require('dotenv').config();
const express = require('express');
const path = require('path');
const cron = require('node-cron');

const { getAllEmployees, addEmployee, updateEmployee, deleteEmployee, daysUntilExpiry } = require('./services/sheets');
const { createContractExpiryEvent, deleteContractEvent } = require('./services/calendar');
const { runDailyReminders, ensureAllCalendarEvents } = require('./services/reminders');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// ─── API Routes ────────────────────────────────────────────────────────────────

// GET all employees with computed days-until-expiry
app.get('/api/employees', async (req, res) => {
  try {
    const employees = await getAllEmployees();
    const enriched = employees.map((emp) => ({
      ...emp,
      daysLeft: daysUntilExpiry(emp.ContractEnd),
    }));
    res.json({ success: true, data: enriched });
  } catch (err) {
    console.error('[API] GET /employees error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST add employee
app.post('/api/employees', async (req, res) => {
  try {
    const employee = req.body;
    if (!employee.Name) return res.status(400).json({ success: false, error: 'Name is required' });

    await addEmployee(employee);

    // Create calendar event if ContractEnd provided
    if (employee.ContractEnd) {
      try {
        await createContractExpiryEvent(employee);
      } catch (calErr) {
        console.warn('[API] Calendar event creation failed (non-fatal):', calErr.message);
      }
    }

    res.json({ success: true, message: 'Employee added successfully' });
  } catch (err) {
    console.error('[API] POST /employees error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT update employee
app.put('/api/employees/:rowIndex', async (req, res) => {
  try {
    const rowIndex = parseInt(req.params.rowIndex, 10);
    const employee = req.body;

    if (!rowIndex || rowIndex < 2) return res.status(400).json({ success: false, error: 'Invalid row index' });

    await updateEmployee(rowIndex, employee);

    // Recreate calendar event
    if (employee.ContractEnd) {
      try {
        await createContractExpiryEvent(employee);
      } catch (calErr) {
        console.warn('[API] Calendar event update failed (non-fatal):', calErr.message);
      }
    }

    res.json({ success: true, message: 'Employee updated successfully' });
  } catch (err) {
    console.error('[API] PUT /employees error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE employee
app.delete('/api/employees/:rowIndex', async (req, res) => {
  try {
    const rowIndex = parseInt(req.params.rowIndex, 10);
    const { name, contractEnd } = req.body;

    if (!rowIndex || rowIndex < 2) return res.status(400).json({ success: false, error: 'Invalid row index' });

    // Delete calendar event first
    if (name && contractEnd) {
      try {
        await deleteContractEvent(name, contractEnd);
      } catch (calErr) {
        console.warn('[API] Calendar event deletion failed (non-fatal):', calErr.message);
      }
    }

    await deleteEmployee(rowIndex);
    res.json({ success: true, message: 'Employee deleted successfully' });
  } catch (err) {
    console.error('[API] DELETE /employees error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST manually trigger reminders
app.post('/api/reminders/run', async (req, res) => {
  try {
    const result = await runDailyReminders();
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST sync all calendar events
app.post('/api/calendar/sync', async (req, res) => {
  try {
    const result = await ensureAllCalendarEvents();
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Serve frontend for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ─── Daily Cron Job ─────────────────────────────────────────────────────────
// Runs every day at 8:00 AM
cron.schedule('0 8 * * *', async () => {
  console.log('[Cron] Running daily contract reminders...');
  try {
    await runDailyReminders();
  } catch (err) {
    console.error('[Cron] Error:', err.message);
  }
}, {
  timezone: 'America/Toronto', // Adjust to your timezone
});

// ─── Start Server ────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🏗  RQL Construction HR System`);
  console.log(`   Server running at http://localhost:${PORT}`);
  console.log(`   Daily reminder cron: 8:00 AM\n`);
});

module.exports = app;
