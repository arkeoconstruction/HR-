const { google } = require('googleapis');
const { getAuth } = require('../auth');
const { sendMailSMTP, isSMTPConfigured } = require('./mailer');

const REMINDER_EMAIL = process.env.RECIPIENT_EMAIL || 'ac@arkeoconstruction.com';
const GMAIL_FROM = process.env.GMAIL_FROM || 'ac@arkeoconstruction.com';

async function getGmailClient() {
  const auth = getAuth();
  return google.gmail({ version: 'v1', auth });
}

function buildEmailMessage({ to, from, subject, body }) {
  const messageParts = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    '',
    body,
  ];
  const message = messageParts.join('\n');
  return Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function getReminderSubjectAndBody(employee, daysLeft) {
  const { Name, Role, ContractEnd } = employee;
  const endDate = new Date(ContractEnd).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  let urgency = '';
  let color = '#2563eb';
  if (daysLeft <= 0) {
    urgency = 'EXPIRED TODAY';
    color = '#dc2626';
  } else if (daysLeft <= 7) {
    urgency = `${daysLeft} DAY${daysLeft === 1 ? '' : 'S'} LEFT - URGENT`;
    color = '#dc2626';
  } else if (daysLeft <= 14) {
    urgency = `${daysLeft} DAYS LEFT`;
    color = '#d97706';
  } else if (daysLeft <= 21) {
    urgency = `${daysLeft} DAYS LEFT`;
    color = '#d97706';
  } else {
    urgency = `${daysLeft} DAYS LEFT`;
    color = '#2563eb';
  }

  const subject =
    daysLeft <= 0
      ? `[CONTRACT EXPIRED] ${Name} - ${Role} Contract Has Expired`
      : `[CONTRACT REMINDER] ${Name} - ${Role} Contract Expires in ${daysLeft} Day${daysLeft === 1 ? '' : 's'}`;

  const body = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f9fafb;">
  <div style="background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <div style="background: ${color}; padding: 20px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 22px;">Contract Reminder</h1>
      <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0; font-size: 16px; font-weight: bold;">${urgency}</p>
    </div>
    <div style="padding: 30px;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; color: #6b7280; width: 40%;">Employee Name</td>
          <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">${Name}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Role</td>
          <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${Role || 'N/A'}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Contract End Date</td>
          <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: bold; color: ${color};">${endDate}</td>
        </tr>
        <tr>
          <td style="padding: 10px; color: #6b7280;">Days Remaining</td>
          <td style="padding: 10px; font-weight: bold; font-size: 18px; color: ${color};">${daysLeft <= 0 ? 'EXPIRED' : daysLeft}</td>
        </tr>
      </table>
      <div style="margin-top: 24px; padding: 16px; background: #f3f4f6; border-radius: 6px;">
        <p style="margin: 0; color: #374151;">
          ${
            daysLeft <= 0
              ? 'This contract has expired. Please take immediate action to renew or terminate the employment arrangement.'
              : `Please take action to renew this contract before it expires on <strong>${endDate}</strong>.`
          }
        </p>
      </div>
      <p style="margin-top: 24px; color: #9ca3af; font-size: 12px; text-align: center;">
        This is an automated reminder from RQL Construction HR System
      </p>
    </div>
  </div>
</body>
</html>`;

  return { subject, body };
}

async function sendReminderEmail(employee, daysLeft) {
  const { subject, body } = getReminderSubjectAndBody(employee, daysLeft);

  // Try Gmail API first, fall back to SMTP nodemailer
  try {
    const gmail = await getGmailClient();
    const raw = buildEmailMessage({
      to: REMINDER_EMAIL,
      from: GMAIL_FROM,
      subject,
      body,
    });
    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw },
    });
    console.log(`[Gmail] Sent reminder for ${employee.Name} (${daysLeft} days) — messageId: ${res.data.id}`);
    return res.data;
  } catch (gmailErr) {
    console.warn(`[Gmail] Gmail API failed: ${gmailErr.message}`);
    if (isSMTPConfigured()) {
      console.log('[Mailer] Falling back to SMTP (nodemailer)...');
      const info = await sendMailSMTP({
        to: REMINDER_EMAIL,
        from: GMAIL_FROM,
        subject,
        html: body,
      });
      console.log(`[Mailer] SMTP sent reminder for ${employee.Name} (${daysLeft} days)`);
      return info;
    }
    throw new Error(`Email delivery failed (Gmail: ${gmailErr.message}). Configure SMTP_* env vars to enable nodemailer fallback.`);
  }
}

module.exports = { sendReminderEmail, getReminderSubjectAndBody };
