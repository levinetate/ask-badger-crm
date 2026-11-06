import { Resend } from "resend";

export type Email = { to: string; subject: string; html: string; text: string };

/** Sends with Resend when RESEND_API_KEY is set; otherwise prints to the server log. */
export async function sendEmail(email: Email): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`\n[email] to=${email.to}\nsubject: ${email.subject}\n${email.text}\n`);
    return;
  }
  const resend = new Resend(key);
  const { error } = await resend.emails.send({
    from: process.env.EMAIL_FROM || "bookings@example.com",
    to: email.to,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });
  if (error) console.error("[email] send failed", error);
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function appUrl(path: string): string {
  return `${(process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "")}${path}`;
}
