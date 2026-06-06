import {
  agencySpend,
  aePerformance,
  capitalOverrun,
  dischargeDelays,
  lifeExpectancy,
  noise,
  rtt18Week,
  trajectory,
  turnover,
  vacancyRate,
  waitingList,
  type Point,
  type TrendSeries,
} from "./data";

export type Department = {
  code: string; // url slug
  name: string; // short, for tab
  fullName: string;
  blurb: string;
  rating: string;
  synthesis: string;
  themes: string[];
  hero: TrendSeries;
  core: TrendSeries[];
  supporting?: TrendSeries[];
};

// ----- formatting helpers -----
const fmtPct = (v: number) => `${v.toFixed(1)}%`;
const fmtPctSigned = (v: number) =>
  `${v > 0 ? "+" : ""}${v.toFixed(1)}pp`;
const fmtK = (v: number) => `${(v / 1000).toFixed(0)}k`;
const fmtKSigned = (v: number) =>
  `${v > 0 ? "+" : ""}${(v / 1000).toFixed(1)}k`;
const fmtThousands = (v: number) =>
  `${Math.round(v).toLocaleString("en-GB")}`;
const fmtThousandsSigned = (v: number) =>
  `${v > 0 ? "+" : ""}${Math.round(v).toLocaleString("en-GB")}`;
const fmtDays = (v: number) => `${Math.round(v)} days`;
const fmtDaysSigned = (v: number) =>
  `${v > 0 ? "+" : ""}${Math.round(v)}d`;
const fmtGbpBn = (v: number) => `£${v.toFixed(2)}bn`;
const fmtGbpBnSigned = (v: number) =>
  `${v > 0 ? "+" : ""}£${v.toFixed(2)}bn`;
const fmtGbpBnShort = (v: number) => `£${v.toFixed(1)}bn`;
const fmtGbpMday = (v: number) => `£${v.toFixed(1)}m/day`;
const fmtGbpMdaySigned = (v: number) =>
  `${v > 0 ? "+" : ""}£${v.toFixed(1)}m/d`;
const fmtMonths = (v: number) => `${v.toFixed(1)} months`;
const fmtMonthsSigned = (v: number) =>
  `${v > 0 ? "+" : ""}${v.toFixed(1)}mo`;
const fmtGbpKyr = (v: number) => `£${Math.round(v).toLocaleString("en-GB")}/yr`;
const fmtGbpKyrSigned = (v: number) =>
  `${v > 0 ? "+" : ""}£${Math.round(v).toLocaleString("en-GB")}`;
const fmtIndex = (v: number) => `${v.toFixed(0)} / 100`;
const fmtIndexSigned = (v: number) =>
  `${v > 0 ? "+" : ""}${v.toFixed(1)} pts`;

// Build an annual series from yearly anchors
function annual(
  anchors: [number, number][],
  startYear: number,
  endYear: number,
  seed: number,
  noiseAmp: number,
): Point[] {
  const rnd = noise(seed);
  const out: Point[] = [];
  for (let y = startYear; y <= endYear; y++) {
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
    out.push({ date: `${y}-01-01`, value: +(v + rnd() * noiseAmp).toFixed(2) });
  }
  return out;
}

// ============================================================
// DfE — Department for Education
// ============================================================
const dfeAttainmentGap: TrendSeries = {
  id: "dfe-attainment-gap",
  title: "Disadvantaged attainment gap",
  subtitle: "Months of progress behind peers, Key Stage 4",
  unit: "count",
  format: fmtMonths,
  shortFormat: (v) => `${v.toFixed(1)}mo`,
  yFormat: (v) => `${v.toFixed(1)}`,
  deltaFormat: fmtMonthsSigned,
  goodDirection: "down",
  source: "Education Policy Institute, annual",
  sourceUrl: "https://epi.org.uk/annual-report-2024/",
  cadence: "annual",
  points: annual(
    [
      [2011, 17.6],
      [2017, 18.1],
      [2019, 18.1],
      [2021, 18.8],
      [2023, 19.2],
      [2025, 19.5],
    ],
    2011,
    2025,
    81,
    0.05,
  ),
  annotations: [
    { date: "2020-01-01", label: "School closures" },
  ],
};

