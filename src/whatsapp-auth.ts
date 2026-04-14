import WhatsApp from '@whiskey/bailey';
import fs from 'fs';
import path from 'path';
import { parsePhoneNumber } from 'libphonenumber-js';
import { logger } from './logger.js';
import { DATA_DIR } from './config.js';

async function main() {
  const { default: makeWASocket } = await import('@whiskey/bailey');

  const sessionPath = path.join(DATA_DIR, 'whatsapp-session');

  const sock = makeWASocket({
    printQRInTerminal: true,
    auth: {
      session: sessionPath,
    },
  });

  sock.ev.on('creds.update', () => {
    logger.info('Credentials updated, session saved');
  });

  sock.ev.on('connection.update', (update) => {
    if (update.qr) {
      console.log('\n=== QR KODU TARA ===');
      console.log('WhatsApp > Ayarlar > Bağlı Cihazlar > Cihaz Ekle');
      console.log('====================\n');
    }

    if (update.connection === 'open') {
      console.log('✅ WhatsApp bağlandı!');
      console.log('Bot hazır. Çıkmak için Ctrl+C');
    }

    if (update.connection === 'close') {
      console.log('❌ Bağlantı kapandı');
    }
  });
}

const isDirectRun =
  process.argv[1] &&
  new URL(import.meta.url).pathname ===
    new URL(`file://${process.argv[1]}`).pathname;

if (isDirectRun) {
  main().catch((err) => {
    logger.error({ err }, 'Auth error');
    process.exit(1);
  });
}
