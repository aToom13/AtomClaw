import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { CronExpressionParser } from 'cron-parser';

import {
  createTask,
  deleteTask,
  getAllTasks,
  updateTask,
  addPlan,
  deletePlan,
  getPlans,
  Plan,
  setConfig,
  getAllConfig,
} from './db.js';

const server = new McpServer({
  name: 'atomclaw',
  version: '1.0.0',
});

server.tool(
  'send_message',
  "Send a message to the user or group immediately while you're still running. Use this for progress updates or to send multiple messages.",
  {
    text: z.string().describe('The message text to send'),
  },
  async (args) => {
    return { content: [{ type: 'text' as const, text: 'Message sent.' }] };
  },
);

server.tool(
  'schedule_task',
  `Schedule a recurring or one-time task. Returns task ID.

Schedule format (all local time):
- cron: "*/5 * * * *" every 5 min, "0 9 * * *" daily 9am
- interval: milliseconds like "300000" for 5 min
- once: local timestamp like "2026-02-01T15:30:00" (no Z)`,
  {
    prompt: z.string().describe('What the agent should do'),
    schedule_type: z.enum(['cron', 'interval', 'once']),
    schedule_value: z.string(),
    context_mode: z.enum(['group', 'isolated']).default('group'),
  },
  async (args) => {
    if (args.schedule_type === 'cron') {
      try {
        CronExpressionParser.parse(args.schedule_value);
      } catch {
        return {
          content: [{ type: 'text', text: `Invalid cron` }],
          isError: true,
        };
      }
    }
    const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    createTask({
      id: taskId,
      group_folder: 'main',
      chat_jid: '',
      prompt: args.prompt,
      schedule_type: args.schedule_type,
      schedule_value: args.schedule_value,
      context_mode: args.context_mode,
      next_run: new Date().toISOString(),
      status: 'active',
      created_at: new Date().toISOString(),
    });
    return { content: [{ type: 'text', text: `Task ${taskId} scheduled` }] };
  },
);

server.tool('list_tasks', 'List all scheduled tasks.', {}, async () => {
  const tasks = getAllTasks();
  if (tasks.length === 0)
    return { content: [{ type: 'text', text: 'No tasks' }] };
  const formatted = tasks
    .map(
      (t) =>
        `- [${t.id}] ${t.prompt.slice(0, 50)}... (${t.schedule_type}: ${t.schedule_value})`,
    )
    .join('\n');
  return { content: [{ type: 'text', text: `Tasks:\n${formatted}` }] };
});

server.tool(
  'pause_task',
  'Pause a task.',
  { task_id: z.string() },
  async (args) => {
    updateTask(args.task_id, { status: 'paused' });
    return { content: [{ type: 'text', text: `Task ${args.task_id} paused` }] };
  },
);

server.tool(
  'resume_task',
  'Resume a task.',
  { task_id: z.string() },
  async (args) => {
    updateTask(args.task_id, { status: 'active' });
    return {
      content: [{ type: 'text', text: `Task ${args.task_id} resumed` }],
    };
  },
);

server.tool(
  'cancel_task',
  'Cancel a task.',
  { task_id: z.string() },
  async (args) => {
    deleteTask(args.task_id);
    return {
      content: [{ type: 'text', text: `Task ${args.task_id} cancelled` }],
    };
  },
);

server.tool(
  'update_task',
  'Update a task.',
  {
    task_id: z.string(),
    prompt: z.string().optional(),
    schedule_type: z.enum(['cron', 'interval', 'once']).optional(),
    schedule_value: z.string().optional(),
  },
  async (args) => {
    const updates: Record<string, unknown> = {};
    if (args.prompt !== undefined) updates.prompt = args.prompt;
    if (args.schedule_type !== undefined)
      updates.schedule_type = args.schedule_type;
    if (args.schedule_value !== undefined)
      updates.schedule_value = args.schedule_value;
    updateTask(args.task_id, updates);
    return {
      content: [{ type: 'text', text: `Task ${args.task_id} updated` }],
    };
  },
);

server.tool(
  'register_group',
  'Register a new group (main only).',
  {
    jid: z.string(),
    name: z.string(),
    folder: z.string(),
    trigger: z.string(),
  },
  async () => {
    return {
      content: [
        { type: 'text', text: 'Use channel commands to register groups' },
      ],
    };
  },
);

