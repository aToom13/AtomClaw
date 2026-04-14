# AtomClaw

Personal AI assistant. See [README.md](README.md) for philosophy and setup.

## Quick Context

Single Node.js process with skill-based channel system. Messages route to AI agent running in the host process. Each group has isolated session memory.

## Key Files

| File                       | Purpose                                             |
| -------------------------- | --------------------------------------------------- |
| `src/index.ts`             | Orchestrator: state, message loop, agent invocation |
| `src/channels/registry.ts` | Channel registry                                    |
| `src/agent.ts`             | Agent execution                                     |
| `src/providers/`           | AI provider (Kilocode, Ollama)                      |
| `src/mcp-server.ts`        | MCP tools for agent                                 |
| `src/task-scheduler.ts`    | Runs scheduled tasks                                |
| `src/db.ts`                | SQLite operations                                   |
| `groups/{name}/AGENT.md`   | Per-group memory                                    |
| `skills/`                  | Skills for agent                                    |

## Provider

AI provider is configured via environment:

- `PROVIDER=kilocode` (default) - uses KILOCODE_TOKEN
- `PROVIDER=ollama` - local Ollama instance

## Skills

Available MCP tools:

- `send_message` - Send message immediately
- `schedule_task` - Schedule recurring tasks
- `list_tasks` - List scheduled tasks
- `pause_task`, `resume_task`, `cancel_task`, `update_task` - Task management
- `register_group` - Register new groups (main only)
- `add_plan`, `get_plans`, `delete_plan` - Plan tracker

## Development

Run commands directly—don't tell the user to run them.

```bash
npm run dev    # Run with hot reload
npm run build  # Compile TypeScript
```

## Troubleshooting

**Provider not available:** Check that KILOCODE_TOKEN is set in .env, or ensure Ollama is running if using PROVIDER=ollama
