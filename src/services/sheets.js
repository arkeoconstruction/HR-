const { google } = require('googleapis');
const { getAuth } = require('../auth');

const SHEET_ID = process.env.SHEET_ID || '18HVul32CS-w1XYYXkBbGbbswdIzlnQs3NcQ05KkTm3E';
const SHEET_NAME = 'Employees';

// Column order: Name, Role, Type, Email, Phone, ContractStart, ContractEnd, MissedDays
const COLUMNS = ['Name', 'Role', 'Type', 'Email', 'Phone', 'ContractStart', 'ContractEnd', 'MissedDays'];

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
  const sheets = await getSheetsClient();
  await ensureSheetExists(sheets);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A:H`,
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
}

async function addEmployee(employee) {
  const sheets = await getSheetsClient();
  await ensureSheetExists(sheets);

  const row = COLUMNS.map((col) => employee[col] || '');
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A:H`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [row] },
  });
}

async function updateEmployee(rowIndex, employee) {
  const sheets = await getSheetsClient();
  const row = COLUMNS.map((col) => employee[col] || '');
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A${rowIndex}:H${rowIndex}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [row] },
  });
}

async function deleteEmployee(rowIndex) {
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
