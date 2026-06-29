import { Footer } from "./Footer";
import { TopNav } from "./TopNav";

/**
 * User-facing transparency page: documents how Govviz sources, validates and
 * presents its data — the methodology counterpart to the charts themselves.
 * Copy is kept accurate to the actual implementation (real-data-only pipeline,
 * range guards, staleness flags, per-number provenance).
 */
export function AboutPage() {
  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <TopNav />
      <main className="mx-auto max-w-3xl px-4 pb-20 pt-10 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          How Govviz is built
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Govviz is a static dashboard of long-run UK government performance
          indicators. Every chart is meant to be trustworthy by construction —
          here is exactly how, and where the limits are.
        </p>

        <div className="mt-10 space-y-8">
          <Section title="Real official data only — never fabricated">
            Every series shows real figures fetched from a reputable public
            source (ONS, the World Bank, gov.uk, NHS England, DfE and others).
            There is no illustrative or synthetic data anywhere in the
            production build: an indicator with no source wired yet renders an
            explicit <em>“no source yet”</em> placeholder rather than an invented
            trend line. If you see a chart, the numbers behind it are real.
          </Section>

          <Section title="Provenance you can check">
            Each chart links the exact file the build actually fetched, along
            with the date it was fetched. The source link is not a vague
            pointer to a department home page; it is the specific dataset, table
            or workbook the value came from, so any figure can be traced back to
            its origin.
          </Section>

          <Section title="Quality assurance: guard ranges">
            Every fetched series is validated against a hand-set plausible range
            (a minimum and maximum). A value that resolves but falls outside its
            expected range is rejected and the chart falls back rather than
            display a wrong-but-plausible number. Combined with the
            real-data-only rule, this means a mis-resolved source code can never
            silently surface incorrect data.
          </Section>

          <Section title="Honesty about freshness">
            Official statistics are published with a lag, and some sources go
            quiet. Each chart shows the vintage of its latest data point, and
            flags a series as <em>aged</em> when its source has not refreshed
            within the expected publication window for its cadence.
          </Section>

          <Section title="Definitions, coverage and caveats">
            Charts carry their geographic coverage (the common England-vs-UK
            distinction is made explicit), measurement basis (e.g. real terms
            vs cash terms), and how any derived or aggregated value is computed.
            Survey-based estimates and breaks in a series (such as a
            questionnaire redesign) are flagged with a caveat, because a
            survey estimate is not a full population count and figures either
            side of a methodology change are not directly comparable.
          </Section>

          <Section title="What the treemap’s channels mean">
            Each visual channel encodes exactly one thing. <em>Colour</em> scores
            each indicator against its published target where one exists (green =
            at or beyond the standard), otherwise against its own history (those
            are desaturated, because an own-range score isn’t comparable to a
            target-anchored one). Where the latest value carries a confidence
            interval that straddles the target, the tile shows a distinct
            “uncertain” state (≈) rather than a confident green or red — we won’t
            claim pass or fail inside the margin of error. A <em>trend glyph</em>{" "}
            (▲/▼ rising/falling, oriented to track the value; a smaller glyph for
            a slighter move) shows the recent direction, computed from a robust
            slope with a noise floor so a wobble doesn’t read as a trend. Every
            indicator in a department gets an <em>equal-size</em> tile, so it is a
            department’s whole block — not the individual tiles — whose area
            reflects its approximate Total Managed Expenditure (a hand-entered HM
            Treasury estimate, not a fetched series); the lead indicator is marked
            with an accent ring, not a bigger tile.
          </Section>

          <Section title="Accessibility">
            Every chart has a text summary for screen readers and a
            “View&nbsp;as&nbsp;table” alternative exposing the underlying data
            points. Rating indicators are not encoded by colour alone — they
            carry redundant letters (G / A / R) so the rating survives
            colour-blindness and greyscale.
          </Section>

          <Section title="Published as AI-ready open data — the essay, made real">
            Govviz doesn’t just consume official data; it re-publishes every
            series as a{" "}
            <a
              href={`${import.meta.env.BASE_URL}data/`}
              className="text-primary hover:underline"
            >
              reference implementation of its own AI-ready series profile
            </a>
            . Each indicator has a stable, resolvable id that returns JSON
            metadata — unit, coverage, periodicity, revision status, provenance,
            licence and a published validation range — pointing at long-format
            tidy CSV with a CSVW schema, all catalogued in DCAT and reachable
            over an open agent (MCP) interface. So an agent, or a fifteen-line
            script, can read any Govviz series without scraping or guessing — and
            a build-time conformance gate fails the release if any record
            doesn’t meet the profile. Govviz is a downstream compiler: every
            record names its primary producer and records the exact upstream
            file it was built from.
          </Section>

          <Section title="Built in the open">
            The data pipeline, the validation rules and this site are all open
            source. Data is fetched in continuous integration before each
            deploy; the code that does it — and the per-series source manifest —
            is public.{" "}
            <a
              href="https://github.com/Egly443/Govviz"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Read the source on GitHub
            </a>
            .
          </Section>
        </div>

        <Footer />
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{children}</p>
    </section>
  );
}
