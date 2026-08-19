import { WASocket, WAMessage } from '@whiskeysockets/baileys';
import { config } from '../config.js';
import { eventStream } from '../sse/eventStream.js';

let cachedTargetJid: string | null = null;

export function resetTargetGroupJidCache(): void {
  cachedTargetJid = null;
}

export async function findTargetGroupJid(sock: WASocket): Promise<string | null> {
  if (cachedTargetJid) return cachedTargetJid;

  try {
    const groups = await sock.groupFetchAllParticipating();
    const targetNameLower = config.targetChatName.toLowerCase().trim();

    // 1. Exact match on group subject
    for (const [jid, metadata] of Object.entries(groups)) {
      if (metadata.subject.toLowerCase().trim() === targetNameLower) {
        cachedTargetJid = jid;
        eventStream.emit({
          type: 'success',
          stage: 'listener',
          message: `Found target WhatsApp group "${metadata.subject}" (JID: ${jid})`
        });
        return jid;
      }
    }

    // 2. Substring match on group subject
    for (const [jid, metadata] of Object.entries(groups)) {
      if (metadata.subject.toLowerCase().includes(targetNameLower)) {
        cachedTargetJid = jid;
        eventStream.emit({
          type: 'success',
          stage: 'listener',
          message: `Found target WhatsApp group "${metadata.subject}" (JID: ${jid})`
        });
        return jid;
      }
    }

    // 3. Self-chat / "Note to Self" / User chat
    const userJid = sock.user?.id?.replace(/:\d+@/, '@');
    if (
      userJid &&
      (targetNameLower === 'me' ||
        targetNameLower === 'myself' ||
        targetNameLower === 'note to self' ||
        targetNameLower === 'to do')
    ) {
      // If no group found with name "To Do", also check if the user is using personal chat
      console.log(`[Group Filter] No group found with name "${config.targetChatName}". User JID: ${userJid}`);
    }
  } catch (error: any) {
    console.warn(`[Group Filter] Failed to fetch participating groups: ${error.message}`);
  }

  return null;
}

export function isTargetGroupMessage(message: WAMessage, targetJid: string | null): boolean {
  const remoteJid = message.key.remoteJid;
  if (!remoteJid || !targetJid) return false;

  // Strict match: the message's remoteJid must match the target chat JID
  return remoteJid === targetJid;
}

export function extractMessageText(message: WAMessage): string {
  let m = message.message;
  if (!m) return '';

  // Unwrap ephemeral/disappearing message wrapper
  if (m.ephemeralMessage?.message) {
    m = m.ephemeralMessage.message;
  }
  // Unwrap view once message wrapper
  if (m.viewOnceMessage?.message) {
    m = m.viewOnceMessage.message;
  }
  if (m.viewOnceMessageV2?.message) {
    m = m.viewOnceMessageV2.message;
  }
  if (m.documentWithCaptionMessage?.message) {
    m = m.documentWithCaptionMessage.message;
  }

  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    (m.documentMessage ? `DOC-Attached: ${m.documentMessage.fileName || 'file'}` : '') ||
    (m.imageMessage ? `IMG-Attached` : '') ||
    ''
  );
}
