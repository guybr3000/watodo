import fs from 'fs-extra';
import path from 'path';
import { config } from '../config.js';

export interface KbItemSummary {
  id: string;
  slug: string;
  title: string;
  date: string;
  category: string;
  tags: string[];
  url?: string;
  status: 'unread' | 'done';
  rating?: number;
  summary: string;
  filePath: string;
  image?: string;
  images?: string[];
  audio?: string;
}

export interface KbItemDetail {
  slug: string;
  id: string;
  title: string;
  date: string;
  source: string;
  sender: string;
  category: string;
  url?: string;
  tags: string[];
  status: 'unread' | 'done';
  rating?: number;
  originalNote: string;
  summary: string;
  keyTakeaways: string[];
  actionableTasks: string[];
  aiPromptStarter: string;
  rawContent: string;
  image?: string;
  images?: string[];
  audio?: string;
  waKey?: {
    id?: string;
    remoteJid?: string;
    fromMe?: boolean;
    participant?: string;
    timestamp?: string | number;
  };
  githubDetails?: {
    repo?: string;
    stars?: string;
    forks?: string;
    language?: string;
    topics?: string[];
    url?: string;
  };
  articleDetails?: {
    source?: string;
    title?: string;
    author?: string;
    url?: string;
    image?: string;
  };
}

function normalizeSlug(rawSlug: string): string {
  let s = decodeURIComponent(rawSlug);
  if (!s.endsWith('.md')) {
    s += '.md';
  }
  return path.basename(s);
}

function extractImagesFromContent(content: string, yamlContent?: string): string[] {
  const images: string[] = [];

  const addImage = (rawUrl: string) => {
    if (!rawUrl) return;
    let u = rawUrl.trim();
    if (u.startsWith('<') && u.endsWith('>')) {
      u = u.slice(1, -1).trim();
    }
    if (!u) return;

    if (u.startsWith('http://') || u.startsWith('https://') || u.startsWith('/api/media/') || u.startsWith('data:image/')) {
      if (!images.includes(u)) images.push(u);
    } else {
      const baseName = path.basename(u);
      const normalized = `/api/media/${baseName}`;
      if (!images.includes(normalized)) images.push(normalized);
    }
  };

  if (yamlContent) {
    const singleImage = (yamlContent.match(/(?:image|attachedImage|media):\s*"([^"]+)"/) || [])[1];
    if (singleImage) addImage(singleImage);

    const arrayMatch = yamlContent.match(/(?:images|mediaFiles):\s*(\[[^\]]*\])/);
    if (arrayMatch) {
      try {
        const arr = JSON.parse(arrayMatch[1]);
        if (Array.isArray(arr)) arr.forEach(addImage);
      } catch {}
    }
  }

  const mdImgMatches = content.matchAll(/!\[.*?\]\(([^)]+)\)/g);
  for (const m of mdImgMatches) {
    addImage(m[1]);
  }

  const htmlImgMatches = content.matchAll(/<img[^>]+src=["']([^"']+)["']/g);
  for (const m of htmlImgMatches) {
    addImage(m[1]);
  }

  const waAttachMatches = content.matchAll(/<attached:\s*([^>]+)>/g);
  for (const m of waAttachMatches) {
    addImage(m[1]);
  }

  const waAttachParenMatches = content.matchAll(/([A-Za-z0-9_.\-]+\.(?:jpg|jpeg|png|webp|gif))\s+\(file attached\)/gi);
  for (const m of waAttachParenMatches) {
    addImage(m[1]);
  }

  return images;
}

