// Owner alert email for workflow failure alerts (Matt Barge, 2026-10-20). Same mailer as superbuilders/aeo
// alpha-site-system/src/alert-email.mjs.
//
// Alerts go by email to Matt Barge and Yash Chitneni only, never to Slack and never to anyone else. Mail is sent over
// SMTP with credentials from repository secrets, so it never sends from a personal Gmail account. No dependencies:
// the failure listener runs from a sparse checkout without npm ci.
//
// Repository secrets (Settings > Secrets and variables > Actions):
//   ALERT_SMTP_HOST      SMTP server, for example smtp.sendgrid.net, smtp.postmarkapp.com or smtp.gmail.com
//   ALERT_SMTP_USER      SMTP login
//   ALERT_SMTP_PASSWORD  SMTP password, API key or app password
//   ALERT_SMTP_PORT      optional, default 465 (implicit TLS); 587 uses STARTTLS
//   ALERT_EMAIL_FROM     optional sender address, default ALERT_SMTP_USER
// Credentials are never logged. Plain-text SMTP without TLS is refused.
import net from "node:net";
import tls from "node:tls";
import { randomUUID } from "node:crypto";

/** The only recipients. Not configurable on purpose: alerts must not reach anyone else. */
export const ALERT_RECIPIENTS = Object.freeze(["matthew.barge@superbuilders.school", "yash.chitneni@superbuilders.school"]);
export const REQUIRED_SECRETS = Object.freeze(["ALERT_SMTP_HOST", "ALERT_SMTP_USER", "ALERT_SMTP_PASSWORD"]);

export function smtpConfigFromEnv(env = process.env) {
  const missing = REQUIRED_SECRETS.filter((name) => !String(env[name] ?? "").trim());
  const port = Number(env.ALERT_SMTP_PORT || 465);
  return {
    configured: missing.length === 0,
    missing,
    host: String(env.ALERT_SMTP_HOST ?? "").trim(),
    port,
    secure: port === 465,
    user: String(env.ALERT_SMTP_USER ?? "").trim(),
    password: String(env.ALERT_SMTP_PASSWORD ?? ""),
    from: String(env.ALERT_EMAIL_FROM || env.ALERT_SMTP_USER || "").trim(),
  };
}

function encodeHeader(value) {
  const text = String(value).replace(/[\r\n]+/g, " ");
  return /^[\x20-\x7e]*$/.test(text) ? text : `=?UTF-8?B?${Buffer.from(text, "utf8").toString("base64")}?=`;
}

function addressOnly(value) {
  const match = String(value).match(/<([^>]+)>/);
  return (match ? match[1] : String(value)).trim();
}