const dfeEctAttrition: TrendSeries = {
  id: "dfe-ect-attrition",
  title: "Early-career teacher attrition",
  subtitle: "% leaving state schools within 5 years of qualifying",
  unit: "percent",
  format: fmtPct,
  shortFormat: fmtPct,
  goodDirection: "down",
  source: "DfE School Workforce Census",
  sourceUrl:
    "https://explore-education-statistics.service.gov.uk/find-statistics/school-workforce-in-england",
  cadence: "annual",
  points: annual(
    [
      [2011, 23.5],
      [2015, 27.0],
      [2018, 31.4],
      [2022, 38.6],
      [2024, 37.2],
      [2025, 35.9],
    ],
    2011,
    2025,
    82,
    0.3,
  ),
  annotations: [
    { date: "2020-01-01", label: "Pandemic" },
  ],
};

const dfeDsgDeficit: TrendSeries = {
  id: "dfe-dsg-deficit",
  title: "Local Authority DSG deficits",
  subtitle: "Cumulative high-needs block deficit, £ billion",
  unit: "gbp",
  format: fmtGbpBn,
  shortFormat: fmtGbpBnShort,
  goodDirection: "down",
  source: "DfE / LGA dedicated schools grant deficit data",
  sourceUrl:
    "https://www.local.gov.uk/topics/children-and-young-people/dedicated-schools-grant-deficits",
  cadence: "annual",
  points: annual(
    [
      [2018, 0.4],
      [2020, 0.9],
      [2022, 1.7],
      [2024, 3.2],
      [2026, 4.6],
    ],
    2018,
    2026,
    83,
    0.04,
  ),
  annotations: [
    { date: "2023-01-01", label: "Statutory override extended" },
  ],
};

const dfeTeacherRecruitment: TrendSeries = {
  id: "dfe-teacher-recruitment",
  title: "Teacher training recruitment",
  subtitle: "Postgraduate ITT enrolments vs target",
  unit: "percent",
  format: fmtPct,
  shortFormat: fmtPct,
  goodDirection: "up",
  target: { value: 100, label: "100% of target" },
  source: "DfE Initial Teacher Training census",
  sourceUrl:
    "https://explore-education-statistics.service.gov.uk/find-statistics/initial-teacher-training-census",
  cadence: "annual",
  points: annual(
    [
      [2013, 95],
      [2017, 102],
      [2019, 85],
      [2021, 109],
      [2023, 71],
      [2024, 62],
      [2025, 68],
    ],
    2013,
    2025,
    84,
    1.2,
  ),
  annotations: [],
};

// ============================================================
// Home Office
// ============================================================
const hoAsylumBacklog: TrendSeries = {
  id: "ho-asylum-backlog",
  title: "Net asylum application backlog",
  subtitle: "Cases awaiting initial decision",
  unit: "count",
  format: fmtThousands,
  shortFormat: fmtK,
  yFormat: fmtK,
  deltaFormat: fmtThousandsSigned,
  goodDirection: "down",
  source: "Home Office immigration system statistics, quarterly",
  sourceUrl:
    "https://www.gov.uk/government/statistical-data-sets/immigration-system-statistics-data-tables",
  cadence: "quarterly",
  points: trajectory(
    [
      ["2014-01-01", 16000],
      ["2018-06-01", 28000],
      ["2020-12-01", 50000],
      ["2022-12-01", 132000],
      ["2024-06-01", 87000],
      ["2025-12-01", 71000],
      ["2026-04-01", 64000],
    ],
    "2014-01-01",
    "2026-04-01",
    91,
    1800,
    0,
  ),
  annotations: [
    { date: "2022-04-01", label: "Streamlined process pause" },
    { date: "2023-12-01", label: "Legacy clearance push" },
  ],
};

