import { SERIES_DATA } from "../generated/seriesData";

export type Point = { date: string; value: number };
export type Annotation = { date: string; label: string };

export type SeriesUnit =
  | "people"
  | "percent"
  | "years"
  | "gbp"
  | "days"
  | "beds"
  | "count"
  | "currency";

/** One line within a (possibly multi-line) chart. */
export type SeriesLine = {
  id: string;
  label: string;
  color?: string; // defaults assigned by index when omitted
  points: Point[];
};

export type TrendSeries = {
  id: string;
  title: string;
  subtitle?: string;
  unit: SeriesUnit;
  format: (v: number) => string;
  shortFormat: (v: number) => string;
  /** Optional y-axis tick formatter (overrides built-in). */
  yFormat?: (v: number) => string;
  /** Optional delta formatter (overrides built-in). Receives signed delta. */
  deltaFormat?: (v: number) => string;
  goodDirection: "up" | "down";
  target?: { value: number; label: string };
  source: string;
  sourceUrl: string;
  cadence: "monthly" | "quarterly" | "annual";
  /** Primary line (single-line charts) or a representative line for tiles. */
  points: Point[];
  /** When set (length > 1), the panel draws a multi-line comparison chart. */
  lines?: SeriesLine[];
  /**
   * Source series ids this series is computed from (e.g. a value-for-money
   * cost÷outcome ratio). When present, the "Official data" badge is shown iff
   * every source id has real baked data — a derived ratio is exactly as real
   * as its inputs, and never carries its own SERIES_DATA entry.
   */
  derivedFrom?: string[];
  annotations: Annotation[];
};

// Real fetched data (baked in CI) overrides the bundled illustrative series.
// With an empty SERIES_DATA (dev/offline), the fallback is used unchanged.
export function realPoints(id: string, fallback: Point[]): Point[] {
  const p = SERIES_DATA[id]?.points;
  return p && p.length ? p : fallback;
}
export function realLine(id: string, lineId: string, fallback: Point[]): Point[] {
  const l = SERIES_DATA[id]?.lines?.find((x) => x.id === lineId);
  return l && l.points.length ? l.points : fallback;
}
/** True when CI baked real fetched data for this series id. */
export function isRealSeries(id: string): boolean {
  const d = SERIES_DATA[id];
  return !!d && (!!d.points?.length || !!d.lines?.length);
}
/**
 * Real-data check for a whole series, aware of derived (cost÷outcome) series:
 * a ratio is real iff every input it is derived from is real.
 */
export function seriesIsReal(series: TrendSeries): boolean {
  return series.derivedFrom
    ? series.derivedFrom.every(isRealSeries)
    : isRealSeries(series.id);
}
/**
 * Whether fabricated/illustrative fallbacks may be shown. In production we only
 * ever display real, officially-sourced data — an unsourced series renders an
 * explicit "no source wired yet" placeholder instead of an invented trend, so
 * the dashboard can never pass off illustrative curves as official statistics.
 * In dev — and in any build where CI did not bake data at all (empty
 * SERIES_DATA, e.g. a local production build) — the illustrative fallbacks
 * remain (clearly badged) so the app stays workable. The honesty gate only
 * bites once real data is present, i.e. on the actual deployment.
 */
export const SHOW_ILLUSTRATIVE =
  !import.meta.env.PROD || Object.keys(SERIES_DATA).length === 0;
/** Fetch date (YYYY-MM-DD) of the baked data, if any. */
export function realAsOf(id: string): string | undefined {
  return SERIES_DATA[id]?.asOf;
}
/** Exact URL of the file/table CI actually fetched for this series, if known. */
export function realSourceUrl(id: string): string | undefined {
  return SERIES_DATA[id]?.srcUrl;
}

// International peer set for World Bank comparator charts. Keep in sync with
// WB_PEERS in scripts/build-data.mjs and src/components/departments.ts.
// Comparator lines carry an empty fallback so the chart shows the UK line
// alone until CI bakes per-country data (TrendPanel drops empty lines).
const WB_PEERS: { code: string; label: string }[] = [
  { code: "deu", label: "Germany" },
  { code: "fra", label: "France" },
];
export function wbLines(id: string, ukFallback: Point[]): SeriesLine[] {
  return [
    { id: "gbr", label: "UK", points: realLine(id, "gbr", ukFallback) },
    ...WB_PEERS.map((p) => ({
      id: p.code,
      label: p.label,
      points: realLine(id, p.code, [] as Point[]),
    })),
  ];
}

