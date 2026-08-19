import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config.js';
import { ClassifiedContent } from '../classifier/contentClassifier.js';
import { GitHubRepoMetadata } from './githubEnricher.js';
import { ArticleMetadata } from './articleEnricher.js';
import { XPostMetadata } from './xEnricher.js';

export interface AIEnrichedContent {
  title: string;
  summary: string;
  category: 'Repository' | 'Article' | 'Task' | 'Research' | 'Tool';
  tags: string[];
  actionableTasks: string[];
  aiPromptStarter: string;
  keyTakeaways: string[];
}

const CANDIDATE_MODELS = [
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.6-flash',
  'gemini-flash-latest',
  'gemini-3.7-flash',
  'gemini-3.1-flash-lite',
  'gemini-pro-latest'
];

export async function transcribeAndEnrichAudio(
  audioBuffer: Buffer,
  mimeType: string,
  sender: string,
  timestamp: Date
): Promise<{ transcription: string; enriched: AIEnrichedContent }> {
  const apiKey = config.geminiApiKey || process.env.GEMINI_API_KEY;

  if (!apiKey) {
    const fallbackTitle = `Voice Note from ${sender}`;
    return {
      transcription: '[Voice note recorded. Configure GEMINI_API_KEY to enable automated transcription.]',
      enriched: {
        title: fallbackTitle,
        summary: `Voice note audio message received on ${timestamp.toLocaleString()} from ${sender}.`,
        category: 'Task',
        tags: ['voice-note', 'audio', 'task'],
        actionableTasks: ['Listen to attached voice note audio'],
        aiPromptStarter: `Process and execute action items from voice note: "${fallbackTitle}"`,
        keyTakeaways: ['Voice note audio recorded']
      }
    };
  }

  const systemPrompt = `You are Watodo AI, an intelligent personal voice productivity assistant.
Listen to the attached audio recording sent to a WhatsApp "To Do" chat by "${sender}".
1. Transcribe the audio verbatim into clear, accurate text.
2. Analyze the spoken content and generate structured task/note enrichment.

Respond strictly with valid JSON with the following schema:
{
  "transcription": "Verbatim transcript of everything spoken in the audio.",
  "title": "Concise, descriptive title for this voice note (5-8 words max, no quotes, no URLs)",
  "summary": "Clear, concise 1-2 paragraph summary of the key message, context, and intent.",
  "category": "Task" | "Research" | "Tool" | "Article" | "Repository",
  "tags": ["voice-note", "topic1", "topic2"],
  "actionableTasks": ["Extracted actionable next step 1", "Extracted step 2"],
  "aiPromptStarter": "A ready-to-run system prompt for AI coding agents or assistants to follow up on this request.",
  "keyTakeaways": ["Key takeaway 1", "Key takeaway 2"]
}`;

  const cleanMime = mimeType?.split(';')[0]?.trim() || 'audio/ogg';
  const audioPart = {
    inlineData: {
      data: audioBuffer.toString('base64'),
      mimeType: cleanMime
    }
  };

  const genAI = new GoogleGenerativeAI(apiKey);

  for (const modelName of CANDIDATE_MODELS) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent([systemPrompt, audioPart]);
      const text = result.response.text();
      const jsonMatch = text.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          transcription: parsed.transcription || 'Audio transcription generated.',
          enriched: {
            title: parsed.title || `Voice Note from ${sender}`,
            summary: parsed.summary || 'Voice note audio summarized.',
            category: parsed.category || 'Task',
            tags: Array.isArray(parsed.tags) ? (parsed.tags.includes('voice-note') ? parsed.tags : ['voice-note', ...parsed.tags]) : ['voice-note', 'audio'],
            actionableTasks: Array.isArray(parsed.actionableTasks) ? parsed.actionableTasks : [],
            aiPromptStarter: parsed.aiPromptStarter || `Follow up on voice note: "${parsed.title || 'Voice Task'}"`,
            keyTakeaways: Array.isArray(parsed.keyTakeaways) ? parsed.keyTakeaways : []
          }
        };
      }
    } catch (err: any) {
      console.warn(`[AI Audio Transcriber] Model "${modelName}" failed: ${err.message}. Trying next candidate...`);
    }
  }

  const fallbackTitle = `Voice Note from ${sender}`;
  return {
    transcription: '[Audio transcription unavailable]',
    enriched: {
      title: fallbackTitle,
      summary: `Voice note audio recorded on ${timestamp.toLocaleString()} from ${sender}.`,
      category: 'Task',
      tags: ['voice-note', 'audio'],
      actionableTasks: ['Listen to audio recording'],
      aiPromptStarter: `Investigate voice note: ${fallbackTitle}`,
      keyTakeaways: ['Voice message captured']
    }
  };
}

