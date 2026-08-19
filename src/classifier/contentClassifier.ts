export type ContentType = 'GITHUB_REPO' | 'WEB_ARTICLE' | 'X_POST' | 'MEDIA' | 'TASK_NOTE';

export interface ClassifiedContent {
  type: ContentType;
  urls: string[];
  primaryUrl?: string;
  rawText: string;
  githubInfo?: {
    owner: string;
    repo: string;
    subPath?: string;
  };
  mediaRef?: string;
}

const GITHUB_REPO_REGEX = /https?:\/\/(?:www\.)?github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)(?:\/([^\s]+))?/;
const X_POST_REGEX = /https?:\/\/(?:www\.)?(?:twitter|x)\.com\/(?:[a-zA-Z0-9_]+|i)\/status\/(\d+)/;
const GENERAL_URL_REGEX = /https?:\/\/[^\s]+/g;
const MEDIA_ATTACHMENT_REGEX = /(?:IMG|DOC|VID|AUD)-\d{8}-WA\d+\.[a-zA-Z0-9]+|(?:IMG|DOC|VID|AUD)-\d{8}-WA\d+/;

export function classifyContent(text: string, mediaFilename?: string): ClassifiedContent {
  const cleanText = text.trim();
  const urls = (cleanText.match(GENERAL_URL_REGEX) || []).map(u => u.replace(/[),.]+$/, ''));

  // 1. Check for GitHub repository URL
  const ghMatch = cleanText.match(GITHUB_REPO_REGEX);
  if (ghMatch) {
    const owner = ghMatch[1];
    let repo = ghMatch[2].replace(/\.git$/, '');
    const subPath = ghMatch[3];
    return {
      type: 'GITHUB_REPO',
      urls,
      primaryUrl: `https://github.com/${owner}/${repo}`,
      rawText: cleanText,
      githubInfo: { owner, repo, subPath }
    };
  }

  // 2. Check for X / Twitter post URL
  const xMatch = cleanText.match(X_POST_REGEX);
  if (xMatch) {
    return {
      type: 'X_POST',
      urls,
      primaryUrl: `https://x.com/i/status/${xMatch[1]}`,
      rawText: cleanText
    };
  }

  // 3. Check for general Web Article / Documentation URL
  if (urls.length > 0) {
    return {
      type: 'WEB_ARTICLE',
      urls,
      primaryUrl: urls[0],
      rawText: cleanText
    };
  }

  // 4. Check for Media Attachment
  if (mediaFilename || MEDIA_ATTACHMENT_REGEX.test(cleanText)) {
    return {
      type: 'MEDIA',
      urls: [],
      rawText: cleanText,
      mediaRef: mediaFilename || cleanText
    };
  }

  // 5. Default to Task / Note / Code Snippet
  return {
    type: 'TASK_NOTE',
    urls: [],
    rawText: cleanText
  };
}
