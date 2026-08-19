import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  WASocket,
  WAMessage,
  downloadMediaMessage
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import qrcodeTerminal from 'qrcode-terminal';
import fs from 'fs-extra';
import path from 'path';
import { config } from '../config.js';
import { eventStream } from '../sse/eventStream.js';
import { findTargetGroupJid, isTargetGroupMessage, extractMessageText, resetTargetGroupJidCache } from './groupFilter.js';
import { classifyContent, ClassifiedContent } from '../classifier/contentClassifier.js';
import { fetchGitHubRepoMetadata } from '../enricher/githubEnricher.js';
import { scrapeArticleMetadata } from '../enricher/articleEnricher.js';
import { enrichWithAI } from '../enricher/aiEnricher.js';
import { saveProcessedItem } from '../storage/mdWriter.js';

let sock: WASocket | null = null;
let currentQrCode: string | null = null;
let currentQrDataUrl: string | null = null;
let connectionStatus: 'disconnected' | 'connecting' | 'qr_ready' | 'connected' = 'disconnected';
let targetJid: string | null = null;

export async function resetWhatsAppTargetChat() {
  targetJid = null;
  resetTargetGroupJidCache();
  if (sock && connectionStatus === 'connected') {
    targetJid = await findTargetGroupJid(sock);
  }
}

export function getWhatsAppState() {
  return {
    status: connectionStatus,
    qrDataUrl: currentQrDataUrl,
    targetChatName: config.targetChatName,
    targetJid
  };
}

export async function initWhatsAppClient() {
  eventStream.emit({
    type: 'info',
    stage: 'listener',
    message: 'Initializing WhatsApp Web Baileys client...'
  });

  const { state, saveCreds } = await useMultiFileAuthState(config.authDir);

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    syncFullHistory: false
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      connectionStatus = 'qr_ready';
      currentQrCode = qr;
      currentQrDataUrl = await QRCode.toDataURL(qr);
      qrcodeTerminal.generate(qr, { small: true });

      eventStream.emit({
        type: 'status',
        stage: 'listener',
        message: 'WhatsApp pairing QR code ready. Please scan via WhatsApp mobile app.',
        details: { qrDataUrl: currentQrDataUrl }
      });
    }

    if (connection === 'connecting') {
      connectionStatus = 'connecting';
      eventStream.emit({
        type: 'info',
        stage: 'listener',
        message: 'Connecting to WhatsApp Web socket...'
      });
    }

    if (connection === 'open') {
      connectionStatus = 'connected';
      currentQrCode = null;
      currentQrDataUrl = null;

      eventStream.emit({
        type: 'success',
        stage: 'listener',
        message: 'Successfully connected to WhatsApp Web!'
      });

      if (sock) {
        targetJid = await findTargetGroupJid(sock);
      }
    }

    if (connection === 'close') {
      connectionStatus = 'disconnected';
      const shouldReconnect =
        (lastDisconnect?.error as any)?.output?.statusCode !== DisconnectReason.loggedOut;

      eventStream.emit({
        type: 'warning',
        stage: 'listener',
        message: `WhatsApp connection closed. Reconnecting: ${shouldReconnect}`
      });

      if (shouldReconnect) {
        setTimeout(() => initWhatsAppClient(), 5000);
      }
    }
  });