export async function enrichWithAI(
  classified: ClassifiedContent,
  githubMeta?: GitHubRepoMetadata,
  articleMeta?: ArticleMetadata,
  xMeta?: XPostMetadata
): Promise<AIEnrichedContent> {
  const apiKey = config.geminiApiKey || process.env.GEMINI_API_KEY;

  // Local fallback generator if API key is not configured yet
  if (!apiKey) {
    return generateFallbackEnrichment(classified, githubMeta, articleMeta, xMeta);
  }

  let promptContext = `Incoming WhatsApp Item:\nRaw Text: ${classified.rawText}\nContent Type: ${classified.type}\n`;

  if (githubMeta) {
    promptContext += `GitHub Repo: ${githubMeta.fullName}\nDescription: ${githubMeta.description}\nStars: ${githubMeta.stars}\nLanguage: ${githubMeta.primaryLanguage}\nTopics: ${githubMeta.topics.join(', ')}\nREADME Snippet:\n${githubMeta.readme.substring(0, 3000)}\n`;
  }

  if (articleMeta) {
    promptContext += `Article Title: ${articleMeta.title}\nSite: ${articleMeta.siteName}\nDescription: ${articleMeta.description}\nContent Snippet:\n${articleMeta.contentMarkdown.substring(0, 3000)}\n`;
  }

  if (xMeta) {
    promptContext += `X/Twitter Post Author: ${xMeta.authorName} (${xMeta.authorHandle})\nTweet Content: ${xMeta.tweetText}\nURL: ${xMeta.url}\n`;
  }

  const systemPrompt = `You are Watodo AI, an expert software developer and technical research curator.
Analyze the following item posted to a developer's WhatsApp "To Do" chat and generate a structured JSON output with the exact schema below.

IMPORTANT CRITERIA FOR TITLES:
- Never use raw URLs as titles (e.g. NEVER "https://x.com/i/status/123").
- Always generate a clear, descriptive, professional title summarizing the key tool, technique, library, or topic.

JSON Schema required:
{
  "title": "Clear, descriptive title summarizing the subject matter (DO NOT USE RAW URLs)",
  "summary": "2-3 concise paragraphs detailing what this item/tool/repo/article/post is, key concepts, and why it is valuable.",
  "category": "Repository" | "Article" | "Task" | "Research" | "Tool",
  "tags": ["tag1", "tag2", "tag3"],
  "actionableTasks": ["Actionable step 1", "Actionable step 2"],
  "aiPromptStarter": "A ready-to-use system prompt for AI coding agents to build, clone, or investigate this topic further.",
  "keyTakeaways": ["Key point 1", "Key point 2", "Key point 3"]
}

Respond strictly with valid JSON. Do not wrap in extra commentary outside the JSON block.`;

  const genAI = new GoogleGenerativeAI(apiKey);

  for (const modelName of CANDIDATE_MODELS) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(`${systemPrompt}\n\n${promptContext}`);
      const text = result.response.text();

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          title: (parsed.title && !parsed.title.startsWith('http')) ? parsed.title : (xMeta?.tweetText ? xMeta.tweetText.substring(0, 60) + '...' : 'Technical Post / Research Note'),
          summary: parsed.summary || 'No summary generated.',
          category: parsed.category || 'Research',
          tags: Array.isArray(parsed.tags) ? parsed.tags : ['watodo'],
          actionableTasks: Array.isArray(parsed.actionableTasks) ? parsed.actionableTasks : [],
          aiPromptStarter: parsed.aiPromptStarter || `Investigate ${classified.primaryUrl || classified.rawText}`,
          keyTakeaways: Array.isArray(parsed.keyTakeaways) ? parsed.keyTakeaways : []
        };
      }
    } catch (error: any) {
      console.warn(`[AI Enricher] Model "${modelName}" failed: ${error.message}. Trying next candidate...`);
    }
  }

  return generateFallbackEnrichment(classified, githubMeta, articleMeta, xMeta);
}

