import makeWASocket, {
  useMultiFileAuthState,
  Browsers,
} from '@whiskeysockets/baileys';
import { logger } from './logger.js';
import { DATA_DIR } from './config.js';
import path from 'path';

async function main() {
  const sessionPath = path.join(DATA_DIR, 'baileys-auth');

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

  const sock = makeWASocket({
    auth: state,
    browser: Browsers.ubuntu('AtomClaw'),
    printQRInTerminal: true,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n📱 QR Kodu - WhatsApp ile Tara\n');
    }

    if (connection === 'open') {
      console.log('\n✅ WhatsApp bağlandı!\n');
    }

    if (connection === 'close') {
      console.log('\n❌ Bağlantı kapandı\n');
    }
  });

  console.log('WhatsApp bağlanıyor...');
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
