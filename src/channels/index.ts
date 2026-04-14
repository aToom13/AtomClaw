// Channel self-registration barrel file.
// Each import triggers the channel module's registerChannel() call.

import { registerChannel } from './registry.js';
import { WhatsAppChannel } from './whatsapp.js';

// discord

// gmail

// slack

// telegram

// whatsapp
registerChannel('whatsapp', (opts) => {
  if (process.env.WHATSAPP_ENABLED !== 'true') return null;
  return new WhatsAppChannel(opts);
});
