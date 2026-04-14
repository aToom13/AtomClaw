import { PROVIDER } from '../config.js';
import { logger } from '../logger.js';

import { Provider, createProvider } from './kilocode.js';
import { createProvider as createOllamaProvider } from './ollama.js';

let provider: Provider | null = null;

export async function initProvider(): Promise<Provider> {
  const providerType = PROVIDER;
  logger.info({ provider: providerType }, 'Initializing provider');

  if (providerType === 'ollama') {
    provider = await createOllamaProvider();
  } else {
    provider = await createProvider();
  }

  const available = await provider.isAvailable();
  if (!available) {
    throw new Error(`Provider ${providerType} is not available`);
  }

  logger.info({ provider: providerType }, 'Provider initialized');
  return provider;
}

export function getProvider(): Provider {
  if (!provider) {
    throw new Error('Provider not initialized. Call initProvider() first.');
  }
  return provider;
}
