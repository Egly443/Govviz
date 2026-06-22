#!/usr/bin/env node
// run.mjs — the agentic loop. Deliberately boring; the eval is where the work is.
//
//   state -> agent proposes edits -> eval -> feed verdict back -> repeat
//   until: pass | no progress for N steps | step budget exhausted.
//
// The "policy" is a black-box command (AGENT_CMD) that reads a prompt on stdin
// and edits the working tree in place — exactly how a coding agent behaves. The
// loop never parses the agent's prose for edits; it only trusts the verdict.
//
// Usage:
//   AGENT_CMD='claude -p --dangerously-skip-permissions' \
//   node tools/loop/run.mjs tools/loop/tasks/cleanup-dead-generators.md
//
//   node tools/loop/run.mjs <task> --dry-run     # just eval once, no agent
//   node tools/loop/run.mjs <task> --commit      # commit on PASS
//
// Env: AGENT_CMD, MAX_STEPS (default 6), STUCK_AFTER (default 2),
//      EVAL_ARGS (extra flags forwarded to eval.mjs, e.g. "--series=foo --allow=...")

import { spawnSync } from "node:child_process";
import { appendFileSync, readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const taskPath = process.argv[2];
const flags = new Set(process.argv.slice(3));
const DRY = flags.has("--dry-run");
const COMMIT = flags.has("--commit");
const MAX_STEPS = Number(process.env.MAX_STEPS || 6);
const STUCK_AFTER = Number(process.env.STUCK_AFTER || 2);
const EVAL_ARGS = (process.env.EVAL_ARGS || "").split(" ").filter(Boolean);
const AGENT_CMD = process.env.AGENT_CMD;

if (!taskPath) {
  console.error("usage: node tools/loop/run.mjs <task.md> [--dry-run|--commit]");
  process.exit(2);
}
const task = readFileSync(taskPath, "utf8");

mkdirSync(`${ROOT}tools/loop/runs`, { recursive: true });
const runId = new Date().toISOString().replace(/[:.]/g, "-");
const logFile = `${ROOT}tools/loop/runs/${runId}.jsonl`;
const log = (rec) => appendFileSync(logFile, JSON.stringify({ t: Date.now(), ...rec }) + "\n");

function runEval() {
  const r = spawnSync("node", ["tools/loop/eval.mjs", "--json", ...EVAL_ARGS], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  try {
    return JSON.parse(r.stdout);
  } catch {
    return { pass: false, signals: [{ name: "eval-crash", pass: false, detail: r.stderr || r.stdout }] };
  }
}

// signature of *why* it failed — used to detect grinding (same failure, new "fix")
function failSig(v) {
  const fails = v.signals.filter((s) => !s.pass && !s.skipped);
  return createHash("sha1")
    .update(fails.map((s) => `${s.name}:${(s.detail || "").slice(0, 200)}`).join("|"))
    .digest("hex")
    .slice(0, 12);
}

function buildPrompt(task, verdict, step) {
  const fails = verdict.signals.filter((s) => !s.pass && !s.skipped);
  return [
    `You are one step of an automated coding loop on the Govviz repo (step ${step}/${MAX_STEPS}).`,
    `Make the smallest edit that moves the verdict toward PASS. Edit files directly. Do not commit.`,
    ``,
    `## TASK`,
    task.trim(),
    ``,
    `## CURRENT VERDICT: ${verdict.pass ? "PASS" : "FAIL"}`,
    ...fails.map((s) => `### FAILING: ${s.name}\n${s.detail}`),
  ].join("\n");
}

function callAgent(prompt) {
  if (!AGENT_CMD) {
    console.error("\nNo AGENT_CMD set. Run with --dry-run, or set e.g.\n  AGENT_CMD='claude -p --dangerously-skip-permissions'\n");
    process.exit(2);
  }
  const r = spawnSync("bash", ["-lc", AGENT_CMD], {
    cwd: ROOT,
    input: prompt,
    encoding: "utf8",
    stdio: ["pipe", "inherit", "inherit"],
    maxBuffer: 64 * 1024 * 1024,
  });
  return r.status === 0;
}

// --- the loop --------------------------------------------------------------
console.log(`loop ${runId}  task=${taskPath}  log=${logFile}`);
log({ event: "start", task: taskPath, evalArgs: EVAL_ARGS, maxSteps: MAX_STEPS });

let verdict = runEval();
log({ event: "eval", step: 0, pass: verdict.pass, signals: verdict.signals });
console.log(`step 0  baseline: ${verdict.pass ? "PASS" : "FAIL"}  [${verdict.signals.filter((s) => !s.pass && !s.skipped).map((s) => s.name).join(",") || "—"}]`);

if (DRY || verdict.pass) {
  console.log(verdict.pass ? "already PASS — nothing to do." : "dry-run — stopping after baseline eval.");
  process.exit(verdict.pass ? 0 : 1);
}

const sigHistory = [];
for (let step = 1; step <= MAX_STEPS; step++) {
  const prompt = buildPrompt(task, verdict, step);
  log({ event: "agent_call", step });
  console.log(`\nstep ${step}  invoking agent…`);
  const agentOk = callAgent(prompt);
  log({ event: "agent_done", step, ok: agentOk });

  verdict = runEval();
  const sig = failSig(verdict);
  sigHistory.push(sig);
  log({ event: "eval", step, pass: verdict.pass, sig, signals: verdict.signals });
  console.log(`step ${step}  verdict: ${verdict.pass ? "PASS" : "FAIL"}  sig=${sig}  [${verdict.signals.filter((s) => !s.pass && !s.skipped).map((s) => s.name).join(",") || "—"}]`);

  if (verdict.pass) {
    console.log(`\n✓ PASS in ${step} step(s).`);
    if (COMMIT) {
      const title = (task.match(/^#\s*(.+)/m)?.[1] || "loop change").trim();
      spawnSync("git", ["add", "-A"], { cwd: ROOT });
      spawnSync("git", ["commit", "-m", title], { cwd: ROOT, stdio: "inherit" });
      log({ event: "commit", title });
    }
    log({ event: "end", result: "pass", steps: step });
    process.exit(0);
  }

  // stuck-detector: same failure signature STUCK_AFTER times running -> bail
  const recent = sigHistory.slice(-STUCK_AFTER);
  if (recent.length === STUCK_AFTER && recent.every((s) => s === recent[0])) {
    console.log(`\n✗ stuck: identical failure ${STUCK_AFTER}x (sig=${sig}). Bailing to human.`);
    log({ event: "end", result: "stuck", steps: step, sig });
    process.exit(1);
  }
}

console.log(`\n✗ budget exhausted (${MAX_STEPS} steps) without PASS.`);
log({ event: "end", result: "budget", steps: MAX_STEPS });
process.exit(1);