const processedMessageIds = new Set<string>();

  sock.ev.on('messages.upsert', async (m) => {
    // Process both 'notify' and 'append' (self-sent) messages
    if (m.type !== 'notify' && m.type !== 'append') return;

    for (const msg of m.messages) {
      if (!msg.message) continue;

      const msgId = msg.key.id;
      if (msgId && processedMessageIds.has(msgId)) continue;
      if (msgId) processedMessageIds.add(msgId);

      // Keep deduplication set bounded
      if (processedMessageIds.size > 500) {
        const first = processedMessageIds.values().next().value;
        if (first) processedMessageIds.delete(first);
      }

      if (!targetJid && sock) {
        targetJid = await findTargetGroupJid(sock);
      }

      if (!isTargetGroupMessage(msg, targetJid)) continue;

      const rawMsg = msg.message;
      const text = extractMessageText(msg);

      // Check for Voice Notes / Audio Messages
      const hasAudio = Boolean(
        rawMsg?.audioMessage ||
        rawMsg?.ephemeralMessage?.message?.audioMessage ||
        rawMsg?.viewOnceMessage?.message?.audioMessage ||
        rawMsg?.viewOnceMessageV2?.message?.audioMessage ||
        (rawMsg?.documentMessage?.mimetype && rawMsg.documentMessage.mimetype.startsWith('audio/'))
      );

      // Check for Images
      const hasImage = Boolean(
        rawMsg?.imageMessage ||
        rawMsg?.ephemeralMessage?.message?.imageMessage ||
        rawMsg?.viewOnceMessage?.message?.imageMessage ||
        rawMsg?.viewOnceMessageV2?.message?.imageMessage ||
        rawMsg?.documentWithCaptionMessage?.message?.imageMessage ||
        (rawMsg?.documentMessage?.mimetype && rawMsg.documentMessage.mimetype.startsWith('image/'))
      );

      // Skip if completely empty message
      if (!text && !hasAudio && !hasImage) {
        continue;
      }

      const sender = msg.key.fromMe ? 'Guy B (Self)' : (msg.pushName || msg.key.participant || 'WhatsApp User');
      const timestamp = new Date((msg.messageTimestamp as number) * 1000 || Date.now());

      const waKey = {
        id: msg.key.id || undefined,
        remoteJid: msg.key.remoteJid || targetJid || undefined,
        fromMe: Boolean(msg.key.fromMe),
        participant: msg.key.participant || undefined,
        timestamp: (msg.messageTimestamp as number) || Math.floor(Date.now() / 1000)
      };

      // 1. Check for Bot Commands (!todo, !done, !search, !summary, !help)
      if (text && text.trim().startsWith('!')) {
        const handled = await handleBotCommand(sock, msg, text, sender, targetJid || msg.key.remoteJid || '');
        if (handled) continue;
      }

      // 2. Handle Voice Notes / Audio Messages
      if (hasAudio) {
        try {
          const buffer = await downloadMediaMessage(msg, 'buffer', {});
          if (buffer) {
            const mediaDir = path.join(config.outputDir, 'media');
            await fs.ensureDir(mediaDir);
            const timeId = timestamp.getTime().toString(36);
            const audioMime = rawMsg?.audioMessage?.mimetype || 'audio/ogg';
            const ext = audioMime.includes('mp4') || audioMime.includes('m4a') ? 'm4a' : audioMime.includes('mp3') ? 'mp3' : 'ogg';
            const mediaFilename = `wa_voice_${timeId}_${msg.key.id || 'voice'}.${ext}`;
            const mediaFilePath = path.join(mediaDir, mediaFilename);
            await fs.writeFile(mediaFilePath, buffer);
            const attachedAudio = `/api/media/${mediaFilename}`;

            eventStream.emit({
              type: 'info',
              stage: 'listener',
              message: `Received voice note from "${sender}". Transcribing with Gemini Audio AI...`
            });

            const audioResult = await transcribeAndEnrichAudio(buffer, audioMime, sender, timestamp);
            const classifiedAudio: ClassifiedContent = {
              type: 'TASK_NOTE',
              urls: [],
              rawText: audioResult.transcription
            };

            await saveProcessedItem(
              audioResult.transcription,
              sender,
              timestamp,
              classifiedAudio,
              audioResult.enriched,
              undefined,
              undefined,
              undefined,
              waKey,
              attachedAudio
            );

            eventStream.emit({
              type: 'success',
              stage: 'storage',
              message: `Voice note transcribed: "${audioResult.enriched.title}"`
            });
            continue;
          }
        } catch (audioErr: any) {
          console.warn('[WhatsApp Audio] Error processing audio message:', audioErr.message);
        }
      }

      let attachedImage: string | undefined = undefined;
      if (hasImage) {
        try {
          const buffer = await downloadMediaMessage(msg, 'buffer', {});
          if (buffer) {
            const mediaDir = path.join(config.outputDir, 'media');
            await fs.ensureDir(mediaDir);
            const timeId = timestamp.getTime().toString(36);
            const ext = rawMsg?.imageMessage?.mimetype?.split('/')[1] || 'jpg';
            const mediaFilename = `wa_${timeId}_${msg.key.id || 'image'}.${ext}`;
            const mediaFilePath = path.join(mediaDir, mediaFilename);
            await fs.writeFile(mediaFilePath, buffer);
            attachedImage = `/api/media/${mediaFilename}`;

            eventStream.emit({
              type: 'info',
              stage: 'listener',
              message: `Downloaded attached image to media/${mediaFilename}`
            });
          }
        } catch (downloadErr: any) {
          console.warn('[WhatsApp Media] Could not download image:', downloadErr.message);
        }
      }

      const effectiveText = text || (hasImage ? '[Attached Photo]' : '');
      if (effectiveText) {
        eventStream.emit({
          type: 'info',
          stage: 'listener',
          message: `Received message from "${sender}" in "${config.targetChatName}": "${effectiveText.substring(0, 60)}..."`
        });

        try {
          await processSingleMessage(effectiveText, sender, timestamp, attachedImage, waKey);
        } catch (err: any) {
          eventStream.emit({
            type: 'error',
            stage: 'listener',
            message: `Failed to process message: ${err.message}`
          });
        }
      }
    }
  });

  return sock;
}

