import fs from 'fs';
import path from 'path';

import { ASSISTANT_NAME, DEFAULT_CONFIG, GROUPS_DIR } from './config.js';
import {
  addPlan,
  createTask,
  deleteTask,
  getAllConfig,
  getAllTasks,
  getPlans,
  getSession,
  setConfig,
  setSession,
  updateTask,
} from './db.js';
import { logger } from './logger.js';
import { getProvider } from './providers/index.js';
import type {
  AnyMessage,
  AssistantToolCallMessage,
  Message,
  ToolCall,
  ToolDefinition,
} from './providers/kilocode.js';

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

function loadSystemPrompt(groupFolder: string): string {
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

// ---------------------------------------------------------------------------
// Tool definitions — tools the AI agent can call
// ---------------------------------------------------------------------------

const AGENT_TOOLS: ToolDefinition[] = [
  {
    name: 'read_memory',
    description: 'Read long-term memory (MEMORY.md)',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'write_memory',
    description: 'Append an entry to long-term memory (MEMORY.md)',
    parameters: {
      type: 'object',
      properties: { content: { type: 'string', description: 'Memory entry to append' } },
      required: ['content'],
    },
  },
  {
    name: 'search_memory',
    description: 'Search memory files for keywords',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Search query' } },
      required: ['query'],
    },
  },
  {
    name: 'write_daily',
    description: 'Append an entry to the daily log (DAILY.md)',
    parameters: {
      type: 'object',
      properties: { entry: { type: 'string', description: 'Log entry to append' } },
      required: ['entry'],
    },
  },
  {
    name: 'get_config',
    description: 'Get all system configuration values',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'set_config',
    description: 'Set a system configuration value',
    parameters: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Config key' },
        value: { type: 'string', description: 'Config value' },
      },
      required: ['key', 'value'],
    },
  },
  {
    name: 'list_tasks',
    description: 'List all scheduled tasks',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'schedule_task',
    description: 'Schedule a recurring or one-time task. schedule_type: cron|interval|once. schedule_value: cron expression, ms interval, or ISO timestamp.',
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'What the agent should do' },
        schedule_type: { type: 'string', enum: ['cron', 'interval', 'once'] },
        schedule_value: { type: 'string', description: 'Cron expression, ms count, or ISO timestamp' },
        group_folder: { type: 'string', description: 'Group folder (default: current group)' },
        context_mode: { type: 'string', enum: ['group', 'isolated'], description: 'Context mode (default: group)' },
      },
      required: ['prompt', 'schedule_type', 'schedule_value'],
    },
  },
  {
    name: 'cancel_task',
    description: 'Cancel a scheduled task by ID',
    parameters: {
      type: 'object',
      properties: { task_id: { type: 'string', description: 'Task ID to cancel' } },
      required: ['task_id'],
    },
  },
  {
    name: 'pause_task',
    description: 'Pause a scheduled task',
    parameters: {
      type: 'object',
      properties: { task_id: { type: 'string', description: 'Task ID to pause' } },
      required: ['task_id'],
    },
  },
  {
    name: 'resume_task',
    description: 'Resume a paused task',
    parameters: {
      type: 'object',
      properties: { task_id: { type: 'string', description: 'Task ID to resume' } },
      required: ['task_id'],
    },
  },
  {
    name: 'list_custom_memories',
    description: 'List all custom memory files',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'create_custom_memory',
    description: 'Create a custom memory file',
    parameters: {
      type: 'object',
      properties: {
        filename: { type: 'string', description: 'Filename (will get .md extension)' },
        content: { type: 'string', description: 'File content' },
      },
      required: ['filename', 'content'],
    },
  },
  {
    name: 'read_custom_memory',
    description: 'Read a custom memory file',
    parameters: {
      type: 'object',
      properties: { filename: { type: 'string', description: 'Filename to read' } },
      required: ['filename'],
    },
  },
  {
    name: 'update_custom_memory',
    description: 'Update a custom memory file',
    parameters: {
      type: 'object',
      properties: {
        filename: { type: 'string', description: 'Filename to update' },
        content: { type: 'string', description: 'New content' },
      },
      required: ['filename', 'content'],
    },
  },
  {
    name: 'get_plans',
    description: 'Get weekly plans, optionally filtered by day (0=Sun, 6=Sat)',
    parameters: {
      type: 'object',
      properties: { day_of_week: { type: 'number', description: '0-6, optional' } },
      required: [],
    },
  },
  {
    name: 'add_plan',
    description: 'Add a weekly plan',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        day_of_week: { type: 'number', description: '0=Sun, 6=Sat' },
        start_time: { type: 'string', description: 'HH:MM format' },
        end_time: { type: 'string', description: 'HH:MM format' },
      },
      required: ['title', 'day_of_week'],
    },
  },
];

// ---------------------------------------------------------------------------
// Tool executor — runs a tool call and returns a string result
// ---------------------------------------------------------------------------