const hoCaseworkerTurnover: TrendSeries = {
  id: "ho-caseworker-turnover",
  title: "Asylum caseworker turnover",
  subtitle: "12-month rolling leaver rate",
  unit: "percent",
  format: fmtPct,
  shortFormat: fmtPct,
  goodDirection: "down",
  source: "Home Office workforce data / NAO",
  sourceUrl:
    "https://www.nao.org.uk/reports/asylum-and-protection-transformation-programme/",
  cadence: "monthly",
  points: trajectory(
    [
      ["2017-01-01", 22],
      ["2019-06-01", 28],
      ["2021-06-01", 46],
      ["2022-12-01", 71],
      ["2024-06-01", 49],
      ["2026-04-01", 34],
    ],
    "2017-01-01",
    "2026-04-01",
    92,
    1.2,
    0.6,
  ),
  annotations: [
    { date: "2022-06-01", label: "Caseworker churn peak" },
  ],
};

const hoHotelSpend: TrendSeries = {
  id: "ho-hotel-spend",
  title: "Asylum hotel contingency spend",
  subtitle: "Daily run-rate, £ million per day",
  unit: "currency",
  format: fmtGbpMday,
  shortFormat: (v) => `£${v.toFixed(1)}m`,
  yFormat: (v) => `£${v.toFixed(1)}m`,
  deltaFormat: fmtGbpMdaySigned,
  goodDirection: "down",
  source: "Home Office accounts / NAO asylum costs",
  sourceUrl:
    "https://www.nao.org.uk/reports/investigation-into-asylum-accommodation/",
  cadence: "monthly",
  points: trajectory(
    [
      ["2019-01-01", 0.5],
      ["2020-06-01", 1.2],
      ["2022-06-01", 5.8],
      ["2023-09-01", 8.2],
      ["2024-09-01", 5.6],
      ["2026-04-01", 3.4],
    ],
    "2019-01-01",
    "2026-04-01",
    93,
    0.15,
    0.05,
  ),
  annotations: [
    { date: "2023-09-01", label: "Peak hotel use" },
  ],
};

const hoVisaSla: TrendSeries = {
  id: "ho-visa-sla",
  title: "Visa processing service standard",
  subtitle: "% of decisions within published service standard",
  unit: "percent",
  format: fmtPct,
  shortFormat: fmtPct,
  goodDirection: "up",
  target: { value: 98, label: "98% standard" },
  source: "UK Visas & Immigration transparency data",
  sourceUrl:
    "https://www.gov.uk/government/collections/migration-transparency-data",
  cadence: "monthly",
  points: trajectory(
    [
      ["2016-01-01", 96],
      ["2019-06-01", 93],
      ["2020-06-01", 71],
      ["2022-06-01", 65],
      ["2024-06-01", 82],
      ["2026-04-01", 88],
    ],
    "2016-01-01",
    "2026-04-01",
    94,
    1.0,
    0.6,
  ),
  annotations: [
    { date: "2022-03-01", label: "Ukraine schemes surge" },
  ],
};

// ============================================================
// MoJ — Ministry of Justice
// ============================================================
const mojCrownBacklog: TrendSeries = {
  id: "moj-crown-backlog",
  title: "Crown Court outstanding caseload",
  subtitle: "Open cases awaiting trial or sentence",
  unit: "count",
  format: fmtThousands,
  shortFormat: fmtK,
  yFormat: fmtK,
  deltaFormat: fmtThousandsSigned,
  goodDirection: "down",
  source: "Ministry of Justice criminal court statistics",
  sourceUrl:
    "https://www.gov.uk/government/collections/criminal-court-statistics",
  cadence: "monthly",
  points: trajectory(
    [
      ["2014-01-01", 49000],
      ["2018-12-01", 33000],
      ["2020-03-01", 39000],
      ["2021-06-01", 60000],
      ["2023-12-01", 67000],
      ["2025-06-01", 72000],
      ["2026-04-01", 73500],
    ],
    "2014-01-01",
    "2026-04-01",
    101,
    900,
    0,
  ),
  annotations: [
    { date: "2020-03-01", label: "Covid-19 court closures" },
    { date: "2022-09-01", label: "CBA action" },
  ],
};

