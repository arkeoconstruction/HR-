'use strict';
const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = path.resolve(process.env.DB_PATH || './db.json');

// ── Helpers ────────────────────────────────────────────────────────────────────
function readDb() {
  if (!fs.existsSync(DB_PATH)) {
    const initial = { employees: [] };
    fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2), 'utf8');
    return initial;
  }
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch {
    return { employees: [] };
  }
}

function writeDb(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function newId() {
  return crypto.randomBytes(8).toString('hex');
}

// ── CRUD ───────────────────────────────────────────────────────────────────────
function getAllEmployees() {
  return readDb().employees;
}

function getEmployeeById(id) {
  return readDb().employees.find(e => e.id === id) || null;
}

function addEmployee(fields) {
  const db = readDb();
  const employee = {
    id: newId(),
    name:          fields.name          || fields.Name          || '',
    role:          fields.role          || fields.Role          || '',
    type:          fields.type          || fields.Type          || '',
    email:         fields.email         || fields.Email         || '',
    phone:         fields.phone         || fields.Phone         || '',
    contractStart: fields.contractStart || fields.ContractStart || '',
    contractEnd:   fields.contractEnd   || fields.ContractEnd   || '',
    missedDays:    fields.missedDays    || fields.MissedDays    || '0',
    notes:         fields.notes         || fields.Notes         || '',
    createdAt: new Date().toISOString(),
  };
  db.employees.push(employee);
  writeDb(db);
  return employee;
}

function updateEmployee(id, fields) {
  const db  = readDb();
  const idx = db.employees.findIndex(e => e.id === id);
  if (idx === -1) return null;

  db.employees[idx] = {
    ...db.employees[idx],
    name:          fields.name          !== undefined ? fields.name          : db.employees[idx].name,
    role:          fields.role          !== undefined ? fields.role          : db.employees[idx].role,
    type:          fields.type          !== undefined ? fields.type          : db.employees[idx].type,
    email:         fields.email         !== undefined ? fields.email         : db.employees[idx].email,
    phone:         fields.phone         !== undefined ? fields.phone         : db.employees[idx].phone,
    contractStart: fields.contractStart !== undefined ? fields.contractStart : db.employees[idx].contractStart,
    contractEnd:   fields.contractEnd   !== undefined ? fields.contractEnd   : db.employees[idx].contractEnd,
    missedDays:    fields.missedDays    !== undefined ? fields.missedDays    : db.employees[idx].missedDays,
    notes:         fields.notes         !== undefined ? fields.notes         : db.employees[idx].notes,
    updatedAt: new Date().toISOString(),
  };
  writeDb(db);
  return db.employees[idx];
}

function deleteEmployee(id) {
  const db  = readDb();
  const idx = db.employees.findIndex(e => e.id === id);
  if (idx === -1) return false;
  db.employees.splice(idx, 1);
  writeDb(db);
  return true;
}

// ── Utility ────────────────────────────────────────────────────────────────────
function daysUntilExpiry(contractEnd) {
  if (!contractEnd) return null;
  const end = new Date(contractEnd);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return Math.round((end - now) / (1000 * 60 * 60 * 24));
}

module.exports = {
  getAllEmployees,
  getEmployeeById,
  addEmployee,
  updateEmployee,
  deleteEmployee,
  daysUntilExpiry,
};
