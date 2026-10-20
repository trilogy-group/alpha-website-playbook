// Posts a GitHub Actions failure (and the later recovery) to Slack, once per transition, so a workflow that fails on
// every scheduled run does not post every run. Called from a workflow_run listener. Never prints the token.
// Env: SLACK_BOT_TOKEN, SLACK_CHANNEL, GH_TOKEN, GITHUB_REPOSITORY, RUN_ID, WORKFLOW_ID, CONCLUSION, BRANCH, EVENT,
//      WORKFLOW_NAME, RUN_URL.
const env = process.env;
const notable = (conclusion) => conclusion === "failure" || conclusion === "timed_out" || conclusion === "startup_failure";

async function github(path) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
  });
  if (!response.ok) throw new Error(`GitHub GET ${path} failed (${response.status})`);
  return response.json();
}

async function previousConclusion() {
  // Most recent completed run of the same workflow on the same branch, older than this one, ignoring cancelled and skipped.
  const query = new URLSearchParams({ branch: env.BRANCH ?? "", status: "completed", per_page: "20" });
  const { workflow_runs: runs = [] } = await github(`/repos/${env.GITHUB_REPOSITORY}/actions/workflows/${env.WORKFLOW_ID}/runs?${query}`);
  const prior = runs.find((run) => String(run.id) !== String(env.RUN_ID) && Number(run.id) < Number(env.RUN_ID) && !["cancelled", "skipped"].includes(run.conclusion));
  return prior?.conclusion ?? null;
}

const current = env.CONCLUSION;
const previous = await previousConclusion();
let text = null;
if (notable(current) && !notable(previous)) {
  text = `:red_circle: *${env.WORKFLOW_NAME}* (${env.GITHUB_REPOSITORY}) started failing on ${env.BRANCH} (${env.EVENT}). Run: ${env.RUN_URL}\nFurther failures stay quiet until it passes again.`;
} else if (current === "success" && notable(previous)) {
  text = `:large_green_circle: *${env.WORKFLOW_NAME}* (${env.GITHUB_REPOSITORY}) is passing again on ${env.BRANCH}. Run: ${env.RUN_URL}`;
}
if (!text) {
  console.log(`No Slack post: ${current} after ${previous ?? "no prior run"}.`);
} else if (!env.SLACK_BOT_TOKEN) {
  console.log("::warning::SLACK_BOT_TOKEN repository secret is missing, so this transition was not posted to Slack.");
  console.log(text);
} else {
  const response = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.SLACK_BOT_TOKEN}`, "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ channel: env.SLACK_CHANNEL, text, unfurl_links: false, unfurl_media: false }),
  });
  const result = await response.json();
  if (!result.ok) {
    console.log(`::warning::Slack post failed (${result.error}). If not_in_channel, invite the bot to the channel.`);
  } else {
    console.log(`Posted ${current} transition to ${env.SLACK_CHANNEL}.`);
  }
}
