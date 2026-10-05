/**
 * ====================================================================
 * GOOGLE APPS SCRIPT WEBHOOK RECEIVER (WITH DUPLICATE PROTECTION)
 * ====================================================================
 * Paste this code into: Extensions > Apps Script in your spreadsheet.
 * 
 * Then click: Deploy > Manage deployments > Click Edit ✏️
 * - Version: Select "New version"
 * - Click "Deploy"
 */

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'No payload' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // 1. Get the "Final" sheet
    const finalSheet = ss.getSheetByName('Final');
    if (!finalSheet) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: '"Final" tab not found' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 2. DUPLICATE CHECK: Ignore if this ticket was already recorded
    if (data.tktNo) {
      const lastRow = finalSheet.getLastRow();
      if (lastRow > 1) {
        const existingTickets = finalSheet.getRange(2, 1, lastRow - 1, 1).getValues().flat();
        if (existingTickets.includes(data.tktNo)) {
          return ContentService.createTextOutput(JSON.stringify({ 
            status: 'ignored', 
            reason: 'duplicate ticket', 
            ticket: data.tktNo 
          })).setMimeType(ContentService.MimeType.JSON);
        }
      }
    }

    // 3. Prepare the clean row in exact column order:
    // Col A: Tkt No
    // Col B: UserID
    // Col C: Name
    // Col D: NewSN
    // Col E: OldSN
    // Col F: Remarks
    const row = [
      data.tktNo || '',
      data.userId || '',
      data.name || '',
      data.newSn || '',
      data.oldSn || '',
      data.remarks || ''
    ];

    // Append directly to the bottom of the "Final" sheet
    finalSheet.appendRow(row);

    // Also mirror the raw lines into the "Pasted" tab if needed:
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
  }
}
