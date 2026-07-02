# Draft Submission: Public Sector Data Survey 2026

This is a draft Govviz response to the public-sector data survey question set:
which public sector datasets matter for AI, what they would be used for, and how
the public sector should make them available.

## Summary

The highest-value datasets for AI are not only neat cross-government catalogues.
They are the accountability-tail datasets people ask about when services fail:
NHS waits, sewage spills, bathing water, court backlogs, homelessness, asylum,
tax service performance, major projects, local-government finance, schools, and
benefits administration.

For AI use, these datasets need stable identifiers, tidy machine-readable
distributions, provenance, release metadata, validation ranges, licences,
contact routes, and clear access policies. They should preserve official trust
and disclosure controls while removing scraping, workbook-tab guessing, and
semantic ambiguity.

## Which Datasets Matter For AI?

Priorities:

- NHS referral-to-treatment waiting lists, A&E performance, delayed discharge,
  workforce vacancies, and capacity measures;
- storm overflow spill counts/duration, bathing-water quality, and environmental
  compliance measures;
- Crown Court outstanding caseload, offence-to-completion times, prison
  capacity, and prison safety;
- statutory homelessness, temporary accommodation, housing supply, and local
  authority finance pressure;
- asylum backlog, decision timeliness, accommodation cost, and caseworker
  capacity;
- HMRC service performance, call handling, compliance yield, and tax-gap
  measures;
- Government Major Projects Portfolio cost, schedule, benefits, and risk data;
- school attendance, attainment gap, teacher recruitment, retention, and high
  needs deficits;
- benefit processing times, PIP/UC backlogs, fraud and error, and work-coach
  caseload.

These are high public-interest series where agents will otherwise fall back to
secondary summaries, stale PDFs, scraped workbooks, or plausible but wrong
tables.

## What Would They Be Used For?

Responsible AI and agent workflows would use them to:

- answer citizen questions with provenance back to the official source;
- compare current service pressure with historical baselines and published
  targets;
- detect stale or inconsistent public claims;
- help journalists, MPs, analysts, charities, and local users find the right
  official measure quickly;
- monitor whether policy interventions are associated with service improvement;
- reduce avoidable Freedom of Information requests for already-published
  aggregate data;
- test whether public-service datasets meet a concrete AI-readiness standard.

Govviz's [conformance suite](../conformance/README.md) turns several of these
use cases into auditable cases rather than generic aspirations.

## How Should Government Make Them Available?

For each priority series, publish:

- a stable resolvable id;
- a metadata JSON record using a thin profile such as the
  [AI-ready series profile](../conformance/ai-ready-series-profile.md);
- tidy CSV with one observation per row;
- CSVW schema;
- DCAT/catalogue entry;
- clear OGL or other licence URI;
- provenance, methodology, and derivation;
- revision status and release calendar;
- validation range to catch wrong units, tables, and geographies;
- suppression code vocabulary where disclosure control applies;
- named contact or public feedback route;
- access class/policy for automated use.

This should be additive to existing GOV.UK and statistical publication
workflows. It should not require replacing official methodology, lowering
trust standards, or publishing restricted microdata.

## What Should Be Avoided?

- PDFs or HTML tables as the only canonical data route.
- Workbooks where the meaning of a value depends on tab position, merged cells,
  colours, or notes outside the table.
- Random file suffixes without stable latest pointers.
- Open data that requires browser-only interaction.
- Ambiguous labels such as `total`, `rate`, or `performance` without measure,
  geography, denominator, and unit.
- Silent estimates for next-release dates or missing values.
- AI-readiness self-assessments that cannot be tested by an external script.

## Concrete Ask

Select a short list of high-trust, low-machine-readability accountability-tail
series and make passing an external conformance harness a release-assurance
gate. Start with one series per major public-service area, then scale the
pattern across producer platforms.

The minimum viable route is described in the
[producer implementation guide](../producer-guide.md).

