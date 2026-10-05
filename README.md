# WhatsApp to Google Sheets Bridge (CGNET Router Updates)

An automated, self-hosted bridge connecting WhatsApp technician group messages directly into Google Sheets in real-time.

## Features
- **Strict Group Filtering**: Only processes messages from `Router Changed Thapathali`.
- **Pattern-Based Regex Parser**: Automatically maps:
  - `Tkt No` (Col A)
  - `UserID` (Col B)
  - `Customer Name` (Col C)
  - `New SN` (Col D)
  - `Old SN` (Col E)
  - `Remarks` (Col F)
- **Two-Layer Deduplication**: Automatically blocks repeated or quoted messages sent by technicians.
- **Offline Backlog Sync**: Catches up on missed messages when reconnected after PC shutdown.
- **No Docker Required**: Runs on lightweight Node.js using `@whiskeysockets/baileys`.

## Setup & Running

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure `.env`**:
   Copy `.env.example` to `.env` and set your Google Apps Script Web App URL:
   ```env
   GOOGLE_SCRIPT_WEBHOOK_URL=https://script.google.com/macros/s/.../exec
   PORT=3001
   TARGET_GROUP_NAME=Router Changed Thapathali
   ```

3. **Start the bridge**:
   ```bash
   npm start
   ```

4. **Link WhatsApp**:
   Open `http://localhost:3001` in your browser and scan the QR code with WhatsApp once.
