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

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
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
const FREEZE = has("--freeze");
const CHECK = has("--check-fixtures");
const FIX_PATH = opt("fixtures") || `${ROOT}tools/loop/fixtures/ok-series.json`;

const loadFixtures = () => {
  try {
    return JSON.parse(readFileSync(FIX_PATH, "utf8"));
  } catch {
    return {
      _note: "Auto-managed by ci-reward.mjs --freeze. Each series here must keep fetching ok with >= minPoints, or CI flags a regression. The corpus grows on success and never shrinks silently.",
      series: {},
    };
  }
};
const saveFixtures = (fx) => {
  mkdirSync(dirname(FIX_PATH), { recursive: true });
  writeFileSync(FIX_PATH, JSON.stringify(fx, null, 2) + "\n");
};
const tagPoints = (s) => Math.max(0, ...Object.values(s.tags).map((t) => t.points || 0));

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

// --- FREEZE: promote currently-ok series into the regression corpus ---------
// Run after a green CI confirms a series fetches real data. Adds new ok series
// (floor = observed point count); never moves an existing floor up, so a later
// revision dropping a provisional point won't trip a false regression.
if (FREEZE) {
  const fx = loadFixtures();
  let added = 0;
  for (const s of ids) {
    if (s.status !== "ok" || fx.series[s.id]) continue;
    fx.series[s.id] = { minPoints: tagPoints(s), frozenAt: new Date().toISOString().slice(0, 10) };
    console.log(`freeze + ${s.id} (minPoints=${tagPoints(s)})`);
    added++;
  }
  saveFixtures(fx);
  console.log(`fixtures: ${Object.keys(fx.series).length} frozen series (${added} new) → ${FIX_PATH}`);
  process.exit(0);
}

// --- CHECK: enforce the corpus. A frozen series that goes skip/absent, or ok
// with fewer points than its floor, is a REGRESSION → non-zero exit (gates CI).
if (CHECK) {
  const fx = loadFixtures();
  const frozen = Object.entries(fx.series);
  const regressions = [];
  for (const [id, meta] of frozen) {
    const s = series[id];
    if (!s || s.status !== "ok") regressions.push(`${id}: expected ok, got ${s ? s.status : "absent"}`);
    else if (tagPoints(s) < meta.minPoints) regressions.push(`${id}: ${tagPoints(s)} pts < frozen floor ${meta.minPoints}`);
  }
  if (SUMMARY) {
    process.stdout.write(
      `### Fixture regression check — ${frozen.length} frozen, ${regressions.length} regression(s)\n\n` +
        (regressions.length
          ? regressions.map((r) => `- ❌ ${r}`).join("\n") + "\n"
          : "All frozen series still fetch ok. ✅\n"),
    );
  } else {
    regressions.forEach((r) => console.error(`REGRESSION ${r}`));
    console.error(`fixtures check: ${frozen.length} frozen, ${regressions.length} regression(s)`);
  }
  process.exit(regressions.length ? 1 : 0);
}

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