const mojPrisonOfficerResign: TrendSeries = {
  id: "moj-officer-resignations",
  title: "Prison officer resignation rate",
  subtitle: "Band 3-5 voluntary resignations, annualised",
  unit: "percent",
  format: fmtPct,
  shortFormat: fmtPct,
  goodDirection: "down",
  source: "HMPPS workforce statistics",
  sourceUrl:
    "https://www.gov.uk/government/collections/her-majestys-prison-and-probation-service-workforce-quarterly",
  cadence: "monthly",
  points: trajectory(
    [
      ["2014-01-01", 5.1],
      ["2017-06-01", 11.2],
      ["2019-06-01", 9.6],
      ["2022-06-01", 15.3],
      ["2024-06-01", 13.1],
      ["2026-04-01", 11.4],
    ],
    "2014-01-01",
    "2026-04-01",
    102,
    0.25,
    0.1,
  ),
  annotations: [
    { date: "2017-09-01", label: "Pay & retention crisis" },
  ],
};

const mojCostPerPrisoner: TrendSeries = {
  id: "moj-cost-per-prisoner",
  title: "Average cost per prisoner",
  subtitle: "Direct + overheads, real terms £/yr",
  unit: "currency",
  format: (v) => `£${Math.round(v).toLocaleString("en-GB")}/yr`,
  shortFormat: (v) => `£${(v / 1000).toFixed(0)}k`,
  yFormat: (v) => `£${(v / 1000).toFixed(0)}k`,
  deltaFormat: fmtGbpKyrSigned,
  goodDirection: "down",
  source: "HMPPS annual report & accounts",
  sourceUrl:
    "https://www.gov.uk/government/collections/her-majestys-prison-service-annual-report-and-accounts",
  cadence: "annual",
  points: annual(
    [
      [2014, 35200],
      [2017, 37900],
      [2020, 42500],
      [2023, 51700],
      [2025, 54600],
    ],
    2014,
    2025,
    103,
    300,
  ),
  annotations: [],
};

const mojCompletionDays: TrendSeries = {
  id: "moj-completion-days",
  title: "Crown Court case completion time",
  subtitle: "Median days from offence to completion",
  unit: "days",
  format: fmtDays,
  shortFormat: (v) => `${Math.round(v)}d`,
  deltaFormat: fmtDaysSigned,
  goodDirection: "down",
  source: "MoJ criminal court statistics quarterly",
  sourceUrl:
    "https://www.gov.uk/government/collections/criminal-court-statistics",
  cadence: "quarterly",
  points: trajectory(
    [
      ["2014-01-01", 391],
      ["2018-01-01", 478],
      ["2020-06-01", 525],
      ["2022-06-01", 642],
      ["2024-06-01", 689],
      ["2026-04-01", 711],
    ],
    "2014-01-01",
    "2026-04-01",
    104,
    6,
    3,
  ),
  annotations: [
    { date: "2020-03-01", label: "Covid-19" },
  ],
};

// ============================================================
// MoD — Ministry of Defence
// ============================================================
const modPersonnelShortfall: TrendSeries = {
  id: "mod-personnel-shortfall",
  title: "Trained personnel shortfall",
  subtitle: "Deficit against full-time trade requirement",
  unit: "percent",
  format: fmtPct,
  shortFormat: fmtPct,
  goodDirection: "down",
  target: { value: 0, label: "Fully manned" },
  source: "MoD quarterly service personnel statistics",
  sourceUrl:
    "https://www.gov.uk/government/collections/uk-armed-forces-monthly-service-personnel-statistics-index",
  cadence: "quarterly",
  points: trajectory(
    [
      ["2014-01-01", 1.6],
      ["2017-06-01", 4.1],
      ["2020-06-01", 4.4],
      ["2023-06-01", 6.8],
      ["2025-06-01", 7.4],
      ["2026-04-01", 6.9],
    ],
    "2014-01-01",
    "2026-04-01",
    111,
    0.15,
    0,
  ),
  annotations: [
    { date: "2022-02-01", label: "Ukraine invasion" },
  ],
};