function generateFallbackEnrichment(
  classified: ClassifiedContent,
  githubMeta?: GitHubRepoMetadata,
  articleMeta?: ArticleMetadata,
  xMeta?: XPostMetadata
): AIEnrichedContent {
  if (githubMeta) {
    return {
      title: `${githubMeta.fullName} - ${githubMeta.description.substring(0, 60)}`,
      summary: `**${githubMeta.fullName}** is a ${githubMeta.primaryLanguage} repository with ${githubMeta.stars} stars.\n\nDescription: ${githubMeta.description}\n\nTopics: ${githubMeta.topics.join(', ') || 'N/A'}.`,
      category: 'Repository',
      tags: ['github', githubMeta.primaryLanguage.toLowerCase(), ...githubMeta.topics],
      actionableTasks: [
        `Clone & inspect repository: ${githubMeta.htmlUrl}`,
        `Review README architecture notes`,
        `Test build and dependencies`
      ],
      aiPromptStarter: `Act as a senior engineer. Clone and analyze repository ${githubMeta.htmlUrl}.\nRepository Description: ${githubMeta.description}\nPrimary Language: ${githubMeta.primaryLanguage}\nGoal: Review codebase structure, evaluate dependencies, and suggest integration points for our current project.`,
      keyTakeaways: [
        `Stars: ${githubMeta.stars} | Language: ${githubMeta.primaryLanguage}`,
        `Pushed at: ${githubMeta.pushedAt}`,
        `License: ${githubMeta.license || 'Unspecified'}`
      ]
    };
  }

  if (xMeta && xMeta.tweetText && !xMeta.tweetText.startsWith('Post ID:')) {
    const cleanText = xMeta.tweetText.replace(/\n+/g, ' ').trim();
    const descriptiveTitle = cleanText.length > 60 ? cleanText.substring(0, 60) + '...' : cleanText;

    return {
      title: `${xMeta.authorName ? `${xMeta.authorName}: ` : ''}${descriptiveTitle}`,
      summary: `**Post by ${xMeta.authorName || 'Author'} (${xMeta.authorHandle || 'X'})**\n\n${xMeta.tweetText}\n\n[View original post](${xMeta.url})`,
      category: 'Research',
      tags: ['x-post', 'twitter', 'tech-insight'],
      actionableTasks: [
        `Investigate key claims in post: "${descriptiveTitle}"`,
        `Explore referenced repositories or tools`,
        `Evaluate applicability to current system`
      ],
      aiPromptStarter: `Act as a technical researcher and software architect. Review this post by ${xMeta.authorName || 'X Author'} (${xMeta.url}):\n\nContent:\n"${xMeta.tweetText}"\n\nGoal: Research the concepts, software tools, or techniques mentioned in this post. Provide a detailed analysis, architecture diagrams, and prototype code snippets.`,
      keyTakeaways: [
        `Author: ${xMeta.authorName} ${xMeta.authorHandle}`,
        `Source URL: ${xMeta.url}`,
        `Topic: ${descriptiveTitle}`
      ]
    };
  }

  if (articleMeta) {
    return {
      title: articleMeta.title || classified.primaryUrl || 'Saved Article',
      summary: `**${articleMeta.title}** (${articleMeta.siteName})\n\n${articleMeta.description || 'Web article saved to Watodo inbox.'}`,
      category: 'Article',
      tags: ['article', articleMeta.siteName.toLowerCase().replace(/[^a-z0-9]/g, '')],
      actionableTasks: [
        `Read full article at ${articleMeta.url}`,
        `Extract key insights for current project`
      ],
      aiPromptStarter: `Act as a technical researcher. Review this article from ${articleMeta.siteName}: ${articleMeta.url}.\nTitle: ${articleMeta.title}\nSummary: ${articleMeta.description}\nGoal: Extract the top technical recommendations and evaluate how they apply to our system architecture.`,
      keyTakeaways: [
        `Source: ${articleMeta.siteName}`,
        `Author: ${articleMeta.author || 'N/A'}`
      ]
    };
  }

  // Raw Task or Media
  const firstLine = classified.rawText.split('\n')[0] || 'Saved Note';
  const cleanTitle = firstLine.startsWith('http') ? 'Saved Web Reference / Media Note' : (firstLine.length > 50 ? firstLine.substring(0, 50) + '...' : firstLine);

  return {
    title: cleanTitle,
    summary: classified.rawText || 'Raw note or media reference saved to Watodo inbox.',
    category: classified.type === 'MEDIA' ? 'Research' : 'Task',
    tags: ['todo', classified.type.toLowerCase()],
    actionableTasks: [
      `Review note: "${cleanTitle}"`,
      `Determine execution requirements`
    ],
    aiPromptStarter: `Task / Idea Context:\n${classified.rawText}\n\nGoal: Help expand this task into a complete step-by-step technical implementation plan with architecture decisions and code snippets.`,
    keyTakeaways: [
      `Type: ${classified.type}`,
      `Created from WhatsApp "To Do" chat`
    ]
  };
}

