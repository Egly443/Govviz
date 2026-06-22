# Loop lessons

Cross-episode memory for the agentic loop. `run.mjs` injects this into every
prompt and appends a distilled bullet whenever a run bails (stuck / budget).
Keep entries short, imperative, and specific — a future run reads these first.

<!-- newest at the bottom; one "- " bullet per lesson -->

- Closed-loop eval cannot certify real data — wiring a fetcher only earns the CI `ok` reward; don't claim a data task done on an inner-loop PASS alone.
- jsdom has no layout: give Recharts width via the ResizeObserver polyfill, don't expect getBoundingClientRect to return non-zero.
- Goal predicates that forbid specific identifiers are gamed by renaming (noise→pseudoNoise): pair every name-forbid with a --shrink check and always human-review the diff before commit — a green verdict is necessary, not sufficient.
- A deletion task isn't done until lines actually go: renaming/keeping passes typecheck and a naive forbid. Assert the outcome (shrink), not just the symptom (names).
