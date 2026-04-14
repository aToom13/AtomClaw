import os from 'os';
import path from 'path';

import { readEnvFile } from './env.js';
import { isValidTimezone } from './timezone.js';

const envConfig = readEnvFile([
  'ASSISTANT_NAME',
  'ASSISTANT_HAS_OWN_NUMBER',
  'PROVIDER',
  'KILOCODE_TOKEN',
  'OLLAMA_BASE_URL',
  'OLLAMA_MODEL',
  'TZ',
  'WHATSAPP_ENABLED',
]);

export const PROVIDER =
  process.env.PROVIDER || envConfig.PROVIDER || 'kilocode';
export const KILOCODE_TOKEN =
  process.env.KILOCODE_TOKEN || envConfig.KILOCODE_TOKEN || '';
export const OLLAMA_BASE_URL =
  process.env.OLLAMA_BASE_URL ||
  envConfig.OLLAMA_BASE_URL ||
  'http://localhost:11434';
export const OLLAMA_MODEL =
  process.env.OLLAMA_MODEL || envConfig.OLLAMA_MODEL || 'llama3';

export const ASSISTANT_NAME =
  process.env.ASSISTANT_NAME || envConfig.ASSISTANT_NAME || 'Atom';
export const ASSISTANT_HAS_OWN_NUMBER =
  (process.env.ASSISTANT_HAS_OWN_NUMBER ||
    envConfig.ASSISTANT_HAS_OWN_NUMBER) === 'true';
export const WHATSAPP_ENABLED =
  process.env.WHATSAPP_ENABLED === 'true' ||
  envConfig.WHATSAPP_ENABLED === 'true';
export const POLL_INTERVAL = 2000;
export const SCHEDULER_POLL_INTERVAL = 60000;

const PROJECT_ROOT = process.cwd();
const HOME_DIR = process.env.HOME || os.homedir();

export const MOUNT_ALLOWLIST_PATH = path.join(
  HOME_DIR,
  '.config',
  'atomclaw',
  'mount-allowlist.json',
);
export const SENDER_ALLOWLIST_PATH = path.join(
  HOME_DIR,
  '.config',
  'atomclaw',
  'sender-allowlist.json',
);
export const STORE_DIR = path.resolve(PROJECT_ROOT, 'store');
export const GROUPS_DIR = path.resolve(PROJECT_ROOT, 'groups');
export const DATA_DIR = path.resolve(PROJECT_ROOT, 'data');

export const MAX_MESSAGES_PER_PROMPT = Math.max(
  1,
  parseInt(process.env.MAX_MESSAGES_PER_PROMPT || '10', 10) || 10,
);
export const MAX_CONCURRENT_AGENTS = Math.max(
  1,
  parseInt(process.env.MAX_CONCURRENT_AGENTS || '3', 10) || 3,
);

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildTriggerPattern(trigger: string): RegExp {
  return new RegExp(`^${escapeRegex(trigger.trim())}\\b`, 'i');
}

export const DEFAULT_TRIGGER = `@${ASSISTANT_NAME}`;

export function getTriggerPattern(trigger?: string): RegExp {
  const normalizedTrigger = trigger?.trim();
  return buildTriggerPattern(normalizedTrigger || DEFAULT_TRIGGER);
}

export const TRIGGER_PATTERN = buildTriggerPattern(DEFAULT_TRIGGER);

function resolveConfigTimezone(): string {
  const candidates = [
    process.env.TZ,
    envConfig.TZ,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  ];
  for (const tz of candidates) {
    if (tz && isValidTimezone(tz)) return tz;
  }
  return 'UTC';
}
export const TIMEZONE = resolveConfigTimezone();

export const DEFAULT_CONFIG = {
  HEARTBEAT_ENABLED: 'true',
  HEARTBEAT_INTERVAL: '3600000',
  HEARTBEAT_CHECK_MESSAGES: 'true',
  HEARTBEAT_SAVE_MEMORY: 'true',
  HEARTBEAT_DAILY_SUMMARY: 'true',
  HEARTBEAT_PROMPT: '',
  MEMORY_PRECOMPACTION_ENABLED: 'true',
  MEMORY_MESSAGE_THRESHOLD: '50',
  AGENT_MAX_ITERATIONS: '10',
};
