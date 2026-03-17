const { google } = require('googleapis');
const { getAuth } = require('../auth');

const CALENDAR_ID = process.env.CALENDAR_ID || 'primary';

async function getCalendarClient() {
  const auth = getAuth();
  return google.calendar({ version: 'v3', auth });
}

async function createContractExpiryEvent(employee) {
  const calendar = await getCalendarClient();
  const { Name, Role, ContractEnd, Email } = employee;

  if (!ContractEnd) {
    console.warn(`[Calendar] No ContractEnd for ${Name}, skipping event creation`);
    return null;
  }

  // Check for existing event to avoid duplicates
  const existing = await findExistingEvent(calendar, Name, ContractEnd);
  if (existing) {
    console.log(`[Calendar] Event already exists for ${Name} on ${ContractEnd}`);
    return existing;
  }

  const endDate = new Date(ContractEnd);
  const startDate = new Date(ContractEnd);

  // All-day event
  const startStr = startDate.toISOString().split('T')[0];
  const nextDay = new Date(endDate);
  nextDay.setDate(nextDay.getDate() + 1);
  const endStr = nextDay.toISOString().split('T')[0];

  const event = {
    summary: `Contract Expiry: ${Name}`,
    description: `Employee: ${Name}\nRole: ${Role || 'N/A'}\nContract End Date: ${ContractEnd}\n\nThis is an automated reminder from RQL Construction HR System.`,
    start: { date: startStr },
    end: { date: endStr },
    colorId: '11', // Red
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email', minutes: 60 * 24 * 60 },  // 60 days
        { method: 'email', minutes: 30 * 24 * 60 },  // 30 days
        { method: 'email', minutes: 21 * 24 * 60 },  // 21 days
        { method: 'email', minutes: 14 * 24 * 60 },  // 14 days
        { method: 'email', minutes: 7 * 24 * 60 },   // 7 days
        { method: 'popup', minutes: 7 * 24 * 60 },   // 7 days popup
        { method: 'popup', minutes: 24 * 60 },        // 1 day popup
      ],
    },
    attendees: Email ? [{ email: Email }] : [],
  };

  const res = await calendar.events.insert({
    calendarId: CALENDAR_ID,
    requestBody: event,
    sendUpdates: 'none',
  });

  console.log(`[Calendar] Created event for ${Name} on ${ContractEnd} — eventId: ${res.data.id}`);
  return res.data;
}

async function findExistingEvent(calendar, employeeName, contractEnd) {
  try {
    const date = new Date(contractEnd);
    const timeMin = new Date(date);
    timeMin.setDate(timeMin.getDate() - 1);
    const timeMax = new Date(date);
    timeMax.setDate(timeMax.getDate() + 2);

    const res = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      q: `Contract Expiry: ${employeeName}`,
      singleEvents: true,
    });

    return res.data.items && res.data.items.length > 0 ? res.data.items[0] : null;
  } catch {
    return null;
  }
}

async function deleteContractEvent(employeeName, contractEnd) {
  if (!contractEnd) return;
  const calendar = await getCalendarClient();
  const event = await findExistingEvent(calendar, employeeName, contractEnd);
  if (event) {
    await calendar.events.delete({ calendarId: CALENDAR_ID, eventId: event.id });
    console.log(`[Calendar] Deleted event for ${employeeName}`);
  }
}

module.exports = { createContractExpiryEvent, deleteContractEvent };
