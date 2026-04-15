import open from 'open';

import { KILOCODE_TOKEN, KILOCODE_MODEL } from '../config.js';
import { logger } from '../logger.js';

const KILOCODE_API_BASE_URL = 'https://api.kilo.ai';
const KILOCODE_OPENROUTER_PROXY_URL = 'https://api.kilo.ai/api/openrouter/';
const POLL_INTERVAL_MS = 3000;

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResultMessage {
  role: 'tool';
  tool_call_id: string;
  name: string;
  content: string;
}

export interface AssistantToolCallMessage {
  role: 'assistant';
  content: string | null;
  tool_calls: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
}

export type AnyMessage = Message | ToolResultMessage | AssistantToolCallMessage;

export interface ChatResponse {
  content: string;
  toolCalls?: ToolCall[];
}

export interface Provider {
  chat(messages: Message[], systemPrompt: string): Promise<string>;
  chatWithTools?(
    messages: AnyMessage[],
    systemPrompt: string,
    tools: ToolDefinition[],
  ): Promise<ChatResponse>;
  isAvailable(): Promise<boolean>;
}

interface DeviceAuthInitiateResponse {
  code: string;
  verificationUrl: string;
  expiresIn: number;
}

interface DeviceAuthPollResponse {
  status: 'pending' | 'approved' | 'denied' | 'expired';
  token?: string;
  userEmail?: string;
}

function getApiUrl(path: string = ''): string {
  return new URL(path, KILOCODE_API_BASE_URL).toString();
}

async function initiateDeviceAuth(): Promise<DeviceAuthInitiateResponse> {
  const response = await fetch(getApiUrl('/api/device-auth/codes'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error(
        'Too many pending authorization requests. Please try again later.',
      );
    }
    throw new Error(
      `Failed to initiate device authorization: ${response.status}`,
    );
  }

  return (await response.json()) as DeviceAuthInitiateResponse;
}

async function pollDeviceAuth(code: string): Promise<DeviceAuthPollResponse> {
  const response = await fetch(getApiUrl(`/api/device-auth/codes/${code}`));

  if (response.status === 202) {
    return { status: 'pending' };
  }

  if (response.status === 403) {
    return { status: 'denied' };
  }

  if (response.status === 410) {
    return { status: 'expired' };
  }

  if (!response.ok) {
    throw new Error(`Failed to poll device authorization: ${response.status}`);
  }

  return (await response.json()) as DeviceAuthPollResponse;
}

async function waitForDeviceAuth(
  code: string,
  expiresIn: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const pollLoop = async () => {
      const maxAttempts = Math.ceil((expiresIn * 1000) / POLL_INTERVAL_MS);

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          const result = await pollDeviceAuth(code);

          if (result.status === 'approved' && result.token) {
            resolve(result.token);
            return;
          }

          if (result.status === 'denied') {
            reject(new Error('Authorization denied by user'));
            return;
          }

          if (result.status === 'expired') {
            reject(new Error('Authorization code expired'));
            return;
          }

          await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
          return;
        }
      }

      reject(new Error('Authorization timed out'));
    };

    pollLoop();
  });
}

export async function authenticate(): Promise<string> {
  const authData = await initiateDeviceAuth();
  const { code, verificationUrl, expiresIn } = authData;

  try {
    await open(verificationUrl);
  } catch {
    logger.warn('Could not open browser automatically');
  }

  console.log('Verification URL:', verificationUrl);
  console.log('Verification code:', code);

  const token = await waitForDeviceAuth(code, expiresIn);
  console.log('Authentication successful!');
  console.log('Add this to your .env file:');
  console.log(`KILOCODE_TOKEN=${token}`);

  return token;
}

export class KilocodeProvider implements Provider {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  async isAvailable(): Promise<boolean> {
    if (!this.token) return false;

    try {
      const response = await fetch(
        'https://api.kilo.ai/api/openrouter/models',
        {
          headers: {
            Authorization: `Bearer ${this.token}`,
          },
        },
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  private async callApi(
    body: Record<string, unknown>,
  ): Promise<{ choices: Array<{ message: { content: string | null; tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }> } }> }> {
    const response = await fetch(
      KILOCODE_OPENROUTER_PROXY_URL + 'chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://atomclaw.ai/',
          'X-Title': 'atomclaw',
        },
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Kilocode API error: ${response.status} - ${error}`);
    }

    return (await response.json()) as {
      choices: Array<{ message: { content: string | null; tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }> } }>;
    };
  }

  async chat(messages: Message[], systemPrompt: string): Promise<string> {
    const body = {
      model: KILOCODE_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    };

    const data = await this.callApi(body);
    return data.choices[0]?.message?.content ?? '';
  }

  async chatWithTools(
    messages: AnyMessage[],
    systemPrompt: string,
    tools: ToolDefinition[],
  ): Promise<ChatResponse> {
    const apiTools = tools.map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));

    const apiMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m) => {
        if (m.role === 'tool') {
          return {
            role: 'tool' as const,
            tool_call_id: m.tool_call_id,
            name: m.name,
            content: m.content,
          };
        }
        if (m.role === 'assistant' && 'tool_calls' in m) {
          return {
            role: 'assistant' as const,
            content: m.content,
            tool_calls: m.tool_calls,
          };
        }
        return { role: m.role, content: (m as Message).content };
      }),
    ];

    const body: Record<string, unknown> = {
      model: KILOCODE_MODEL,
      messages: apiMessages,
      tools: apiTools,
      tool_choice: 'auto',
    };

    const data = await this.callApi(body);
    const msg = data.choices[0]?.message;
    if (!msg) return { content: '' };

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      const toolCalls: ToolCall[] = msg.tool_calls.map((tc) => {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
        } catch {
          args = {};
        }
        return { id: tc.id, name: tc.function.name, arguments: args };
      });
      return { content: msg.content ?? '', toolCalls };
    }

    return { content: msg.content ?? '' };
  }
}

export async function createProvider(token?: string): Promise<Provider> {
  const useToken = token || KILOCODE_TOKEN;

  if (!useToken) {
    logger.warn('KILOCODE_TOKEN not set, attempting device auth...');
    const newToken = await authenticate();
    return new KilocodeProvider(newToken);
  }

  return new KilocodeProvider(useToken);
}
