// Channel self-registration barrel file.
// Each import triggers the channel module's registerChannel() call.

import { registerChannel } from './registry.js';
import { WhatsAppChannel } from './whatsapp.js';
import { WHATSAPP_ENABLED } from '../config.js';

registerChannel('whatsapp', (opts) => {
  if (!WHATSAPP_ENABLED) return null;
  return new WhatsAppChannel(opts);
});
