const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const WEBHOOK_URL = process.env.GOOGLE_SCRIPT_WEBHOOK_URL;
const CUTOFF_TICKET = "TKT1343714"; // Last ticket recorded on Thursday

function parseBulkTechnicianMessages(text, lastKnownTkt = CUTOFF_TICKET) {
  const chunks = text.split(/(?=\bTKT\d+)/i).map(c => c.trim()).filter(Boolean);
  const results = [];

  let foundLast = !lastKnownTkt;

  for (const chunk of chunks) {
    if (!chunk.toUpperCase().includes('TKT')) continue;

    const tktMatch = chunk.match(/\bTKT\s*(\d+)\b/i);
    if (!tktMatch) continue;
    const tktNo = `TKT${tktMatch[1]}`;

    if (!foundLast) {
      if (tktNo.toUpperCase() === lastKnownTkt.toUpperCase()) {
        foundLast = true;
      }
      continue;
    }

    const lines = chunk.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    // UserID
    const userMatch = chunk.match(/\b(?!(?:TKT|ALCL))([A-Za-z]{2,4}\d{6,}|\d{10})\b/i);
    const userId = userMatch ? userMatch[1] : '';

    // New SN
    let newSn = '';
    let m = chunk.match(/New\s*SN\s*[:\-\s]*([A-Za-z0-9]+)/i);
    if (m) newSn = m[1];
    else {
      m = chunk.match(/S\/?N\s*[:\-\s]*([A-Za-z0-9]+)\s*\(\s*new\s*\)/i);
      if (m) newSn = m[1];
      else {
        m = chunk.match(/\b([A-Za-z0-9]{8,})\s+New(?:\s+dual)?\b/i);
        if (m) newSn = m[1];
      }
    }

    // Old SN
    let oldSn = '';
    m = chunk.match(/Old\s*SN\s*[:\-\s]*([A-Za-z0-9]+)/i);
    if (m) oldSn = m[1];
    else {
      m = chunk.match(/S\/?N\s*[:\-\s]*([A-Za-z0-9]+)\s*\(\s*old\s*\)/i);
      if (m) oldSn = m[1];
      else {
        m = chunk.match(/\b([A-Za-z0-9]{8,})\s+Old(?:\s+dual)?\b/i);
        if (m) oldSn = m[1];
      }
    }

    // Customer Name
    let name = '';
    for (const line of lines) {
      if (tktNo && line.toUpperCase().includes(tktNo.toUpperCase())) continue;
      if (userId && line.toUpperCase().includes(userId.toUpperCase())) continue;
      if (newSn && line.toUpperCase().includes(newSn.toUpperCase())) continue;
      if (oldSn && line.toUpperCase().includes(oldSn.toUpperCase())) continue;
      if (/^(Old|New|Note|S\/?N|Wifi)/i.test(line)) continue;
      if (/[A-Za-z]/.test(line)) {
        name = line;
        break;
      }
    }

    // Remarks
    let remarks = '';
    const noteMatch = chunk.match(/Note\s*[:\-]\s*(.+)/i);
    if (noteMatch) {
      remarks = noteMatch[1].trim();
    } else {
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        if (line !== name && line !== userId && line !== tktNo && !line.includes(newSn) && !line.includes(oldSn)) {
          remarks = line;
          break;
        }
      }
    }

    results.push({
      tktNo,
      userId,
      name,
      newSn: newSn.toUpperCase(),
      oldSn: oldSn.toUpperCase(),
      remarks
    });
  }

  return results;
}

async function runBackfill() {
  const inputFile = path.join(__dirname, 'backfill_input.txt');
  if (!fs.existsSync(inputFile)) {
    console.error('File not found: backfill_input.txt. Create this file and paste your missed WhatsApp messages into it.');
    return;
  }

  const rawText = fs.readFileSync(inputFile, 'utf-8');
  const tickets = parseBulkTechnicianMessages(rawText, CUTOFF_TICKET);

  console.log(`\n📋 Found ${tickets.length} new tickets after ${CUTOFF_TICKET}:`);
  console.log('------------------------------------------------------------');

  for (let i = 0; i < tickets.length; i++) {
    const item = tickets[i];
    console.log(`[${i + 1}/${tickets.length}] Pushing ${item.tktNo} (${item.name} - ${item.userId})...`);
    try {
      const res = await axios.post(WEBHOOK_URL, item);
      console.log(`   ✅ Success:`, res.data);
    } catch (err) {
      console.error(`   ❌ Failed:`, err.message);
    }
    // Small delay between requests to be gentle on Google Sheets
    await new Promise(r => setTimeout(r, 600));
  }

  console.log('\n🎉 All missed tickets pushed to Google Sheet!\n');
}

runBackfill();
