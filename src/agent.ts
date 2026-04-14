import fs from 'fs';
import path from 'path';

import { ASSISTANT_NAME, DEFAULT_CONFIG, GROUPS_DIR } from './config.js';
import { getAllConfig, getSession, setConfig, setSession } from './db.js';
import { logger } from './logger.js';
import { getProvider } from './providers/index.js';
import type { Message } from './providers/kilocode.js';

const MEMORY_DIR = path.join(GROUPS_DIR, 'memory');
const MEMORY_FILE = path.join(MEMORY_DIR, 'MEMORY.md');
const DAILY_FILE = path.join(MEMORY_DIR, 'DAILY.md');
const CONFIG_FILE = path.join(MEMORY_DIR, 'CONFIG.md');
const CUSTOM_DIR = path.join(MEMORY_DIR, 'custom');
const ARCHIVE_DIR = path.join(MEMORY_DIR, 'archive');
const MAX_ITERATIONS = 10;

function ensureMemoryDirs(): void {
  fs.mkdirSync(MEMORY_DIR, { recursive: true });
  fs.mkdirSync(CUSTOM_DIR, { recursive: true });
  fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
}

export function loadMemory(): string {
  ensureMemoryDirs();
  if (fs.existsSync(MEMORY_FILE)) {
    return fs.readFileSync(MEMORY_FILE, 'utf-8');
  }
  return '';
}

export function saveMemory(content: string): void {
  ensureMemoryDirs();
  fs.writeFileSync(MEMORY_FILE, content, 'utf-8');
}

export function loadDailyLog(): string {
  ensureMemoryDirs();
  if (fs.existsSync(DAILY_FILE)) {
    return fs.readFileSync(DAILY_FILE, 'utf-8');
  }
  return '';
}

export function appendDailyLog(entry: string): void {
  ensureMemoryDirs();
  const timestamp = new Date().toISOString();
  const existing = fs.existsSync(DAILY_FILE)
    ? fs.readFileSync(DAILY_FILE, 'utf-8')
    : '';
  const newContent = existing + `\n\n## ${timestamp}\n${entry}`;
  fs.writeFileSync(DAILY_FILE, newContent, 'utf-8');
}

export function searchMemory(query: string): string {
  ensureMemoryDirs();
  const keywords = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (keywords.length === 0) return '';

  const results: string[] = [];
  const memoryContent = fs.existsSync(MEMORY_FILE)
    ? fs.readFileSync(MEMORY_FILE, 'utf-8')
    : '';
  const dailyContent = fs.existsSync(DAILY_FILE)
    ? fs.readFileSync(DAILY_FILE, 'utf-8')
    : '';

  for (const [filename, content] of [
    ['MEMORY.md', memoryContent],
    ['DAILY.md', dailyContent],
  ]) {
    const contentLower = content.toLowerCase();
    const matches = keywords.filter((k) => contentLower.includes(k));
    if (matches.length > 0) {
      results.push(`[${filename} matched: ${matches.join(', ')}]`);
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const lineLower = lines[i].toLowerCase();
        if (keywords.some((k) => lineLower.includes(k))) {
          results.push(`  Line ${i + 1}: ${lines[i].slice(0, 100)}`);
        }
      }
    }
  }

  const customFiles = fs
    .readdirSync(CUSTOM_DIR)
    .filter((f) => f.endsWith('.md'));
  for (const file of customFiles) {
    const content = fs.readFileSync(path.join(CUSTOM_DIR, file), 'utf-8');
    const contentLower = content.toLowerCase();
    const matches = keywords.filter((k) => contentLower.includes(k));
    if (matches.length > 0) {
      results.push(`[custom/${file} matched: ${matches.join(', ')}]`);
    }
  }

  return results.join('\n') || 'No matches found';
}

export function loadConfig(): Record<string, string> {
  ensureMemoryDirs();
  const config: Record<string, string> = { ...DEFAULT_CONFIG };
  const dbConfig = getAllConfig();
  for (const [key, value] of Object.entries(dbConfig)) {
    config[key] = value;
  }
  if (fs.existsSync(CONFIG_FILE)) {
    const lines = fs.readFileSync(CONFIG_FILE, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const eq = trimmed.indexOf('=');
        if (eq > 0) {
          config[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
        }
      }
    }
  }
  return config;
}

export function updateConfigValue(key: string, value: string): void {
  setConfig(key, value);
}

export function updateAGENT(
  rules: string,
  groupFolder: string = 'global',
): void {
  const targetPath = path.join(GROUPS_DIR, groupFolder, 'AGENT.md.pending');
  fs.writeFileSync(targetPath, rules, 'utf-8');
}

