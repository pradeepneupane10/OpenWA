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
  Browsers,
  proto
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
const ROUTER_GROUP_JID = process.env.TARGET_GROUP_JID || '120363028366417731@g.us';
const ROUTER_GROUP_NAME = process.env.TARGET_GROUP_NAME || 'Router Changed Thapathali';

const IPTV_GROUP_JID = '120363042361547566@g.us';
const IPTV_GROUP_NAME = 'IPTV-Registration';

// Whitelist: strictly process IPTV tickets only from these 7 team members (plus own messages)
const IPTV_TEAM_PATTERNS = [
  'ajit',
  'chandramani',
  'rajesh',
  'rj mhrzn',
  'sabin',
  'sanjeev',
  'sanzeev',
  'shashikant',
  'shashi',
  'sunil'
];

// Local cache for duplicate tickets
const PROCESSED_FILE = path.join(__dirname, 'processed_tickets.json');
const CONTACTS_FILE = path.join(__dirname, 'known_contacts.json');
const ANCHORS_FILE = path.join(__dirname, 'last_anchors.json');

let processedTickets = new Set();
let knownContacts = {};
let lastAnchors = {};
const autoSyncedGroupsThisBoot = new Set();

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

try {
  if (fs.existsSync(CONTACTS_FILE)) {
    knownContacts = JSON.parse(fs.readFileSync(CONTACTS_FILE, 'utf-8')) || {};
  }
} catch (e) {
  knownContacts = {};
}

try {
  if (fs.existsSync(ANCHORS_FILE)) {
    lastAnchors = JSON.parse(fs.readFileSync(ANCHORS_FILE, 'utf-8')) || {};
  }
} catch (e) {
  lastAnchors = {};
}

function recordProcessedTicket(tktNo, newSn) {
  if (tktNo) processedTickets.add(tktNo.toUpperCase().trim());
  if (newSn && newSn.length >= 8) processedTickets.add(newSn.toUpperCase().trim());
  try {
    fs.writeFileSync(PROCESSED_FILE, JSON.stringify(Array.from(processedTickets), null, 2));
  } catch (e) {}
}

function updateKnownContacts(contactsList) {
  if (!Array.isArray(contactsList)) return;
  let changed = false;
  for (const c of contactsList) {
    if (!c || !c.id) continue;
    const prev = knownContacts[c.id] || {};
    const next = {
      name: c.name || prev.name || '',
      notify: c.notify || prev.notify || '',
      verifiedName: c.verifiedName || prev.verifiedName || ''
    };
    if (next.name !== prev.name || next.notify !== prev.notify || next.verifiedName !== prev.verifiedName) {
      knownContacts[c.id] = next;
      changed = true;
    }
    if (c.lid) {
      knownContacts[c.lid] = { ...(knownContacts[c.lid] || {}), ...next };
      changed = true;
    }
  }
  if (changed) {
    try {
      fs.writeFileSync(CONTACTS_FILE, JSON.stringify(knownContacts, null, 2));
    } catch (e) {}
  }
}

function toTimestampMs(ts) {
  if (!ts) return Date.now();
  const num = typeof ts === 'object' && ts.low !== undefined ? ts.low : Number(ts);
  if (!num || Number.isNaN(num)) return Date.now();
  return num > 1e12 ? num : num * 1000;
}

function recordAnchor(msg) {
  if (!msg?.key?.id || !msg?.key?.remoteJid) return;
  const jid = msg.key.remoteJid;
  if (jid !== ROUTER_GROUP_JID && jid !== IPTV_GROUP_JID) return;
  const tsMs = toTimestampMs(msg.messageTimestamp);
  const existing = lastAnchors[jid];
  if (!existing || tsMs >= (existing.timestampMs || 0)) {
    lastAnchors[jid] = {
      key: {
        remoteJid: jid,
        fromMe: Boolean(msg.key.fromMe),
        id: msg.key.id,
        participant: msg.key.participant || undefined
      },
      timestampMs: tsMs,
      updatedAt: new Date().toISOString()
    };
    try {
      fs.writeFileSync(ANCHORS_FILE, JSON.stringify(lastAnchors, null, 2));
    } catch (e) {}
  }
}

// Push queue
const pushQueue = [];
let isQueueProcessing = false;
let lastSyncNotice = '';

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