import { fetchXPostMetadata } from '../enricher/xEnricher.js';
import { transcribeAndEnrichAudio } from '../enricher/aiEnricher.js';
import { getKbItems, updateKnowledgeBaseItemStatus, KbItemSummary } from '../storage/kbReader.js';

async function handleBotCommand(
  sock: any,
  msg: any,
  commandText: string,
  sender: string,
  targetJid: string
): Promise<boolean> {
  const trimmed = commandText.trim();
  const [cmdRaw, ...args] = trimmed.split(' ');
  const cmd = cmdRaw.toLowerCase();
  const query = args.join(' ').trim();
  const remoteJid = msg.key.remoteJid || targetJid;
  if (!remoteJid || !sock) return false;

  try {
    if (cmd === '!help' || cmd === '!commands') {
      const helpText = `🤖 *Watodo WhatsApp Assistant*
    
• *!todo* or *!pending* — View your top pending tasks
• *!done <# or keyword>* — Mark task as done (or quote & reply !done)
• *!search <query>* — Search notes, repositories & articles
• *!summary* — Summarize today's inbox
• *!help* — Show this command menu`;

      await sock.sendMessage(remoteJid, { text: helpText }, { quoted: msg });
      return true;
    }

    if (cmd === '!todo' || cmd === '!pending' || cmd === '!tasks') {
      const items: KbItemSummary[] = await getKbItems();
      const pending = items.filter((i: KbItemSummary) => i.status !== 'done');
      if (pending.length === 0) {
        await sock.sendMessage(remoteJid, { text: '🎉 *All clear!* You have zero pending tasks in Watodo.' }, { quoted: msg });
        return true;
      }

      const top5 = pending.slice(0, 5);
      let listText = `📋 *Watodo Pending Tasks* (${top5.length} of ${pending.length})\n\n`;
      top5.forEach((item: KbItemSummary, idx: number) => {
        const icon = item.category === 'Repository' ? '💻' : item.category === 'Article' ? '📰' : item.category === 'Research' ? '🔬' : '📌';
        listText += `${idx + 1}️⃣ ${icon} *${item.title}*\n   📂 _${item.category}_ ${item.tags?.length ? `• #${item.tags.slice(0, 2).join(' #')}` : ''}\n\n`;
      });
      listText += `_Reply with !done <number> or quote to complete._`;

      await sock.sendMessage(remoteJid, { text: listText }, { quoted: msg });
      return true;
    }

    if (cmd === '!done' || cmd === '!complete') {
      const quotedStanzaId = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;
      const items: KbItemSummary[] = await getKbItems();
      let targetItem: KbItemSummary | undefined = undefined;

      if (quotedStanzaId) {
        targetItem = items.find((i: any) => i.waKey?.id === quotedStanzaId);
      }

      if (!targetItem && query) {
        const num = parseInt(query, 10);
        const pending = items.filter((i: KbItemSummary) => i.status !== 'done');
        if (!isNaN(num) && num >= 1 && num <= pending.length) {
          targetItem = pending[num - 1];
        } else {
          targetItem = items.find((i: KbItemSummary) => i.title.toLowerCase().includes(query.toLowerCase()) || i.slug.toLowerCase().includes(query.toLowerCase()));
        }
      }

      if (targetItem) {
        await updateKnowledgeBaseItemStatus(targetItem.slug, 'done');
        await sock.sendMessage(remoteJid, { text: `✅ *Completed:* "${targetItem.title}" marked as done in Watodo!` }, { quoted: msg });
        return true;
      } else {
        await sock.sendMessage(remoteJid, { text: `⚠️ Could not find matching item. Use \`!todo\` to see item numbers or quote the message.` }, { quoted: msg });
        return true;
      }
    }

    if (cmd === '!search' || cmd === '!find') {
      if (!query) {
        await sock.sendMessage(remoteJid, { text: `🔍 Please provide a search term: e.g. \`!search ai agents\`` }, { quoted: msg });
        return true;
      }

      const items: KbItemSummary[] = await getKbItems();
      const qLower = query.toLowerCase();
      const matches = items.filter((i: KbItemSummary) =>
        i.title.toLowerCase().includes(qLower) ||
        i.tags.some((t: string) => t.toLowerCase().includes(qLower)) ||
        i.category.toLowerCase().includes(qLower) ||
        (i.summary && i.summary.toLowerCase().includes(qLower))
      ).slice(0, 3);

      if (matches.length === 0) {
        await sock.sendMessage(remoteJid, { text: `🔍 No items found matching "${query}".` }, { quoted: msg });
        return true;
      }

      let searchReply = `🔍 *Top Results for "${query}"* (${matches.length}):\n\n`;
      matches.forEach((m: KbItemSummary, idx: number) => {
        const statusIcon = m.status === 'done' ? '✅' : '⏳';
        searchReply += `${idx + 1}️⃣ ${statusIcon} *${m.title}*\n   _${m.category}_ ${m.url ? `\n   🔗 ${m.url}` : ''}\n\n`;
      });

      await sock.sendMessage(remoteJid, { text: searchReply }, { quoted: msg });
      return true;
    }

    if (cmd === '!summary' || cmd === '!digest') {
      const items: KbItemSummary[] = await getKbItems();
      const todayStr = new Date().toISOString().split('T')[0];
      const todaysItems = items.filter((i: KbItemSummary) => i.date.startsWith(todayStr));

      if (todaysItems.length === 0) {
        await sock.sendMessage(remoteJid, { text: `📅 *Today's Digest:* No items recorded today yet.` }, { quoted: msg });
        return true;
      }

      let summaryText = `📊 *Today's Watodo Digest* (${todaysItems.length} items):\n\n`;
      const pendingCount = todaysItems.filter((i: KbItemSummary) => i.status !== 'done').length;
      const doneCount = todaysItems.filter((i: KbItemSummary) => i.status === 'done').length;
      summaryText += `⏳ *Pending:* ${pendingCount}  |  ✅ *Done:* ${doneCount}\n\n`;

      todaysItems.slice(0, 5).forEach((item: KbItemSummary, idx: number) => {
        summaryText += `• *${item.title}* (${item.category})\n`;
      });

      if (todaysItems.length > 5) {
        summaryText += `\n_...and ${todaysItems.length - 5} more items in web dashboard._`;
      }

      await sock.sendMessage(remoteJid, { text: summaryText }, { quoted: msg });
      return true;
    }
  } catch (err: any) {
    console.warn('[WhatsApp Bot] Error handling command:', err.message);
  }

  return false;
}