export function updateMEMORY(entry: string): void {
  const existing = loadMemory();
  const timestamp = new Date().toISOString();
  const newContent = existing + `\n\n## ${timestamp}\n${entry}`;
  saveMemory(newContent);
}

export function getContextSummary(): string {
  const memory = loadMemory();
  const daily = loadDailyLog();
  const config = loadConfig();
  return `Memory: ${memory.length} chars\nDaily: ${daily.length} chars\nConfig: ${JSON.stringify(config)}`;
}

export function createCustomMemory(filename: string, content: string): string {
  ensureMemoryDirs();
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = path.join(
    CUSTOM_DIR,
    safeName.endsWith('.md') ? safeName : `${safeName}.md`,
  );
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

export function readCustomMemory(filename: string): string {
  ensureMemoryDirs();
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = path.join(
    CUSTOM_DIR,
    safeName.endsWith('.md') ? safeName : `${safeName}.md`,
  );
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, 'utf-8');
  }
  return '';
}

export function updateCustomMemory(filename: string, content: string): string {
  return createCustomMemory(filename, content);
}

export function listCustomMemories(): string {
  ensureMemoryDirs();
  const files = fs.readdirSync(CUSTOM_DIR).filter((f) => f.endsWith('.md'));
  if (files.length === 0) return 'No custom memories found';
  return files.join('\n');
}

export function archiveDaily(): string {
  ensureMemoryDirs();
  if (!fs.existsSync(DAILY_FILE)) {
    return 'No DAILY.md to archive';
  }
  const content = fs.readFileSync(DAILY_FILE, 'utf-8');
  const today = new Date().toISOString().split('T')[0];
  const archivePath = path.join(ARCHIVE_DIR, `${today}.md`);
  fs.writeFileSync(archivePath, content, 'utf-8');
  fs.writeFileSync(DAILY_FILE, '', 'utf-8');
  return `Archived to ${archivePath}`;
}

export interface AgentInput {
  prompt: string;
  sessionId?: string;
  groupFolder: string;
  chatJid: string;
  isMain: boolean;
}

export interface AgentOutput {
  result: string;
  newSessionId?: string;
  status: 'success' | 'error';
  error?: string;
}

function loadSystemPrompt(groupFolder: string, isMain: boolean): string {
  const parts: string[] = [];

  const groupPath = path.join(GROUPS_DIR, groupFolder, 'AGENT.md');
  if (fs.existsSync(groupPath)) {
    parts.push(fs.readFileSync(groupPath, 'utf-8'));
  }

  const globalPath = path.join(GROUPS_DIR, 'global', 'AGENT.md');
  if (fs.existsSync(globalPath)) {
    parts.push(fs.readFileSync(globalPath, 'utf-8'));
  }

  if (parts.length === 0) {
    parts.push(`You are ${ASSISTANT_NAME}, a helpful AI assistant.`);
  }

  return parts.join('\n\n');
}

export async function runAgent(
  input: AgentInput,
  onOutput?: (output: AgentOutput) => Promise<void>,
): Promise<AgentOutput> {
  const { prompt, sessionId, groupFolder, chatJid, isMain } = input;

  let currentSessionId = sessionId || getSession(groupFolder);

  const systemPrompt = loadSystemPrompt(groupFolder, isMain);

  const messages: Message[] = [];

  if (currentSessionId) {
    messages.push({
      role: 'system' as const,
      content: `[Previous session: ${currentSessionId}]`,
    });
  }

  messages.push({
    role: 'user',
    content: prompt,
  });

  const provider = getProvider();

  let iteration = 0;
  let lastResult = '';

  while (iteration < MAX_ITERATIONS) {
    iteration++;

    logger.info(
      { group: groupFolder, iteration, messageCount: messages.length },
      'Calling provider',
    );

    let response: string;
    try {
      response = await provider.chat(messages, systemPrompt);
    } catch (err) {
      logger.error({ group: groupFolder, err }, 'Provider error');
      return {
        result: '',
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      };
    }

    lastResult = response;

    const output: AgentOutput = {
      result: response,
      status: 'success',
    };

    if (onOutput) {
      await onOutput(output);
    }

    if (!response.trim()) {
      break;
    }

    messages.push({
      role: 'assistant',
      content: response,
    });

    break;
  }

  if (iteration >= MAX_ITERATIONS) {
    logger.warn(
      { group: groupFolder, iterations: MAX_ITERATIONS },
      'Max iterations reached',
    );
  }

  if (!currentSessionId && lastResult) {
    currentSessionId = `sess-${Date.now()}`;
    setSession(groupFolder, currentSessionId);
  }

  return {
    result: lastResult,
    newSessionId: currentSessionId,
    status: 'success',
  };
}
