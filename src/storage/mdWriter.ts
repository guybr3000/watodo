import fs from 'fs-extra';
import path from 'path';
import slugify from 'slugify';
import { config } from '../config.js';
import { ClassifiedContent } from '../classifier/contentClassifier.js';
import { GitHubRepoMetadata } from '../enricher/githubEnricher.js';
import { ArticleMetadata } from '../enricher/articleEnricher.js';
import { AIEnrichedContent } from '../enricher/aiEnricher.js';
import { eventStream } from '../sse/eventStream.js';

export interface ProcessedItem {
  id: string;
  date: string;
  sender: string;
  classified: ClassifiedContent;
  githubMeta?: GitHubRepoMetadata;
  articleMeta?: ArticleMetadata;
  aiEnriched: AIEnrichedContent;
  filePath: string;
  slug: string;
}

export async function saveProcessedItem(
  rawText: string,
  sender: string,
  timestampDate: Date,
  classified: ClassifiedContent,
  aiEnriched: AIEnrichedContent,
  githubMeta?: GitHubRepoMetadata,
  articleMeta?: ArticleMetadata,
  attachedImage?: string,
  waKey?: { id?: string; remoteJid?: string; fromMe?: boolean; participant?: string },
  attachedAudio?: string
): Promise<ProcessedItem> {
  const outputDir = config.outputDir;
  const itemsDir = path.join(outputDir, 'items');
  const categoriesDir = path.join(outputDir, 'categories');

  await fs.ensureDir(itemsDir);
  await fs.ensureDir(categoriesDir);

  const dateStr = timestampDate.toISOString().split('T')[0];
  const safeSlug = slugify(aiEnriched.title, { lower: true, strict: true, replacement: '-' }).substring(0, 40) || 'item';
  const timeId = timestampDate.getTime().toString(36);
  const fileBasename = `${dateStr}_${safeSlug}_${timeId}.md`;
  const filePath = path.join(itemsDir, fileBasename);

  const id = `${dateStr}-${safeSlug}-${timeId}`;

  // Build Frontmatter & Markdown Content
  const imageField = attachedImage ? `\nimage: "${attachedImage}"` : '';
  const audioField = attachedAudio ? `\naudio: "${attachedAudio}"` : '';
  const waKeyFields = waKey?.id
    ? `\nwaMessageId: "${waKey.id}"\nwaRemoteJid: "${waKey.remoteJid || ''}"\nwaFromMe: ${Boolean(waKey.fromMe)}\nwaParticipant: "${waKey.participant || ''}"`
    : '';

  const frontmatter = `---
id: "${id}"
date: "${timestampDate.toISOString()}"
source: "WhatsApp Group '${config.targetChatName}'"
sender: "${sender}"
type: "${aiEnriched.category}"
url: "${classified.primaryUrl || ''}"
tags: ${JSON.stringify(aiEnriched.tags)}${imageField}${audioField}${waKeyFields}
status: "unread"
---`;

  let bodyMarkdown = `${frontmatter}

# ${aiEnriched.title}

> 📱 **Original WhatsApp Note** (${timestampDate.toLocaleString()}):
> ${rawText.split('\n').join('\n> ')}

---
${attachedAudio ? `\n🎙️ **Voice Note Audio**:\n<audio controls src="${attachedAudio}"></audio>\n` : ''}${attachedImage ? `\n![Attached Image](${attachedImage})\n` : ''}

## 💡 Executive Summary
${aiEnriched.summary}
`;

  if (aiEnriched.keyTakeaways.length > 0) {
    bodyMarkdown += `\n## 🔑 Key Takeaways\n${aiEnriched.keyTakeaways.map(t => `- ${t}`).join('\n')}\n`;
  }

  if (githubMeta) {
    bodyMarkdown += `
## ⚙️ GitHub Repository Details
- **Repository**: [${githubMeta.fullName}](${githubMeta.htmlUrl})
- **Stars**: ⭐ ${githubMeta.stars} | **Forks**: 🍴 ${githubMeta.forks} | **Primary Language**: 💻 ${githubMeta.primaryLanguage}
- **Topics**: ${githubMeta.topics.map(t => `\`${t}\``).join(', ') || 'None'}
- **Pushed**: ${githubMeta.pushedAt}
`;
  }

  if (articleMeta) {
    bodyMarkdown += `
