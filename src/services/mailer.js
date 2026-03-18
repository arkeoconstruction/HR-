'use strict';
/**
 * Nodemailer email service for RQL Construction HR
 * Supports Gmail app-password or any SMTP provider.
 */
const nodemailer = require('nodemailer');

const RECIPIENT_EMAIL = process.env.RECIPIENT_EMAIL || 'ac@arkeoconstruction.com';
const FROM_EMAIL      = process.env.GMAIL_FROM || process.env.SMTP_FROM || 'ac@arkeoconstruction.com';

// ── Transport factory ──────────────────────────────────────────────────────────
function createTransport() {
  // Gmail with App Password (most common)
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });
  }

  // Generic SMTP (e.g. SendGrid, Mailgun, Office 365)
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host:   process.env.SMTP_HOST,
      port:   parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  // Fallback: Ethereal test account (will log preview URL)
  return null;
}

// ── Email builder ─────────────────────────────────────────────────────────────
function buildReminderEmail(employee, daysLeft) {
  const { name, role, contractEnd } = employee;

  const endDate = contractEnd
    ? new Date(contractEnd).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'N/A';

  let urgency, color;
  if (daysLeft <= 0)       { urgency = 'EXPIRED TODAY';                                        color = '#dc2626'; }
  else if (daysLeft <= 7)  { urgency = `${daysLeft} DAY${daysLeft === 1 ? '' : 'S'} LEFT — URGENT`; color = '#dc2626'; }
  else if (daysLeft <= 21) { urgency = `${daysLeft} DAYS LEFT`;                                color = '#d97706'; }
  else                     { urgency = `${daysLeft} DAYS LEFT`;                                color = '#2563eb'; }

  const subject = daysLeft <= 0
    ? `[CONTRACT EXPIRED] ${name} — Contract Has Expired`
    : `[CONTRACT REMINDER] ${name} — ${role || 'Employee'} Contract Expires in ${daysLeft} Day${daysLeft === 1 ? '' : 's'}`;

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f9fafb;">
  <div style="background:white;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1);">
    <div style="background:${color};padding:20px;text-align:center;">
      <h1 style="color:white;margin:0;font-size:22px;">Contract Reminder — RQL Construction</h1>
      <p style="color:rgba(255,255,255,.9);margin:8px 0 0;font-size:16px;font-weight:bold;">${urgency}</p>
    </div>
    <div style="padding:30px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:10px;border-bottom:1px solid #e5e7eb;color:#6b7280;width:40%;">Employee</td>
          <td style="padding:10px;border-bottom:1px solid #e5e7eb;font-weight:bold;">${name}</td>
        </tr>
        <tr>
          <td style="padding:10px;border-bottom:1px solid #e5e7eb;color:#6b7280;">Role</td>
          <td style="padding:10px;border-bottom:1px solid #e5e7eb;">${role || 'N/A'}</td>
        </tr>
        <tr>
          <td style="padding:10px;border-bottom:1px solid #e5e7eb;color:#6b7280;">Contract End</td>
          <td style="padding:10px;border-bottom:1px solid #e5e7eb;font-weight:bold;color:${color};">${endDate}</td>
        </tr>
        <tr>
          <td style="padding:10px;color:#6b7280;">Days Remaining</td>
          <td style="padding:10px;font-weight:bold;font-size:18px;color:${color};">${daysLeft <= 0 ? 'EXPIRED' : daysLeft}</td>
        </tr>
      </table>
      <div style="margin-top:24px;padding:16px;background:#f3f4f6;border-radius:6px;">
        <p style="margin:0;color:#374151;">${
          daysLeft <= 0
            ? 'This contract has expired. Please take immediate action to renew or terminate.'
            : `Please take action to renew this contract before <strong>${endDate}</strong>.`
        }</p>
      </div>
      <p style="margin-top:24px;color:#9ca3af;font-size:12px;text-align:center;">
        Automated reminder from RQL Construction HR System
      </p>
    </div>
  </div>
</body>
</html>`;

  return { subject, html };
}

// ── Public API ─────────────────────────────────────────────────────────────────
async function sendReminderEmail(employee, daysLeft) {
  const transporter = createTransport();

  const { subject, html } = buildReminderEmail(employee, daysLeft);
  const mailOptions = {
    from: FROM_EMAIL,
    to:   RECIPIENT_EMAIL,
    subject,
    html,
  };

  if (!transporter) {
    // Create a test account on-the-fly so the app still works during development
    const testAccount = await nodemailer.createTestAccount();
    const testTransport = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      auth: { user: testAccount.user, pass: testAccount.pass },
    });
    const info = await testTransport.sendMail(mailOptions);
    console.log(`[Mailer] Test email for ${employee.name} (${daysLeft}d) — Preview: ${nodemailer.getTestMessageUrl(info)}`);
    return info;
  }

  const info = await transporter.sendMail(mailOptions);
  console.log(`[Mailer] Sent reminder for ${employee.name} (${daysLeft} days) — messageId: ${info.messageId}`);
  return info;
}

module.exports = { sendReminderEmail };
