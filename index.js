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
  fetchLatestBaileysVersion,
  Browsers
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
const TARGET_GROUP_JID = process.env.TARGET_GROUP_JID || '120363028366417731@g.us';
const TARGET_GROUP_NAME = process.env.TARGET_GROUP_NAME || 'Router Changed Thapathali';

// Local cache for duplicate tickets
const PROCESSED_FILE = path.join(__dirname, 'processed_tickets.json');
let processedTickets = new Set();

try {
  if (fs.existsSync(PROCESSED_FILE)) {
    const data = JSON.parse(fs.readFileSync(PROCESSED_FILE, 'utf-8'));
    if (Array.isArray(data)) {
      processedTickets = new Set(data.map(t => String(t).toUpperCase().trim()));
    }
  }
} catch (e) {
  processedTickets = new Set();
}

function recordProcessedTicket(tktNo, newSn) {
  if (tktNo) processedTickets.add(tktNo.toUpperCase());
  if (newSn && newSn.length >= 8) processedTickets.add(newSn.toUpperCase());
  try {
    fs.writeFileSync(PROCESSED_FILE, JSON.stringify(Array.from(processedTickets), null, 2));
  } catch (e) {}
}

// Push queue
const pushQueue = [];
let isQueueProcessing = false;

async function processQueue() {
  if (isQueueProcessing || pushQueue.length === 0) return;
  isQueueProcessing = true;

  while (pushQueue.length > 0) {
    const item = pushQueue.shift();
    if (!WEBHOOK_URL || WEBHOOK_URL.includes('YOUR_DEPLOYMENT_ID')) {
      console.warn('⚠️ Webhook URL not configured in .env!');
      continue;
    }

    try {
      const response = await axios.post(WEBHOOK_URL, item, { timeout: 20000, maxRedirects: 5 });
      console.log(`🚀 [SUCCESS] Pushed ${item.tktNo} to Google Sheet:`, response.data);
      recordProcessedTicket(item.tktNo, item.newSn);
    } catch (err) {
      console.error(`❌ [FAILED] Pushing ${item.tktNo}:`, err.message);
    }

    await new Promise((r) => setTimeout(r, 600));
  }

  isQueueProcessing = false;
}

// Local Web Server for monitoring and pairing
const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

