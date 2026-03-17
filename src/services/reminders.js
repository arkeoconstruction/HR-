const { getAllEmployees, daysUntilExpiry } = require('./sheets');
const { sendReminderEmail } = require('./gmail');
const { createContractExpiryEvent } = require('./calendar');

const REMINDER_DAYS = [60, 30, 21, 14, 7, 0];

async function runDailyReminders() {
  console.log('[Reminders] Starting daily contract check —', new Date().toISOString());

  let employees;
  try {
    employees = await getAllEmployees();
  } catch (err) {
    console.error('[Reminders] Failed to fetch employees:', err.message);
    return { error: err.message };
  }

  const results = [];

  for (const employee of employees) {
    if (!employee.ContractEnd) continue;

    const days = daysUntilExpiry(employee.ContractEnd);
    if (days === null) continue;

    // Send email if today matches a reminder threshold
    if (REMINDER_DAYS.includes(days)) {
      try {
        await sendReminderEmail(employee, days);
        results.push({ employee: employee.Name, days, action: 'email_sent', status: 'ok' });
      } catch (err) {
        console.error(`[Reminders] Email failed for ${employee.Name}:`, err.message);
        results.push({ employee: employee.Name, days, action: 'email_sent', status: 'error', error: err.message });
      }
    }
  }

  console.log(`[Reminders] Completed. ${results.length} reminder(s) sent.`);
  return { processed: employees.length, reminders: results };
}

async function ensureAllCalendarEvents() {
  console.log('[Calendar] Syncing calendar events for all employees...');

  let employees;
  try {
    employees = await getAllEmployees();
  } catch (err) {
    console.error('[Calendar] Failed to fetch employees:', err.message);
    return { error: err.message };
  }

  const results = [];
  for (const employee of employees) {
    if (!employee.ContractEnd) continue;
    try {
      const event = await createContractExpiryEvent(employee);
      results.push({ employee: employee.Name, status: 'ok', eventId: event?.id });
    } catch (err) {
      console.error(`[Calendar] Failed for ${employee.Name}:`, err.message);
      results.push({ employee: employee.Name, status: 'error', error: err.message });
    }
  }

  return { synced: results.length, results };
}

module.exports = { runDailyReminders, ensureAllCalendarEvents, REMINDER_DAYS };
