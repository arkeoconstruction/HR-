'use strict';
const express = require('express');
const path    = require('path');
const fs      = require('fs');

const app     = express();
const PORT    = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'db.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── DB helpers ────────────────────────────────────────────────────────────────
function readDB() {
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const end = new Date(dateStr);
  end.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((end - now) / (1000 * 60 * 60 * 24));
}

// ── API ───────────────────────────────────────────────────────────────────────

// GET all employees
app.get('/api/employees', (req, res) => {
  try {
    const db = readDB();
    const data = db.employees.map(emp => ({ ...emp, daysLeft: daysUntil(emp.contractEnd) }));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST add employee
app.post('/api/employees', (req, res) => {
  try {
    const db  = readDB();
    const emp = { ...req.body, id: db.nextId++ };
    if (!emp.name) return res.status(400).json({ success: false, error: 'Name is required' });
    db.employees.push(emp);
    writeDB(db);
    res.json({ success: true, message: 'Employee added', data: emp });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT update employee
app.put('/api/employees/:id', (req, res) => {
  try {
    const db  = readDB();
    const id  = parseInt(req.params.id, 10);
    const idx = db.employees.findIndex(e => e.id === id);
    if (idx === -1) return res.status(404).json({ success: false, error: 'Employee not found' });
    db.employees[idx] = { ...db.employees[idx], ...req.body, id };
    writeDB(db);
    res.json({ success: true, message: 'Employee updated' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE employee
app.delete('/api/employees/:id', (req, res) => {
  try {
    const db  = readDB();
    const id  = parseInt(req.params.id, 10);
    const idx = db.employees.findIndex(e => e.id === id);
    if (idx === -1) return res.status(404).json({ success: false, error: 'Employee not found' });
    db.employees.splice(idx, 1);
    writeDB(db);
    res.json({ success: true, message: 'Employee deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET reminders — employees whose contract ends within 60 days (including expired today)
app.get('/api/reminders', (req, res) => {
  try {
    const db   = readDB();
    const data = db.employees
      .map(emp => ({ ...emp, daysLeft: daysUntil(emp.contractEnd) }))
      .filter(emp => emp.daysLeft !== null && emp.daysLeft >= 0 && emp.daysLeft <= 60)
      .sort((a, b) => a.daysLeft - b.daysLeft);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Serve frontend SPA for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\nRQL CRM running at http://localhost:${PORT}`);
  console.log(`Data file: ${DB_FILE}\n`);
});