/**
 * Build a value-for-money ratio (cost ÷ outcome) from two existing series by
 * dividing their values year-by-year. The result is genuinely real wherever
 * both inputs are real — no fabricated points are introduced — and is flagged
 * via `derivedFrom`. Year alignment keeps it robust to differing start dates
 * and cadences (both are reduced to their common years).
 */
export function ratioSeries(o: {
  id: string;
  title: string;
  subtitle?: string;
  num: TrendSeries;
  den: TrendSeries;
  unit?: SeriesUnit;
  format: (v: number) => string;
  shortFormat?: (v: number) => string;
  yFormat?: (v: number) => string;
  deltaFormat?: (v: number) => string;
  goodDirection: "up" | "down";
  target?: { value: number; label: string };
  source: string;
  sourceUrl: string;
  scale?: number;
  round?: number;
  annotations?: Annotation[];
}): TrendSeries {
  const scale = o.scale ?? 1;
  const round = o.round ?? 2;
  const denByYear = new Map<string, number>();
  for (const p of o.den.points) denByYear.set(p.date.slice(0, 4), p.value);
  const points: Point[] = [];
  for (const p of o.num.points) {
    const d = denByYear.get(p.date.slice(0, 4));
    if (d == null || d === 0) continue;
    points.push({ date: p.date, value: +((p.value / d) * scale).toFixed(round) });
  }
  return {
    id: o.id,
    title: o.title,
    subtitle: o.subtitle,
    unit: o.unit ?? "currency",
    format: o.format,
    shortFormat: o.shortFormat ?? o.format,
    yFormat: o.yFormat ?? o.shortFormat ?? o.format,
    deltaFormat: o.deltaFormat,
    goodDirection: o.goodDirection,
    target: o.target,
    source: o.source,
    sourceUrl: o.sourceUrl,
    cadence: o.num.cadence,
    points,
    derivedFrom: [o.num.id, o.den.id],
    annotations: o.annotations ?? [],
  };
}

// Deterministic pseudo-noise
export function noise(seed: number) {
  let s = seed * 9301 + 49297;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280 - 0.5;
  };
}