export async function getKnowledgeBaseItems(): Promise<KbItemSummary[]> {
  const outputDir = config.outputDir;
  const itemsDir = path.join(outputDir, 'items');

  if (!(await fs.pathExists(itemsDir))) {
    return [];
  }

  const files = await fs.readdir(itemsDir);
  const items: KbItemSummary[] = [];

  for (const file of files) {
    if (!file.endsWith('.md')) continue;

    const fullPath = path.join(itemsDir, file);
    try {
      const content = await fs.readFile(fullPath, 'utf-8');

      // Parse Frontmatter
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
      let id = file.replace(/\.md$/, '');
      let date = '';
      let category = 'Task';
      let url = '';
      let status: 'unread' | 'done' = 'unread';
      let rating: number | undefined = undefined;
      let tags: string[] = [];
      let yamlStr = '';

      if (frontmatterMatch) {
        yamlStr = frontmatterMatch[1];
        id = (yamlStr.match(/id:\s*"([^"]+)"/) || [])[1] || id;
        date = (yamlStr.match(/date:\s*"([^"]+)"/) || [])[1] || '';
        category = (yamlStr.match(/type:\s*"([^"]+)"/) || [])[1] || 'Task';
        url = (yamlStr.match(/url:\s*"([^"]+)"/) || [])[1] || '';
        const rawStatus = (yamlStr.match(/status:\s*"([^"]+)"/) || [])[1];
        if (rawStatus === 'done') {
          status = 'done';
        }

        const ratingMatch = yamlStr.match(/rating:\s*(\d+)/);
        if (ratingMatch) {
          const parsedR = parseInt(ratingMatch[1], 10);
          if (parsedR >= 1 && parsedR <= 5) {
            rating = parsedR;
          }
        }

        const tagsMatch = yamlStr.match(/tags:\s*(\[[^\]]*\])/);
        if (tagsMatch) {
          try { tags = JSON.parse(tagsMatch[1]); } catch {}
        }
      }

      // Title & Executive Summary
      const titleMatch = content.match(/#\s+(.+)/);
      const title = titleMatch ? titleMatch[1].trim() : file.replace(/\.md$/, '');

      const summaryMatch = content.match(/## 💡 Executive Summary\n([\s\S]*?)(?=\n## |$)/);
      const summary = summaryMatch ? summaryMatch[1].trim() : '';

      const images = extractImagesFromContent(content, yamlStr);
      const audioMatch = (yamlStr.match(/audio:\s*"([^"]+)"/) || [])[1];

      items.push({
        id,
        slug: file,
        title,
        date: date || new Date().toISOString(),
        category,
        tags,
        url,
        status,
        rating,
        summary: summary.substring(0, 300),
        filePath: fullPath,
        image: images[0],
        images,
        audio: audioMatch
      });
    } catch (err) {
      console.warn(`[KB Reader] Error reading item ${file}:`, err);
    }
  }

  // Sort descending by date
  return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export const getKbItems = getKnowledgeBaseItems;

export async function getKnowledgeBaseItemContent(rawSlug: string): Promise<string | null> {
  const outputDir = config.outputDir;
  const slug = normalizeSlug(rawSlug);
  const filePath = path.join(outputDir, 'items', slug);
  if (await fs.pathExists(filePath)) {
    return fs.readFile(filePath, 'utf-8');
  }
  return null;
}

export async function getKnowledgeBaseItemParsedDetail(rawSlug: string): Promise<KbItemDetail | null> {
  const outputDir = config.outputDir;
  const slug = normalizeSlug(rawSlug);
  const filePath = path.join(outputDir, 'items', slug);

  if (!(await fs.pathExists(filePath))) {
    return null;
  }

  const content = await fs.readFile(filePath, 'utf-8');

  // Parse Frontmatter
  let id = slug.replace(/\.md$/, '');
  let date = '';
  let source = `WhatsApp Group '${config.targetChatName}'`;
  let sender = 'WhatsApp User';
  let category = 'Task';
  let url = '';
  let tags: string[] = [];
  let status: 'unread' | 'done' = 'unread';
  let rating: number | undefined = undefined;

  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (frontmatterMatch) {
    const yaml = frontmatterMatch[1];
    id = (yaml.match(/id:\s*"([^"]+)"/) || [])[1] || id;
    date = (yaml.match(/date:\s*"([^"]+)"/) || [])[1] || '';
    source = (yaml.match(/source:\s*"([^"]+)"/) || [])[1] || source;
    sender = (yaml.match(/sender:\s*"([^"]+)"/) || [])[1] || sender;
    category = (yaml.match(/type:\s*"([^"]+)"/) || [])[1] || 'Task';
    url = (yaml.match(/url:\s*"([^"]+)"/) || [])[1] || '';
    const rawStatus = (yaml.match(/status:\s*"([^"]+)"/) || [])[1];
    if (rawStatus === 'done') {
      status = 'done';
    }

    const ratingMatch = yaml.match(/rating:\s*(\d+)/);
    if (ratingMatch) {
      const parsedR = parseInt(ratingMatch[1], 10);
      if (parsedR >= 1 && parsedR <= 5) {
        rating = parsedR;
      }
    }

    const tagsMatch = yaml.match(/tags:\s*(\[[^\]]*\])/);
    if (tagsMatch) {
      try { tags = JSON.parse(tagsMatch[1]); } catch {}
    }
  }

  // Title
  const titleMatch = content.match(/#\s+(.+)/);
  const title = titleMatch ? titleMatch[1].trim() : slug.replace(/\.md$/, '');

  // Original WhatsApp Note
  let originalNote = '';
  const noteMatch = content.match(/> 📱 \*\*Original WhatsApp Note\*\* [^\n]*\n([\s\S]*?)(?=\n---|##|$)/);
  if (noteMatch) {
    originalNote = noteMatch[1]
      .split('\n')
      .map(line => line.replace(/^>\s?/, ''))
      .join('\n')
      .trim();
  }

  // Clean out any audio tags or attached media markup from note text
  originalNote = originalNote
    .replace(/<audio[\s\S]*?<\/audio>/gi, '')
    .replace(/🎙️?\s*\*\*Voice Note Audio\*\*:[^\n]*/gi, '')
    .replace(/!\[Attached Image\]\([^)]+\)/gi, '')
    .trim();

  // Strip synthetic [Voice Note: ...] wrapper if present
  const vnWrapper = originalNote.match(/^\[Voice Note:\s*([\s\S]*?)\]$/i);
  if (vnWrapper) {
    originalNote = vnWrapper[1].trim();
  }

  // Executive Summary
  let summary = '';
  const summaryMatch = content.match(/## 💡 Executive Summary\n([\s\S]*?)(?=\n## |$)/);
  if (summaryMatch) {
    summary = summaryMatch[1].trim();
  }

  // Key Takeaways
  const keyTakeaways: string[] = [];
  const takeawaysMatch = content.match(/## 🔑 Key Takeaways\n([\s\S]*?)(?=\n## |$)/);
  if (takeawaysMatch) {
    takeawaysMatch[1].split('\n').forEach(l => {
      const trimmed = l.trim().replace(/^[-*]\s+/, '');
      if (trimmed) keyTakeaways.push(trimmed);
    });
  }

  // Actionable Next Steps
  const actionableTasks: string[] = [];
  const tasksMatch = content.match(/## 🎯 Actionable Next Steps\n([\s\S]*?)(?=\n## |$)/);
  if (tasksMatch) {
    tasksMatch[1].split('\n').forEach(l => {
      const trimmed = l.trim().replace(/^[-*]\s+(\[[ xX]\]\s+)?/, '');
      if (trimmed) actionableTasks.push(trimmed);
    });
  }

  // AI Prompt Starter
  let aiPromptStarter = '';
  const promptMatch = content.match(/## 🤖 AI Agent Prompt Starter\n```text\n([\s\S]*?)\n```/);
  if (promptMatch) {
    aiPromptStarter = promptMatch[1].trim();
  }

  // GitHub Details
  let githubDetails: KbItemDetail['githubDetails'] = undefined;
  const githubSectionMatch = content.match(/## ⚙️ GitHub Repository Details\n([\s\S]*?)(?=\n## |$)/);
  if (githubSectionMatch) {
    const sec = githubSectionMatch[1];
    const repoMatch = sec.match(/- \*\*Repository\*\*:\s*\[([^\]]+)\]\(([^)]+)\)/);
    const starsMatch = sec.match(/⭐\s*([\d,]+)/);
    const forksMatch = sec.match(/🍴\s*([\d,]+)/);
    const langMatch = sec.match(/💻\s*([^\n|]+)/);
    const topicsMatch = sec.match(/- \*\*Topics\*\*:\s*(.+)/);

    let topics: string[] = [];
    if (topicsMatch && topicsMatch[1] !== 'None') {
      topics = (topicsMatch[1].match(/`([^`]+)`/g) || []).map(t => t.replace(/`/g, ''));
    }

    githubDetails = {
      repo: repoMatch ? repoMatch[1] : undefined,
      url: repoMatch ? repoMatch[2] : undefined,
      stars: starsMatch ? starsMatch[1] : undefined,
      forks: forksMatch ? forksMatch[1] : undefined,
      language: langMatch ? langMatch[1].trim() : undefined,
      topics
    };
  }

  // Article Details
  let articleDetails: KbItemDetail['articleDetails'] = undefined;
  const articleSectionMatch = content.match(/## 📰 Web Article Metadata\n([\s\S]*?)(?=\n## |$)/);
  if (articleSectionMatch) {
    const sec = articleSectionMatch[1];
    const sourceMatch = sec.match(/- \*\*Source\*\*:\s*\[([^\]]+)\]\(([^)]+)\)/);
    const titleSecMatch = sec.match(/- \*\*Title\*\*:\s*(.+)/);
    const authorMatch = sec.match(/- \*\*Author\*\*:\s*(.+)/);

    articleDetails = {
      source: sourceMatch ? sourceMatch[1] : undefined,
      url: sourceMatch ? sourceMatch[2] : undefined,
      title: titleSecMatch ? titleSecMatch[1].trim() : undefined,
      author: authorMatch ? authorMatch[1].trim() : undefined
    };
  }

  const yamlBlock = frontmatterMatch ? frontmatterMatch[1] : '';
  const images = extractImagesFromContent(content, yamlBlock);
  const audioMatch = yamlBlock ? (yamlBlock.match(/audio:\s*"([^"]+)"/) || [])[1] : undefined;

  let waKey: KbItemDetail['waKey'] = undefined;
  if (yamlBlock) {
    const waMsgId = (yamlBlock.match(/waMessageId:\s*"([^"]+)"/) || [])[1];
    const waRemoteJid = (yamlBlock.match(/waRemoteJid:\s*"([^"]+)"/) || [])[1];
    const waFromMeStr = (yamlBlock.match(/waFromMe:\s*(true|false)/) || [])[1];
    const waParticipant = (yamlBlock.match(/waParticipant:\s*"([^"]+)"/) || [])[1];
    if (waMsgId) {
      waKey = {
        id: waMsgId,
        remoteJid: waRemoteJid || undefined,
        fromMe: waFromMeStr === 'true',
        participant: waParticipant || undefined,
        timestamp: date ? new Date(date).getTime() : undefined
      };
    }
  }

  return {
    slug,
    id,
    title,
    date,
    source,
    sender,
    category,
    url,
    tags,
    status,
    rating,
    originalNote,
    summary,
    keyTakeaways,
    actionableTasks,
    aiPromptStarter,
    rawContent: content,
    image: images[0],
    images,
    audio: audioMatch,
    waKey,
    githubDetails,
    articleDetails
  };
}

export async function updateKnowledgeBaseItemStatus(
  rawSlug: string,
  newStatus: 'unread' | 'done',
  rating?: number | null
): Promise<boolean> {
  const outputDir = config.outputDir;
  const slug = normalizeSlug(rawSlug);
  const filePath = path.join(outputDir, 'items', slug);

  if (!(await fs.pathExists(filePath))) {
    return false;
  }

  // 1. Update Markdown Item Frontmatter
  let content = await fs.readFile(filePath, 'utf-8');
  if (/status:\s*"[^"]*"/.test(content)) {
    content = content.replace(/status:\s*"[^"]*"/, `status: "${newStatus}"`);
  } else if (/^---\n([\s\S]*?)\n---/.test(content)) {
    content = content.replace(/^---\n([\s\S]*?)\n---/, `---\n$1\nstatus: "${newStatus}"\n---`);
  }

  // If rating is explicitly provided
  if (rating !== undefined) {
    if (rating === null || rating === 0) {
      content = content.replace(/\nrating:\s*\d+/g, '');
    } else if (rating >= 1 && rating <= 5) {
      if (/rating:\s*\d+/.test(content)) {
        content = content.replace(/rating:\s*\d+/, `rating: ${rating}`);
      } else if (/^---\n([\s\S]*?)\n---/.test(content)) {
        content = content.replace(/^---\n([\s\S]*?)\n---/, `---\n$1\nrating: ${rating}\n---`);
      }
    }
  }

  await fs.writeFile(filePath, content, 'utf-8');

  // 2. Update central WATODO_INBOX.md checkbox
  const inboxPath = path.join(outputDir, 'WATODO_INBOX.md');
  if (await fs.pathExists(inboxPath)) {
    try {
      const inboxContent = await fs.readFile(inboxPath, 'utf-8');
      const lines = inboxContent.split('\n');
      const updatedLines = lines.map(line => {
        if (line.includes(slug)) {
          if (newStatus === 'done') {
            return line.replace(/^\|\s*\[\s*\]\s*\|/, '| [x] |');
          } else {
            return line.replace(/^\|\s*\[x\]\s*\|/i, '| [ ] |');
          }
        }
        return line;
      });
      await fs.writeFile(inboxPath, updatedLines.join('\n'), 'utf-8');
    } catch (err) {
      console.warn('[KB Reader] Failed to update inbox index checkbox:', err);
    }
  }

  return true;
}

export async function updateKnowledgeBaseItemRating(rawSlug: string, rating: number | null): Promise<boolean> {
  const outputDir = config.outputDir;
  const slug = normalizeSlug(rawSlug);
  const filePath = path.join(outputDir, 'items', slug);

  if (!(await fs.pathExists(filePath))) {
    return false;
  }

  let content = await fs.readFile(filePath, 'utf-8');
  if (rating === null || rating === 0) {
    content = content.replace(/\nrating:\s*\d+/g, '');
  } else if (rating >= 1 && rating <= 5) {
    if (/rating:\s*\d+/.test(content)) {
      content = content.replace(/rating:\s*\d+/, `rating: ${rating}`);
    } else if (/^---\n([\s\S]*?)\n---/.test(content)) {
      content = content.replace(/^---\n([\s\S]*?)\n---/, `---\n$1\nrating: ${rating}\n---`);
    }
  }

  await fs.writeFile(filePath, content, 'utf-8');
  return true;
}

export async function deleteKnowledgeBaseItem(rawSlug: string): Promise<boolean> {
  const outputDir = config.outputDir;
  const slug = normalizeSlug(rawSlug);
  const filePath = path.join(outputDir, 'items', slug);

  if (await fs.pathExists(filePath)) {
    await fs.remove(filePath);
  }

  // 1. Clean up central WATODO_INBOX.md
  const inboxPath = path.join(outputDir, 'WATODO_INBOX.md');
  if (await fs.pathExists(inboxPath)) {
    try {
      const inboxContent = await fs.readFile(inboxPath, 'utf-8');
      const lines = inboxContent.split('\n');
      const filteredLines = lines.filter(line => !line.includes(slug));
      await fs.writeFile(inboxPath, filteredLines.join('\n'), 'utf-8');
    } catch (err) {
      console.warn('[KB Reader] Failed to remove item from WATODO_INBOX.md:', err);
    }
  }

  // 2. Clean up categories/*.md
  const categoriesDir = path.join(outputDir, 'categories');
  if (await fs.pathExists(categoriesDir)) {
    try {
      const catFiles = await fs.readdir(categoriesDir);
      for (const catFile of catFiles) {
        if (!catFile.endsWith('.md')) continue;
        const catPath = path.join(categoriesDir, catFile);
        const catContent = await fs.readFile(catPath, 'utf-8');
        if (catContent.includes(slug)) {
          // Remove multi-line or single-line list entries referring to this slug
          const catLines = catContent.split('\n');
          const newCatLines: string[] = [];
          for (let i = 0; i < catLines.length; i++) {
            if (catLines[i].includes(slug)) {
              // Also skip indented description line following it if present
              if (i + 1 < catLines.length && catLines[i + 1].startsWith('  ')) {
                i++;
              }
              continue;
            }
            newCatLines.push(catLines[i]);
          }
          await fs.writeFile(catPath, newCatLines.join('\n'), 'utf-8');
        }
      }
    } catch (err) {
      console.warn('[KB Reader] Failed to remove item from categories:', err);
    }
  }

  return true;
}
