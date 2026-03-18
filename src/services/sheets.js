const { google } = require('googleapis');
const { getAuth } = require('../auth');
const { getAllEmployeesLocal, addEmployeeLocal, updateEmployeeLocal, deleteEmployeeLocal } = require('./db');

const SHEET_ID = process.env.SHEET_ID || '18HVul32CS-w1XYYXkBbGbbswdIzlnQs3NcQ05KkTm3E';
const SHEET_NAME = 'Employees';

// Determine if Google Sheets is configured
function isSheetsConfigured() {
  const fs = require('fs');
  const path = require('path');
  const credPath = path.resolve(process.env.GOOGLE_SERVICE_ACCOUNT_KEY || './credentials.json');
  const hasServiceAccount = fs.existsSync(credPath);
  const hasOAuth = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_REFRESH_TOKEN);
  return hasServiceAccount || hasOAuth;
}

// Column order: Name, Role, Type, Email, Phone, ContractStart, ContractEnd, MissedDays, Notes
const COLUMNS = ['Name', 'Role', 'Type', 'Email', 'Phone', 'ContractStart', 'ContractEnd', 'MissedDays', 'Notes'];

async function getSheetsClient() {
  const auth = getAuth();
  return google.sheets({ version: 'v4', auth });
}

async function ensureSheetExists(sheets) {
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
    const sheetNames = meta.data.sheets.map((s) => s.properties.title);
    if (!sheetNames.includes(SHEET_NAME)) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: {
          requests: [{ addSheet: { properties: { title: SHEET_NAME } } }],
        },
      });
      // Write header row
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAME}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [COLUMNS] },
      });
    }
  } catch (err) {
    console.error('ensureSheetExists error:', err.message);
    throw err;
  }
}

async function getAllEmployees() {
  if (!isSheetsConfigured()) {
    console.log('[Sheets] No Google credentials — using local db.json');
    return getAllEmployeesLocal();
  }
  try {
    const sheets = await getSheetsClient();
    await ensureSheetExists(sheets);

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A:I`,
    });

    const rows = res.data.values || [];
    if (rows.length <= 1) return [];

    const header = rows[0];
    return rows.slice(1).map((row, idx) => {
      const emp = { _rowIndex: idx + 2 }; // 1-indexed, row 1 is header
      header.forEach((col, i) => {
        emp[col] = row[i] || '';
      });
      return emp;
    });
  } catch (err) {
    console.warn('[Sheets] Falling back to db.json:', err.message);
    return getAllEmployeesLocal();
  }
}

async function addEmployee(employee) {
  if (!isSheetsConfigured()) {
    return addEmployeeLocal(employee);
  }
  try {
    const sheets = await getSheetsClient();
    await ensureSheetExists(sheets);

    const row = COLUMNS.map((col) => employee[col] || '');
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A:I`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [row] },
    });
    // Also persist locally as backup
    addEmployeeLocal(employee);
  } catch (err) {
    console.warn('[Sheets] Google Sheets write failed, using db.json:', err.message);
    addEmployeeLocal(employee);
  }
}

async function updateEmployee(rowIndex, employee) {
  if (!isSheetsConfigured()) {
    return updateEmployeeLocal(rowIndex, employee);
  }
  try {
    const sheets = await getSheetsClient();
    const row = COLUMNS.map((col) => employee[col] || '');
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A${rowIndex}:I${rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [row] },
    });
  } catch (err) {
    console.warn('[Sheets] Google Sheets update failed, using db.json:', err.message);
    updateEmployeeLocal(rowIndex, employee);
  }
}

async function deleteEmployee(rowIndex) {
  if (!isSheetsConfigured()) {
    return deleteEmployeeLocal(rowIndex);
  }
  try {
    const sheets = await getSheetsClient();
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: await getSheetId(sheets),
                dimension: 'ROWS',
                startIndex: rowIndex - 1, // 0-indexed
                endIndex: rowIndex,
              },
            },
          },
        ],
      },
    });
  } catch (err) {
    console.warn('[Sheets] Google Sheets delete failed, using db.json:', err.message);
    deleteEmployeeLocal(rowIndex);
  }
}

async function getSheetId(sheets) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const sheet = meta.data.sheets.find((s) => s.properties.title === SHEET_NAME);
  return sheet ? sheet.properties.sheetId : 0;
}

function daysUntilExpiry(contractEnd) {
  if (!contractEnd) return null;
  const end = new Date(contractEnd);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return Math.round((end - now) / (1000 * 60 * 60 * 24));
}

module.exports = { getAllEmployees, addEmployee, updateEmployee, deleteEmployee, daysUntilExpiry };
