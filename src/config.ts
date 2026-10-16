import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export interface AppConfig {
  targetChatName: string;
  geminiApiKey: string;
  githubToken: string;
  outputDir: string;
  port: number;
  authDir: string;
}

import fs from 'fs-extra';

// Load persistent config.json if present
const configJsonPath = path.resolve(process.cwd(), 'config.json');
let savedConfigJson: Partial<AppConfig> = {};
try {
  if (fs.existsSync(configJsonPath)) {
    savedConfigJson = fs.readJsonSync(configJsonPath);
  }
} catch {}

function resolveOutputDir(envVal?: string, jsonVal?: string): string {
  if (envVal) {
    return path.resolve(process.cwd(), envVal);
  }
  if (jsonVal) {
    // If running on Linux/Docker and jsonVal is a Windows absolute path (e.g. C:\...), ignore it
    if (process.platform !== 'win32' && /^[a-zA-Z]:\\/.test(jsonVal)) {
      return path.resolve(process.cwd(), './inbox');
    }
    return path.resolve(process.cwd(), jsonVal);
  }
  return path.resolve(process.cwd(), './inbox');
}

export const config: AppConfig = {
  targetChatName: savedConfigJson.targetChatName || process.env.TARGET_CHAT_NAME || 'To Do',
  geminiApiKey: savedConfigJson.geminiApiKey || process.env.GEMINI_API_KEY || '',
  githubToken: savedConfigJson.githubToken || process.env.GITHUB_TOKEN || '',
  outputDir: resolveOutputDir(process.env.OUTPUT_DIR, savedConfigJson.outputDir),
  port: parseInt(process.env.PORT || '', 10) || savedConfigJson.port || 3001,
  authDir: path.resolve(process.cwd(), process.env.AUTH_DIR || './auth_info_baileys'),
};

// Sync process.env
if (config.geminiApiKey) process.env.GEMINI_API_KEY = config.geminiApiKey;
if (config.githubToken) process.env.GITHUB_TOKEN = config.githubToken;
if (config.targetChatName) process.env.TARGET_CHAT_NAME = config.targetChatName;

export function updateRuntimeConfig(newConfig: Partial<AppConfig>): AppConfig {
  if (newConfig.targetChatName !== undefined) {
    config.targetChatName = newConfig.targetChatName;
    process.env.TARGET_CHAT_NAME = newConfig.targetChatName;
  }
  if (newConfig.geminiApiKey !== undefined) {
    config.geminiApiKey = newConfig.geminiApiKey;
    process.env.GEMINI_API_KEY = newConfig.geminiApiKey;
  }
  if (newConfig.githubToken !== undefined) {
    config.githubToken = newConfig.githubToken;
    process.env.GITHUB_TOKEN = newConfig.githubToken;
  }
  if (newConfig.outputDir !== undefined) {
    config.outputDir = path.resolve(process.cwd(), newConfig.outputDir);
    process.env.OUTPUT_DIR = newConfig.outputDir;
  }
  if (newConfig.port !== undefined) {
    config.port = newConfig.port;
    process.env.PORT = String(newConfig.port);
  }
  return config;
}

export async function persistEnvConfig(updated: Partial<AppConfig>): Promise<void> {
  // 1. Persist to config.json
  try {
    let currentJson: any = {};
    if (await fs.pathExists(configJsonPath)) {
      try {
        currentJson = await fs.readJson(configJsonPath);
      } catch {}
    }
    const merged = { ...currentJson, ...updated };
    await fs.writeJson(configJsonPath, merged, { spaces: 2 });
  } catch (jsonErr: any) {
    console.warn('[Config] Could not write config.json:', jsonErr.message);
  }

  // 2. Persist to .env
  const envPath = path.resolve(process.cwd(), '.env');
  try {
    let content = (await fs.pathExists(envPath)) ? await fs.readFile(envPath, 'utf8') : '';
    if (updated.geminiApiKey !== undefined) {
      if (content.includes('GEMINI_API_KEY=')) {
        content = content.replace(/GEMINI_API_KEY=.*/, `GEMINI_API_KEY="${updated.geminiApiKey}"`);
      } else {
        content += `\nGEMINI_API_KEY="${updated.geminiApiKey}"\n`;
      }
    }
    if (updated.githubToken !== undefined) {
      if (content.includes('GITHUB_TOKEN=')) {
        content = content.replace(/GITHUB_TOKEN=.*/, `GITHUB_TOKEN="${updated.githubToken}"`);
      } else {
        content += `\nGITHUB_TOKEN="${updated.githubToken}"\n`;
      }
    }
    if (updated.targetChatName !== undefined) {
      if (content.includes('TARGET_CHAT_NAME=')) {
        content = content.replace(/TARGET_CHAT_NAME=.*/, `TARGET_CHAT_NAME="${updated.targetChatName}"`);
      } else {
        content += `\nTARGET_CHAT_NAME="${updated.targetChatName}"\n`;
      }
    }
    await fs.writeFile(envPath, content.trim() + '\n', 'utf8');
  } catch (err: any) {
    console.warn('[Config] Could not persist settings to .env file:', err.message);
  }
}
