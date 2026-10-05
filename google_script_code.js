/**
 * ====================================================================
 * GOOGLE APPS SCRIPT WEBHOOK RECEIVER (STRICT LOCK & MULTI-FIELD DEDUP)
 * ====================================================================
 * Paste this code into: Extensions > Apps Script in your spreadsheet.
 * 
 * Then click: Deploy > Manage deployments > Click Edit ✏️
 * - Version: Select "New version"
 * - Click "Deploy"
 */

function doPost(e) {
  // 1. Script Lock: Prevents race conditions and duplicate writes
  const lock = LockService.getScriptLock();
  try {
    // Wait up to 30 seconds to acquire exclusive write lock
    lock.waitLock(30000);

    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'No payload' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    const finalSheet = ss.getSheetByName('Final');
    if (!finalSheet) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: '"Final" tab not found' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const incomingTkt = String(data.tktNo || '').toUpperCase().trim();
    const incomingNewSn = String(data.newSn || '').toUpperCase().trim();
    const incomingOldSn = String(data.oldSn || '').toUpperCase().trim();

    // 2. STRICT MULTI-FIELD DUPLICATE CHECK:
    // Check if Ticket Number, New SN, or Old SN already exists in the sheet
    const lastRow = finalSheet.getLastRow();
    if (lastRow > 1) {
      const allRows = finalSheet.getRange(2, 1, lastRow - 1, 6).getValues();

      for (let i = 0; i < allRows.length; i++) {
        const rowTkt = String(allRows[i][0] || '').toUpperCase().trim();
        const rowNewSn = String(allRows[i][3] || '').toUpperCase().trim();
        const rowOldSn = String(allRows[i][4] || '').toUpperCase().trim();

        // Check A: Ticket Number already exists
        if (incomingTkt && rowTkt === incomingTkt) {
          return ContentService.createTextOutput(JSON.stringify({ 
            status: 'ignored', 
            reason: 'duplicate ticket number', 
            ticket: data.tktNo,
            row: i + 2 
          })).setMimeType(ContentService.MimeType.JSON);
        }

        // Check B: Same New SN already recorded
        if (incomingNewSn && incomingNewSn.length >= 8 && rowNewSn === incomingNewSn) {
          return ContentService.createTextOutput(JSON.stringify({ 
            status: 'ignored', 
            reason: 'duplicate new serial number', 
            ticket: data.tktNo,
            sn: incomingNewSn,
            row: i + 2 
          })).setMimeType(ContentService.MimeType.JSON);
        }
      }
    }

    // 3. Prepare the clean row in exact column order:
    // Col A: Tkt No | Col B: UserID | Col C: Name | Col D: NewSN | Col E: OldSN | Col F: Remarks
    const row = [
      data.tktNo || '',
      data.userId || '',
      data.name || '',
      data.newSn || '',
      data.oldSn || '',
      data.remarks || ''
    ];

    // Append ONLY when no duplicates exist
    finalSheet.appendRow(row);
    SpreadsheetApp.flush(); // Commit immediately so next checks see it instantly

    // Optional: mirror to Pasted tab
    const pastedSheet = ss.getSheetByName('Pasted');
    if (pastedSheet && data.rawText) {
      const rawLines = data.rawText.split(/\r?\n/).map(l => [l.trim()]).filter(r => r[0].length > 0);
      if (rawLines.length > 0) {
        pastedSheet.getRange("A:A").clearContent();
        pastedSheet.getRange(1, 1, rawLines.length, 1).setValues(rawLines);
      }
    }

    return ContentService.createTextOutput(JSON.stringify({ status: 'success', ticket: data.tktNo }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

/**
 * UTILITY: Run this function once inside Apps Script to instantly remove
 * any existing duplicates in the "Final" tab and keep only unique tickets.
 */
function cleanDuplicatesNow() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Final');
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return;

  const data = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
  const seenTkts = new Set();
  const uniqueRows = [];

  for (let i = 0; i < data.length; i++) {
    const tkt = String(data[i][0] || '').toUpperCase().trim();
    if (tkt && seenTkts.has(tkt)) {
      continue; // Skip duplicate
    }
    if (tkt) seenTkts.add(tkt);
    uniqueRows.push(data[i]);
  }

  // Clear and rewrite only unique rows
  sheet.getRange(2, 1, lastRow - 1, 6).clearContent();
  if (uniqueRows.length > 0) {
    sheet.getRange(2, 1, uniqueRows.length, 6).setValues(uniqueRows);
  }
  SpreadsheetApp.flush();
  Logger.log('Done! Kept ' + uniqueRows.length + ' unique tickets.');
}
