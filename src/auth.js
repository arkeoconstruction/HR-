const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/drive',
];

let authClient = null;

function getAuth() {
  if (authClient) return authClient;

  const credPath = path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS || './credentials.json');

  if (fs.existsSync(credPath)) {
    const creds = JSON.parse(fs.readFileSync(credPath, 'utf8'));

    // Service account
    if (creds.type === 'service_account') {
      authClient = new google.auth.GoogleAuth({
        keyFile: credPath,
        scopes: SCOPES,
      });
      return authClient;
    }
  }

  // OAuth2 fallback
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_REFRESH_TOKEN) {
    const oauth2 = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    authClient = oauth2;
    return authClient;
  }

  throw new Error(
    'No Google credentials found. Provide credentials.json (service account) or OAuth2 env vars.'
  );
}

module.exports = { getAuth, SCOPES };
