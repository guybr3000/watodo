import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs-extra';
import { config, updateRuntimeConfig, persistEnvConfig } from './config.js';
import { eventStream } from './sse/eventStream.js';
import {
  initWhatsAppClient,
  getWhatsAppState,
  resetWhatsAppTargetChat,
  deleteWhatsAppMessage
} from './whatsapp/client.js';
import {
  getKnowledgeBaseItems,
  getKnowledgeBaseItemContent,
  getKnowledgeBaseItemParsedDetail,
  updateKnowledgeBaseItemStatus,
  updateKnowledgeBaseItemRating,
  deleteKnowledgeBaseItem
} from './storage/kbReader.js';
import { parseExportFile, processExportedMessages } from './parser/chatExportParser.js';

const app = express();

app.use(cors());
app.use(express.json());

// Serve static frontend build in production
const frontendBuildDir = path.resolve(process.cwd(), 'dist/frontend');
if (fs.existsSync(frontendBuildDir)) {
  app.use(express.static(frontendBuildDir));
}

// Serve Knowledge Base media attachments (/api/media)
const mediaDir = path.resolve(config.outputDir, 'media');
fs.ensureDirSync(mediaDir);
app.use('/api/media', express.static(mediaDir));

function maskKey(key?: string): string {
  if (!key || key.length < 8) return '';
  return key.substring(0, 6) + '••••••••' + key.substring(key.length - 4);
}

// 1. Status endpoint
app.get('/api/status', async (req, res) => {
  const items = await getKnowledgeBaseItems();
  const waState = getWhatsAppState();

  res.json({
    whatsapp: waState,
    totalItems: items.length,
    config: {
      targetChatName: config.targetChatName,
      outputDir: config.outputDir,
      hasGeminiApiKey: Boolean(config.geminiApiKey),
      maskedGeminiApiKey: maskKey(config.geminiApiKey),
      hasGithubToken: Boolean(config.githubToken),
      maskedGithubToken: maskKey(config.githubToken),
      port: config.port
    }
  });
});

// 1b. Get Settings endpoint
app.get('/api/settings', (req, res) => {
  res.json({
    targetChatName: config.targetChatName,
    outputDir: config.outputDir,
    hasGeminiApiKey: Boolean(config.geminiApiKey),
    maskedGeminiApiKey: maskKey(config.geminiApiKey),
    hasGithubToken: Boolean(config.githubToken),
    maskedGithubToken: maskKey(config.githubToken),
    port: config.port
  });
});

// 2. QR Code endpoint
app.get('/api/qr', (req, res) => {
  const waState = getWhatsAppState();
  res.json({ qrDataUrl: waState.qrDataUrl, status: waState.status });
});

// 3. SSE Log Stream endpoint
app.get('/api/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  eventStream.addClient(res);
});

// 4. Knowledge Base List endpoint
app.get('/api/kb', async (req, res) => {
  const items = await getKnowledgeBaseItems();
  res.json(items);
});

// 5. Knowledge Base Item Detail endpoint
app.get('/api/kb/item/:slug', async (req, res) => {
  const detail = await getKnowledgeBaseItemParsedDetail(req.params.slug);
  if (!detail) {
    return res.status(404).json({ error: 'Markdown file not found' });
  }
  res.json(detail);
});

// 5b. Knowledge Base Raw Markdown endpoint
app.get('/api/kb/raw/:slug', async (req, res) => {
  const rawContent = await getKnowledgeBaseItemContent(req.params.slug);
  if (rawContent === null) {
    return res.status(404).send('Markdown file not found');
  }
  res.type('text/plain; charset=utf-8').send(rawContent);
});

// 6. Update Knowledge Base Item Status endpoint (unread / done)
app.patch('/api/kb/item/:slug/status', async (req, res) => {
  const { status, rating, deleteFromWhatsApp, deleteMode = 'clear_for_me' } = req.body;
  if (status !== 'unread' && status !== 'done') {
    return res.status(400).json({ error: 'Status must be "unread" or "done"' });
  }

  const numRating = rating !== undefined ? (rating === null || rating === 0 ? null : Number(rating)) : undefined;
  if (numRating !== undefined && numRating !== null && (!Number.isInteger(numRating) || numRating < 1 || numRating > 5)) {
    return res.status(400).json({ error: 'Rating must be an integer between 1 and 5, or null' });
  }

  // If requested to delete from WhatsApp on complete
  if (status === 'done' && deleteFromWhatsApp) {
    const detail = await getKnowledgeBaseItemParsedDetail(req.params.slug);
    if (detail?.waKey) {
      await deleteWhatsAppMessage(detail.waKey, deleteMode);
    }
  }

  const success = await updateKnowledgeBaseItemStatus(req.params.slug, status, numRating);
  if (!success) {
    return res.status(404).json({ error: 'Item not found' });
  }

  eventStream.emit({
    type: 'info',
    stage: 'storage',
    message: `Updated status of "${req.params.slug}" to "${status}"${numRating ? ` with rating ${numRating} ⭐` : ''}`,
    details: { slug: req.params.slug, status, rating: numRating }
  });

  res.json({ success: true, slug: req.params.slug, status, rating: numRating });
});