const modVoluntaryOutflow: TrendSeries = {
  id: "mod-voluntary-outflow",
  title: "Critical trades voluntary outflow",
  subtitle: "Annual voluntary outflow rate, pinch-point trades",
  unit: "percent",
  format: fmtPct,
  shortFormat: fmtPct,
  goodDirection: "down",
  source: "MoD service personnel statistics",
  sourceUrl:
    "https://www.gov.uk/government/collections/uk-armed-forces-quarterly-service-personnel-statistics-index",
  cadence: "quarterly",
  points: trajectory(
    [
      ["2014-01-01", 5.1],
      ["2018-06-01", 6.7],
      ["2021-06-01", 6.3],
      ["2023-12-01", 8.4],
      ["2026-04-01", 7.6],
    ],
    "2014-01-01",
    "2026-04-01",
    112,
    0.2,
    0.05,
  ),
  annotations: [],
};

const modProcurement: TrendSeries = {
  id: "mod-procurement",
  title: "Equipment procurement cost variance",
  subtitle: "Weighted overrun across MoD GMPP portfolio",
  unit: "percent",
  format: fmtPct,
  shortFormat: fmtPct,
  goodDirection: "down",
  target: { value: 0, label: "On budget" },
  source: "IPA Annual Report on Major Projects",
  sourceUrl:
    "https://www.gov.uk/government/collections/ipa-annual-report-on-major-projects",
  cadence: "annual",
  points: annual(
    [
      [2012, 12],
      [2015, 16],
      [2018, 21],
      [2021, 28],
      [2024, 34],
      [2025, 31],
    ],
    2012,
    2025,
    113,
    1.0,
  ),
  annotations: [
    { date: "2023-01-01", label: "Equipment Plan unaffordable" },
  ],
};

const modReadiness: TrendSeries = {
  id: "mod-readiness",
  title: "Force readiness index",
  subtitle: "Composite capability score (NAO/SDSR proxies)",
  unit: "count",
  format: fmtIndex,
  shortFormat: (v) => `${v.toFixed(0)}`,
  yFormat: (v) => `${v.toFixed(0)}`,
  deltaFormat: fmtIndexSigned,
  goodDirection: "up",
  source: "NAO reports on force readiness (proxy)",
  sourceUrl: "https://www.nao.org.uk/reports/the-equipment-plan-2023-2033/",
  cadence: "annual",
  points: annual(
    [
      [2014, 78],
      [2017, 71],
      [2020, 64],
      [2023, 56],
      [2025, 58],
    ],
    2014,
    2025,
    114,
    1.4,
  ),
  annotations: [],
};

// ============================================================
// DWP — Department for Work & Pensions
// ============================================================
const dwpPipDays: TrendSeries = {
  id: "dwp-pip-clearance",
  title: "PIP end-to-end clearance time",
  subtitle: "Median days, new claims",
  unit: "days",
  format: fmtDays,
  shortFormat: (v) => `${Math.round(v)}d`,
  deltaFormat: fmtDaysSigned,
  goodDirection: "down",
  source: "DWP Personal Independence Payment statistics",
  sourceUrl:
    "https://www.gov.uk/government/collections/personal-independence-payment-statistics",
  cadence: "quarterly",
  points: trajectory(
    [
      ["2014-06-01", 28],
      ["2017-06-01", 52],
      ["2019-06-01", 42],
      ["2022-06-01", 105],
      ["2024-06-01", 78],
      ["2026-04-01", 72],
    ],
    "2014-06-01",
    "2026-04-01",
    121,
    2,
    1,
  ),
  annotations: [
    { date: "2022-06-01", label: "Backlog peak" },
  ],
};

