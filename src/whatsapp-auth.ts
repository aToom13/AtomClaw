import makeWASocket, {
  useMultiFileAuthState,
  Browsers,
  fetchLatestBaileysVersion,
  DisconnectReason,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import QRCode from 'qrcode';
import fs from 'fs';
import { logger } from './logger.js';
import { DATA_DIR } from './config.js';
import path from 'path';

async function connectToWhatsApp() {
  const sessionPath = path.join(DATA_DIR, 'baileys-auth');
  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

  if (!state.creds.registered) {
    console.log('Yeni oturum başlatılıyor...');
  } else {
    console.log('Mevcut oturum ile bağlanıyor...');
  }

  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    auth: state,
    browser: ['Ubuntu', 'AtomClaw', '22.04.4'],
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
      const isLoggedOut = statusCode === DisconnectReason.loggedOut;

      // 401 = unauthorized, session silinmeli
      if (statusCode === 401) {
        console.log('Session geçersiz, temizleniyor...');
        fs.rmSync(sessionPath, { recursive: true, force: true });
        console.log('Session temizlendi. Tekrar bağlanılıyor...');
        setTimeout(connectToWhatsApp, 3000);
        return;
      }

      const shouldReconnect = !isLoggedOut;
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
