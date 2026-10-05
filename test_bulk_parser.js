const bulkText = `
TKT1343714
LTP9849335487
Krishna kumar basnet
ALCLFE4FEBBC New wifi 6
ALCLB2B22739 Old dual
Note:upgrade to WiFi 6

TKT1347456
9841638051
Saurab Raj Karmikar
New SN : ALCLFE4FFD86
Old SN : ALCLEB163020
Note : Upgrade to wifi-6

Please check

TKT1347127
9844113667
Ashim raj bahak
New SN : ALCLFE4FF104
Old SN : ALCLEB2CADC3
Note : Upgrade to wifi-6

TKT1349504
LTP9844063532
Shiva mangrati
ALCLB2794CF1 New dual
ALCLB27F2115 Old dual
Note:router faulty
`;

function parseBulkTechnicianMessages(text, lastKnownTkt = "TKT1343714") {
  // Split by ticket blocks: find where each TKT starts
  const chunks = text.split(/(?=\bTKT\d+)/i).map(c => c.trim()).filter(Boolean);
  const results = [];

  let foundLast = !lastKnownTkt; // If no lastKnownTkt specified, process all

  for (const chunk of chunks) {
    if (!chunk.toUpperCase().includes('TKT')) continue;

    const tktMatch = chunk.match(/\bTKT\s*(\d+)\b/i);
    if (!tktMatch) continue;
    const tktNo = `TKT${tktMatch[1]}`;

    if (!foundLast) {
      if (tktNo.toUpperCase() === lastKnownTkt.toUpperCase()) {
        foundLast = true; // Found the Thursday cut-off, all following tickets will be processed
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

console.log(JSON.stringify(parseBulkTechnicianMessages(bulkText, "TKT1343714"), null, 2));