let currentQR = null;
let currentPairingCode = null;
let connectionStatus = 'Connecting...';
let isReconnecting = false;
let globalSock = null;

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>WhatsApp to Google Sheets Bridge</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #f0f2f5; margin: 0; padding: 1rem; }
        .card { background: white; padding: 2rem; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); text-align: center; max-width: 440px; width: 100%; box-sizing: border-box; }
        h1 { font-size: 1.35rem; color: #1f2937; margin-bottom: 0.5rem; }
        .target { font-size: 0.85rem; color: #4b5563; background: #e5e7eb; padding: 4px 8px; border-radius: 6px; display: inline-block; margin-bottom: 1rem; }
        .status { font-weight: bold; padding: 6px 14px; border-radius: 20px; display: inline-block; margin-bottom: 1.5rem; font-size: 0.85rem; }
        .connected { background: #d1fae5; color: #065f46; }
        .waiting { background: #fef3c7; color: #92400e; }
        img { border: 1px solid #e5e7eb; border-radius: 8px; width: 250px; height: 250px; max-width: 100%; }
        .code-box { background: #1e293b; color: #38bdf8; font-size: 1.8rem; font-weight: bold; letter-spacing: 4px; padding: 12px; border-radius: 8px; margin: 1rem 0; }
        .btn { background: #2563eb; color: white; border: none; padding: 10px 18px; border-radius: 6px; font-weight: 600; cursor: pointer; margin-top: 8px; width: 100%; }
        input { width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; box-sizing: border-box; font-size: 1rem; text-align: center; margin-top: 6px; }
      </style>
      <meta http-equiv="refresh" content="${connectionStatus === 'Connected' ? '30' : '6'}">
    </head>
    <body>
      <div class="card">
        <h1>📱 WhatsApp Bridge</h1>
        <div class="target">Locked Group: <strong>${TARGET_GROUP_NAME}</strong></div><br/>
        <div class="status ${connectionStatus === 'Connected' ? 'connected' : 'waiting'}">Status: ${connectionStatus}</div>
        
        ${
          connectionStatus === 'Connected'
            ? '<p style="color:#059669;font-weight:600;font-size:1.1rem;">✅ Connected & actively monitoring group for router tickets!</p>'
            : `
              ${currentPairingCode ? `
                <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px;margin-bottom:1rem;">
                  <p style="font-weight:600;margin:0 0 6px 0;color:#1e40af;">🔑 8-Character Pairing Code:</p>
                  <div class="code-box" style="margin:4px 0;">${currentPairingCode}</div>
                  <p style="font-size:0.8rem;color:#475569;margin:4px 0 0 0;">In WhatsApp: <strong>Linked Devices &gt; Link a Device &gt; Link with phone number instead</strong></p>
                </div>
              ` : ''}

              ${currentQR ? `
                <p style="margin-bottom:8px;font-size:0.95rem;font-weight:600;">Or Scan QR Code:</p>
                <img src="${currentQR}" alt="WhatsApp QR Code"/>
              ` : '<p>Generating connection codes...</p>'}
              
              <hr style="border:0;border-top:1px solid #e2e8f0;margin:1.5rem 0 1rem 0;"/>
              <form action="/pair" method="POST">
                <label style="font-size:0.85rem;color:#475569;font-weight:600;">Request New Pairing Code:</label>
                <input type="text" name="phone" value="9779820105044" placeholder="e.g. 9779820105044" required />
                <button type="submit" class="btn">Get New Code</button>
              </form>
            `
        }
      </div>
    </body>
    </html>
  `);
});

app.post('/pair', async (req, res) => {
  const phone = (req.body.phone || '').replace(/[^0-9]/g, '');
  if (!phone || !globalSock) {
    return res.redirect('/');
  }

  try {
    console.log(`\n⏳ Web requested pairing code for +${phone}...`);
    const code = await globalSock.requestPairingCode(phone);
    currentPairingCode = code;
    console.log(`👉 Pairing Code: ${code}`);
  } catch (err) {
    console.error('Pairing code request failed:', err.message);
  }
  res.redirect('/');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🌐 Bridge Web Dashboard running at: http://localhost:${PORT}`);
  console.log(`📱 On your local Wi-Fi, open: http://10.20.252.139:${PORT}`);
  console.log(`🎯 Locked to group: "${TARGET_GROUP_NAME}"\n`);
});

// Helper: Extract text regardless of how WhatsApp wrapped the message
function extractText(message) {
  if (!message) return '';
  if (message.conversation) return message.conversation;
  if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
  if (message.imageMessage?.caption) return message.imageMessage.caption;
  if (message.documentMessage?.caption) return message.documentMessage.caption;
  if (message.videoMessage?.caption) return message.videoMessage.caption;
  if (message.ephemeralMessage?.message) return extractText(message.ephemeralMessage.message);
  if (message.viewOnceMessage?.message) return extractText(message.viewOnceMessage.message);
  if (message.viewOnceMessageV2?.message) return extractText(message.viewOnceMessageV2.message);
  return '';
}

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

async function handleMessage(msg, sourceLabel = 'Live') {
  if (msg.key.fromMe) return;

  const jid = msg.key.remoteJid;
  if (jid !== TARGET_GROUP_JID) return;

  const messageText = extractText(msg.message);
  if (!messageText) return;

  console.log(`\n💬 [${sourceLabel}] Group Message from ${msg.pushName || 'Technician'}:`);
  console.log(`   "${messageText.replace(/\n/g, ' ')}"`);

  if (!messageText.toUpperCase().includes('TKT')) {
    console.log(`   ⏩ Ignored (No TKT keyword).`);
    return;
  }

  const parsed = parseTechnicianMessage(messageText);
  if (!parsed.tktNo && !parsed.newSn && !parsed.oldSn) {
    console.log(`   ⏩ Ignored (No valid ticket/SN patterns found).`);
    return;
  }

  if (parsed.tktNo && processedTickets.has(parsed.tktNo.toUpperCase())) {
    console.log(`   ⏩ [Duplicate Ignored] Ticket ${parsed.tktNo} already processed previously.`);
    return;
  }

  if (parsed.newSn && parsed.newSn.length >= 8 && processedTickets.has(parsed.newSn.toUpperCase())) {
    console.log(`   ⏩ [Duplicate Ignored] Serial Number ${parsed.newSn} already processed previously.`);
    return;
  }

  console.log(`\n====================================================`);
  console.log(`📩 New Router Ticket: ${parsed.tktNo}`);
  console.log(`   UserID   : ${parsed.userId}`);
  console.log(`   Name     : ${parsed.name}`);
  console.log(`   New SN   : ${parsed.newSn}`);
  console.log(`   Old SN   : ${parsed.oldSn}`);
  console.log(`   Remarks  : ${parsed.remarks}`);
  console.log(`====================================================`);

  pushQueue.push({
    ...parsed,
    rawText: messageText,
    group: TARGET_GROUP_NAME,
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
    printQRInTerminal: false,
    browser: Browsers.ubuntu('Chrome')
  });

  globalSock = sock;
  sock.ev.on('creds.update', saveCreds);

  if (!sock.authState.creds.registered) {
    setTimeout(async () => {
      try {
        console.log('Requesting pairing code for 9779820105044...');
        const code = await sock.requestPairingCode('9779820105044');
        currentPairingCode = code;
        console.log('\n======================================================');
        console.log(`🔑 8-CHARACTER PAIRING CODE: ${code}`);
        console.log('======================================================\n');
      } catch (err) {
        console.log('Notice requesting pairing code:', err.message);
      }
    }, 3500);
  }

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      currentQR = await QRCode.toDataURL(qr, { scale: 8 });
      try {
        await QRCode.toFile('C:\\Users\\om prakash\\.gemini\\antigravity\\brain\\dad1f1ed-2fc6-4309-bd92-a210f207a9d9\\whatsapp_qr.png', qr, { width: 320 });
      } catch (e) {}
      connectionStatus = 'Waiting for QR scan';
      console.log('\n======================================================');
      console.log('⚡ QR CODE READY! Open in browser: http://localhost:' + PORT);
      console.log('======================================================\n');
      qrcodeTerminal.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      console.log(`⚠️ Connection closed (${statusCode}).`);

      if (statusCode === DisconnectReason.loggedOut) {
        console.log('Session was logged out. Resetting auth_info for clean new scan...');
        try {
          fs.rmSync(authFolder, { recursive: true, force: true });
          fs.mkdirSync(authFolder, { recursive: true });
        } catch (e) {}
      }

      connectionStatus = 'Waiting for login';
      if (!isReconnecting) {
        isReconnecting = true;
        setTimeout(() => {
          isReconnecting = false;
          startWhatsApp().catch((e) => console.log('Reconnection notice:', e.message));
        }, 3000);
      }
    } else if (connection === 'open') {
      connectionStatus = 'Connected';
      currentQR = null;
      currentPairingCode = null;
      console.log('\n✅ WhatsApp Connected successfully!');
      console.log(`🎯 Locked to JID: ${TARGET_GROUP_JID} ("${TARGET_GROUP_NAME}")\n`);
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    const label = type === 'notify' ? 'Live' : 'Offline Catch-Up';
    for (const msg of messages) {
      await handleMessage(msg, label);
    }
  });

  sock.ev.on('messaging-history.set', async ({ messages }) => {
    for (const msg of messages) {
      await handleMessage(msg, 'History Sync');
    }
  });
}

startWhatsApp().catch((err) => console.log('Notice in startWhatsApp:', err.message));
