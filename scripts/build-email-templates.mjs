// Generates AXON's Supabase Auth email templates (HTML + plain-text twin).
// Run: node scripts/build-email-templates.mjs  -> supabase/templates/*.html|*.txt
// Supabase sends the HTML; the .txt files are the plain-text fallback for a
// custom SMTP provider / send-email hook and the reference copy.
// Template variables are Supabase Go-template ({{ .ConfirmationURL }} etc.).
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "supabase", "templates");
mkdirSync(OUT, { recursive: true });

const C = {
  bg: "#050608", card: "#0B0D10", line: "#1C2026", text: "#F2F3F4",
  body: "#A3A9AE", muted: "#6F767C", gold: "#FFB733", goldSoft: "#FFD98A", ink: "#120C00",
};
const FONT = "-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const T = [
  {
    key: "confirmation", subject: "Confirm your AXON account",
    preheader: "One tap and your memory is ready.",
    title: "Confirm your email",
    lead: "You're one step from a memory that follows you into every AI. Confirm this address to finish creating your AXON account.",
    cta: "Confirm email", url: "{{ .ConfirmationURL }}",
    foot: "Didn't sign up for AXON? You can safely ignore this email. No account is created until the address is confirmed.",
  },
  {
    key: "magic_link", subject: "Your AXON sign-in link",
    preheader: "Tap to sign in. The link works once.",
    title: "Sign in to AXON",
    lead: "Tap the button to sign in. The link works once and expires shortly.",
    cta: "Sign in", url: "{{ .ConfirmationURL }}",
    foot: "Didn't ask to sign in? Ignore this email and nothing happens. Your account stays as it is.",
  },
  {
    key: "recovery", subject: "Reset your AXON password",
    preheader: "Choose a new password for your AXON account.",
    title: "Reset your password",
    lead: "Someone asked to reset the password for the AXON account linked to {{ .Email }}. Tap below to choose a new one.",
    cta: "Choose a new password", url: "{{ .ConfirmationURL }}",
    foot: "Didn't request this? Ignore this email. Your password stays the same until you set a new one.",
  },
  {
    key: "email_change", subject: "Confirm your new AXON email",
    preheader: "Confirm the switch to your new address.",
    title: "Confirm your new email",
    lead: "You asked to change your AXON email from {{ .Email }} to {{ .NewEmail }}. Confirm to make the switch.",
    cta: "Confirm new email", url: "{{ .ConfirmationURL }}",
    foot: "Didn't ask for this? Don't tap the button, and change your password from the app to be safe.",
  },
  {
    key: "invite", subject: "You're invited to AXON",
    preheader: "Accept your invite and set up your memory.",
    title: "You're invited",
    lead: "You've been invited to AXON: one memory you can carry into ChatGPT, Claude and the other AIs you use. Accept to set up your account.",
    cta: "Accept invite", url: "{{ .ConfirmationURL }}",
    foot: "Not expecting this? You can ignore it. Nothing is created unless you accept.",
  },
  {
    key: "reauthentication", subject: "Your AXON verification code",
    preheader: "Use this code to confirm it's you.",
    title: "Confirm it's you",
    lead: "Enter this code in AXON to continue. It works once and expires shortly.",
    code: "{{ .Token }}",
    foot: "Didn't try to change anything? Ignore this email and change your password from the app.",
  },
];

const esc = (s) => s; // copy is static and trusted; Go-template vars are escaped by Supabase

function html(t) {
  const action = t.code
    ? `<tr><td style="padding:8px 0 28px 0;">
        <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:32px;letter-spacing:10px;color:${C.goldSoft};background:#0F1216;border:1px solid ${C.line};border-radius:14px;padding:18px 0;text-align:center;">${t.code}</div>
      </td></tr>`
    : `<tr><td style="padding:8px 0 28px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td align="center" bgcolor="${C.gold}" style="border-radius:999px;background:${C.gold};background-image:linear-gradient(180deg,${C.goldSoft},${C.gold});">
            <a href="${t.url}" target="_blank" style="display:inline-block;padding:15px 30px;font-family:${FONT};font-size:16px;font-weight:600;color:${C.ink};text-decoration:none;border-radius:999px;letter-spacing:-0.01em;">${t.cta}</a>
          </td></tr></table>
      </td></tr>
      <tr><td style="padding:0 0 28px 0;font-family:${FONT};font-size:13px;line-height:20px;color:${C.muted};">
        Button not working? Paste this link into your browser:<br>
        <a href="${t.url}" target="_blank" style="color:${C.body};text-decoration:underline;word-break:break-all;">${t.url}</a>
      </td></tr>`;
  return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${esc(t.subject)}</title>
<style>
  :root { color-scheme: dark; supported-color-schemes: dark; }
  body { margin:0; padding:0; background:${C.bg}; }
  a { color:${C.goldSoft}; }
  @media (max-width:600px) { .ax-card { padding:32px 22px !important; border-radius:20px !important; } .ax-h1 { font-size:26px !important; line-height:32px !important; } }
</style>
</head>
<body style="margin:0;padding:0;background:${C.bg};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.bg};">${t.preheader}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.bg}" style="background:${C.bg};">
  <tr><td align="center" style="padding:40px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
      <tr><td style="padding:0 6px 22px 6px;font-family:${FONT};font-size:13px;font-weight:600;letter-spacing:6px;color:${C.text};">
        <span style="color:${C.gold};">&#9670;</span>&nbsp; AXON
      </td></tr>
      <tr><td class="ax-card" bgcolor="${C.card}" style="background:${C.card};background-image:linear-gradient(180deg,#101318,${C.card});border:1px solid ${C.line};border-radius:24px;padding:44px 40px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="padding:0 0 4px 0;"><div style="height:2px;width:44px;background:${C.gold};background-image:linear-gradient(90deg,${C.goldSoft},${C.gold});border-radius:2px;line-height:2px;font-size:0;">&nbsp;</div></td></tr>
          <tr><td class="ax-h1" style="padding:22px 0 12px 0;font-family:${FONT};font-size:30px;line-height:36px;font-weight:600;letter-spacing:-0.02em;color:${C.text};">${t.title}</td></tr>
          <tr><td style="padding:0 0 26px 0;font-family:${FONT};font-size:16px;line-height:25px;color:${C.body};">${t.lead}</td></tr>
          ${action}
          <tr><td style="border-top:1px solid ${C.line};padding:22px 0 0 0;font-family:${FONT};font-size:13px;line-height:20px;color:${C.muted};">${t.foot}</td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:24px 6px 0 6px;font-family:${FONT};font-size:12px;line-height:18px;color:${C.muted};">
        AXON &middot; One memory. Every AI.<br>
        <a href="https://axon-memory.com" target="_blank" style="color:${C.muted};text-decoration:underline;">axon-memory.com</a>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>
`;
}

function text(t) {
  const action = t.code ? `Your code: ${t.code}` : `${t.cta}:\n${t.url}`;
  return `AXON\n\n${t.title}\n\n${t.lead}\n\n${action}\n\n${t.foot}\n\n--\nAXON - One memory. Every AI.\nhttps://axon-memory.com\n`;
}

for (const t of T) {
  writeFileSync(join(OUT, `${t.key}.html`), html(t));
  writeFileSync(join(OUT, `${t.key}.txt`), text(t));
}
writeFileSync(join(OUT, "subjects.json"), JSON.stringify(Object.fromEntries(T.map((t) => [t.key, t.subject])), null, 2) + "\n");
console.log(`wrote ${T.length} templates to ${OUT}`);
