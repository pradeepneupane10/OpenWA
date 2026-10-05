const axios = require('axios');
const fs = require('fs');
require('dotenv').config();

const rawText = `[12:52 pm, 28/09/2026] Rajesh: TKT1348025
madhavmarasini
Madhav Marasini
NEW SN: ALCLFE4FE6D0
OLD SN: ALCLB3D72F6E
note: upgraded to wifi6
[12:53 pm, 28/09/2026] Sunil chaudhary: Done
Still internet light is blinking
[12:58 pm, 28/09/2026] Sanjeev: Done
Still no internet
[1:05 pm, 28/09/2026] Shashikant Chaudhary: Check this too sir
..
[1:15 pm, 28/09/2026] Sanjeev: Done
Please check this one user have some meetings online
[1:24 pm, 28/09/2026] Sanjeev: TKT1344651
DRZ9863934780
Abishek Dangol
SN:ALCLB2A1F99F(old)
S/N: ALCLFE4FEEB6(new)
WiFi 6 upgrade
[1:24 pm, 28/09/2026] Sanjeev: Please check
[1:28 pm, 28/09/2026] Chandramani Tharu: TKT1347456
9841638051
Saurab Raj Karmikar
New SN : ALCLFE4FFD86
Old SN : ALCLEB163020
Note : Upgrade to wifi-6
[1:30 pm, 28/09/2026] Sunil chaudhary: TKT1347127
9844113667 
Ashim raj bahak
New SN : ALCLFE4FF104
Old SN : ALCLEB2CADC3
Note : Upgrade to wifi-6
[1:30 pm, 28/09/2026] Sunil chaudhary: Please check
[1:30 pm, 28/09/2026] Shashikant Chaudhary: TKT1349504
LTP9844063532
Shiva mangrati
ALCLB2794CF1 New dual
ALCLB27F2115 Old dual
Note:router faulty
[1:34 pm, 28/09/2026] +977 984-7592175: TKT1344651
DRZ9863934780
Abishek Dangol
SN:ALCLB2A1F99F(old)
S/N: ALCLFE4FEEB6(new)
WiFi 6 upgrade
checking
[1:37 pm, 28/09/2026] Sanjeev: TKT1343941
9860658536
yeman makaju
S/N: ALCLB27F0BC1(old)
S/N: ALCLFE4FECFA(new)
WiFi 6 upgrade
More than 80 minutes
[1:39 pm, 28/09/2026] +977 984-7592175: TKT1344651
DRZ9863934780
Abishek Dangol
SN:ALCLB2A1F99F(old)
S/N: ALCLFE4FEEB6(new)
WiFi 6 upgrade
done
[1:42 pm, 28/09/2026] Sanjeev: TKT1343941
9860658536
yeman makaju
S/N: ALCLB27F0BC1(old)
S/N: ALCLFE4FECFA(new)
WiFi 6 upgrade
This one sir it's been 90 minutes
[1:43 pm, 28/09/2026] Chandramani Tharu: TKT1347456
9841638051
Saurab Raj Karmikar
New SN : ALCLFE4FFD86
Old SN : ALCLEB163020
Note : Upgrade to wifi-6
Please check
[1:45 pm, 28/09/2026] +977 984-7592175: TKT1349504
LTP9844063532
Shiva mangrati
ALCLB2794CF1 New dual
ALCLB27F2115 Old dual
Note:router faulty
done
[1:50 pm, 28/09/2026] +977 984-7592175: TKT1347127
9844113667 
Ashim raj bahak
New SN : ALCLFE4FF104
Old SN : ALCLEB2CADC3
Note : Upgrade to wifi-6
done
[1:50 pm, 28/09/2026] +977 984-7592175: TKT1347456
9841638051
Saurab Raj Karmikar
New SN : ALCLFE4FFD86
Old SN : ALCLEB163020
Note : Upgrade to wifi-6
checking
[1:50 pm, 28/09/2026] Sanjeev: TKT1343941
9860658536
yeman makaju
S/N: ALCLB27F0BC1(old)
S/N: ALCLFE4FECFA(new)
WiFi 6 upgrade
[1:51 pm, 28/09/2026] Rajesh: TKT1348025
madhavmarasini
Madhav Marasini
NEW SN: ALCLFE4FE6D0
OLD SN: ALCLB3D72F6E
note: upgraded to wifi6
Please check
[1:51 pm, 28/09/2026] Sunil chaudhary: Still internet light is blinking
Please check this too sir internet light is blinking
[1:53 pm, 28/09/2026] Shashikant Chaudhary: TKT1348491
9840559578
Rabi Maharjan
ALCLFE4FE602 New wifi 6
ALCLB255AF76 Old dual
Note:upgrade to WiFi 6
Please check
[1:54 pm, 28/09/2026] +977 984-7592175: TKT1347456
9841638051
Saurab Raj Karmikar
New SN : ALCLFE4FFD86
Old SN : ALCLEB163020
Note : Upgrade to wifi-6
done
[2:01 pm, 28/09/2026] +977 984-7592175: TKT1348491
9840559578
Rabi Maharjan
ALCLFE4FE602 New wifi 6
ALCLB255AF76 Old dual
Note:upgrade to WiFi 6
done
[2:06 pm, 28/09/2026] Sanjeev: TKT1343941
9860658536
yeman makaju
S/N: ALCLB27F0BC1(old)
S/N: ALCLFE4FECFA(new)
WiFi 6 upgrade
.
[2:08 pm, 28/09/2026] Sunil chaudhary: TKT1345530
9815298404 
Durga lal tamang
New SN : ALCLFE4FE500
Old SN : ALCLB27959EA
Note : Upgrade to wifi-6
[2:08 pm, 28/09/2026] Sunil chaudhary: Please check
[2:09 pm, 28/09/2026] +977 984-7592175: Please check this too sir internet light is blinking
please verify
[2:12 pm, 28/09/2026] Rajesh: TKT1348025
madhavmarasini
Madhav Marasini
NEW SN: ALCLFE4FE6D0
OLD SN: ALCLB3D72F6E
note: upgraded to wifi6
.....
[2:12 pm, 28/09/2026] +977 984-7592175: .
done
[2:14 pm, 28/09/2026] Rajesh: TKT1347700	
9868732494	
Bina Sharma
NEW SN: ALCLFE4FF278
OLD SN: ALCLB2B2133C
note: upgraded to wifi6`;