const dwpWorkCoach: TrendSeries = {
  id: "dwp-work-coach-ratio",
  title: "Work coach caseload ratio",
  subtitle: "UC claimants per work coach (full-time equivalent)",
  unit: "count",
  format: (v) => `${Math.round(v)} per coach`,
  shortFormat: (v) => `${Math.round(v)}`,
  yFormat: (v) => `${Math.round(v)}`,
  deltaFormat: (v) => `${v > 0 ? "+" : ""}${Math.round(v)}`,
  goodDirection: "down",
  source: "DWP / NAO work coach capacity reporting",
  sourceUrl:
    "https://www.nao.org.uk/reports/dwp-work-coaches/",
  cadence: "quarterly",
  points: trajectory(
    [
      ["2015-01-01", 95],
      ["2018-06-01", 110],
      ["2020-06-01", 240],
      ["2022-06-01", 175],
      ["2024-06-01", 195],
      ["2026-04-01", 188],
    ],
    "2015-01-01",
    "2026-04-01",
    122,
    4,
    1.5,
  ),
  annotations: [
    { date: "2020-03-01", label: "UC surge" },
  ],
};

const dwpFraudError: TrendSeries = {
  id: "dwp-fraud-error",
  title: "Fraud & error in benefit spend",
  subtitle: "Overpayments as % of total benefit expenditure",
  unit: "percent",
  format: fmtPct,
  shortFormat: fmtPct,
  goodDirection: "down",
  target: { value: 1.9, label: "Pre-2018 baseline" },
  source: "DWP fraud and error in the benefit system",
  sourceUrl:
    "https://www.gov.uk/government/collections/fraud-and-error-in-the-benefit-system",
  cadence: "annual",
  points: annual(
    [
      [2011, 2.0],
      [2015, 1.9],
      [2019, 2.4],
      [2021, 3.9],
      [2023, 3.7],
      [2025, 3.3],
    ],
    2011,
    2025,
    123,
    0.05,
  ),
  annotations: [
    { date: "2020-01-01", label: "Covid-19 easements" },
  ],
};

const dwpUcMr: TrendSeries = {
  id: "dwp-uc-mr",
  title: "Outstanding UC mandatory reconsiderations",
  subtitle: "Open cases awaiting reconsideration",
  unit: "count",
  format: fmtThousands,
  shortFormat: fmtK,
  yFormat: fmtK,
  deltaFormat: fmtThousandsSigned,
  goodDirection: "down",
  source: "DWP mandatory reconsiderations statistics",
  sourceUrl:
    "https://www.gov.uk/government/collections/mandatory-reconsiderations",
  cadence: "monthly",
  points: trajectory(
    [
      ["2017-01-01", 14000],
      ["2019-06-01", 22000],
      ["2021-06-01", 38000],
      ["2023-06-01", 55000],
      ["2025-06-01", 47000],
      ["2026-04-01", 42000],
    ],
    "2017-01-01",
    "2026-04-01",
    124,
    900,
    300,
  ),
  annotations: [],
};

// ============================================================
// DfT — Department for Transport
// ============================================================
const dftCancellations: TrendSeries = {
  id: "dft-rail-cancellations",
  title: "Passenger rail cancellation score",
  subtitle: "% of services cancelled (ORR cancellation score)",
  unit: "percent",
  format: fmtPct,
  shortFormat: fmtPct,
  goodDirection: "down",
  target: { value: 3.0, label: "Pre-pandemic norm" },
  source: "Office of Rail and Road, cancellation statistics",
  sourceUrl: "https://dataportal.orr.gov.uk/statistics/performance/passenger-rail-performance/",
  cadence: "monthly",
  points: trajectory(
    [
      ["2015-01-01", 2.8],
      ["2018-06-01", 3.4],
      ["2020-06-01", 3.1],
      ["2022-06-01", 4.6],
      ["2024-06-01", 4.2],
      ["2026-04-01", 3.9],
    ],
    "2015-01-01",
    "2026-04-01",
    131,
    0.15,
    0.18,
  ),
  annotations: [
    { date: "2018-05-01", label: "May 2018 timetable" },
    { date: "2022-06-01", label: "Industrial action" },
  ],
};