function monthsBetween(startISO: string, endISO: string): string[] {
  const out: string[] = [];
  const d = new Date(startISO);
  const end = new Date(endISO);
  while (d <= end) {
    out.push(
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`,
    );
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return out;
}

export function trajectory(
  anchors: [string, number][],
  startISO: string,
  endISO: string,
  seed: number,
  noiseAmp: number,
  seasonalAmp = 0,
): Point[] {
  const months = monthsBetween(startISO, endISO);
  const rnd = noise(seed);
  const anchorTimes = anchors.map(([d, v]) => [new Date(d).getTime(), v] as const);

  return months.map((iso) => {
    const t = new Date(iso).getTime();
    let v = anchorTimes[0][1];
    for (let i = 0; i < anchorTimes.length - 1; i++) {
      const [t0, v0] = anchorTimes[i];
      const [t1, v1] = anchorTimes[i + 1];
      if (t >= t0 && t <= t1) {
        const k = (t - t0) / (t1 - t0);
        v = v0 + (v1 - v0) * k;
        break;
      }
      if (t > t1) v = v1;
    }
    const month = new Date(iso).getUTCMonth();
    const seasonal = Math.sin((month / 12) * Math.PI * 2) * seasonalAmp;
    return { date: iso, value: +(v + seasonal + rnd() * noiseAmp).toFixed(3) };
  });
}

// Build an annual series from yearly anchors (used by data-light fallbacks).
function annualSeries(
  anchors: [number, number][],
  start: number,
  end: number,
  seed: number,
  amp: number,
): Point[] {
  const rnd = noise(seed);
  const out: Point[] = [];
  for (let y = start; y <= end; y++) {
    let v = anchors[0][1];
    for (let i = 0; i < anchors.length - 1; i++) {
      const [y0, v0] = anchors[i];
      const [y1, v1] = anchors[i + 1];
      if (y >= y0 && y <= y1) {
        v = v0 + ((v1 - v0) * (y - y0)) / (y1 - y0);
        break;
      }
      if (y > y1) v = v1;
    }
    out.push({ date: `${y}-01-01`, value: +(v + rnd() * amp).toFixed(3) });
  }
  return out;
}

const fmtMillions = (v: number) => `${v.toFixed(2)}M`;
const fmtMillionsShort = (v: number) => `${v.toFixed(1)}M`;
const fmtPct = (v: number) => `${v.toFixed(1)}%`;
const fmtYears = (v: number) => `${v.toFixed(1)} yrs`;
const fmtGbp = (v: number) => `£${v.toFixed(2)}bn`;
const fmtGbpShort = (v: number) => `£${v.toFixed(1)}bn`;
const fmtBeds = (v: number) => `${(v / 1000).toFixed(1)}k beds/day`;
const fmtBedsShort = (v: number) => `${(v / 1000).toFixed(1)}k`;

// ============================================================
// Headline waiting list (kept as hero)
// ============================================================
export const waitingList: TrendSeries = {
  id: "waiting-list",
  title: "Elective care waiting list",
  subtitle: "Incomplete RTT pathways",
  unit: "people",
  format: fmtMillions,
  shortFormat: fmtMillionsShort,
  goodDirection: "down",
  source: "NHS England RTT, monthly",
  sourceUrl:
    "https://www.england.nhs.uk/statistics/statistical-work-areas/rtt-waiting-times/",
  cadence: "monthly",
  points: realPoints(
    "waiting-list",
    trajectory(
    [
      ["2007-08-01", 4.20],
      ["2012-01-01", 2.50],
      ["2015-01-01", 3.30],
      ["2019-01-01", 4.43],
      ["2020-03-01", 4.24],
      ["2020-08-01", 4.05],
      ["2022-01-01", 6.07],
      ["2023-09-01", 7.77],
      ["2024-04-01", 7.62],
      ["2025-01-01", 7.49],
      ["2026-04-01", 7.42],
    ],
    "2007-08-01",
    "2026-04-01",
    11,
    0.04,
    0.03,
  )),
  annotations: [
    { date: "2010-05-01", label: "Austerity" },
    { date: "2020-03-01", label: "Covid-19" },
    { date: "2023-03-01", label: "Industrial action" },
  ],
};

// ============================================================
// Core DHSC competence metrics (per executive summary)
// ============================================================

// 18-week elective treatment target compliance — statutory 92% standard
export const rtt18Week: TrendSeries = {
  id: "rtt-18-week",
  title: "18-week treatment target compliance",
  subtitle: "% of incomplete pathways under 18 weeks",
  unit: "percent",
  format: fmtPct,
  shortFormat: fmtPct,
  goodDirection: "up",
  target: { value: 92, label: "92% standard" },
  source: "NHS England RTT, monthly",
  sourceUrl:
    "https://www.england.nhs.uk/statistics/statistical-work-areas/rtt-waiting-times/",
  cadence: "monthly",
  points: realPoints(
    "rtt-18-week",
    trajectory(
    [
      ["2008-04-01", 84.0],
      ["2012-01-01", 93.8],
      ["2014-06-01", 93.1],
      ["2016-12-01", 90.3],
      ["2019-06-01", 86.4],
      ["2020-02-01", 83.0],
      ["2021-06-01", 67.0],
      ["2023-06-01", 58.7],
      ["2024-06-01", 59.5],
      ["2026-04-01", 61.4],
    ],
    "2008-04-01",
    "2026-04-01",
    17,
    0.6,
    0.5,
  )),
  annotations: [
    { date: "2016-01-01", label: "Standard last met" },
    { date: "2020-03-01", label: "Covid-19" },
  ],
};

// Hospital discharge / social-care bottleneck — beds/day occupied by
// patients medically fit to leave hospital
export const dischargeDelays: TrendSeries = {
  id: "discharge-delays",
  title: "Hospital discharge bottleneck",
  subtitle: "Beds/day occupied by patients medically fit for discharge",
  unit: "beds",
  format: fmtBeds,
  shortFormat: fmtBedsShort,
  goodDirection: "down",
  source: "NHS England discharge delays, daily SitRep",
  sourceUrl:
    "https://www.england.nhs.uk/statistics/statistical-work-areas/discharge-delays-acute-data/",
  cadence: "monthly",
  points: realPoints(
    "discharge-delays",
    trajectory(
    [
      ["2011-01-01", 4200],
      ["2014-06-01", 4900],
      ["2016-12-01", 6400],
      ["2018-06-01", 5100],
      ["2020-02-01", 4700],
      ["2020-06-01", 2500],
      ["2022-06-01", 12800],
      ["2023-04-01", 13900],
      ["2024-06-01", 13200],
      ["2026-04-01", 12100],
    ],
    "2011-01-01",
    "2026-04-01",
    29,
    320,
    420,
  )),
  annotations: [
    { date: "2017-03-01", label: "Social-care funding crisis" },
    { date: "2020-03-01", label: "Covid-19" },
    { date: "2022-09-01", label: "Discharge fund" },
  ],
};

// NHS temporary agency spend, rolling 12-month £bn
export const agencySpend: TrendSeries = {
  id: "agency-spend",
  title: "NHS temporary agency staff spend",
  subtitle: "Rolling 12-month, £ billion",
  unit: "gbp",
  format: fmtGbp,
  shortFormat: fmtGbpShort,
  goodDirection: "down",
  target: { value: 2.4, label: "NHSE cap ambition" },
  source: "NHS England board papers / NAO",
  sourceUrl:
    "https://www.nao.org.uk/reports/nhs-financial-management-and-sustainability/",
  cadence: "monthly",
  points: realPoints(
    "agency-spend",
    trajectory(
      [
        ["2013-04-01", 2.10],
        ["2015-09-01", 3.65],
        ["2018-03-01", 2.42],
        ["2020-03-01", 2.55],
        ["2022-09-01", 3.40],
        ["2023-09-01", 4.62],
        ["2024-09-01", 3.55],
        ["2026-04-01", 2.95],
      ],
      "2013-04-01",
      "2026-04-01",
      31,
      0.06,
      0.05,
    ),
  ),
  annotations: [
    { date: "2015-11-01", label: "Agency caps introduced" },
    { date: "2020-03-01", label: "Covid-19" },
    { date: "2023-03-01", label: "Strike cover surge" },
  ],
};

// Capital budget overruns — IPA Government Major Projects Portfolio,
// weighted cost variance across DHSC major projects
export const capitalOverrun: TrendSeries = {
  id: "capital-overrun",
  title: "Capital programme cost overrun",
  subtitle: "Weighted variance across DHSC major projects",
  unit: "percent",
  format: fmtPct,
  shortFormat: fmtPct,
  goodDirection: "down",
  target: { value: 0, label: "On budget" },
  source: "IPA Annual Report on Major Projects (GMPP)",
  sourceUrl:
    "https://www.gov.uk/government/collections/ipa-annual-report-on-major-projects",
  cadence: "annual",
  points: (() => {
    const out: Point[] = [];
    const anchors: [number, number][] = [
      [2012, 8.4],
      [2014, 11.2],
      [2016, 14.7],
      [2018, 19.1],
      [2020, 22.6],
      [2022, 27.4],
      [2024, 31.8],
      [2025, 28.9],
    ];
    const rnd = noise(41);
    for (let y = 2012; y <= 2025; y++) {
      let v = anchors[0][1];
      for (let i = 0; i < anchors.length - 1; i++) {
        const [y0, v0] = anchors[i];
        const [y1, v1] = anchors[i + 1];
        if (y >= y0 && y <= y1) {
          v = v0 + ((v1 - v0) * (y - y0)) / (y1 - y0);
          break;
        }
        if (y > y1) v = v1;
      }
      out.push({ date: `${y}-01-01`, value: +(v + rnd() * 0.8).toFixed(2) });
    }
    return out;
  })(),
  annotations: [
    { date: "2020-01-01", label: "New Hospital Programme" },
    { date: "2023-01-01", label: "RAAC remediation" },
  ],
};

// ============================================================
// Supporting context metrics
// ============================================================

export const aePerformance: TrendSeries = {
  id: "ae-performance",
  title: "A&E 4-hour standard",
  subtitle: "% of attendances admitted/discharged within 4 hours",
  unit: "percent",
  format: fmtPct,
  shortFormat: fmtPct,
  goodDirection: "up",
  target: { value: 95, label: "95% standard" },
  source: "NHS England A&E attendances, monthly",
  sourceUrl:
    "https://www.england.nhs.uk/statistics/statistical-work-areas/ae-waiting-times-and-activity/",
  cadence: "monthly",
  points: realPoints(
    "ae-performance",
    trajectory(
    [
      ["2004-04-01", 78.0],
      ["2005-01-01", 95.0],
      ["2010-06-01", 98.2],
      ["2013-01-01", 95.7],
      ["2015-06-01", 92.3],
      ["2019-12-01", 79.8],
      ["2020-05-01", 90.0],
      ["2022-12-01", 65.0],
      ["2024-01-01", 70.3],
      ["2025-06-01", 73.5],
      ["2026-04-01", 74.1],
    ],
    "2004-04-01",
    "2026-04-01",
    23,
    0.9,
    1.6,
  )),
  annotations: [
    { date: "2010-05-01", label: "Austerity" },
    { date: "2020-03-01", label: "Covid-19" },
    { date: "2023-12-01", label: "Winter crisis" },
  ],
};

// GP access — the single biggest day-to-day NHS gripe. GP Patient Survey
// (Ipsos) headline: % reporting a good overall experience of their practice.
export const gpAccess: TrendSeries = {
  id: "dhsc-gp-access",
  title: "GP practice experience",
  subtitle: "% reporting a good overall experience of their GP practice",
  unit: "percent",
  format: (v) => `${v.toFixed(1)}%`,
  shortFormat: (v) => `${v.toFixed(0)}%`,
  yFormat: (v) => `${v.toFixed(0)}%`,
  deltaFormat: (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}pp`,
  goodDirection: "up",
  source: "GP Patient Survey (Ipsos, NHS England)",
  sourceUrl: "https://www.gp-patient.co.uk/surveysandreports",
  cadence: "annual",
  points: realPoints(
    "dhsc-gp-access",
    annualSeries(
      [[2018, 84], [2020, 82], [2022, 72], [2023, 71], [2024, 74], [2025, 75]],
      2018,
      2025,
      39,
      0.2,
    ),
  ),
  annotations: [{ date: "2022-01-01", label: "Post-pandemic access" }],
};

// Category 2 ambulance response (emergencies like heart attack / stroke) — the
// "waited hours for an ambulance" grievance. 18-minute national standard.
export const ambulanceC2: TrendSeries = {
  id: "dhsc-ambulance-c2",
  title: "Ambulance response (Category 2)",
  subtitle: "Mean response to emergency calls (heart attack, stroke), minutes",
  unit: "count",
  format: (v) => `${v.toFixed(0)} min`,
  shortFormat: (v) => `${v.toFixed(0)}m`,
  yFormat: (v) => `${v.toFixed(0)}`,
  deltaFormat: (v) => `${v > 0 ? "+" : ""}${v.toFixed(0)}m`,
  goodDirection: "down",
  target: { value: 18, label: "18-min standard" },
  source: "NHS England Ambulance Quality Indicators (AmbSYS)",
  sourceUrl:
    "https://www.england.nhs.uk/statistics/statistical-work-areas/ambulance-quality-indicators/",
  cadence: "monthly",
  points: realPoints(
    "dhsc-ambulance-c2",
    trajectory(
      [
        ["2018-08-01", 19],
        ["2020-06-01", 21],
        ["2021-10-01", 40],
        ["2022-12-01", 92],
        ["2023-06-01", 38],
        ["2024-06-01", 36],
        ["2026-04-01", 31],
      ],
      "2018-08-01",
      "2026-04-01",
      37,
      1.5,
      1.0,
    ),
  ),
  annotations: [{ date: "2022-12-01", label: "Winter crisis" }],
};

export const turnover: TrendSeries = {
  id: "turnover",
  title: "Civil service & NHS workforce turnover",
  subtitle: "Rolling 12-month leaver rate",
  unit: "percent",
  format: fmtPct,
  shortFormat: fmtPct,
  goodDirection: "down",
  source: "NHS Digital workforce statistics",
  sourceUrl:
    "https://digital.nhs.uk/data-and-information/publications/statistical/nhs-workforce-statistics",
  cadence: "monthly",
  points: realPoints(
    "turnover",
    trajectory(
      [
        ["2011-01-01", 9.1],
        ["2014-01-01", 9.6],
        ["2017-06-01", 10.7],
        ["2019-06-01", 11.2],
        ["2020-09-01", 9.8],
        ["2022-09-01", 12.5],
        ["2024-01-01", 11.6],
        ["2026-04-01", 11.3],
      ],
      "2011-01-01",
      "2026-04-01",
      7,
      0.15,
      0.08,
    ),
  ),
  annotations: [
    { date: "2016-06-01", label: "Brexit vote" },
    { date: "2020-03-01", label: "Covid-19" },
    { date: "2023-03-01", label: "Pay disputes" },
  ],
};

// Two-line: nursing vs medical vacancy rate (illustrative until CI supplies the
// real NHS Vacancy Statistics by staff group).
const nursingVacancyPts = trajectory(
  [
    ["2012-01-01", 5.4],
    ["2015-06-01", 7.2],
    ["2018-06-01", 8.6],
    ["2021-09-01", 10.3],
    ["2023-06-01", 9.4],
    ["2026-04-01", 8.5],
  ],
  "2012-01-01",
  "2026-04-01",
  19,
  0.18,
  0.05,
);
const medicalVacancyPts = trajectory(
  [
    ["2012-01-01", 3.6],
    ["2016-06-01", 5.1],
    ["2019-06-01", 6.0],
    ["2022-06-01", 7.4],
    ["2024-06-01", 6.6],
    ["2026-04-01", 6.1],
  ],
  "2012-01-01",
  "2026-04-01",
  27,
  0.15,
  0.04,
);

export const vacancyRate: TrendSeries = {
  id: "vacancy",
  title: "Health & social care vacancy rate",
  subtitle: "Vacancies per 100 employee jobs, Human Health & Social Work sector (ONS JPB9); by-group breakdown indicative",
  unit: "percent",
  format: fmtPct,
  shortFormat: fmtPct,
  goodDirection: "down",
  source: "ONS Labour Market Statistics (JPB9)",
  sourceUrl:
    "https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/employmentandemployeetypes/timeseries/jpb9/lms",
  cadence: "monthly",
  points: realPoints("vacancy", nursingVacancyPts),
  // The by-group breakdown is illustrative only; once CI supplies the real
  // sector-wide series, show that single line rather than mixing real and
  // fabricated lines on one chart.
  lines: isRealSeries("vacancy")
    ? undefined
    : [
        { id: "nursing", label: "Nursing & midwifery", points: nursingVacancyPts },
        { id: "medical", label: "Medical", points: medicalVacancyPts },
      ],
  annotations: [{ date: "2020-03-01", label: "Covid-19" }],
};

// Doctors vs nurses per 1,000 people — real data from the World Bank (OECD/WHO).
const docsPer1000 = annualSeries(
  [[1990, 1.6], [2000, 2.0], [2010, 2.7], [2018, 2.9], [2022, 3.2]],
  1990,
  2022,
  301,
  0.01,
);
const nursesPer1000 = annualSeries(
  [[1990, 5.2], [2000, 8.1], [2010, 8.6], [2018, 8.2], [2022, 8.7]],
  1990,
  2022,
  302,
  0.02,
);
export const clinicalPer1000: TrendSeries = {
  id: "dhsc-clinical-per-1000",
  title: "Clinical workforce per 1,000 people",
  subtitle: "Doctors vs nurses, per 1,000 population",
  unit: "count",
  format: (v) => v.toFixed(1),
  shortFormat: (v) => v.toFixed(1),
  yFormat: (v) => v.toFixed(1),
  goodDirection: "up",
  source: "World Bank (OECD/WHO)",
  sourceUrl: "https://data.worldbank.org/indicator/SH.MED.PHYS.ZS?locations=GB",
  cadence: "annual",
  points: realLine("dhsc-clinical-per-1000", "doctors", docsPer1000),
  lines: [
    { id: "doctors", label: "Doctors", points: realLine("dhsc-clinical-per-1000", "doctors", docsPer1000) },
    { id: "nurses", label: "Nurses & midwives", points: realLine("dhsc-clinical-per-1000", "nurses", nursesPer1000) },
  ],
  annotations: [],
};

// Hospital beds per 1,000 — real data from the World Bank (OECD/WHO/Eurostat).
const bedsFallback = annualSeries(
  [[1960, 10.0], [1980, 7.5], [2000, 4.1], [2010, 2.9], [2020, 2.4], [2022, 2.4]],
  1960,
  2022,
  303,
  0.02,
);
export const hospitalBeds: TrendSeries = {
  id: "dhsc-beds-per-1000",
  title: "Hospital beds per 1,000 people",
  subtitle: "Total care beds per 1,000 population — UK vs Germany & France",
  unit: "count",
  format: (v) => v.toFixed(1),
  shortFormat: (v) => v.toFixed(1),
  yFormat: (v) => v.toFixed(1),
  goodDirection: "up",
  source: "World Bank (OECD/WHO/Eurostat)",
  sourceUrl: "https://data.worldbank.org/indicator/SH.MED.BEDS.ZS?locations=GB",
  cadence: "annual",
  points: realLine("dhsc-beds-per-1000", "gbr", bedsFallback),
  lines: wbLines("dhsc-beds-per-1000", bedsFallback),
  annotations: [],
};

const healthSpendGdpFallback = annualSeries(
  [[2000, 6.0], [2008, 8.4], [2012, 8.3], [2019, 10.0], [2021, 11.9], [2022, 11.3]],
  2000,
  2022,
  310,
  0.05,
);
export const healthSpendGdp: TrendSeries = {
  id: "dhsc-health-spend-gdp",
  title: "Health spending (% of GDP)",
  subtitle: "Total current health expenditure, % of GDP — UK vs Germany & France",
  unit: "percent",
  format: fmtPct,
  shortFormat: fmtPct,
  goodDirection: "up",
  source: "World Bank (WHO/OECD)",
  sourceUrl: "https://data.worldbank.org/indicator/SH.XPD.CHEX.GD.ZS?locations=GB",
  cadence: "annual",
  points: realLine("dhsc-health-spend-gdp", "gbr", healthSpendGdpFallback),
  lines: wbLines("dhsc-health-spend-gdp", healthSpendGdpFallback),
  annotations: [{ date: "2020-01-01", label: "Covid-19" }],
};

export const infantMortality: TrendSeries = {
  id: "dhsc-infant-mortality",
  title: "Infant mortality",
  subtitle: "Deaths under age 1 per 1,000 live births",
  unit: "count",
  format: (v) => v.toFixed(1),
  shortFormat: (v) => v.toFixed(1),
  yFormat: (v) => v.toFixed(1),
  goodDirection: "down",
  source: "World Bank (UN IGME)",
  sourceUrl: "https://data.worldbank.org/indicator/SP.DYN.IMRT.IN?locations=GB",
  cadence: "annual",
  points: realPoints(
    "dhsc-infant-mortality",
    annualSeries(
      [[1960, 22], [1980, 12], [2000, 5.6], [2010, 4.3], [2018, 3.7], [2022, 3.6]],
      1960,
      2022,
      311,
      0.05,
    ),
  ),
  annotations: [],
};

export const lifeExpectancy: TrendSeries = {
  id: "life-expectancy",
  title: "Life expectancy at birth",
  subtitle: "Years, England, both sexes",
  unit: "years",
  format: fmtYears,
  shortFormat: (v) => `${v.toFixed(1)}`,
  goodDirection: "up",
  source: "ONS national life tables",
  sourceUrl:
    "https://www.ons.gov.uk/peoplepopulationandcommunity/birthsdeathsandmarriages/lifeexpectancies",
  cadence: "annual",
  points: realPoints("life-expectancy", (() => {
    const out: Point[] = [];
    const anchors: [number, number][] = [
      [1981, 73.8],
      [1990, 75.7],
      [2000, 77.9],
      [2011, 80.6],
      [2019, 81.4],
      [2020, 80.4],
      [2022, 80.7],
      [2024, 81.0],
    ];
    for (let y = 1981; y <= 2024; y++) {
      let v = anchors[0][1];
      for (let i = 0; i < anchors.length - 1; i++) {
        const [y0, v0] = anchors[i];
        const [y1, v1] = anchors[i + 1];
        if (y >= y0 && y <= y1) {
          v = v0 + ((v1 - v0) * (y - y0)) / (y1 - y0);
          break;
        }
        if (y > y1) v = v1;
      }
      out.push({ date: `${y}-01-01`, value: +v.toFixed(2) });
    }
    return out;
  })()),
  annotations: [
    { date: "2011-01-01", label: "Stalling" },
    { date: "2020-01-01", label: "Covid-19" },
  ],
};

export const allSeries = [
  waitingList,
  rtt18Week,
  dischargeDelays,
  agencySpend,
  capitalOverrun,
  aePerformance,
  turnover,
  vacancyRate,
  lifeExpectancy,
];

// Helpers ----------------------------------------------------

export function latest(series: TrendSeries): Point {
  return series.points[series.points.length - 1];
}

export function deltaVs(series: TrendSeries, monthsBack: number) {
  const pts = series.points;
  const stepMonths = series.cadence === "annual" ? 12 : 1;
  const steps = Math.round(monthsBack / stepMonths);
  const idx = pts.length - 1 - steps;
  if (idx < 0) return null;
  const now = pts[pts.length - 1].value;
  const then = pts[idx].value;
  const diff = now - then;
  return { diff, then, abs: Math.abs(diff) };
}

/**
 * Data vintage + staleness for a series: how old its most recent point is, and
 * whether that exceeds a cadence-aware tolerance for publication lag. Lets the
 * UI surface the actual coverage end ("to 2021") and loudly flag series whose
 * source has gone quiet — the honest counterpart to the "Official data" badge.
 */
export function stalenessOf(series: TrendSeries): {
  latestDate: string;
  latestYear: number;
  monthsOld: number;
  stale: boolean;
} {
  const last = series.points[series.points.length - 1];
  const latestDate = last?.date ?? "";
  const t = latestDate ? new Date(latestDate).getTime() : NaN;
  const monthsOld = Number.isFinite(t)
    ? Math.max(0, Math.round((Date.now() - t) / (1000 * 60 * 60 * 24 * 30.44)))
    : Infinity;
  // Tolerances allow for normal publication lag; beyond them the source has
  // genuinely not refreshed and the chart is showing aged data.
  const limit =
    series.cadence === "monthly" ? 5 : series.cadence === "quarterly" ? 8 : 22;
  return {
    latestDate,
    latestYear: latestDate ? new Date(latestDate).getUTCFullYear() : NaN,
    monthsOld,
    stale: monthsOld > limit,
  };
}

export function minMax(series: TrendSeries) {
  let min = series.points[0];
  let max = series.points[0];
  for (const p of series.points) {
    if (p.value < min.value) min = p;
    if (p.value > max.value) max = p;
  }
  return { min, max };
}

export function slicePoints(points: Point[], years: number | "max"): Point[] {
  if (years === "max" || points.length === 0) return points;
  const last = new Date(points[points.length - 1].date);
  const cutoff = new Date(last);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - years);
  return points.filter((p) => new Date(p.date) >= cutoff);
}

export function sliceRange(series: TrendSeries, years: number | "max"): Point[] {
  return slicePoints(series.points, years);
}

export function formatMonth(iso: string, opts?: { year?: boolean }) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    month: "short",
    year: opts?.year === false ? undefined : "numeric",
  });
}