// 6b. Update Knowledge Base Item Rating endpoint (1 to 5 stars)
app.patch('/api/kb/item/:slug/rating', async (req, res) => {
  const { rating } = req.body;
  const numRating = rating === null || rating === 0 || rating === undefined ? null : Number(rating);
  if (numRating !== null && (!Number.isInteger(numRating) || numRating < 1 || numRating > 5)) {
    return res.status(400).json({ error: 'Rating must be an integer between 1 and 5, or null' });
  }

  const success = await updateKnowledgeBaseItemRating(req.params.slug, numRating);
  if (!success) {
    return res.status(404).json({ error: 'Item not found' });
  }

  eventStream.emit({
    type: 'info',
    stage: 'storage',
    message: `Updated rating of "${req.params.slug}" to ${numRating ? `${numRating} ⭐` : 'unrated'}`,
    details: { slug: req.params.slug, rating: numRating }
  });

  res.json({ success: true, slug: req.params.slug, rating: numRating });
});

// 7. Delete Knowledge Base Item endpoint
app.delete('/api/kb/item/:slug', async (req, res) => {
  const deleteFromWhatsApp = req.query.deleteFromWhatsApp === 'true' || req.body?.deleteFromWhatsApp === true;
  const deleteMode = (req.query.deleteMode as any) || req.body?.deleteMode || 'clear_for_me';

  if (deleteFromWhatsApp) {
    const detail = await getKnowledgeBaseItemParsedDetail(req.params.slug);
    if (detail?.waKey) {
      await deleteWhatsAppMessage(detail.waKey, deleteMode);
    }
  }

  const success = await deleteKnowledgeBaseItem(req.params.slug);
  if (!success) {
    return res.status(500).json({ error: 'Failed to delete item' });
  }

  eventStream.emit({
    type: 'warning',
    stage: 'storage',
    message: `Deleted item "${req.params.slug}" from Inbox`,
    details: { slug: req.params.slug }
  });

  res.json({ success: true, slug: req.params.slug });
});

// 7b. Batch Update Status endpoint
app.post('/api/kb/batch-status', async (req, res) => {
  const { slugs, status, deleteFromWhatsApp = false } = req.body;
  if (!Array.isArray(slugs) || (status !== 'unread' && status !== 'done')) {
    return res.status(400).json({ error: 'Invalid parameters' });
  }

  const results = [];
  for (const slug of slugs) {
    if (status === 'done' && deleteFromWhatsApp) {
      const detail = await getKnowledgeBaseItemParsedDetail(slug);
      if (detail?.waKey) {
        await deleteWhatsAppMessage(detail.waKey, 'clear_for_me');
      }
    }
    const success = await updateKnowledgeBaseItemStatus(slug, status);
    results.push({ slug, success });
  }

  eventStream.emit({
    type: 'info',
    stage: 'storage',
    message: `Batch updated ${slugs.length} items to "${status}"`,
    details: { count: slugs.length, status }
  });

  res.json({ success: true, count: slugs.length, results });
});

// 7c. Batch Delete endpoint
app.post('/api/kb/batch-delete', async (req, res) => {
  const { slugs, deleteFromWhatsApp = false } = req.body;
  if (!Array.isArray(slugs)) {
    return res.status(400).json({ error: 'Invalid parameters' });
  }

  const results = [];
  for (const slug of slugs) {
    if (deleteFromWhatsApp) {
      const detail = await getKnowledgeBaseItemParsedDetail(slug);
      if (detail?.waKey) {
        await deleteWhatsAppMessage(detail.waKey, 'clear_for_me');
      }
    }
    const success = await deleteKnowledgeBaseItem(slug);
    results.push({ slug, success });
  }

  eventStream.emit({
    type: 'warning',
    stage: 'storage',
    message: `Batch deleted ${slugs.length} items from Inbox`,
    details: { count: slugs.length }
  });

  res.json({ success: true, count: slugs.length, results });
});

// 8. Historical Zip Archive Import trigger
app.post('/api/import-zip', async (req, res) => {
  const txtPath = path.resolve(process.cwd(), 'chat_export_temp/WhatsApp Chat with To Do.txt');

  if (!(await fs.pathExists(txtPath))) {
    return res.status(404).json({
      error: `Export text file not found at ${txtPath}. Please ensure the ZIP archive is extracted.`
    });
  }

  res.json({ message: 'Archive import started in background.' });

  // Run in background
  setTimeout(async () => {
    try {
      const entries = await parseExportFile(txtPath);
      await processExportedMessages(entries);
    } catch (err: any) {
      eventStream.emit({
        type: 'error',
        stage: 'parser',
        message: `Archive import failed: ${err.message}`
      });
    }
  }, 100);
});

// 9. Update Runtime Settings
app.post('/api/settings', async (req, res) => {
  const prevTargetChat = config.targetChatName;
  const updated = updateRuntimeConfig(req.body);
  await persistEnvConfig(req.body);

  if (req.body.targetChatName && req.body.targetChatName !== prevTargetChat) {
    await resetWhatsAppTargetChat();
  }

  eventStream.emit({
    type: 'info',
    stage: 'system',
    message: 'Runtime configuration updated and saved.',
    details: { targetChatName: updated.targetChatName, outputDir: updated.outputDir }
  });
  res.json({ message: 'Settings saved', config: updated });
});

// Fallback for SPA routing
app.get('*', (req, res, next) => {
  const indexPath = path.join(frontendBuildDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  next();
});

// Start Express & WhatsApp Client
app.listen(config.port, async () => {
  console.log(`\n🚀 Watodo Server running at http://localhost:${config.port}`);
  eventStream.emit({
    type: 'info',
    stage: 'system',
    message: `Watodo Server listening on http://localhost:${config.port}`
  });

  try {
    await initWhatsAppClient();
  } catch (err: any) {
    console.error('Failed to start WhatsApp socket client:', err);
  }
});