// Local Web Server for monitoring, pairing, and on-demand history sync
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
        .status { font-weight: bold; padding: 6px 14px; border-radius: 20px; display: inline-block; margin-bottom: 1.2rem; font-size: 0.85rem; }
        .connected { background: #d1fae5; color: #065f46; }
        .waiting { background: #fef3c7; color: #92400e; }
        img { border: 1px solid #e5e7eb; border-radius: 8px; width: 250px; height: 250px; max-width: 100%; }
        .code-box { background: #1e293b; color: #38bdf8; font-size: 1.8rem; font-weight: bold; letter-spacing: 4px; padding: 12px; border-radius: 8px; margin: 1rem 0; }
        .btn { background: #2563eb; color: white; border: none; padding: 10px 18px; border-radius: 6px; font-weight: 600; cursor: pointer; margin-top: 8px; width: 100%; }
        .btn-sync { background: #059669; }
        input { width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; box-sizing: border-box; font-size: 1rem; text-align: center; margin-top: 6px; }
        .meta { font-size: 0.8rem; color: #6b7280; margin-top: 0.75rem; }
      </style>
      <meta http-equiv="refresh" content="${connectionStatus === 'Connected' ? '30' : '6'}">
    </head>
    <body>
      <div class="card">
        <h1>📱 WhatsApp Bridge</h1>
        <div class="target">Monitoring: <strong>${ROUTER_GROUP_NAME}</strong> & <strong>${IPTV_GROUP_NAME}</strong></div><br/>
        <div class="status ${connectionStatus === 'Connected' ? 'connected' : 'waiting'}">Status: ${connectionStatus}</div>
        
        ${
          connectionStatus === 'Connected'
            ? `
              <p style="color:#059669;font-weight:600;font-size:1.05rem;margin-top:0;">✅ Connected & monitoring live Router & IPTV tickets!</p>
              <form action="/sync" method="POST">
                <button type="submit" class="btn btn-sync">🔄 Sync Recent Missed Messages</button>
              </form>
              ${lastSyncNotice ? `<p class="meta">${lastSyncNotice}</p>` : ''}
            `
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

app.post('/sync', async (req, res) => {
  if (!globalSock || connectionStatus !== 'Connected') {
    lastSyncNotice = '⚠️ Bridge is not connected yet.';
    return res.redirect('/');
  }
  const jids = [ROUTER_GROUP_JID, IPTV_GROUP_JID];
  let requested = 0;
  for (const jid of jids) {
    const anchor = lastAnchors[jid];
    if (anchor?.key) {
      try {
        await globalSock.fetchMessageHistory(50, anchor.key, anchor.timestampMs);
        requested++;
        console.log(`🔄 Requested on-demand history sync (50 msgs) for ${jid}`);
      } catch (err) {
        console.log(`⚠️ On-demand sync warning for ${jid}:`, err.message);
      }
    }
  }
  lastSyncNotice = requested > 0
    ? `Requested last 50 messages from ${requested} group(s) at ${new Date().toLocaleTimeString()}.`
    : 'Waiting for at least 1 group message anchor before history sync can run.';
  res.redirect('/');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🌐 Bridge Web Dashboard running at: http://localhost:${PORT}`);
  console.log(`🎯 Monitoring: "${ROUTER_GROUP_NAME}" & "${IPTV_GROUP_NAME}"\n`);
});

// Helper: Extract text regardless of how WhatsApp wrapped or edited the message
function extractText(message) {
  if (!message) return '';
  if (message.conversation) return message.conversation;
  if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
  if (message.imageMessage?.caption) return message.imageMessage.caption;
  if (message.documentMessage?.caption) return message.documentMessage.caption;
  if (message.videoMessage?.caption) return message.videoMessage.caption;
  if (message.documentWithCaptionMessage?.message) return extractText(message.documentWithCaptionMessage.message);
  if (message.ephemeralMessage?.message) return extractText(message.ephemeralMessage.message);
  if (message.viewOnceMessage?.message) return extractText(message.viewOnceMessage.message);
  if (message.viewOnceMessageV2?.message) return extractText(message.viewOnceMessageV2.message);
  if (message.viewOnceMessageV2Extension?.message) return extractText(message.viewOnceMessageV2Extension.message);
  if (message.editedMessage?.message) return extractText(message.editedMessage.message);
  if (message.protocolMessage?.editedMessage) return extractText(message.protocolMessage.editedMessage);
  return '';
}

// Helper: Parse technician message (handles all Router ALCL serials and IPTV Skycom/NETTV MAC formats)
function parseTechnicianMessage(rawText) {
  const cleaned = rawText.trim();
  const lines = cleaned.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  // 1. Ticket Number
  const tktMatch = cleaned.match(/\bTKT[ \t\-:]*(\d+)\b/i);
  const tktNo = tktMatch ? `TKT${tktMatch[1]}` : '';

  // 2. New SN / MAC
  let newSn = '';
  const newPatterns = [
    /(?:New[ \t]*(?:TV[ \t]*MAC|MAC|S\/?N|SN|Router|STB|Box)?|(?:S\/?N|SN|MAC)[ \t]*\([ \t]*new[ \t]*\))[ \t]*[:\-][ \t]*([A-Za-z0-9]{8,20})\b/i,
    /\bNew[ \t]+(?:TV[ \t]*MAC|MAC|S\/?N|SN|Router|STB|Box)[ \t]*[:\-]?[ \t]*([A-Za-z0-9]{8,20})\b/i,
    /\b([A-Za-z0-9]{8,20})[ \t]*\([ \t]*new[^)]*\)/i,
    /\b([A-Za-z0-9]{8,20})[ \t]+New\b/i
  ];
  for (const pat of newPatterns) {
    const m = cleaned.match(pat);
    if (m && m[1]) {
      newSn = m[1];
      break;
    }
  }

  // 3. Old SN / MAC
  let oldSn = '';
  const oldPatterns = [
    /(?:Old[ \t]*(?:TV[ \t]*MAC|MAC|S\/?N|SN|Router|STB|Box)?|(?:S\/?N|SN|MAC)[ \t]*\([ \t]*old[ \t]*\))[ \t]*[:\-][ \t]*([A-Za-z0-9]{8,20})\b/i,
    /\bOld[ \t]+(?:TV[ \t]*MAC|MAC|S\/?N|SN|Router|STB|Box)[ \t]*[:\-]?[ \t]*([A-Za-z0-9]{8,20})\b/i,
    /\b([A-Za-z0-9]{8,20})[ \t]*\([ \t]*old[^)]*\)/i,
    /\b([A-Za-z0-9]{8,20})[ \t]+Old\b/i
  ];
  for (const pat of oldPatterns) {
    const m = cleaned.match(pat);
    if (m && m[1]) {
      oldSn = m[1];
      break;
    }
  }

  // 4. UserID (supports digits like 9841136413, trailing letter like 9851025460A, and prefixed IDs like BKT9828179853 / IC9851029384A)
  let userId = '';
  const idRegex = /\b([A-Za-z]{1,5}\d{5,}[A-Za-z]?|\d{8,12}[A-Za-z]?)\b/g;
  let match;
  while ((match = idRegex.exec(cleaned)) !== null) {
    const val = match[1];
    if (val.toUpperCase().startsWith('TKT')) continue;
    if (newSn && val.toUpperCase() === newSn.toUpperCase()) continue;
    if (oldSn && val.toUpperCase() === oldSn.toUpperCase()) continue;
    userId = val;
    break;
  }
  if (!userId && lines.length >= 2 && !/^(TKT|S\/?N|SN|Old|New|Note|MAC)/i.test(lines[1])) {
    userId = lines[1];
  }

  // 5. Remarks / Note
  let remarks = '';
  const noteMatch = cleaned.match(/(?:Note|Remarks?|Issue)[ \t]*[:\-][ \t]*(.+)/i);
  if (noteMatch) {
    remarks = noteMatch[1].trim();
  } else {
    for (const l of lines) {
      if (tktNo && l.toUpperCase().includes(tktNo.toUpperCase())) continue;
      if (userId && l.toUpperCase().includes(userId.toUpperCase())) continue;
      if (newSn && l.toUpperCase().includes(newSn.toUpperCase())) continue;
      if (oldSn && l.toUpperCase().includes(oldSn.toUpperCase())) continue;
      if (/(box\s*damaged|damage|faulty|no\s*light|upgrade|wifi|stb|single\s*to\s*dual|dual\s*to\s*wifi|los|dead|replace)/i.test(l)) {
        remarks = l;
        break;
      }
    }
  }

  // 6. Customer Name
  const knownTechs = /^(?:chandramani|sabin|ajit|rajesh|sanjeev|sanzeev|shashikant|sunil)\b/i;
  let name = '';
  for (const line of lines) {
    if (tktNo && line.toUpperCase().includes(tktNo.toUpperCase())) continue;
    if (userId && line.toUpperCase().includes(userId.toUpperCase())) continue;
    if (newSn && line.toUpperCase().includes(newSn.toUpperCase())) continue;
    if (oldSn && line.toUpperCase().includes(oldSn.toUpperCase())) continue;
    if (remarks && line.toUpperCase() === remarks.toUpperCase()) continue;
    if (knownTechs.test(line)) continue;
    if (/^(Old|New|Note|Remarks?|Issue|S\/?N|SN|MAC|Wifi|Upgrade|Single|Dual|Done|Please|Still|Check|Checking|Internet|Skycom|NETTV|STB|Wait|Ok|Now)\b/i.test(line)) continue;
    if (line.match(/^[\d\s\-\+\(\)\:]+$/)) continue;
    if (/[A-Za-z]/.test(line)) {
      name = line;
      break;
    }
  }

  const upperNew = newSn ? newSn.toUpperCase() : '';
  const upperOld = oldSn ? oldSn.toUpperCase() : '';
  const isStb = upperNew.startsWith('900') || upperNew.startsWith('D076') || upperOld.startsWith('900') || upperOld.startsWith('D076');

  return {
    tktNo,
    userId,
    name,
    newSn: upperNew,
    oldSn: upperOld,
    remarks: remarks || (isStb ? 'STB replacement' : 'Upgrade to wifi-6')
  };
}

function resolveSenderNames(msg) {
  const names = [];
  if (msg.pushName) names.push(msg.pushName);
  const participant = msg.key?.participant;
  if (participant && knownContacts[participant]) {
    const c = knownContacts[participant];
    if (c.name) names.push(c.name);
    if (c.notify) names.push(c.notify);
    if (c.verifiedName) names.push(c.verifiedName);
  }
  return Array.from(new Set(names.filter(Boolean)));
}

async function handleMessage(msg, sourceLabel = 'Live') {
  if (!msg?.key) return;

  const jid = msg.key.remoteJid;
  const isRouterGroup = jid === ROUTER_GROUP_JID;
  const isIptvGroup = jid === IPTV_GROUP_JID;

  if (!isRouterGroup && !isIptvGroup) return;

  const groupLabel = isIptvGroup ? IPTV_GROUP_NAME : ROUTER_GROUP_NAME;
  const senderNames = resolveSenderNames(msg);
  const displaySender = msg.key.fromMe
    ? 'You (Self)'
    : (senderNames.join(' / ') || msg.key.participant || 'Technician');

  // Log decryption retries (StubType 2 = CIPHERTEXT) instead of failing silently
  if (!msg.message && msg.messageStubType === 2) {
    console.log(`🔐 [${sourceLabel}] [${groupLabel}] Decryption retry requested for msg ${msg.key.id} from ${displaySender}...`);
    return;
  }

  if (!msg.message) return;

  // Record message anchor for on-demand missed-message sync
  recordAnchor(msg);

  // Trigger a one-time automatic history sync per target group after boot so any gap while laptop was asleep is caught
  if (sourceLabel !== 'History Sync' && !autoSyncedGroupsThisBoot.has(jid) && globalSock) {
    autoSyncedGroupsThisBoot.add(jid);
    const anchor = lastAnchors[jid];
    if (anchor?.key) {
      setTimeout(() => {
        if (globalSock && connectionStatus === 'Connected') {
          globalSock.fetchMessageHistory(50, anchor.key, anchor.timestampMs)
            .then(() => console.log(`🔄 [Auto-Catchup] Requested previous 50 messages for "${groupLabel}"`))
            .catch(() => {});
        }
      }, 3000);
    }
  }

  const messageText = extractText(msg.message);
  if (!messageText) return;

  // STRICT WHITELIST for IPTV group: only process if sent by our 7 team members (or ourselves)
  if (isIptvGroup && !msg.key.fromMe) {
    const combinedLower = senderNames.join(' | ').toLowerCase();
    const isTeamMember = IPTV_TEAM_PATTERNS.some(pat => combinedLower.includes(pat));
    if (!isTeamMember) {
      console.log(`\n💬 [${sourceLabel}] [${groupLabel}] Ignored non-team sender: "${displaySender}" (${msg.key.participant || ''})`);
      return;
    }
  }

  console.log(`\n💬 [${sourceLabel}] [${groupLabel}] Message from ${displaySender}:`);
  console.log(`   "${messageText.replace(/\n/g, ' ')}"`);

  if (!messageText.toUpperCase().includes('TKT')) {
    console.log(`   ⏩ Ignored (No TKT keyword).`);
    return;
  }

  const parsed = parseTechnicianMessage(messageText);
  if (!parsed.tktNo || (!parsed.newSn && !parsed.oldSn)) {
    console.log(`   ⏩ Ignored (Missing valid TKT or Serial/MAC number).`);
    return;
  }

  const incomingTkt = parsed.tktNo.toUpperCase().trim();
  const incomingNewSn = parsed.newSn && parsed.newSn.length >= 8 ? parsed.newSn.toUpperCase().trim() : null;

  // 1. DUPLICATE CHECK: Ignore if already processed previously
  if (incomingTkt && processedTickets.has(incomingTkt)) {
    console.log(`   ⏩ [Duplicate Ignored] Ticket ${parsed.tktNo} already processed previously.`);
    return;
  }

  if (incomingNewSn && processedTickets.has(incomingNewSn)) {
    console.log(`   ⏩ [Duplicate Ignored] Serial/MAC Number ${parsed.newSn} already processed previously.`);
    return;
  }

  // 2. QUEUE CHECK: Ignore if already waiting in queue to be pushed
  const alreadyInQueue = pushQueue.some(item =>
    (incomingTkt && item.tktNo && item.tktNo.toUpperCase().trim() === incomingTkt) ||
    (incomingNewSn && item.newSn && item.newSn.toUpperCase().trim() === incomingNewSn)
  );
  if (alreadyInQueue) {
    console.log(`   ⏩ [Duplicate Ignored] ${parsed.tktNo || parsed.newSn} is already pending in push queue.`);
    return;
  }

  // 3. INSTANT LOCK: Mark in memory and disk IMMEDIATELY so rapid double-sends within ms are blocked
  recordProcessedTicket(parsed.tktNo, parsed.newSn);

  console.log(`\n====================================================`);
  console.log(`📩 New [${groupLabel}] Ticket: ${parsed.tktNo}`);
  console.log(`   Sender   : ${displaySender}`);
  console.log(`   UserID   : ${parsed.userId}`);
  console.log(`   Name     : ${parsed.name}`);
  console.log(`   New SN   : ${parsed.newSn}`);
  console.log(`   Old SN   : ${parsed.oldSn}`);
  console.log(`   Remarks  : ${parsed.remarks}`);
  console.log(`====================================================`);

  pushQueue.push({
    ...parsed,
    rawText: messageText,
    group: groupLabel,
    sender: msg.key.participant || jid,
    pushName: displaySender,
    timestamp: msg.messageTimestamp
  });

  processQueue();
}

async function startWhatsApp() {
  const authFolder = path.join(__dirname, 'auth_info');
  const { state, saveCreds } = await useMultiFileAuthState(authFolder);
  const { version } = await fetchLatestBaileysVersion();

  const onDemandType = proto?.Message?.HistorySyncNotification?.HistorySyncType?.ON_DEMAND ?? 4;

  const sock = makeWASocket({
    version,
    logger: pino({ level: 'error' }),
    auth: state,
    printQRInTerminal: false,
    browser: Browsers.ubuntu('Chrome'),
    markOnlineOnConnect: false,
    syncFullHistory: false,
    // Prevent automatic initial history/app-state sync from deadlocking processingMutex & ev.buffer()
    shouldSyncHistoryMessage: (msg) => msg?.syncType === onDemandType || msg?.syncType === 4,
    getMessage: async () => undefined
  });

  globalSock = sock;
  sock.ev.on('creds.update', saveCreds);

  // Safety flush timer: guarantees Baileys v6.7.16 event-buffer never traps offline or live messages
  const flushInterval = setInterval(() => {
    try {
      if (sock?.ev?.isBuffering?.()) {
        sock.ev.flush();
      }
    } catch (e) {}
  }, 1500);

  if (sock.authState.creds.registered) {
    connectionStatus = 'Connecting to WhatsApp...';
  } else {
    connectionStatus = 'Waiting for login';
  }

  sock.ev.on('contacts.upsert', updateKnownContacts);
  sock.ev.on('contacts.update', updateKnownContacts);

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
      clearInterval(flushInterval);
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
      if (sock?.ev?.isBuffering?.()) {
        sock.ev.flush();
      }
      console.log('\n✅ WhatsApp Connected successfully! (Live stream unbuffered & active)');
      console.log(`🎯 Monitoring: "${ROUTER_GROUP_NAME}" & "${IPTV_GROUP_NAME}"\n`);
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    const label = type === 'notify' ? 'Live' : 'Offline Catch-Up';
    for (const msg of messages) {
      await handleMessage(msg, label);
    }
  });

  sock.ev.on('messages.update', async (updates) => {
    for (const u of updates) {
      if (u?.key && u?.update?.message) {
        await handleMessage({ key: u.key, message: u.update.message, pushName: u.update.pushName }, 'Edited');
      }
    }
  });

  sock.ev.on('messaging-history.set', async ({ messages, contacts }) => {
    if (contacts?.length) updateKnownContacts(contacts);
    if (messages?.length) {
      console.log(`📥 [History Sync] Checking ${messages.length} synced message(s)...`);
      for (const msg of messages) {
        await handleMessage(msg, 'History Sync');
      }
    }
  });
}

startWhatsApp().catch((err) => console.log('Notice in startWhatsApp:', err.message));