## 📰 Web Article Metadata
- **Source**: [${articleMeta.siteName}](${articleMeta.url})
- **Title**: ${articleMeta.title}
- **Author**: ${articleMeta.author || 'Unspecified'}
`;
  }

  if (aiEnriched.actionableTasks.length > 0) {
    bodyMarkdown += `
## 🎯 Actionable Next Steps
${aiEnriched.actionableTasks.map(t => `- [ ] ${t}`).join('\n')}
`;
  }

  bodyMarkdown += `
## 🤖 AI Agent Prompt Starter
\`\`\`text
${aiEnriched.aiPromptStarter}
\`\`\`
`;

  if (githubMeta && githubMeta.readme) {
    bodyMarkdown += `
<details>
<summary>📄 Raw GitHub README Snippet</summary>

${githubMeta.readme}

</details>
`;
  } else if (articleMeta && articleMeta.contentMarkdown) {
    bodyMarkdown += `
<details>
<summary>📄 Raw Article Content Snippet</summary>

${articleMeta.contentMarkdown}

</details>
`;
  }

  // Write item markdown file
  await fs.writeFile(filePath, bodyMarkdown, 'utf-8');

  const processed: ProcessedItem = {
    id,
    date: timestampDate.toISOString(),
    sender,
    classified,
    githubMeta,
    articleMeta,
    aiEnriched,
    filePath,
    slug: fileBasename
  };

  // Update central index WATODO_INBOX.md
  await updateInboxIndex(outputDir, processed);

  // Update Category file
  await updateCategoryIndex(categoriesDir, processed);

  eventStream.emit({
    type: 'success',
    stage: 'storage',
    message: `Saved "${aiEnriched.title}" to Markdown Inbox`,
    details: { filePath, slug: fileBasename }
  });

  return processed;
}

async function updateInboxIndex(outputDir: string, item: ProcessedItem) {
  const inboxPath = path.join(outputDir, 'WATODO_INBOX.md');
  const dateStr = item.date.split('T')[0];
  const relativeLink = `./items/${item.slug}`;
  const urlDisplay = item.classified.primaryUrl ? `[Link](${item.classified.primaryUrl})` : '-';
  const tagsDisplay = item.aiEnriched.tags.map(t => `\`${t}\``).join(' ');

  const row = `| [ ] | ${dateStr} | ${item.aiEnriched.category} | [${item.aiEnriched.title}](${relativeLink}) | ${urlDisplay} | ${tagsDisplay} |`;

  if (!(await fs.pathExists(inboxPath))) {
    const header = `# 📥 Watodo Inbox

Automatically generated from WhatsApp group chat \`${config.targetChatName}\`.

| Status | Date | Category | Title | Source URL | Tags |
| :---: | :--- | :--- | :--- | :--- | :--- |
${row}
`;
    await fs.writeFile(inboxPath, header, 'utf-8');
  } else {
    const existing = await fs.readFile(inboxPath, 'utf-8');
    if (!existing.includes(item.slug)) {
      await fs.appendFile(inboxPath, `${row}\n`, 'utf-8');
    }
  }
}

async function updateCategoryIndex(categoriesDir: string, item: ProcessedItem) {
  const categoryFilename = `${item.aiEnriched.category.toLowerCase()}s.md`;
  const catPath = path.join(categoriesDir, categoryFilename);
  const relativeLink = `../items/${item.slug}`;
  const itemEntry = `- **[${item.aiEnriched.title}](${relativeLink})** (${item.date.split('T')[0]})\n  ${item.aiEnriched.summary.split('\n')[0]}\n`;

  if (!(await fs.pathExists(catPath))) {
    const header = `# Category: ${item.aiEnriched.category}s\n\n${itemEntry}`;
    await fs.writeFile(catPath, header, 'utf-8');
  } else {
    await fs.appendFile(catPath, `\n${itemEntry}`, 'utf-8');
  }
}
