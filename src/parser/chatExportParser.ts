import fs from 'fs-extra';
import path from 'path';
import unzipper from 'zlib';
import { classifyContent } from '../classifier/contentClassifier.js';
import { fetchGitHubRepoMetadata } from '../enricher/githubEnricher.js';
import { scrapeArticleMetadata } from '../enricher/articleEnricher.js';
import { enrichWithAI } from '../enricher/aiEnricher.js';
import { saveProcessedItem } from '../storage/mdWriter.js';
import { eventStream } from '../sse/eventStream.js';

export interface ChatMessageEntry {
  timestamp: Date;
  sender: string;
  text: string;
}

export async function parseExportFile(txtFilePath: string): Promise<ChatMessageEntry[]> {
  const content = await fs.readFile(txtFilePath, 'utf-8');
  const lines = content.split('\n');

  const entries: ChatMessageEntry[] = [];
  const lineRegex = /^(\d{4}-\d{2}-\d{2},\s+\d{2}:\d{2})\s+-\s+([^:]+):\s+(.*)$/;

  let currentEntry: ChatMessageEntry | null = null;

  for (const line of lines) {
    const match = line.match(lineRegex);
    if (match) {
      if (currentEntry) {
        entries.push(currentEntry);
      }
      const rawDateStr = match[1];
      const sender = match[2].trim();
      const text = match[3].trim();

      // Standardize date parsing: 2026-07-08, 20:02 -> Date
      const dateParts = rawDateStr.split(', ');
      const [year, month, day] = dateParts[0].split('-').map(Number);
      const [hour, minute] = dateParts[1].split(':').map(Number);
      const parsedDate = new Date(year, month - 1, day, hour, minute);

      currentEntry = {
        timestamp: isNaN(parsedDate.getTime()) ? new Date() : parsedDate,
        sender,
        text
      };
    } else if (currentEntry) {
      currentEntry.text += '\n' + line;
    }
  }

  if (currentEntry) {
    entries.push(currentEntry);
  }

  // Filter out system messages (encryption, group creation, etc.)
  return entries.filter(e =>
    !e.text.includes('Messages and calls are end-to-end encrypted') &&
    !e.text.includes('You created this group') &&
    !e.text.includes('Messages to this group are now secured') &&
    e.text.trim().length > 0
  );
}

import { fetchXPostMetadata } from '../enricher/xEnricher.js';

export async function processExportedMessages(entries: ChatMessageEntry[]): Promise<number> {
  eventStream.emit({
    type: 'info',
    stage: 'parser',
    message: `Starting import of ${entries.length} historical chat messages...`
  });

  let importedCount = 0;

  for (const entry of entries) {
    const classified = classifyContent(entry.text);

    let githubMeta;
    let articleMeta;
    let xMeta;

    if (classified.type === 'GITHUB_REPO' && classified.githubInfo) {
      eventStream.emit({
        type: 'info',
        stage: 'enricher',
        message: `Fetching GitHub metadata for ${classified.githubInfo.owner}/${classified.githubInfo.repo}`
      });
      githubMeta = await fetchGitHubRepoMetadata(classified.githubInfo.owner, classified.githubInfo.repo);
    } else if (classified.type === 'X_POST' && classified.primaryUrl) {
      eventStream.emit({
        type: 'info',
        stage: 'enricher',
        message: `Fetching X/Twitter post metadata for ${classified.primaryUrl}`
      });
      xMeta = await fetchXPostMetadata(classified.primaryUrl);
    } else if (classified.type === 'WEB_ARTICLE' && classified.primaryUrl) {
      eventStream.emit({
        type: 'info',
        stage: 'enricher',
        message: `Scraping web article ${classified.primaryUrl}`
      });
      articleMeta = await scrapeArticleMetadata(classified.primaryUrl);
    }

    const aiEnriched = await enrichWithAI(classified, githubMeta, articleMeta, xMeta);

    await saveProcessedItem(
      entry.text,
      entry.sender,
      entry.timestamp,
      classified,
      aiEnriched,
      githubMeta,
      articleMeta
    );

    importedCount++;
  }

  eventStream.emit({
    type: 'success',
    stage: 'parser',
    message: `Successfully imported ${importedCount} items into Inbox!`
  });

  return importedCount;
}
