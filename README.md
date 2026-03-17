# RQL Construction — HR Contract Management System

A Node.js web app to manage employee contracts, send automated reminder emails, and create Google Calendar events for contract expiries.

## Features

- **Google Sheets** as the database (Sheet ID pre-configured)
- **Gmail API** — sends real reminder emails at 60/30/21/14/7/0 days before contract end
- **Google Calendar API** — creates contract expiry events with reminders
- **Express.js** dashboard with live search, filters, and stats
- **Daily cron** at 8:00 AM automatically processes all reminders
- Supports **Google Shared Drive**

---

## Quick Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure Google credentials

**Option A — Service Account (recommended for servers)**

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project → Enable **Sheets API**, **Gmail API**, **Calendar API**
3. Create a **Service Account** → download JSON key → save as `credentials.json` in the project root
4. Share the Google Sheet with the service account email (Editor access)
5. **For Gmail sending**: The service account must have **Domain-wide Delegation** enabled, and a user must impersonate a real Gmail address. Alternatively, use OAuth2.

**Option B — OAuth2 (for individual users)**

1. Create OAuth2 credentials in Google Cloud Console
2. Copy `.env.example` to `.env` and fill in OAuth2 values:

```bash
cp .env.example .env
```

### 3. Configure `.env`

```env
GOOGLE_SERVICE_ACCOUNT_KEY=./credentials.json
SHEET_ID=18HVul32CS-w1XYYXkBbGbbswdIzlnQs3NcQ05KkTm3E
RECIPIENT_EMAIL=ac@arkeoconstruction.com
GMAIL_FROM=ac@arkeoconstruction.com
CALENDAR_ID=primary
PORT=3000
```

### 4. Start the server

```bash
npm start
# or for development with auto-reload:
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Google Sheet Structure

The app auto-creates an **Employees** sheet tab with these columns:

| Name | Role | Type | Email | Phone | ContractStart | ContractEnd | MissedDays |
|------|------|------|-------|-------|---------------|-------------|------------|

---

## Reminder Schedule

Emails are sent to `ac@arkeoconstruction.com` when a contract is:

| Days Left | Urgency |
|-----------|---------|
| 60 days   | Notice  |
| 30 days   | Notice  |
| 21 days   | Warning |
| 14 days   | Warning |
| 7 days    | Urgent  |
| 0 days    | Expired |

The cron runs daily at **8:00 AM** (timezone: `America/Toronto` — edit `src/server.js` to change).

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET    | `/api/employees` | List all employees with days-left |
| POST   | `/api/employees` | Add new employee |
| PUT    | `/api/employees/:rowIndex` | Update employee |
| DELETE | `/api/employees/:rowIndex` | Delete employee |
| POST   | `/api/reminders/run` | Manually trigger reminder emails |
| POST   | `/api/calendar/sync` | Sync calendar events for all employees |
| GET    | `/api/health` | Health check |

---

## Shared Drive Note

If using a Google Shared Drive, ensure the service account is added as a **Content Manager** or higher on the Shared Drive, and include `supportsAllDrives: true` in Sheets API calls (already handled in this app).
