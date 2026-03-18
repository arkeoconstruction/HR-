'use strict';
require('dotenv').config();

const express = require('express');
const path    = require('path');
const cron    = require('node-cron');

// ── Local DB (primary) ─────────────────────────────────────────────────────────
const db = require('./services/db');

// ── Google services (secondary / optional) ────────────────────────────────────
let calendar  = null;
let reminders = null;

try {
  calendar  = require('./services/calendar');
  reminders = require('./services/reminders');
} catch (e) {
  console.warn('[Server] Google services not loaded:', e.message);
}

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// ─── Helper: enrich employee with daysLeft ─────────────────────────────────────
function enrich(emp) {
  return { ...emp, daysLeft: db.daysUntilExpiry(emp.contractEnd) };
}

// ─── API Routes ────────────────────────────────────────────────────────────────

// GET all employees
app.get('/api/employees', (req, res) => {
  try {
    const employees = db.getAllEmployees().map(enrich);
    res.json({ success: true, data: employees });
  } catch (err) {
    console.error('[API] GET /employees:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET single employee
app.get('/api/employees/:id', (req, res) => {
  try {
    const emp = db.getEmployeeById(req.params.id);
    if (!emp) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: enrich(emp) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST add employee
app.post('/api/employees', async (req, res) => {
  try {
    const employee = req.body;
    if (!employee.name && !employee.Name) {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }

    const created = db.addEmployee(employee);

    // Optional: create Google Calendar event
    if (calendar && created.contractEnd) {
      calendar.createContractExpiryEvent({
        Name: created.name, Role: created.role,
        ContractEnd: created.contractEnd, Email: created.email,
      }).catch(e => console.warn('[API] Calendar event failed:', e.message));
    }

    res.json({ success: true, data: created });
  } catch (err) {
    console.error('[API] POST /employees:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT update employee
app.put('/api/employees/:id', async (req, res) => {
  try {
    const updated = db.updateEmployee(req.params.id, req.body);
    if (!updated) return res.status(404).json({ success: false, error: 'Employee not found' });

    // Optional: refresh Google Calendar event
    if (calendar && updated.contractEnd) {
      calendar.createContractExpiryEvent({
        Name: updated.name, Role: updated.role,
        ContractEnd: updated.contractEnd, Email: updated.email,
      }).catch(e => console.warn('[API] Calendar update failed:', e.message));
    }

    res.json({ success: true, data: enrich(updated) });
  } catch (err) {
    console.error('[API] PUT /employees:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE employee
app.delete('/api/employees/:id', async (req, res) => {
  try {
    const emp = db.getEmployeeById(req.params.id);
    if (!emp) return res.status(404).json({ success: false, error: 'Employee not found' });

    // Optional: remove Google Calendar event
    if (calendar && emp.contractEnd) {
      calendar.deleteContractEvent(emp.name, emp.contractEnd)
        .catch(e => console.warn('[API] Calendar delete failed:', e.message));
    }

    db.deleteEmployee(req.params.id);
    res.json({ success: true, message: 'Employee deleted' });
  } catch (err) {
    console.error('[API] DELETE /employees:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST manually trigger reminder emails
app.post('/api/reminders/run', async (req, res) => {
  try {
    const { sendReminderEmail } = require('./services/mailer');
    const REMINDER_DAYS = [60, 30, 21, 14, 7, 0];
    const employees = db.getAllEmployees();
    const results = [];

    for (const emp of employees) {
      if (!emp.contractEnd) continue;
      const days = db.daysUntilExpiry(emp.contractEnd);
      if (days === null) continue;
      if (REMINDER_DAYS.includes(days)) {
        try {
          await sendReminderEmail(emp, days);
          results.push({ employee: emp.name, days, status: 'ok' });
        } catch (e) {
          results.push({ employee: emp.name, days, status: 'error', error: e.message });
        }
      }
    }

    res.json({ success: true, result: { processed: employees.length, reminders: results } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST sync calendar events
app.post('/api/calendar/sync', async (req, res) => {
  if (!calendar || !reminders) {
    return res.json({ success: true, result: { synced: 0, note: 'Google Calendar not configured' } });
  }
  try {
    const result = await reminders.ensureAllCalendarEvents();
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET contracts expiring within 60 days (for /reminders page)
app.get('/api/reminders', (req, res) => {
  try {
    const THRESHOLDS = [60, 30, 21, 14, 7, 0];
    const employees  = db.getAllEmployees().map(enrich);
    const expiring   = employees
      .filter(e => e.daysLeft !== null && e.daysLeft <= 60)
      .sort((a, b) => a.daysLeft - b.daysLeft);

    const grouped = {};
    for (const t of THRESHOLDS) grouped[t] = [];
    for (const emp of expiring) {
      // Put employee in the tightest matching bucket
      const bucket = [...THRESHOLDS].reverse().find(t => emp.daysLeft >= t);
      if (bucket !== undefined) grouped[bucket].push(emp);
    }

    res.json({ success: true, data: expiring, grouped });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// ─── Page Routes (SPA — all served by index.html, JS handles routing) ─────────
const INDEX = path.join(__dirname, '..', 'public', 'index.html');
app.get('/',          (_req, res) => res.sendFile(INDEX));
app.get('/reminders', (_req, res) => res.sendFile(INDEX));
app.get('/add',       (_req, res) => res.sendFile(INDEX));
app.get('/edit/:id',  (_req, res) => res.sendFile(INDEX));

// ─── Daily Cron — 8:00 AM ─────────────────────────────────────────────────────
cron.schedule('0 8 * * *', async () => {
  console.log('[Cron] Running daily contract reminders…');
  try {
    const { sendReminderEmail } = require('./services/mailer');
    const REMINDER_DAYS = [60, 30, 21, 14, 7, 0];
    const employees = db.getAllEmployees();
    let sent = 0;
    for (const emp of employees) {
      if (!emp.contractEnd) continue;
      const days = db.daysUntilExpiry(emp.contractEnd);
      if (days !== null && REMINDER_DAYS.includes(days)) {
        await sendReminderEmail(emp, days).catch(e =>
          console.error(`[Cron] Email failed for ${emp.name}:`, e.message)
        );
        sent++;
      }
    }
    console.log(`[Cron] Done. ${sent} reminder(s) sent.`);
  } catch (err) {
    console.error('[Cron] Error:', err.message);
  }
}, { timezone: 'America/Toronto' });

// ─── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('\n  RQL Construction HR System');
  console.log(`  http://localhost:${PORT}`);
  console.log('  Daily reminder cron: 8:00 AM (America/Toronto)\n');
});

module.exports = app;
