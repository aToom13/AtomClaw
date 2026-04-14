import makeWASocket, {
  useMultiFileAuthState,
  Browsers,
  fetchLatestBaileysVersion,
  DisconnectReason,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import QRCode from 'qrcode';
import { logger } from './logger.js';
import { DATA_DIR } from './config.js';
import path from 'path';

async function connectToWhatsApp() {
  const sessionPath = path.join(DATA_DIR, 'baileys-auth');
  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    auth: state,
    browser: Browsers.macOS('AtomClaw'),
    version,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n📱 WhatsApp QR Kodu - Telefondan Tara:\n');
      console.log('WhatsApp > Ayarlar > Bağlı Cihazlar > Cihaz Ekle\n');
      const qrString = await QRCode.toString(qr, { type: 'terminal' });
      console.log(qrString);
      console.log('\n');
    }

    if (connection === 'open') {
      console.log('✅ WhatsApp bağlandı!');
      console.log('Bot hazır. Çıkmak için Ctrl+C\n');
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log(
        `Bağlantı kapandı (code: ${statusCode}). Tekrar bağlanılıyor: ${shouldReconnect}`,
      );

      if (shouldReconnect) {
        setTimeout(connectToWhatsApp, 3000);
      } else {
        console.log('Çıkış yapıldı. Tekrar QR taramanız gerekiyor.');
        process.exit(0);
      }
    }
  });

  console.log('WhatsApp bağlanıyor...');
}

const isDirectRun =
  process.argv[1] &&
  new URL(import.meta.url).pathname ===
    new URL(`file://${process.argv[1]}`).pathname;

if (isDirectRun) {
  connectToWhatsApp().catch((err) => {
    logger.error({ err }, 'Auth error');
    process.exit(1);
  });
}