const dftDvlaBacklog: TrendSeries = {
  id: "dft-dvla-backlog",
  title: "DVLA paper application backlog",
  subtitle: "Outstanding paper items in processing",
  unit: "count",
  format: fmtThousands,
  shortFormat: fmtK,
  yFormat: fmtK,
  deltaFormat: fmtThousandsSigned,
  goodDirection: "down",
  source: "DVLA performance data / Transport Committee",
  sourceUrl:
    "https://www.gov.uk/government/organisations/driver-and-vehicle-licensing-agency/about/statistics",
  cadence: "monthly",
  points: trajectory(
    [
      ["2018-01-01", 110000],
      ["2020-06-01", 380000],
      ["2021-09-01", 1600000],
      ["2023-06-01", 420000],
      ["2025-06-01", 240000],
      ["2026-04-01", 210000],
    ],
    "2018-01-01",
    "2026-04-01",
    132,
    12000,
    5000,
  ),
  annotations: [
    { date: "2021-06-01", label: "Industrial action + Covid" },
  ],
};

const dftCapitalOverrun: TrendSeries = {
  id: "dft-capital-overrun",
  title: "Transport capital portfolio overrun",
  subtitle: "Weighted cost variance across rail & road majors",
  unit: "percent",
  format: fmtPct,
  shortFormat: fmtPct,
  goodDirection: "down",
  target: { value: 0, label: "On budget" },
  source: "IPA Annual Report on Major Projects",
  sourceUrl:
    "https://www.gov.uk/government/collections/ipa-annual-report-on-major-projects",
  cadence: "annual",
  points: annual(
    [
      [2012, 14],
      [2015, 19],
      [2018, 26],
      [2021, 38],
      [2023, 52],
      [2025, 47],
    ],
    2012,
    2025,
    133,
    1.2,
  ),
  annotations: [
    { date: "2023-10-01", label: "HS2 northern leg cancelled" },
  ],
};

const dftSrnDegradation: TrendSeries = {
  id: "dft-srn-degradation",
  title: "Strategic road network condition",
  subtitle: "% of SRN pavement requiring further investigation",
  unit: "percent",
  format: fmtPct,
  shortFormat: fmtPct,
  goodDirection: "down",
  source: "National Highways performance statistics",
  sourceUrl:
    "https://nationalhighways.co.uk/about-us/our-performance/our-performance-results/",
  cadence: "annual",
  points: annual(
    [
      [2014, 3.6],
      [2017, 3.9],
      [2020, 4.2],
      [2023, 5.1],
      [2025, 5.4],
    ],
    2014,
    2025,
    134,
    0.08,
  ),
  annotations: [],
};