export function buildMessage({ from, to, subject, text, date = new Date(), messageId = `<${randomUUID()}@alpha-website-qc>` }) {
  const body = Buffer.from(String(text).replace(/\r?\n/g, "\r\n"), "utf8").toString("base64").replace(/.{1,76}/g, "$&\r\n");
  return [
    `From: ${encodeHeader(from)}`,
    `To: ${to.map(encodeHeader).join(", ")}`,
    `Subject: ${encodeHeader(subject)}`,
    `Date: ${date.toUTCString()}`,
    `Message-ID: ${messageId}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "Auto-Submitted: auto-generated",
    "",
    body,
  ].join("\r\n");
}

/** Line reader for SMTP replies; resolves with { code, text } once a final (code + space) line arrives. */
function replyReader(socket) {
  let buffer = "";
  let lines = [];
  let waiter = null;
  let failure = null;
  const pending = [];
  const flush = () => {
    while (waiter && pending.length) {
      const next = pending.shift();
      const resolve = waiter.resolve;
      waiter = null;
      resolve(next);
    }
    if (waiter && failure) {
      const reject = waiter.reject;
      waiter = null;
      reject(failure);
    }
  };
  const onData = (chunk) => {
    buffer += chunk.toString("utf8");
    let index;
    while ((index = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, index).replace(/\r$/, "");
      buffer = buffer.slice(index + 1);
      lines.push(line);
      if (/^\d{3} /.test(line) || /^\d{3}$/.test(line)) {
        pending.push({ code: Number(line.slice(0, 3)), text: lines.join("\n") });
        lines = [];
      }
    }
    flush();
  };
  const onError = (error) => { failure = error; flush(); };
  const onClose = () => { failure = failure ?? new Error("SMTP connection closed"); flush(); };
  const attach = (target) => {
    target.on("data", onData);
    target.on("error", onError);
    target.on("close", onClose);
  };
  const detach = (target) => {
    target.off("data", onData);
    target.off("error", onError);
    target.off("close", onClose);
  };
  attach(socket);
  return {
    next: () => new Promise((resolve, reject) => { waiter = { resolve, reject }; flush(); }),
    swap(from, to) { detach(from); buffer = ""; lines = []; failure = null; attach(to); },
  };
}

function connect({ host, port, secure, timeoutMs, tlsOptions }) {
  return new Promise((resolve, reject) => {
    const socket = secure
      ? tls.connect({ host, port, servername: host, ...tlsOptions })
      : net.connect({ host, port });
    const ready = secure ? "secureConnect" : "connect";
    socket.setTimeout(timeoutMs, () => socket.destroy(new Error(`SMTP timeout after ${timeoutMs} ms`)));
    socket.once(ready, () => resolve(socket));
    socket.once("error", reject);
  });
}

/**
 * Sends one plain-text message to ALERT_RECIPIENTS. `allowPlaintext` and `tlsOptions` exist for the local test
 * server only; production always uses TLS (port 465) or STARTTLS (any other port) before AUTH.
 */
export async function sendAlertEmail({ subject, text }, { env = process.env, timeoutMs = 20000, allowPlaintext = false, tlsOptions = {} } = {}) {
  const config = smtpConfigFromEnv(env);
  if (!config.configured) return { sent: false, reason: `missing repository secret(s): ${config.missing.join(", ")}` };
  const to = [...ALERT_RECIPIENTS];
  let socket = await connect({ host: config.host, port: config.port, secure: config.secure, timeoutMs, tlsOptions });
  const reader = replyReader(socket);
  const expect = async (codes, step) => {
    const reply = await reader.next();
    if (!codes.includes(reply.code)) throw new Error(`SMTP ${step} rejected (${reply.text.split("\n").at(-1).slice(0, 200)})`);
    return reply;
  };
  const send = (line) => socket.write(`${line}\r\n`);
  try {
    await expect([220], "greeting");
    send("EHLO alpha-website-qc");
    let ehlo = await expect([250], "EHLO");
    if (!config.secure) {
      if (/STARTTLS/i.test(ehlo.text)) {
        send("STARTTLS");
        await expect([220], "STARTTLS");
        const plain = socket;
        socket = await new Promise((resolve, reject) => {
          const upgraded = tls.connect({ socket: plain, servername: config.host, ...tlsOptions }, () => resolve(upgraded));
          upgraded.once("error", reject);
        });
        reader.swap(plain, socket);
        send("EHLO alpha-website-qc");
        ehlo = await expect([250], "EHLO after STARTTLS");
      } else if (!allowPlaintext) {
        throw new Error("SMTP server does not offer STARTTLS; refusing to send credentials without TLS (use port 465)");
      }
    }
    send(`AUTH PLAIN ${Buffer.from(`\u0000${config.user}\u0000${config.password}`, "utf8").toString("base64")}`);
    await expect([235], "AUTH");
    send(`MAIL FROM:<${addressOnly(config.from)}>`);
    await expect([250], "MAIL FROM");
    for (const recipient of to) {
      send(`RCPT TO:<${recipient}>`);
      await expect([250, 251], "RCPT TO");
    }
    send("DATA");
    await expect([354], "DATA");
    const message = buildMessage({ from: config.from, to, subject, text }).replace(/^\./gm, "..");
    socket.write(`${message}\r\n.\r\n`);
    await expect([250], "message");
    send("QUIT");
    return { sent: true, to };
  } finally {
    socket.end();
  }
}