// Workforce small multiples
export type GroupSeries = {
  group: string;
  current: number;
  delta: string;
  points: Point[];
};

function groupSeries(
  group: string,
  current: number,
  anchors: [string, number][],
  seed: number,
): GroupSeries {
  const points = trajectory(anchors, "2014-01-01", "2026-04-01", seed, 0.18, 0.06);
  const first = points[0].value;
  const diff = current - first;
  return {
    group,
    current,
    delta: `${diff >= 0 ? "+" : ""}${diff.toFixed(1)}pp vs '14`,
    points,
  };
}

export const turnoverByGroup: GroupSeries[] = [
  groupSeries(
    "Nursing & midwifery",
    11.8,
    [
      ["2014-01-01", 9.4],
      ["2019-01-01", 11.5],
      ["2022-06-01", 12.4],
      ["2026-04-01", 11.8],
    ],
    3,
  ),
  groupSeries(
    "Medical & dental",
    7.9,
    [
      ["2014-01-01", 7.1],
      ["2020-01-01", 7.6],
      ["2026-04-01", 7.9],
    ],
    5,
  ),
  groupSeries(
    "Allied health professionals",
    10.2,
    [
      ["2014-01-01", 8.6],
      ["2020-01-01", 9.5],
      ["2023-01-01", 10.6],
      ["2026-04-01", 10.2],
    ],
    8,
  ),
  groupSeries(
    "Support to clinical staff",
    14.6,
    [
      ["2014-01-01", 11.9],
      ["2020-06-01", 13.2],
      ["2026-04-01", 14.6],
    ],
    13,
  ),
];
