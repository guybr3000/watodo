export interface LogEvent {
  id: string;
  timestamp: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'status';
  stage: 'listener' | 'parser' | 'classifier' | 'enricher' | 'storage' | 'system';
  message: string;
  details?: any;
}

export interface StatusData {
  whatsapp: {
    status: 'disconnected' | 'connecting' | 'qr_ready' | 'connected';
    qrDataUrl: string | null;
    targetChatName: string;
    targetJid: string | null;
    lastDisconnectReason?: string | null;
  };
  totalItems: number;
  config: {
    targetChatName: string;
    outputDir: string;
    hasGeminiApiKey: boolean;
    maskedGeminiApiKey?: string;
    hasGithubToken: boolean;
    maskedGithubToken?: string;
    port: number;
  };
}

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
