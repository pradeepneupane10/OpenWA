process.on('uncaughtException', (err) => {
  console.log('🛡️ Handled exception:', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.log('🛡️ Handled rejection:', reason && reason.message ? reason.message : reason);
});

const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcodeTerminal = require('qrcode-terminal');
const QRCode = require('qrcode');
const express = require('express');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const PORT = process.env.PORT || 3001;
const WEBHOOK_URL = process.env.GOOGLE_SCRIPT_WEBHOOK_URL;
const TARGET_GROUP = (process.env.TARGET_GROUP_NAME || 'Router Changed Thapathali').toLowerCase().trim();

// Group metadata cache
const groupNameCache = new Map();

// Local cache for duplicate tickets
const PROCESSED_FILE = path.join(__dirname, 'processed_tickets.json');
let processedTickets = new Set();

try {
  if (fs.existsSync(PROCESSED_FILE)) {
    const data = JSON.parse(fs.readFileSync(PROCESSED_FILE, 'utf-8'));
    if (Array.isArray(data)) {
      processedTickets = new Set(data);
    }
  }
} catch (e) {
  processedTickets = new Set();
}

function recordProcessedTicket(tktNo) {
  if (!tktNo) return;
  processedTickets.add(tktNo.toUpperCase());
  try {
    fs.writeFileSync(PROCESSED_FILE, JSON.stringify(Array.from(processedTickets), null, 2));
  } catch (e) {}
}

// Queue for pushing to Google Sheets smoothly
const pushQueue = [];
let isQueueProcessing = false;

async function processQueue() {
  if (isQueueProcessing || pushQueue.length === 0) return;
  isQueueProcessing = true;

  while (pushQueue.length > 0) {
    const item = pushQueue.shift();
    if (!WEBHOOK_URL || WEBHOOK_URL.includes('YOUR_DEPLOYMENT_ID')) {
      console.warn('⚠️ Webhook URL not set in .env!');
      continue;
    }

    try {
      const response = await axios.post(WEBHOOK_URL, item, { timeout: 20000, maxRedirects: 5 });
      console.log(`🚀 Pushed ${item.tktNo} to Google Sheet:`, response.data);
      recordProcessedTicket(item.tktNo);
    } catch (err) {
      console.error(`❌ Failed pushing ${item.tktNo}:`, err.message);
    }

    // Small delay between pushes to be gentle on Google Apps Script
    await new Promise((r) => setTimeout(r, 600));
  }

  isQueueProcessing = false;
}

// Local Web Server for showing live QR code
const app = express();
let currentQR = null;
let connectionStatus = 'Connecting...';
let isReconnecting = false;

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>WhatsApp to Google Sheets Bridge</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #f0f2f5; margin: 0; }
        .card { background: white; padding: 2rem; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); text-align: center; max-width: 440px; width: 90%; }
        h1 { font-size: 1.35rem; color: #1f2937; margin-bottom: 0.5rem; }
        .target { font-size: 0.85rem; color: #4b5563; background: #e5e7eb; padding: 4px 8px; border-radius: 6px; display: inline-block; margin-bottom: 1rem; }
        .status { font-weight: bold; padding: 6px 14px; border-radius: 20px; display: inline-block; margin-bottom: 1.5rem; font-size: 0.85rem; }
        .connected { background: #d1fae5; color: #065f46; }
        .waiting { background: #fef3c7; color: #92400e; }
        img { border: 1px solid #e5e7eb; border-radius: 8px; width: 260px; height: 260px; }
      </style>
      <meta http-equiv="refresh" content="5">
    </head>
    <body>
      <div class="card">
        <h1>📱 WhatsApp Bridge</h1>
        <div class="target">Target Group: <strong>${process.env.TARGET_GROUP_NAME || 'Router Changed Thapathali'}</strong></div><br/>
        <div class="status ${connectionStatus === 'Connected' ? 'connected' : 'waiting'}">Status: ${connectionStatus}</div>
        ${
          connectionStatus === 'Connected'
            ? '<p style="color:#059669;font-weight:600;">✅ Connected & actively monitoring group for router tickets!</p>'
            : currentQR
            ? `<p>Scan this QR code with WhatsApp on your phone:</p><img src="${currentQR}" alt="WhatsApp QR Code"/>`
            : '<p>Connecting / generating QR code, please wait a moment...</p>'
        }
      </div>
    </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`\n🌐 Bridge Web Dashboard running at: http://localhost:${PORT}`);
  console.log(`🎯 Locked to group: "${process.env.TARGET_GROUP_NAME || 'Router Changed Thapathali'}"\n`);
});

// Helper: Parse technician message
function parseTechnicianMessage(rawText) {
  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  // 1. Ticket Number
  const tktMatch = rawText.match(/\bTKT\s*(\d+)\b/i);
  const tktNo = tktMatch ? `TKT${tktMatch[1]}` : '';

  // 2. UserID
  const userMatch = rawText.match(/\b(?!(?:TKT|ALCL))([A-Za-z]{2,4}\d{6,}|\d{10})\b/i);
  let userId = userMatch ? userMatch[1] : '';
  if (!userId && lines.length >= 2 && !/^(TKT|S\/?N|Old|New|Note)/i.test(lines[1])) {
    userId = lines[1];
  }

  // 3. New SN
  let newSn = '';
  let m = rawText.match(/New\s*SN\s*[:\-\s]*([A-Za-z0-9]+)/i);
  if (m) newSn = m[1];
  else {
    m = rawText.match(/S\/?N\s*[:\-\s]*([A-Za-z0-9]+)\s*\(\s*new\s*\)/i);
    if (m) newSn = m[1];
    else {
      m = rawText.match(/\b([A-Za-z0-9]{8,})\s+New(?:\s+dual|\s+wifi\s*6)?\b/i);
      if (m) newSn = m[1];
    }
  }

  // 4. Old SN
  let oldSn = '';
  m = rawText.match(/Old\s*SN\s*[:\-\s]*([A-Za-z0-9]+)/i);
  if (m) oldSn = m[1];
  else {
    m = rawText.match(/S\/?N\s*[:\-\s]*([A-Za-z0-9]+)\s*\(\s*old\s*\)/i);
    if (m) oldSn = m[1];
    else {
      m = rawText.match(/\b([A-Za-z0-9]{8,})\s+Old(?:\s+dual)?\b/i);
      if (m) oldSn = m[1];
    }
  }

  // 5. Customer Name
  let name = '';
  for (const line of lines) {
    if (tktNo && line.toUpperCase().includes(tktNo.toUpperCase())) continue;
    if (userId && line.toLowerCase() === userId.toLowerCase()) continue;
    if (newSn && line.toUpperCase().includes(newSn.toUpperCase())) continue;
    if (oldSn && line.toUpperCase().includes(oldSn.toUpperCase())) continue;
    if (/^(Old|New|Note|S\/?N|Wifi|Done|Please|Still|Check)/i.test(line)) continue;
    if (/[A-Za-z]/.test(line)) {
      name = line;
      break;
    }
  }

  // 6. Remarks
  let remarks = '';
  const noteMatch = rawText.match(/Note\s*[:\-]\s*(.+)/i);
  if (noteMatch) {
    remarks = noteMatch[1].trim();
  } else {
    const wifiMatch = rawText.match(/(WiFi\s*6\s*upgrade|Upgrade\s*to\s*wifi-?6)/i);
    if (wifiMatch) remarks = wifiMatch[1];
  }

  return {
    tktNo,
    userId,
    name,
    newSn: newSn.toUpperCase(),
    oldSn: oldSn.toUpperCase(),
    remarks: remarks || 'Upgrade to wifi-6'
  };
}

// Handler for incoming/offline messages
async function handleMessage(sock, msg, sourceLabel = 'Live') {
  if (msg.key.fromMe) return;

  const jid = msg.key.remoteJid;
  if (!jid || !jid.endsWith('@g.us')) return;

  const messageText =
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    '';

  if (!messageText || !messageText.toUpperCase().includes('TKT')) return;

  let groupName = groupNameCache.get(jid);
  if (!groupName) {
    try {
      const meta = await sock.groupMetadata(jid);
      groupName = meta.subject || '';
      groupNameCache.set(jid, groupName);
    } catch (e) {
      groupName = '';
    }
  }

  if (!groupName.toLowerCase().includes(TARGET_GROUP)) {
    return;
  }

  const parsed = parseTechnicianMessage(messageText);
  if (!parsed.tktNo && !parsed.newSn && !parsed.oldSn) {
    return;
  }

  // DUPLICATE CHECK: Skip if already recorded
  if (parsed.tktNo && processedTickets.has(parsed.tktNo.toUpperCase())) {
    console.log(`⏩ [Duplicate Ignored] ${parsed.tktNo} already processed previously.`);
    return;
  }

  console.log(`\n====================================================`);
  console.log(`📩 [${sourceLabel}] Router Ticket in "${groupName}"`);
  console.log(`   TKT No   : ${parsed.tktNo}`);
  console.log(`   UserID   : ${parsed.userId}`);
  console.log(`   Name     : ${parsed.name}`);
  console.log(`   New SN   : ${parsed.newSn}`);
  console.log(`   Old SN   : ${parsed.oldSn}`);
  console.log(`   Remarks  : ${parsed.remarks}`);
  console.log(`====================================================`);

  // Queue for transmission
  pushQueue.push({
    ...parsed,
    rawText: messageText,
    group: groupName,
    sender: msg.key.participant || jid,
    pushName: msg.pushName || 'Technician',
    timestamp: msg.messageTimestamp
  });

  processQueue();
}

async function startWhatsApp() {
  const authFolder = path.join(__dirname, 'auth_info');
  const { state, saveCreds } = await useMultiFileAuthState(authFolder);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    auth: state,
    printQRInTerminal: false
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      currentQR = await QRCode.toDataURL(qr);
      connectionStatus = 'Waiting for QR scan';
      console.log('\n======================================================');
      console.log('⚡ QR CODE READY! Open in your browser: http://localhost:' + PORT);
      console.log('======================================================\n');
      qrcodeTerminal.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      connectionStatus = shouldReconnect ? 'Reconnecting...' : 'Logged Out';
      console.log(`⚠️ Connection closed (${statusCode}). Reconnecting: ${shouldReconnect}`);

      if (shouldReconnect && !isReconnecting) {
        isReconnecting = true;
        setTimeout(() => {
          isReconnecting = false;
          startWhatsApp().catch((e) => console.log('Reconnection notice:', e.message));
        }, 4000);
      }
    } else if (connection === 'open') {
      connectionStatus = 'Connected';
      currentQR = null;
      console.log('\n✅ WhatsApp Connected successfully!');
      console.log(`Listening ONLY for "${TARGET_GROUP}"...\n`);
    }
  });

  // 1. Listen for Live AND Offline Backlog messages (both 'notify' and 'append')
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    const label = type === 'notify' ? 'Live' : 'Offline Catch-Up';
    for (const msg of messages) {
      await handleMessage(sock, msg, label);
    }
  });

  // 2. Also process initial history sync on reconnection
  sock.ev.on('messaging-history.set', async ({ messages }) => {
    console.log(`📥 Received offline history sync (${messages.length} messages). Checking for missed tickets...`);
    for (const msg of messages) {
      await handleMessage(sock, msg, 'Offline History');
    }
  });
}

startWhatsApp().catch((err) => console.log('Notice in startWhatsApp:', err.message));
