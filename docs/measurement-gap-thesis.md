# The measurement gap — government measures what it does, not what you get

**Status: parked developed note (2026-06-28). Raw material for a future essay
section / a second pillar of `docs/blog-open-data-for-ai.md`. Not yet written
up for publication — capture, don't polish.**

This note records a thesis that emerged from building Govviz: the pattern of
*which indicators were easy to find vs which were missing* is itself a diagnosis
of why government underserves ordinary people. Keep it; it may be the strongest
spine the blog has.

---

## The claim, in one line

Government measures **what it does** far better than **what citizens get** —
producer-side *outputs* (cases cleared, % within service standard, project
delivery-confidence RAGs) over consumer-side *outcomes* (could I get a GP
appointment, could I afford the bill, did my street get safer). The gap in the
*data* is the gap in the *accountability*, and they are the same gap.

## Why this is sharper than "performance vs customer experience"

The user's first framing — "the civil service measures performance, not citizen
customer experience" — is right but blunt. Three refinements make it both more
defensible and more damning:

1. **Producer-side vs consumer-side, not effort vs experience.** It isn't that
   the civil service doesn't try. It measures diligently — but from the
   *provider's* vantage (our throughput, our caseload, our project status)
   rather than the *user's* end-to-end journey (I waited four weeks, got bounced
   across three channels, gave up). The end-to-end journey is rarely owned by
   anyone, so it is rarely measured by anyone.

2. **"What gets measured gets managed" closes the loop.** If the boards a
   department lives by are throughput and RAG ratings, effort optimises those,
   and the *felt* outcome can rot while the board stays green. This is the
   **green-while-failing** gap. The HMRC phone-wait series is the cleanest
   example in Govviz: internally HMRC was *succeeding* at the output it
   controlled (shifting callers to digital channels); the experience it didn't
   foreground — 24 minutes on hold — was a different number.

3. **The data we *can* get is the operational exhaust.** Process metrics are a
   near-free byproduct of operations (a case-management system emits clearance
   times automatically). Experience/outcome metrics must be *deliberately and
   expensively collected* (surveys, external regulators). So government publishes
   outputs partly because they are cheap, not only because it values them more.

## Three interlocking causes (don't credit it all to measurement culture)

Even perfect experience metrics would not fix this on their own. Measurement is
necessary, not sufficient. The real machine has three gears:

- **Instrumentation asymmetry.** Outputs are free byproducts; outcomes cost
  money to observe. (This is the *same* "last-mile cost shapes what exists"
  thesis the existing essay is built on — see the symmetry below.)
- **Accountability geometry.** KPIs answer *upward* — to ministers, the spending
  review, Parliament — so they are built to be legible to the centre, not to the
  user. And the citizen's journey routinely crosses boundaries no single body
  owns: sewage is "Defra's" but delivered by water companies and policed by
  Ofwat/EA; child poverty spans DWP, DfE, MHCLG and the Treasury. The result is
  **accountability without control, and outcomes without an owner.**
- **Goodhart on both sides.** Make experience the target and you get gamed
  satisfaction scores and cream-skimming (serve the easy customers, hit the
  survey). So the fix is *not* "measure experience instead." It is "measure
  **outcomes the citizen feels, sourced from outside the delivering body, hard
  to game.**"

## Where the "customer" frame breaks

Citizens are not only customers. They are also funders (tax), subjects of
coercion (justice, immigration enforcement, prisons), and a collective. The
service-delivery frame ("could I get the thing I needed") is exactly right for
the transactional state — GP, passport, benefits, bins — and a category error
for defence or prisons. So the thesis is **strongest for the transactional
service parts of government** and should be applied with care elsewhere. Govviz
already does this implicitly: HMRC phone waits and temporary accommodation are
consumer-side; MoD delivery-confidence is, rightly, producer-side.

## Why this is the real argument for the dashboard

A citizen-facing, **outcome-weighted, externally-sourced** dashboard is quietly
subversive precisely because it **re-points the telescope** — from producer to
consumer, from "did we hit the target" to "did the thing actually get better" —
using numbers the department cannot quietly redefine. It does not change the
incentive. But it makes the green-while-failing gap *visible*, which is the
precondition for anyone fixing it.

## The symmetry with the existing essay (the payoff)

The current essay argues: the data that holds government to account at the
high-accountability *tail* (sewage, waiting lists, the bills) is the hardest to
get machine-readably. This note explains **why that is not a coincidence**: that
data is hard to read *because it is not the operational exhaust the system emits
for free* — it is the consumer-side outcome the producer-side machine was never
built to surface. **The measurement gap and the machine-readability gap are the
same gap, seen from two sides.** That is a stronger, more unifying spine than
"AI can't read the data" alone — it says *why* the un-readable data is also the
data that matters.

## Candidate essay structure (when we write it)

1. Open on a felt experience (HMRC hold music / no GP appointment / the water
   bill) and the dashboard that stays green through it.
2. Producer-side vs consumer-side; "what gets measured gets managed".
3. The three gears (instrumentation asymmetry, accountability geometry,
   Goodhart) — and why measurement alone won't fix it.
4. The "customer" frame's limits (the coercive state).
5. The dashboard as re-pointing the telescope; the design principle
   (consumer-side, externally-sourced, hard-to-game).
6. Land the symmetry: the measurement gap *is* the machine-readability gap.
   Tie to the AI-ready/open-data argument.

## The concrete test this generated

The gap is not abstract — it predicts *exactly which indicators Govviz is
missing*. The companion planning doc turns the thesis into a buildable backlog:
`docs/backlog-citizen-indicators.md`. If the thesis is right, the missing series
should cluster on the consumer side (primary-care access, the household bills,
child poverty, the crime people experience) — and they do.
