import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { ALERT_RECIPIENTS, buildMessage, sendAlertEmail, smtpConfigFromEnv } from "../scripts/ci/alert-email.mjs";
import { transitionMessage } from "../scripts/ci/notify-workflow-failure.mjs";

function fakeSmtp({ starttls = false } = {}) {
  const transcript = [];
  const server = net.createServer((socket) => {
    let data = false;
    let buffer = "";
    socket.write("220 fake ESMTP\r\n");
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let index;
      while ((index = buffer.indexOf("\r\n")) !== -1) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        transcript.push(line);
        if (data) {
          if (line === ".") { data = false; socket.write("250 queued\r\n"); }
          continue;
        }
        if (line.startsWith("EHLO")) socket.write(`250-fake\r\n${starttls ? "250-STARTTLS\r\n" : ""}250 AUTH PLAIN\r\n`);
        else if (line.startsWith("AUTH PLAIN")) socket.write("235 ok\r\n");
        else if (line.startsWith("MAIL FROM") || line.startsWith("RCPT TO")) socket.write("250 ok\r\n");
        else if (line === "DATA") { data = true; socket.write("354 go\r\n"); }
        else if (line === "QUIT") { socket.write("221 bye\r\n"); socket.end(); }
      }
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, transcript, port: server.address().port })));
}

const env = (port) => ({ ALERT_SMTP_HOST: "127.0.0.1", ALERT_SMTP_PORT: String(port), ALERT_SMTP_USER: "alerts@example.com", ALERT_SMTP_PASSWORD: "not-a-real-secret" });

test("missing secrets are reported by name and nothing is sent", async () => {
  const result = await sendAlertEmail({ subject: "s", text: "t" }, { env: {} });
  assert.equal(result.sent, false);
  assert.match(result.reason, /ALERT_SMTP_HOST, ALERT_SMTP_USER, ALERT_SMTP_PASSWORD/);
  assert.equal(smtpConfigFromEnv({ ALERT_SMTP_PORT: "587" }).secure, false);
  assert.equal(smtpConfigFromEnv({}).secure, true);
});

test("sends one message to exactly Matt and Yash over SMTP", async () => {
  const { server, transcript, port } = await fakeSmtp();
  try {
    const result = await sendAlertEmail({ subject: "Alpha website QC: 1 new critical incident", text: "line one\n.dot line" }, { env: env(port), allowPlaintext: true });
    assert.equal(result.sent, true);
    assert.deepEqual(transcript.filter((l) => l.startsWith("RCPT TO")), ALERT_RECIPIENTS.map((r) => `RCPT TO:<${r}>`));
    assert.ok(transcript.includes("MAIL FROM:<alerts@example.com>"));
    assert.ok(transcript.includes("Subject: Alpha website QC: 1 new critical incident"));
    assert.ok(!transcript.some((l) => l.includes("not-a-real-secret")), "password is never sent in clear text lines");
  } finally {
    server.close();
  }
});

test("refuses to send credentials when the server offers no TLS", async () => {
  const { server, transcript, port } = await fakeSmtp();
  try {
    await assert.rejects(sendAlertEmail({ subject: "s", text: "t" }, { env: env(port), timeoutMs: 3000 }), /refusing to send credentials without TLS/);
    assert.ok(!transcript.some((l) => l.startsWith("AUTH")));
  } finally {
    server.close();
  }
});

test("message headers are ASCII-safe and the body is base64", () => {
  const message = buildMessage({ from: "a@b.c", to: ALERT_RECIPIENTS, subject: "Caf\u00e9", text: "hi", date: new Date(0), messageId: "<x@y>" });
  assert.ok(message.includes("Subject: =?UTF-8?B?"));
  assert.ok(message.includes(`To: ${ALERT_RECIPIENTS.join(", ")}`));
  assert.ok(message.includes("Content-Transfer-Encoding: base64"));
});

test("workflow alerts fire only on the failing and recovering transitions", () => {
  const base = { workflow: "Alpha Website Production Observer", repository: "superbuilders/aeo", branch: "main", event: "schedule", runUrl: "https://run" };
  assert.match(transitionMessage({ ...base, current: "failure", previous: "success" }).subject, /started failing$/);
  assert.equal(transitionMessage({ ...base, current: "failure", previous: "failure" }), null);
  assert.match(transitionMessage({ ...base, current: "success", previous: "timed_out" }).subject, /is passing again$/);
  assert.equal(transitionMessage({ ...base, current: "success", previous: "success" }), null);
  assert.equal(transitionMessage({ ...base, current: "success", previous: null }), null);
});
