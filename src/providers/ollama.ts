import { OLLAMA_BASE_URL, OLLAMA_MODEL } from '../config.js';
import { logger } from '../logger.js';

import { Message, Provider } from './kilocode.js';

export class OllamaProvider implements Provider {
  private baseUrl: string;
  private model: string;

  constructor(baseUrl?: string, model?: string) {
    this.baseUrl = baseUrl || OLLAMA_BASE_URL;
    this.model = model || OLLAMA_MODEL;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async chat(messages: Message[], systemPrompt: string): Promise<string> {
    const formattedMessages: { role: string; content: string }[] = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages: formattedMessages,
        stream: false,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama API error: ${response.status} - ${error}`);
    }

    const data = (await response.json()) as {
      message: { content: string };
    };

    return data.message?.content ?? '';
  }
}

export async function createProvider(
  baseUrl?: string,
  model?: string,
): Promise<Provider> {
  const provider = new OllamaProvider(baseUrl, model);

  const available = await provider.isAvailable();
  if (!available) {
    logger.warn(
      `Ollama not available at ${baseUrl || OLLAMA_BASE_URL}, skipping`,
    );
    throw new Error('Ollama not available');
  }

  return provider;
}
