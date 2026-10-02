import { Resend } from "resend";

let resendClient: Resend | null = null;

export function isResendConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
}

function getResendClient() {
  if (!resendClient) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("Resend is not configured. Set RESEND_API_KEY.");
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

function getFromAddress() {
  const from = process.env.RESEND_FROM_EMAIL;
  if (!from) throw new Error("Resend is not configured. Set RESEND_FROM_EMAIL.");
  return from;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

export async function sendWelcomeEmail(email: string) {
  const { error } = await getResendClient().emails.send({
    from: getFromAddress(),
    to: email,
    subject: "Welcome to Orbit",
    html: "<p>Welcome to Orbit. Your workspace is ready when you are.</p>",
  });
  if (error) throw new Error(`Welcome email could not be sent: ${error.message}`);
}

export async function sendInvitationEmail(email: string, workspaceName: string, role: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) throw new Error("NEXT_PUBLIC_APP_URL is required for invitation emails.");
  const safeWorkspaceName = escapeHtml(workspaceName);
  const safeRole = escapeHtml(role);
  const safeLoginUrl = escapeHtml(`${appUrl}/login`);
  const { error } = await getResendClient().emails.send({
    from: getFromAddress(),
    to: email,
    subject: `You have been invited to ${workspaceName}`,
    html: `<p>You have been invited to join <strong>${safeWorkspaceName}</strong> as a ${safeRole}.</p><p>Sign in at <a href="${safeLoginUrl}">${safeLoginUrl}</a> to accept the invitation.</p>`,
  });
  if (error) throw new Error(`Invitation email could not be sent: ${error.message}`);
}
