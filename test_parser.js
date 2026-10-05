const sample1 = `TKT1347456
9841638051
Saurab Raj Karmikar
New SN : ALCLFE4FFD86
Old SN : ALCLEB163020
Note : Upgrade to wifi-6`;

const sample2 = `TKT1349504
LTP9844063532
Shiva mangrati
ALCLB2794CF1 New dual
ALCLB27F2115 Old dual
Note:router faulty`;

const sample3 = `TKT1334125
9845603766
Niran Shahi Thakuri
S/N: ALCLB27F0E5B(old)
S/N: ALCLFE4323DB(new)
Wifi 6 upgrade`;

function parseTechnicianMessage(rawText) {
  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  // 1. Ticket Number
  const tktMatch = rawText.match(/\bTKT\s*(\d+)\b/i);
  const tktNo = tktMatch ? `TKT${tktMatch[1]}` : '';

  // 2. UserID (Exclude TKT and ALCL prefixes)
  const userMatch = rawText.match(/\b(?!(?:TKT|ALCL))([A-Za-z]{2,4}\d{6,}|\d{10})\b/i);
  const userId = userMatch ? userMatch[1] : '';

  // 3. New SN
  let newSn = '';
  let m = rawText.match(/New\s*SN\s*[:\-\s]*([A-Za-z0-9]+)/i);
  if (m) newSn = m[1];
  else {
    m = rawText.match(/S\/?N\s*[:\-\s]*([A-Za-z0-9]+)\s*\(\s*new\s*\)/i);
    if (m) newSn = m[1];
    else {
      m = rawText.match(/\b([A-Za-z0-9]{8,})\s+New(?:\s+dual)?\b/i);
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

  // 5. Customer Name (Text line that is not Tkt, UserID, SN, or Note)
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

  // 6. Remarks
  let remarks = '';
  const noteMatch = rawText.match(/Note\s*[:\-]\s*(.+)/i);
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

  return {
    tktNo,
    userId,
    name,
    newSn: newSn.toUpperCase(),
    oldSn: oldSn.toUpperCase(),
    remarks
  };
}

console.log("Sample 1:", parseTechnicianMessage(sample1));
console.log("Sample 2:", parseTechnicianMessage(sample2));
console.log("Sample 3:", parseTechnicianMessage(sample3));
