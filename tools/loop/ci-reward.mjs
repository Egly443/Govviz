#!/usr/bin/env node
// ci-reward.mjs — the OUTER (open-loop) reward for data tasks.
//
// The inner loop (eval.mjs) can only certify a fetcher is *structurally* wired:
// it compiles, the manifest has min/max, the app renders. It can NOT say "this
// is real data" — that needs the internet, which only CI has. So the ground-
// truth reward is the `ok`/`SKIP` line build-data.mjs prints per series after
// the min/max guard, and this script turns that log into a structured verdict.
//
// Crucially the agent cannot run or forge this from the sandbox: the reward is
// minted where the internet (and the guard) live. That's the unforgeable-reward
// design — keep it that way.
//
// Input: the "Fetch live data" log (stdin, or --log <file>). In CI that's the
// build-data.mjs stdout; locally it's whatever you paste from the CI job log.
//
// Usage:
//   node tools/loop/ci-reward.mjs --log fetch.log --json
//   node tools/loop/ci-reward.mjs --series=defra-bathing-water < fetch.log   # gate: exit 0 iff ok
//   node tools/loop/ci-reward.mjs --summary < fetch.log >> "$GITHUB_STEP_SUMMARY"

import { readFileSync } from "node:fs";

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const opt = (n) => {
  const h = argv.find((a) => a.startsWith(`--${n}=`));
  return h ? h.slice(n.length + 3) : undefined;
};
const logArg = argv.find((a) => a.startsWith("--log="))?.slice(6);
const SERIES = opt("series");
const JSON_OUT = has("--json");
const SUMMARY = has("--summary");

const text = logArg ? readFileSync(logArg, "utf8") : readFileSync(0, "utf8");

// Parse the two canonical lines build-data.mjs emits:
//   ok   <tag>  <n> pts  <start>..<end>  src=<url>
//   SKIP <tag>  <message>
// where <tag> is `id` or `id:line`.
const tags = {}; // tag -> { status, id, line, detail, points, span, src }
for (const raw of text.split("\n")) {
  const line = raw.replace(/\x1b\[[0-9;]*m/g, ""); // strip any colour
  let m;
  if ((m = line.match(/^ok\s+(\S+)\s+(\d+)\s+pts\s+(\S+\.\.\S+)?\s*(?:src=(\S+))?/))) {
    const [, tag, pts, span, src] = m;
    tags[tag] = { status: "ok", points: Number(pts), span: span ?? null, src: src ?? null };
  } else if ((m = line.match(/^SKIP\s+(\S+)\s+(.*)$/))) {
    const [, tag, detail] = m;
    tags[tag] = { status: "skip", detail: detail.trim() };
  }
}

// Fold tags (id:line) up to series ids. A series is `ok` only if it produced
// at least one ok tag and zero skip tags (a half-fetched multi-line series is
// not a win).
const series = {};
for (const [tag, info] of Object.entries(tags)) {
  const id = tag.includes(":") ? tag.split(":")[0] : tag;
  (series[id] ??= { id, tags: {}, ok: true, anyOk: false }).tags[tag] = info;
  if (info.status === "ok") series[id].anyOk = true;
  if (info.status === "skip") series[id].ok = false;
}
for (const s of Object.values(series)) s.status = s.anyOk && s.ok ? "ok" : "skip";

const ids = Object.values(series);
const okCount = ids.filter((s) => s.status === "ok").length;
const skipCount = ids.length - okCount;
const totals = { series: ids.length, ok: okCount, skip: skipCount };

if (SUMMARY) {
  const rows = ids
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((s) => {
      const detail =
        s.status === "ok"
          ? Object.values(s.tags).map((t) => `${t.points} pts ${t.span ?? ""}`).join("; ")
          : Object.entries(s.tags).filter(([, t]) => t.status === "skip").map(([, t]) => t.detail).join("; ");
      return `| ${s.status === "ok" ? "✅" : "⏭️"} | \`${s.id}\` | ${detail.slice(0, 90)} |`;
    });
  process.stdout.write(
    `### Data fetch reward — ${okCount} ok / ${skipCount} skip\n\n` +
      `| | series | detail |\n|--|--|--|\n${rows.join("\n")}\n`,
  );
} else if (JSON_OUT) {
  process.stdout.write(JSON.stringify({ totals, series }, null, 2) + "\n");
} else if (SERIES) {
  const s = series[SERIES];
  const status = s?.status ?? "absent";
  console.log(`${SERIES}: ${status}`);
  if (s) for (const [tag, t] of Object.entries(s.tags)) console.log(`  ${tag}: ${t.status} ${t.detail ?? `${t.points} pts ${t.span ?? ""}`}`);
} else {
  console.log(`${okCount} ok / ${skipCount} skip`);
  for (const s of ids.sort((a, b) => a.id.localeCompare(b.id))) console.log(`  ${s.status === "ok" ? "ok  " : "skip"} ${s.id}`);
}

// As a reward gate: when --series is given, exit 0 iff that series is ok.
if (SERIES) process.exit(series[SERIES]?.status === "ok" ? 0 : 1);
process.exit(0);