function executeTool(
  toolCall: ToolCall,
  groupFolder: string,
  chatJid: string,
): string {
  const args = toolCall.arguments;

  try {
    switch (toolCall.name) {
      case 'read_memory':
        return loadMemory() || '(memory is empty)';

      case 'write_memory': {
        const content = String(args.content ?? '');
        updateMEMORY(content);
        return 'Memory updated.';
      }

      case 'search_memory': {
        const query = String(args.query ?? '');
        return searchMemory(query) || 'No matches found.';
      }

      case 'write_daily': {
        const entry = String(args.entry ?? '');
        appendDailyLog(entry);
        return 'Daily log updated.';
      }

      case 'get_config': {
        const config = getAllConfig();
        const lines = Object.entries(config).map(([k, v]) => `${k}=${v}`);
        return lines.join('\n') || '(no config set)';
      }

      case 'set_config': {
        const key = String(args.key ?? '');
        const value = String(args.value ?? '');
        setConfig(key, value);
        return `Config set: ${key}=${value}`;
      }

      case 'list_tasks': {
        const tasks = getAllTasks();
        if (tasks.length === 0) return 'No tasks scheduled.';
        return tasks
          .map((t) => `[${t.id}] ${t.prompt.slice(0, 60)} (${t.schedule_type}: ${t.schedule_value}) — ${t.status}`)
          .join('\n');
      }

      case 'schedule_task': {
        const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const folder = String(args.group_folder ?? groupFolder);
        createTask({
          id: taskId,
          group_folder: folder,
          chat_jid: chatJid,
          prompt: String(args.prompt ?? ''),
          schedule_type: (args.schedule_type as 'cron' | 'interval' | 'once') ?? 'once',
          schedule_value: String(args.schedule_value ?? ''),
          context_mode: (args.context_mode as 'group' | 'isolated') ?? 'group',
          next_run: new Date().toISOString(),
          status: 'active',
          created_at: new Date().toISOString(),
        });
        return `Task ${taskId} scheduled.`;
      }

      case 'cancel_task': {
        const taskId = String(args.task_id ?? '');
        deleteTask(taskId);
        return `Task ${taskId} cancelled.`;
      }

      case 'pause_task': {
        const taskId = String(args.task_id ?? '');
        updateTask(taskId, { status: 'paused' });
        return `Task ${taskId} paused.`;
      }

      case 'resume_task': {
        const taskId = String(args.task_id ?? '');
        updateTask(taskId, { status: 'active' });
        return `Task ${taskId} resumed.`;
      }

      case 'list_custom_memories':
        return listCustomMemories();

      case 'create_custom_memory': {
        const filePath = createCustomMemory(
          String(args.filename ?? ''),
          String(args.content ?? ''),
        );
        return `Created ${filePath}`;
      }

      case 'read_custom_memory':
        return readCustomMemory(String(args.filename ?? '')) || '(file not found)';

      case 'update_custom_memory': {
        const filePath = updateCustomMemory(
          String(args.filename ?? ''),
          String(args.content ?? ''),
        );
        return `Updated ${filePath}`;
      }

      case 'get_plans': {
        const day = args.day_of_week !== undefined ? Number(args.day_of_week) : undefined;
        const plans = getPlans(day);
        if (plans.length === 0) return 'No plans found.';
        return plans
          .map((p) => `[${p.id}] ${p.title} (day ${p.day_of_week}, ${p.start_time || 'any'})`)
          .join('\n');
      }

      case 'add_plan': {
        const planId = `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        addPlan({
          id: planId,
          title: String(args.title ?? ''),
          description: args.description ? String(args.description) : undefined,
          day_of_week: Number(args.day_of_week ?? 0),
          start_time: args.start_time ? String(args.start_time) : undefined,
          end_time: args.end_time ? String(args.end_time) : undefined,
          recurrence: 'weekly',
          created_at: new Date().toISOString(),
        });
        return `Plan "${args.title}" added with ID ${planId}.`;
      }

      default:
        return `Unknown tool: ${toolCall.name}`;
    }
  } catch (err) {
    return `Error executing ${toolCall.name}: ${err instanceof Error ? err.message : String(err)}`;
  }
}

export async function runAgent(
  input: AgentInput,
  onOutput?: (output: AgentOutput) => Promise<void>,
): Promise<AgentOutput> {
  const { prompt, sessionId, groupFolder, chatJid } = input;

  let currentSessionId = sessionId || getSession(groupFolder);

  const systemPrompt = loadSystemPrompt(groupFolder);

  const provider = getProvider();
  const supportsTools = typeof provider.chatWithTools === 'function';

  let iteration = 0;
  let lastResult = '';

  if (supportsTools) {
    // --- Tool calling loop ---
    const messages: AnyMessage[] = [{ role: 'user', content: prompt }];

    while (iteration < MAX_ITERATIONS) {
      iteration++;

      logger.info(
        { group: groupFolder, iteration, messageCount: messages.length },
        'Calling provider (with tools)',
      );

      let response;
      try {
        response = await provider.chatWithTools!(messages, systemPrompt, AGENT_TOOLS);
      } catch (err) {
        logger.error({ group: groupFolder, err }, 'Provider error');
        return {
          result: '',
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        };
      }

      if (response.toolCalls && response.toolCalls.length > 0) {
        // Push assistant message with tool_calls
        const assistantMsg: AssistantToolCallMessage = {
          role: 'assistant',
          content: response.content || null,
          tool_calls: response.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
          })),
        };
        messages.push(assistantMsg);

        // Execute each tool and push results
        for (const tc of response.toolCalls) {
          logger.info({ group: groupFolder, tool: tc.name, args: tc.arguments }, 'Executing tool');
          const result = executeTool(tc, groupFolder, chatJid);
          logger.info({ group: groupFolder, tool: tc.name, resultLen: result.length }, 'Tool result');

          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            name: tc.name,
            content: result,
          });
        }

        // Continue the loop for the next AI response
        continue;
      }

      // No tool calls — final text response
      lastResult = response.content;
      break;
    }
  } else {
    // --- Simple chat (no tools) ---
    const messages: Message[] = [{ role: 'user', content: prompt }];

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
      messages.push({ role: 'assistant', content: response });
      break;
    }
  }

  if (iteration >= MAX_ITERATIONS) {
    logger.warn(
      { group: groupFolder, iterations: MAX_ITERATIONS },
      'Max iterations reached',
    );
  }

  if (lastResult && onOutput) {
    await onOutput({ result: lastResult, status: 'success' });
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