const WEBHOOK_URL = process.env.GOOGLE_SCRIPT_WEBHOOK_URL;

function parseBlock(block) {
  // Strip WhatsApp metadata headers like "[12:52 pm, 28/09/2026] Rajesh: "
  const cleaned = block.replace(/\[\d{1,2}:\d{2}\s*[ap]m[^\]]*\][^:]*:\s*/gi, '').trim();
  const lines = cleaned.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  const tktMatch = cleaned.match(/\bTKT\s*(\d+)\b/i);
  if (!tktMatch) return null;
  const tktNo = `TKT${tktMatch[1]}`;

  // 1. New SN
  let newSn = '';
  let m = cleaned.match(/New\s*SN\s*[:\-\s]*([A-Za-z0-9]+)/i);
  if (m) newSn = m[1];
  else {
    m = cleaned.match(/S\/?N\s*[:\-\s]*([A-Za-z0-9]+)\s*\(\s*new\s*\)/i);
    if (m) newSn = m[1];
    else {
      m = cleaned.match(/\b([A-Za-z0-9]{8,})\s+New(?:\s+dual|\s+wifi\s*6)?\b/i);
      if (m) newSn = m[1];
    }
  }

  // 2. Old SN
  let oldSn = '';
  m = cleaned.match(/Old\s*SN\s*[:\-\s]*([A-Za-z0-9]+)/i);
  if (m) oldSn = m[1];
  else {
    m = cleaned.match(/S\/?N\s*[:\-\s]*([A-Za-z0-9]+)\s*\(\s*old\s*\)/i);
    if (m) oldSn = m[1];
    else {
      m = cleaned.match(/\b([A-Za-z0-9]{8,})\s+Old(?:\s+dual)?\b/i);
      if (m) oldSn = m[1];
    }
  }

  // 3. UserID: either a number, branch prefix + number, or a single-word username like madhavmarasini
  let userId = '';
  const numMatch = cleaned.match(/\b(?!(?:TKT|ALCL))([A-Za-z]{2,4}\d{6,}|\d{10})\b/i);
  if (numMatch) {
    userId = numMatch[1];
  } else if (lines.length >= 2 && !/^(TKT|S\/?N|Old|New|Note)/i.test(lines[1])) {
    userId = lines[1];
  }

  // 4. Name: customer full name
  let name = '';
  for (const line of lines) {
    if (line.includes(tktNo)) continue;
    if (userId && line.toLowerCase() === userId.toLowerCase()) continue;
    if (newSn && line.toUpperCase().includes(newSn.toUpperCase())) continue;
    if (oldSn && line.toUpperCase().includes(oldSn.toUpperCase())) continue;
    if (/^(Old|New|Note|S\/?N|WiFi|Done|Please|Still|Check)/i.test(line)) continue;
    if (/[A-Za-z]/.test(line)) {
      name = line;
      break;
    }
  }

  // 5. Remarks
  let remarks = '';
  const noteMatch = cleaned.match(/Note\s*[:\-]\s*(.+)/i);
  if (noteMatch) {
    remarks = noteMatch[1].trim();
  } else {
    const wifiMatch = cleaned.match(/(WiFi\s*6\s*upgrade|Upgrade\s*to\s*wifi-?6)/i);
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

async function run() {
  // Split on TKT
  const rawChunks = rawText.split(/(?=\bTKT\d+)/i);
  const seenTkts = new Set();
  const uniqueTickets = [];

  for (const chunk of rawChunks) {
    const parsed = parseBlock(chunk);
    if (parsed && !seenTkts.has(parsed.tktNo)) {
      seenTkts.add(parsed.tktNo);
      uniqueTickets.push(parsed);
    }
  }

  console.log(`\n📋 Found ${uniqueTickets.length} unique tickets to push:\n`);
  console.table(uniqueTickets);

  for (let i = 0; i < uniqueTickets.length; i++) {
    const t = uniqueTickets[i];
    console.log(`[${i + 1}/${uniqueTickets.length}] Pushing ${t.tktNo} (${t.name})...`);
    try {
      const res = await axios.post(WEBHOOK_URL, t);
      console.log(`   ✅ Success:`, res.data);
    } catch (err) {
      console.error(`   ❌ Error:`, err.message);
    }
    await new Promise(r => setTimeout(r, 500));
  }

  console.log('\n🎉 Finished backfill!');
}

run();