// ============================================================
// Registry
// ============================================================
export const departments: Department[] = [
  {
    code: "dhsc",
    name: "DHSC",
    fullName: "Health & Social Care",
    blurb:
      "Decades of monthly data on how the department is performing against its stated objectives. Headline numbers in context, not in isolation.",
    rating: "C+",
    synthesis:
      "Waiting list has stopped growing but remains near record highs. The 18-week standard has not been met for a decade and the social-care discharge bottleneck is structural. Agency spend has eased since the 2023 peak; capital delivery is worsening.",
    themes: ["Waiting list", "Urgent care", "Workforce", "Capital"],
    hero: waitingList,
    core: [rtt18Week, dischargeDelays, agencySpend, capitalOverrun],
    supporting: [aePerformance, turnover, vacancyRate, lifeExpectancy],
  },
  {
    code: "dfe",
    name: "DfE",
    fullName: "Education",
    blurb:
      "How the schools system is performing on the measures that families and economists both care about: outcomes, retention, financial sustainability, and pipeline.",
    rating: "D+",
    synthesis:
      "The disadvantaged attainment gap has widened back beyond its pre-2019 level. Early-career attrition is structurally higher than a decade ago, training recruitment is missing target by a third, and high-needs deficits are compounding.",
    themes: ["Attainment", "Workforce", "Funding", "Pipeline"],
    hero: dfeAttainmentGap,
    core: [dfeEctAttrition, dfeDsgDeficit, dfeTeacherRecruitment],
  },
  {
    code: "home-office",
    name: "Home Office",
    fullName: "Home Office",
    blurb:
      "Operational throughput on the highest-volume, highest-salience flows: asylum, visas, and the costs of contingency.",
    rating: "D",
    synthesis:
      "The legacy asylum backlog has cleared, but new intake keeps the headline above its 2010s baseline. Hotel run-rate has fallen from the 2023 peak but remains an order of magnitude above pre-2019. Visa SLAs are recovering.",
    themes: ["Throughput", "Workforce", "Value for money", "Service standard"],
    hero: hoAsylumBacklog,
    core: [hoCaseworkerTurnover, hoHotelSpend, hoVisaSla],
  },
  {
    code: "moj",
    name: "MoJ",
    fullName: "Justice",
    blurb:
      "The throughput, cost, and capacity of the criminal-justice system. Hard to fudge: courts list cases publicly and prisons publish costs.",
    rating: "D-",
    synthesis:
      "Crown Court outstanding cases continue to grow; completion times are over 700 days. Prison officer attrition has eased from its 2022 peak but unit costs keep rising faster than inflation.",
    themes: ["Backlog", "Cost", "Workforce", "Speed"],
    hero: mojCrownBacklog,
    core: [mojPrisonOfficerResign, mojCostPerPrisoner, mojCompletionDays],
  },
  {
    code: "mod",
    name: "MoD",
    fullName: "Defence",
    blurb:
      "Whether the armed forces are at the size, mix, and readiness that the National Security Strategy requires, and whether equipment programmes deliver on time and on budget.",
    rating: "D",
    synthesis:
      "Manning is below requirement across all three services. Voluntary outflow in critical trades has accelerated since Ukraine. The equipment programme remains structurally unaffordable; the IPA portfolio overruns are rising.",
    themes: ["People", "Procurement", "Readiness", "Affordability"],
    hero: modPersonnelShortfall,
    core: [modVoluntaryOutflow, modProcurement, modReadiness],
  },
  {
    code: "dwp",
    name: "DWP",
    fullName: "Work & Pensions",
    blurb:
      "Whether claimants get decisions promptly, whether work coaches have manageable caseloads, and whether the system is losing money to fraud and error.",
    rating: "C-",
    synthesis:
      "PIP clearance has improved from its 2022 peak but remains over twice its 2014 baseline. Work coach ratios are double the pre-UC norm. Fraud and error is structurally elevated since the Covid easements.",
    themes: ["Speed", "Capacity", "Integrity", "Backlog"],
    hero: dwpPipDays,
    core: [dwpWorkCoach, dwpFraudError, dwpUcMr],
  },
  {
    code: "dft",
    name: "DfT",
    fullName: "Transport",
    blurb:
      "Daily reliability and long-term asset health: cancellations passengers see, agency backlogs drivers see, and capital programmes taxpayers pay for.",
    rating: "D+",
    synthesis:
      "Rail cancellation scores have not returned to pre-pandemic norms. DVLA has recovered most of its 2021 backlog. Capital portfolio overruns have ballooned; SRN pavement condition is deteriorating.",
    themes: ["Reliability", "Service", "Delivery", "Assets"],
    hero: dftCancellations,
    core: [dftDvlaBacklog, dftCapitalOverrun, dftSrnDegradation],
  },
];

export function getDepartment(code: string): Department | undefined {
  return departments.find((d) => d.code === code);
}