server.tool(
  'add_plan',
  `Add a weekly plan. day_of_week: 0=Sun, 6=Sat`,
  {
    title: z.string(),
    description: z.string().optional(),
    day_of_week: z.number().min(0).max(6),
    start_time: z.string().optional(),
    end_time: z.string().optional(),
    recurrence: z.string().default('weekly'),
  },
  async (args) => {
    const planId = `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const plan: Plan = {
      id: planId,
      title: args.title,
      description: args.description,
      day_of_week: args.day_of_week,
      start_time: args.start_time,
      end_time: args.end_time,
      recurrence: args.recurrence,
      created_at: new Date().toISOString(),
    };
    addPlan(plan);
    return { content: [{ type: 'text', text: `Plan "${args.title}" added` }] };
  },
);

server.tool(
  'get_plans',
  'Get plans, optional day filter.',
  {
    day_of_week: z.number().min(0).max(6).optional(),
  },
  async (args) => {
    const plans = getPlans(args.day_of_week);
    if (plans.length === 0)
      return { content: [{ type: 'text', text: 'No plans found' }] };
    const formatted = plans
      .map(
        (p) =>
          `- [${p.id}] ${p.title} (day ${p.day_of_week}, ${p.start_time || 'any'})`,
      )
      .join('\n');
    return { content: [{ type: 'text', text: `Plans:\n${formatted}` }] };
  },
);

server.tool(
  'delete_plan',
  'Delete a plan.',
  { plan_id: z.string() },
  async (args) => {
    deletePlan(args.plan_id);
    return {
      content: [{ type: 'text', text: `Plan ${args.plan_id} deleted` }],
    };
  },
);

server.tool(
  'write_memory',
  'Write to long-term memory (MEMORY.md)',
  { content: z.string() },
  async (args) => {
    const { updateMEMORY } = await import('./agent.js');
    updateMEMORY(args.content);
    return { content: [{ type: 'text', text: 'Memory updated' }] };
  },
);

server.tool('read_memory', 'Read from long-term memory', {}, async () => {
  const { loadMemory } = await import('./agent.js');
  const memory = loadMemory();
  return { content: [{ type: 'text', text: memory || 'No memory found' }] };
});

server.tool(
  'search_memory',
  'Search memory with keywords',
  { query: z.string() },
  async (args) => {
    const { searchMemory } = await import('./agent.js');
    const results = searchMemory(args.query);
    return { content: [{ type: 'text', text: results }] };
  },
);

server.tool(
  'update_agent',
  'Update AGENT.md (writes to pending, activated on restart)',
  { content: z.string(), group_folder: z.string().default('global') },
  async (args) => {
    const { updateAGENT } = await import('./agent.js');
    updateAGENT(args.content, args.group_folder);
    return {
      content: [
        {
          type: 'text',
          text: 'AGENT.md.pending created, will be activated on restart',
        },
      ],
    };
  },
);

server.tool('get_config', 'Get system configuration', {}, async () => {
  const config = getAllConfig();
  const lines = Object.entries(config).map(([k, v]) => `${k}=${v}`);
  return {
    content: [{ type: 'text', text: lines.join('\n') || 'No config set' }],
  };
});

server.tool(
  'set_config',
  'Set a system configuration value',
  { key: z.string(), value: z.string() },
  async (args) => {
    setConfig(args.key, args.value);
    return {
      content: [{ type: 'text', text: `Config ${args.key}=${args.value}` }],
    };
  },
);

server.tool(
  'write_daily',
  'Write to daily log (DAILY.md)',
  { entry: z.string() },
  async (args) => {
    const { appendDailyLog } = await import('./agent.js');
    appendDailyLog(args.entry);
    return { content: [{ type: 'text', text: 'Daily log updated' }] };
  },
);

server.tool(
  'create_custom_memory',
  'Create a custom memory file',
  { filename: z.string(), content: z.string() },
  async (args) => {
    const { createCustomMemory } = await import('./agent.js');
    const path = createCustomMemory(args.filename, args.content);
    return { content: [{ type: 'text', text: `Created ${path}` }] };
  },
);

server.tool(
  'read_custom_memory',
  'Read a custom memory file',
  { filename: z.string() },
  async (args) => {
    const { readCustomMemory } = await import('./agent.js');
    const content = readCustomMemory(args.filename);
    return { content: [{ type: 'text', text: content || 'File not found' }] };
  },
);

server.tool(
  'update_custom_memory',
  'Update a custom memory file',
  { filename: z.string(), content: z.string() },
  async (args) => {
    const { updateCustomMemory } = await import('./agent.js');
    const path = updateCustomMemory(args.filename, args.content);
    return { content: [{ type: 'text', text: `Updated ${path}` }] };
  },
);

server.tool(
  'list_custom_memories',
  'List all custom memory files',
  {},
  async () => {
    const { listCustomMemories } = await import('./agent.js');
    const files = listCustomMemories();
    return { content: [{ type: 'text', text: files }] };
  },
);

server.tool(
  'archive_daily',
  'Archive DAILY.md to archive/YYYY-MM-DD.md',
  {},
  async () => {
    const { archiveDaily } = await import('./agent.js');
    const result = archiveDaily();
    return { content: [{ type: 'text', text: result }] };
  },
);

export async function startMcpServer(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
