// Emails a GitHub Actions failure (and the later recovery) to Matt Barge and Yash Chitneni only, once per transition,
// so a workflow that fails on every scheduled run sends one email, not one per run. Called from a workflow_run
// listener. Never prints credentials.
// Env: ALERT_SMTP_* and ALERT_EMAIL_FROM (see scripts/ci/alert-email.mjs), GH_TOKEN, GITHUB_REPOSITORY,
//      RUN_ID, WORKFLOW_ID, CONCLUSION, BRANCH, EVENT, WORKFLOW_NAME, RUN_URL.
import { pathToFileURL } from "node:url";
import { sendAlertEmail } from "./alert-email.mjs";

const notable = (conclusion) => conclusion === "failure" || conclusion === "timed_out" || conclusion === "startup_failure";

/** The transition email for this run, or null when nothing changed (still failing, or still passing). */
export function transitionMessage({ current, previous, workflow, repository, branch, event, runUrl }) {
  if (notable(current) && !notable(previous)) {
    return {
      subject: `[${repository}] ${workflow} started failing`,
      text: [
        `${workflow} (${repository}) started failing on ${branch} (${event}, conclusion: ${current}).`,
        `Run: ${runUrl}`,
        "",
        "Further failures stay quiet until it passes again; you will get one more email when it recovers.",
      ].join("\n"),
    };
  }
  if (current === "success" && notable(previous)) {
    return {
      subject: `[${repository}] ${workflow} is passing again`,
      text: [`${workflow} (${repository}) is passing again on ${branch}.`, `Run: ${runUrl}`].join("\n"),
    };
  }
  return null;
}

async function github(env, path) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
  });
  if (!response.ok) throw new Error(`GitHub GET ${path} failed (${response.status})`);
  return response.json();
}

async function previousConclusion(env) {
  // Most recent completed run of the same workflow on the same branch, older than this one, ignoring cancelled and skipped.
  const query = new URLSearchParams({ branch: env.BRANCH ?? "", status: "completed", per_page: "20" });
  const { workflow_runs: runs = [] } = await github(env, `/repos/${env.GITHUB_REPOSITORY}/actions/workflows/${env.WORKFLOW_ID}/runs?${query}`);
  const prior = runs.find((run) => String(run.id) !== String(env.RUN_ID) && Number(run.id) < Number(env.RUN_ID) && !["cancelled", "skipped"].includes(run.conclusion));
  return prior?.conclusion ?? null;
}

export async function main(env = process.env) {
  const current = env.CONCLUSION;
  const previous = await previousConclusion(env);
  const message = transitionMessage({ current, previous, workflow: env.WORKFLOW_NAME, repository: env.GITHUB_REPOSITORY, branch: env.BRANCH, event: env.EVENT, runUrl: env.RUN_URL });
  if (!message) {
    console.log(`No email: ${current} after ${previous ?? "no prior run"}.`);
    return;
  }
  try {
    const result = await sendAlertEmail(message, { env });
    if (result.sent) console.log(`Emailed ${current} transition to ${result.to.length} owner(s).`);
    else console.log(`::warning::Transition email not sent (${result.reason}).\n${message.subject}\n${message.text}`);
  } catch (error) {
    console.log(`::warning::Transition email failed (SMTP error: ${error.message}).\n${message.subject}\n${message.text}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
