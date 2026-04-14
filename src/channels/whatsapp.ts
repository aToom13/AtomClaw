import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  WASocket,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import QRCode from 'qrcode';
import path from 'path';
import fs from 'fs';

import {
  Channel,
  OnInboundMessage,
  OnChatMetadata,
  RegisteredGroup,
} from '../types.js';
import { logger } from '../logger.js';
import { DATA_DIR } from '../config.js';

export class WhatsAppChannel implements Channel {
  name = 'whatsapp';
  private sock: WASocket | null = null;
  private connected = false;
  private onMessage: OnInboundMessage;
  private onChatMetadata: OnChatMetadata;
  private getGroups: () => Record<string, RegisteredGroup>;
  private sessionPath: string;

  constructor(opts: {
    onMessage: OnInboundMessage;
    onChatMetadata: OnChatMetadata;
    registeredGroups: () => Record<string, RegisteredGroup>;
  }) {
    this.onMessage = opts.onMessage;
    this.onChatMetadata = opts.onChatMetadata;
    this.getGroups = opts.registeredGroups;
    this.sessionPath = path.join(DATA_DIR, 'baileys-auth');
  }

  isConnected(): boolean {
    return this.connected;
  }

  ownsJid(jid: string): boolean {
    return jid.endsWith('@s.whatsapp.net') || jid.endsWith('@g.us');
  }

  async connect(): Promise<void> {
    await this.startSocket();
  }

  async disconnect(): Promise<void> {
    this.sock?.end(undefined);
    this.connected = false;
  }

  async sendMessage(jid: string, text: string): Promise<void> {
    if (!this.sock || !this.connected) {
      throw new Error('WhatsApp not connected');
    }
    await this.sock.sendMessage(jid, { text });
  }

  async setTyping(jid: string, isTyping: boolean): Promise<void> {
    if (!this.sock || !this.connected) return;
    if (isTyping) {
      await this.sock.sendPresenceUpdate('composing', jid);
    } else {
      await this.sock.sendPresenceUpdate('paused', jid);
    }
  }

  private async startSocket(): Promise<void> {
    const { state, saveCreds } = await useMultiFileAuthState(this.sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    this.sock = makeWASocket({
      auth: state,
      browser: ['Ubuntu', 'AtomClaw', '22.04.4'],
      version,
      printQRInTerminal: false,
    });

    this.sock.ev.on('creds.update', saveCreds);

    this.sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log('\n📱 WhatsApp QR Kodu - Telefondan Tara:');
        console.log('WhatsApp > Ayarlar > Bağlı Cihazlar > Cihaz Ekle\n');
        const qrString = await QRCode.toString(qr, { type: 'terminal' });
        console.log(qrString);
      }

      if (connection === 'open') {
        this.connected = true;
        logger.info('WhatsApp connected');
      }

      if (connection === 'close') {
        this.connected = false;
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        if (statusCode === 401) {
          fs.rmSync(this.sessionPath, { recursive: true, force: true });
        }

        if (shouldReconnect) {
          setTimeout(() => this.startSocket(), 3000);
        }
      }
    });

    this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;

      for (const msg of messages) {
        if (!msg.key.remoteJid || msg.key.fromMe) continue;

        const chatJid = msg.key.remoteJid;
        const sender = msg.key.participant || msg.key.remoteJid;
        const senderName = msg.pushName || sender.split('@')[0];
        const content =
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text ||
          '';

        if (!content) continue;

        const timestamp = new Date(
          (msg.messageTimestamp as number) * 1000,
        ).toISOString();

        this.onMessage(chatJid, {
          id: msg.key.id || '',
          chat_jid: chatJid,
          sender,
          sender_name: senderName,
          content,
          timestamp,
          is_from_me: false,
        });

        this.onChatMetadata(
          chatJid,
          timestamp,
          senderName,
          'whatsapp',
          chatJid.endsWith('@g.us'),
        );
      }
    });
  }
}
