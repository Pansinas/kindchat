import "server-only";

import { serverEnv } from "@/lib/server/env";

interface Email {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Sends transactional email through Resend's HTTP API (no SDK dependency).
 * Without RESEND_API_KEY, development prints the message to the server log;
 * production reports failure so callers can respond appropriately.
 */
export async function sendEmail(email: Email): Promise<boolean> {
  if (!serverEnv.resendApiKey) {
    if (!serverEnv.isProduction) {
      console.info(`\n[dev email] To: ${email.to}\nSubject: ${email.subject}\n\n${email.text}\n`);
      return true;
    }
    console.error("RESEND_API_KEY is not configured; email not sent");
    return false;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${serverEnv.resendApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: serverEnv.emailFrom, to: [email.to], subject: email.subject, text: email.text, html: email.html }),
  });
  if (!res.ok) console.error("email send failed", res.status, await res.text().catch(() => ""));
  return res.ok;
}

function layout(title: string, body: string, actionUrl: string, actionLabel: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f7f4ee;font-family:Inter,Segoe UI,Arial,sans-serif;color:#2b2a33">
<div style="max-width:480px;margin:40px auto;background:#fffdf9;border:1px solid #ebe5da;border-radius:16px;padding:32px">
<p style="font-size:13px;letter-spacing:.2em;color:#7c6fa6;margin:0 0 24px">PAIRVELLA</p>
<h1 style="font-size:20px;font-weight:600;margin:0 0 12px">${title}</h1>
<p style="font-size:15px;line-height:1.6;margin:0 0 24px">${body}</p>
<a href="${actionUrl}" style="display:inline-block;background:#2b2a33;color:#fffdf9;text-decoration:none;padding:12px 20px;border-radius:999px;font-size:14px">${actionLabel}</a>
<p style="font-size:12px;color:#8a8794;margin:24px 0 0">If you didn't request this, you can ignore this email.</p>
</div></body></html>`;
}

export function passwordResetEmail(to: string, url: string): Email {
  return {
    to,
    subject: "Reset your Pairvella password",
    text: `Someone asked to reset the password for your Pairvella account.\n\nReset it here (valid for 1 hour): ${url}\n\nIf you didn't request this, ignore this email.`,
    html: layout("Reset your password", "Someone asked to reset the password for your Pairvella account. This link is valid for one hour.", url, "Choose a new password"),
  };
}

export function verifyRecoveryEmail(to: string, url: string): Email {
  return {
    to,
    subject: "Confirm your Pairvella recovery email",
    text: `Confirm this address as the recovery email for your Pairvella account (valid for 24 hours): ${url}`,
    html: layout("Confirm your recovery email", "Confirm this address so you can recover your Pairvella account if you forget your password. The link is valid for 24 hours.", url, "Confirm email"),
  };
}
