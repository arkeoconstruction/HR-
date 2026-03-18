/**
 * mailer.js — SMTP email via nodemailer (fallback when Gmail API is unavailable)
 * Configure SMTP_* environment variables to enable this transport.
 */
const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE } = process.env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    throw new Error(
      'SMTP not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS in .env'
    );
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT || '587', 10),
    secure: SMTP_SECURE === 'true', // true for port 465, false for 587
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  return transporter;
}

/**
 * Send an email via SMTP (nodemailer).
 * @param {{ to: string, from: string, subject: string, html: string }} opts
 */
async function sendMailSMTP({ to, from, subject, html }) {
  const transport = getTransporter();
  const info = await transport.sendMail({ from, to, subject, html });
  console.log(`[Mailer] SMTP message sent: ${info.messageId}`);
  return info;
}

/**
 * Returns true if SMTP is configured via env vars.
 */
function isSMTPConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

module.exports = { sendMailSMTP, isSMTPConfigured };