export async function processSingleMessage(
  text: string,
  sender: string,
  timestamp: Date,
  attachedImage?: string,
  waKey?: { id?: string; remoteJid?: string; fromMe?: boolean; participant?: string }
) {
  const classified = classifyContent(text);

  eventStream.emit({
    type: 'info',
    stage: 'classifier',
    message: `Classified item as ${classified.type}`,
    details: { type: classified.type, primaryUrl: classified.primaryUrl }
  });

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
      message: `Scraping web article content from ${classified.primaryUrl}`
    });
    articleMeta = await scrapeArticleMetadata(classified.primaryUrl);
  }

  eventStream.emit({
    type: 'info',
    stage: 'enricher',
    message: 'Synthesizing AI context & prompt starters...'
  });

  const aiEnriched = await enrichWithAI(classified, githubMeta, articleMeta, xMeta);

  await saveProcessedItem(
    text,
    sender,
    timestamp,
    classified,
    aiEnriched,
    githubMeta,
    articleMeta,
    attachedImage,
    waKey
  );
}

export async function deleteWhatsAppMessage(
  waKey?: {
    remoteJid?: string;
    id?: string;
    fromMe?: boolean;
    participant?: string;
    timestamp?: string | number;
  },
  mode: 'clear_for_me' | 'revoke' = 'clear_for_me'
): Promise<boolean> {
  if (!sock) {
    console.warn('[WhatsApp Delete] Baileys socket is not connected.');
    return false;
  }
  if (!waKey || !waKey.id) {
    console.warn('[WhatsApp Delete] No message ID provided in waKey:', waKey);
    return false;
  }

  let jid = waKey.remoteJid || targetJid;
  if (!jid) {
    jid = await findTargetGroupJid(sock);
  }
  if (!jid) {
    console.warn('[WhatsApp Delete] Could not find target chat JID for message deletion.');
    return false;
  }

  const rawTs = waKey.timestamp ? Number(waKey.timestamp) : Date.now();
  const ts = Math.floor(rawTs > 1e11 ? rawTs / 1000 : rawTs);
  const fromMe = waKey.fromMe ?? true;

  try {
    // 1. Execute direct protocol delete on WhatsApp (guaranteed deletion)
    await sock.sendMessage(jid, {
      delete: {
        remoteJid: jid,
        id: waKey.id,
        fromMe,
        participant: waKey.participant
      }
    });

    // 2. Also execute chatModify deleteForMe for local syncd cleanup
    try {
      await sock.chatModify(
        {
          deleteForMe: {
            deleteMedia: true,
            key: {
              remoteJid: jid,
              id: waKey.id,
              fromMe,
              participant: fromMe ? undefined : waKey.participant
            },
            timestamp: ts
          }
        },
        jid
      );
    } catch (modifyErr: any) {
      console.warn('[WhatsApp Delete] chatModify deleteForMe notice:', modifyErr.message);
    }

    eventStream.emit({
      type: 'success',
      stage: 'listener',
      message: `Deleted message "${waKey.id}" from WhatsApp chat`
    });
    return true;
  } catch (err: any) {
    console.warn('[WhatsApp] Could not delete message from WhatsApp:', err.message);
    eventStream.emit({
      type: 'warning',
      stage: 'listener',
      message: `Could not delete message from WhatsApp: ${err.message}`
    });
    return false;
  }
}

