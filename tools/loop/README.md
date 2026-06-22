# Agentic loop (experiment)

A while-loop is trivial; the verifier is the whole game. So this is two files:

- **`eval.mjs`** — the verifier. Runs the closed-loop (sandbox, deterministic)
  checks in trust × speed order, short-circuiting on the first failure, and
  emits a structured verdict. **This is the real artifact — iterate here.**
- **`run.mjs`** — the loop. Calls a black-box agent command, feeds the verdict
  back, stops on PASS / no-progress / budget. Boring on purpose.

## The verifiers (eval.mjs)

Run in this order, cheapest + hardest-to-game first:

| signal | catches | when |
|---|---|---|
| `scope` | edits outside the `--allow` allowlist (guardrail) | instant |
| `manifest` | `--series=ID` lacks a `SOURCES` entry with numeric min/max | instant |
| `typecheck` | `tsc -b` errors | fast |
| `build` | vite build / router codegen / blog prerender | medium |
| `jsdom` | client-only crash; `#root` renders empty | medium |

**Not here:** "is this real data?" — that needs the internet and lives only in
CI (`data-check.yml`, read back via the GitHub tools). The inner loop can wire a
fetcher structurally but **cannot certify real data** — that reward is
unforgeable from the sandbox, which is the point.

```bash
node tools/loop/eval.mjs                                   # all closed-loop checks
node tools/loop/eval.mjs --series=hmt-psnd                 # + static manifest check
node tools/loop/eval.mjs --skip-build --json               # fast inner-loop signal
node tools/loop/eval.mjs --allow='src/**,scripts/build-data.mjs'   # scope guard
```

Exit 0 = PASS. `jsdom` auto-installs (`npm i --no-save jsdom`) on first run.

## The loop (run.mjs)

The agent is a command that reads a prompt on stdin and edits the working tree
in place (i.e. how a coding agent already works). The loop trusts only the
verdict, never the agent's prose.

```bash
# see the baseline verdict without running an agent:
node tools/loop/run.mjs tools/loop/tasks/cleanup-dead-generators.md --dry-run

# real run (example agent: Claude Code headless):
AGENT_CMD='claude -p --dangerously-skip-permissions' \
EVAL_ARGS='--allow=src/**,scripts/**' \
node tools/loop/run.mjs tools/loop/tasks/cleanup-dead-generators.md --commit
```

Env: `AGENT_CMD`, `MAX_STEPS` (6), `STUCK_AFTER` (2), `EVAL_ARGS`.
Every step is logged to `tools/loop/runs/<ts>.jsonl` (gitignored).

## Tasks

A task is a markdown file whose **`Done =`** clause is the reward predicate. If
you can't write that clause, the task isn't loop-ready — keep it human-driven.
Closed-loop-verifiable tasks (no internet) are the right first experiments; see
`tasks/`.

## Grade the grader

Periodically read diffs from runs the eval marked PASS. You're measuring the
false-positive rate — the true quality of the system. When a bug slips through,
don't just fix it: add the verifier that would have caught it. The eval ratchets.
