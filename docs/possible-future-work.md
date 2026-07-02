# Possible Future Work

## Make Govviz Reusable As An Adoption Kit

Govviz is currently a working reference implementation: dashboard, open-data
artefacts, AI-ready series profile, conformance suite and optional agent adapter.
The next useful step would be to make the pattern easier for a government data
scientist or publishing team to reuse without understanding the whole app.

The aim would be to move from "nice working example" to "small adoption kit".

### One-Series Starter Kit

Create a minimal standalone example that publishes exactly one public aggregate
series:

```text
starter-kit/
  README.md
  series.json
  data.csv
  data.csv-metadata.json
  index.html
  validate.mjs
  .github/workflows/check.yml
```

It should show the cheapest route for a producer to publish:

- a stable series metadata record;
- tidy long-format CSV;
- CSVW metadata;
- a human landing page;
- a validation command;
- a static deploy path, such as GitHub Pages.

### Standalone Validator

Extract the reusable checks into a small validator that can be run outside the
Govviz dashboard:

```bash
npx govviz-check ./series.json ./data.csv
```

It should report:

- missing required metadata fields;
- malformed period or value columns;
- CSV rows outside `validRange`;
- missing provenance, licence or producer;
- CSVW mismatch;
- unclear suppression or status codes;
- missing stable `latest` links.

### GitHub Action

Publish the validator as a drop-in release gate:

```yaml
- uses: egly443/govviz-ai-ready-check@v1
  with:
    metadata: data/series.json
    csv: data/data.csv
```

This would let a producer add AI-readiness checks to an existing publication
workflow without adopting the whole Govviz stack.

### Producer Mode

Separate the guidance for:

- **downstream compiler mode**: Govviz has inferred or compiled a public series
  from existing official releases;
- **primary producer mode**: a department, agency or ALB owns the source and can
  assert the data steward, release calendar, methodology, revision policy,
  contact route, disclosure position and legal basis.

Primary producers need a slightly different checklist because they can assert
facts that Govviz deliberately does not invent.

### Before/After Case Studies

For each hard conformance case, add a short "before and after":

- current official publication shape;
- parser or interpretation burden;
- Govviz target shape;
- what code, risk or repeated support work disappears if the producer publishes
  the target shape upstream.

Good first cases:

- storm-overflow spill hours;
- NHS RTT waiting times;
- temporary accommodation;
- HMRC average speed of answer;
- house-price-to-earnings ratio.

### Producer Business Case

Add a short page aimed at senior analysts, heads of profession and data owners.
Frame the benefit in operational terms:

- fewer repeated data-user queries;
- fewer miscitations and wrong-tab errors;
- less bespoke parser maintenance across consumers;
- better accessibility alignment;
- easier reuse by journalists, Parliament, civic tech and AI agents;
- clearer provenance, licence, release and revision handling;
- a visible feedback loop for data-quality and machine-consumption issues.

### Maturity Checklist

Turn the Trust x Machine-readability model into a simple adoption ladder:

- Level 0: PDF, HTML or spreadsheet-only publication;
- Level 1: downloadable machine file exists;
- Level 2: tidy CSV exists;
- Level 3: tidy CSV plus basic metadata;
- Level 4: stable id, provenance, CSVW, licence, suppression and validation;
- Level 5: monitored, catalogued, automation-friendly and optionally
  agent-accessible, with a feedback loop.

This would give teams an incremental route rather than an all-or-nothing
standard.

### Desired Outcome

A government data scientist should be able to pick up the kit and, in one
afternoon, test whether one of their public aggregate series can be made
AI-readable:

```text
choose one series -> fill metadata -> add tidy CSV -> run validator -> publish
```

That would make Govviz useful as a practical adoption tool, not only as a
reference implementation.
