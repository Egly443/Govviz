# Remove dead illustrative generators from data.ts and departments.ts

A good first loop task: fully verifiable in-sandbox (no internet), crisp Done.

## Context

`SHOW_ILLUSTRATIVE` is permanently `false` and `realPoints(id, fallback)` /
`realLine(...)` discard their fallback argument, returning `[]` when CI hasn't
baked data. The illustrative generators (`annual`, `trajectory`, `annualSeries`,
`noise`) in `src/components/data.ts` and `src/components/departments.ts`, plus
the inert anchor-literal arrays passed as the 2nd arg to `realPoints`/`realLine`,
therefore produce nothing. They are dead code.

## Scope (stay inside)

- `src/components/data.ts`
- `src/components/departments.ts`

Run with `EVAL_ARGS='--allow=src/components/data.ts,src/components/departments.ts'`.

## Do

1. Drop the 2nd argument at every `realPoints(id, fallback)` / `realLine(id, lineId, fallback)`
   call site (change the signatures to single-arg).
2. Delete the now-unreferenced generators (`annual`, `trajectory`,
   `annualSeries`, `noise`) and the inert anchor-literal arrays.
3. Do not change any rendered behaviour — output is already `[]`/baked data.

## Done =

- `node tools/loop/eval.mjs` → PASS (scope + typecheck + build + jsdom all green), AND
- no remaining references to `annual(`, `trajectory(`, `annualSeries(`, `noise(`
  in the two files, AND
- `realPoints` / `realLine` are single-argument.
