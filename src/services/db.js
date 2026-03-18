/**
 * db.js — Local JSON file database (fallback when Google Sheets is unavailable)
 * Stores employees in db.json at the project root.
 */
const fs = require('fs');
const path = require('path');

const DB_PATH = path.resolve(process.env.DB_PATH || path.join(__dirname, '..', '..', 'db.json'));

function readDb() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      const initial = { employees: [] };
      fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2), 'utf8');
      return initial;
    }
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch (err) {
    console.error('[DB] Read error:', err.message);
    return { employees: [] };
  }
}

function writeDb(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function getAllEmployeesLocal() {
  const db = readDb();
  return db.employees.map((emp, idx) => ({ ...emp, _rowIndex: idx + 2 }));
}

function addEmployeeLocal(employee) {
  const db = readDb();
  const newEmp = { ...employee, id: generateId() };
  db.employees.push(newEmp);
  writeDb(db);
  return newEmp;
}

function updateEmployeeLocal(rowIndex, employee) {
  const db = readDb();
  const idx = rowIndex - 2; // _rowIndex starts at 2
  if (idx < 0 || idx >= db.employees.length) {
    throw new Error(`Employee at row ${rowIndex} not found`);
  }
  db.employees[idx] = { ...db.employees[idx], ...employee };
  writeDb(db);
  return db.employees[idx];
}

function deleteEmployeeLocal(rowIndex) {
  const db = readDb();
  const idx = rowIndex - 2;
  if (idx < 0 || idx >= db.employees.length) {
    throw new Error(`Employee at row ${rowIndex} not found`);
  }
  db.employees.splice(idx, 1);
  writeDb(db);
}

module.exports = {
  getAllEmployeesLocal,
  addEmployeeLocal,
  updateEmployeeLocal,
  deleteEmployeeLocal,
  DB_PATH,
};
