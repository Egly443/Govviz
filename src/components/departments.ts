import {
  agencySpend,
  aePerformance,
  capitalOverrun,
  clinicalPer1000,
  dischargeDelays,
  healthSpendGdp,
  hospitalBeds,
  infantMortality,
  lifeExpectancy,
  noise,
  realLine,
  realPoints,
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
  pageTitle?: string; // H1 override; defaults to `Department for {fullName}`
  blurb: string;
  rating: string;
  synthesis: string;
  themes: string[];
  spendBn: number; // illustrative departmental total managed expenditure, £bn
  hero: TrendSeries;
  core: TrendSeries[];
  supporting?: TrendSeries[];
};

// ----- formatting helpers -----
const fmtPct = (v: number) => `${v.toFixed(1)}%`;
const fmtPctWhole = (v: number) => `${v.toFixed(0)}%`;
const fmtGbpHead = (v: number) => `£${Math.round(v).toLocaleString("en-GB")}`;
const fmtGbpHeadShort = (v: number) => `£${(v / 1000).toFixed(0)}k`;
const fmtPts = (v: number) => `${v.toFixed(0)}`;
const fmtGbpTn = (v: number) => `£${(v / 1000).toFixed(2)}tn`;
const fmtGbpTnShort = (v: number) => `£${(v / 1000).toFixed(1)}tn`;
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
  subtitle: "KS4 disadvantage gap index (higher = wider gap)",
  unit: "count",
  format: (v) => v.toFixed(2),
  shortFormat: (v) => v.toFixed(1),
  yFormat: (v) => v.toFixed(1),
  deltaFormat: (v) => `${v > 0 ? "+" : ""}${v.toFixed(2)}`,
  goodDirection: "down",
  source: "DfE, Explore Education Statistics (KS4 performance)",
  sourceUrl:
    "https://explore-education-statistics.service.gov.uk/find-statistics/key-stage-4-performance",
  cadence: "annual",
  points: realPoints(
    "dfe-attainment-gap",
    annual(
      [
        [2011, 3.0],
        [2017, 2.9],
        [2019, 2.9],
        [2021, 3.2],
        [2023, 3.4],
        [2025, 3.5],
      ],
      2011,
      2025,
      81,
      0.02,
    ),
  ),
  annotations: [
    { date: "2020-01-01", label: "School closures" },
  ],
};

const dfeEctAttritionFallback = annual(
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
);
const dfeEctAttrition: TrendSeries = {
  id: "dfe-ect-attrition",
  title: "Early-career teacher attrition",
  subtitle: "% leaving state schools within 5 years of qualifying",
  unit: "percent",
  format: fmtPct,
  shortFormat: fmtPct,
  goodDirection: "down",
  source: "DfE School Workforce in England (EES)",
  sourceUrl:
    "https://explore-education-statistics.service.gov.uk/find-statistics/school-workforce-in-england",
  cadence: "annual",
  points: realPoints("dfe-ect-attrition", dfeEctAttritionFallback),
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

const dfeTeacherRecruitmentFallback = annual(
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
);
const dfeTeacherRecruitment: TrendSeries = {
  id: "dfe-teacher-recruitment",
  title: "Teacher training recruitment",
  subtitle: "Postgraduate ITT enrolments vs target (%)",
  unit: "percent",
  format: fmtPct,
  shortFormat: fmtPct,
  goodDirection: "up",
  target: { value: 100, label: "100% of target" },
  source: "DfE ITT Census (EES)",
  sourceUrl:
    "https://explore-education-statistics.service.gov.uk/find-statistics/initial-teacher-training-census",
  cadence: "annual",
  points: realPoints("dfe-teacher-recruitment", dfeTeacherRecruitmentFallback),
  annotations: [],
};

// ============================================================
// Home Office
// ============================================================
const hoAsylumBacklog: TrendSeries = {
  id: "ho-asylum-backlog",
  title: "Pending asylum seekers",
  subtitle: "Total pending in UK (UNHCR, all stages & origins)",
  unit: "count",
  format: fmtThousands,
  shortFormat: fmtK,
  yFormat: fmtK,
  deltaFormat: fmtThousandsSigned,
  goodDirection: "down",
  source: "UNHCR Refugee Statistics",
  sourceUrl: "https://www.unhcr.org/refugee-statistics",
  cadence: "annual",
  points: realPoints(
    "ho-asylum-backlog",
    trajectory(
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
  points: realPoints(
    "ho-visa-sla",
    trajectory(
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
  points: realPoints(
    "moj-crown-backlog",
    trajectory(
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
  points: realPoints(
    "moj-officer-resignations",
    trajectory(
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
  points: realPoints(
    "moj-cost-per-prisoner",
    annual(
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
  points: realPoints(
    "moj-completion-days",
    trajectory(
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
  )),
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
  points: realPoints(
    "mod-personnel-shortfall",
    trajectory(
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
  points: realPoints(
    "mod-voluntary-outflow",
    trajectory(
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
  points: realPoints(
    "mod-procurement",
    annual(
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
  points: realPoints(
    "dwp-fraud-error",
    annual(
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
  points: realPoints(
    "dft-rail-cancellations",
    trajectory(
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
  )),
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
  points: realPoints(
    "dft-capital-overrun",
    annual(
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
// HM Treasury — economy & public finances
// ============================================================
const hmtGdpPerCapita: TrendSeries = {
  id: "hmt-gdp-per-capita",
  title: "Real GDP per head",
  subtitle: "Chained-volume £ per person",
  unit: "currency",
  format: fmtGbpHead,
  shortFormat: fmtGbpHeadShort,
  yFormat: fmtGbpHeadShort,
  deltaFormat: (v) => `${v > 0 ? "+" : ""}£${Math.round(v).toLocaleString("en-GB")}`,
  goodDirection: "up",
  source: "ONS quarterly national accounts",
  sourceUrl: "https://www.ons.gov.uk/economy/grossdomesticproductgdp",
  cadence: "annual",
  points: realPoints(
    "hmt-gdp-per-capita",
    annual(
      [
        [1990, 22000],
        [2000, 26500],
        [2007, 30600],
        [2009, 28700],
        [2014, 29400],
        [2019, 31600],
        [2020, 29400],
        [2022, 31900],
        [2025, 31700],
      ],
      1990,
      2025,
      201,
      70,
    ),
  ),
  annotations: [
    { date: "2008-01-01", label: "Financial crisis" },
    { date: "2020-01-01", label: "Covid-19" },
  ],
};

const hmtCpiPts = annual(
  [
    [1990, 7.0],
    [1993, 2.6],
    [2000, 1.2],
    [2008, 3.6],
    [2009, 2.2],
    [2015, 0.4],
    [2017, 2.7],
    [2020, 1.0],
    [2022, 9.1],
    [2023, 7.3],
    [2025, 2.6],
  ],
  1990,
  2025,
  202,
  0.2,
);
const hmtWagePts = annual(
  [
    [1990, 9.5],
    [1993, 3.6],
    [2000, 4.5],
    [2008, 3.8],
    [2009, 1.4],
    [2015, 2.6],
    [2020, 1.7],
    [2022, 6.0],
    [2023, 7.8],
    [2025, 4.6],
  ],
  1990,
  2025,
  203,
  0.2,
);
const hmtCostOfLiving: TrendSeries = {
  id: "hmt-cost-of-living",
  title: "Inflation vs pay growth",
  subtitle: "Annual % change: CPI vs average weekly earnings",
  unit: "percent",
  format: fmtPct,
  shortFormat: fmtPct,
  goodDirection: "down",
  source: "ONS consumer prices & average weekly earnings",
  sourceUrl: "https://www.ons.gov.uk/economy/inflationandpriceindices",
  cadence: "annual",
  points: realLine("hmt-cost-of-living", "cpi", hmtCpiPts),
  lines: [
    { id: "cpi", label: "CPI inflation", points: realLine("hmt-cost-of-living", "cpi", hmtCpiPts) },
    { id: "wages", label: "Pay growth", points: realLine("hmt-cost-of-living", "wages", hmtWagePts) },
  ],
  annotations: [{ date: "2022-01-01", label: "Cost-of-living crisis" }],
};

const hmtRealIncome: TrendSeries = {
  id: "hmt-real-income",
  title: "Real household income per head",
  subtitle: "Real households' disposable income, £ per person",
  unit: "currency",
  format: fmtGbpHead,
  shortFormat: fmtGbpHeadShort,
  yFormat: fmtGbpHeadShort,
  deltaFormat: (v) => `${v > 0 ? "+" : ""}£${Math.round(v).toLocaleString("en-GB")}`,
  goodDirection: "up",
  source: "ONS real households' disposable income",
  sourceUrl: "https://www.ons.gov.uk/economy/nationalaccounts",
  cadence: "annual",
  points: realPoints(
    "hmt-real-income",
    annual(
      [
        [1990, 14200],
        [2000, 16800],
        [2007, 19600],
        [2009, 19100],
        [2019, 21000],
        [2022, 20400],
        [2025, 20800],
      ],
      1990,
      2025,
      204,
      60,
    ),
  ),
  annotations: [],
};

const hmtProdPts = annual(
  [
    [1990, 80],
    [2000, 92],
    [2007, 100],
    [2009, 99],
    [2014, 101],
    [2019, 104],
    [2025, 106],
  ],
  1990,
  2025,
  205,
  0.3,
);
const hmtRealWagePts = annual(
  [
    [1990, 72],
    [2000, 88],
    [2007, 100],
    [2009, 99],
    [2014, 92],
    [2019, 97],
    [2022, 99],
    [2025, 98],
  ],
  1990,
  2025,
  206,
  0.3,
);
const hmtProductivity: TrendSeries = {
  id: "hmt-productivity",
  title: "Productivity",
  subtitle: "Output per hour worked, index",
  unit: "count",
  format: fmtPts,
  shortFormat: fmtPts,
  yFormat: fmtPts,
  goodDirection: "up",
  source: "ONS labour productivity",
  sourceUrl:
    "https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/labourproductivity",
  cadence: "annual",
  points: realPoints("hmt-productivity", hmtProdPts),
  annotations: [{ date: "2008-01-01", label: "Productivity stalls" }],
};
void hmtRealWagePts;

const hmtDebt: TrendSeries = {
  id: "hmt-psnd",
  title: "Public sector net debt",
  subtitle: "% of GDP",
  unit: "percent",
  format: fmtPct,
  shortFormat: fmtPctWhole,
  yFormat: fmtPctWhole,
  goodDirection: "down",
  target: { value: 40, label: "Old 40% ceiling" },
  source: "ONS / OBR public sector finances",
  sourceUrl:
    "https://www.ons.gov.uk/economy/governmentpublicsectorandtaxes/publicsectorfinance",
  cadence: "annual",
  points: realPoints(
    "hmt-psnd",
    annual(
      [
        [1990, 28],
        [1993, 38],
        [2001, 29],
        [2008, 42],
        [2012, 80],
        [2016, 86],
        [2020, 96],
        [2021, 103],
        [2025, 98],
      ],
      1990,
      2025,
      207,
      0.5,
    ),
  ),
  annotations: [
    { date: "2008-01-01", label: "Bank bailouts" },
    { date: "2020-01-01", label: "Covid-19" },
  ],
};

const hmtDebtCash: TrendSeries = {
  id: "hmt-psnd-cash",
  title: "National debt in cash terms",
  subtitle: "Public sector net debt ex banks, £ trillion",
  unit: "currency",
  format: fmtGbpTn,
  shortFormat: fmtGbpTnShort,
  yFormat: fmtGbpTnShort,
  deltaFormat: (v) => `${v > 0 ? "+" : ""}£${Math.round(v)}bn`,
  goodDirection: "down",
  target: { value: 3000, label: "£3tn" },
  source: "ONS / OBR public sector finances",
  sourceUrl:
    "https://www.ons.gov.uk/economy/governmentpublicsectorandtaxes/publicsectorfinance",
  cadence: "annual",
  // Stored in £ billion; formatted as £ trillion.
  points: realPoints(
    "hmt-psnd-cash",
    annual(
      [
        [1993, 300],
        [2000, 350],
        [2008, 520],
        [2010, 1000],
        [2012, 1190],
        [2015, 1540],
        [2018, 1740],
        [2020, 1880],
        [2021, 2230],
        [2022, 2480],
        [2024, 2690],
        [2025, 2810],
      ],
      1993,
      2025,
      213,
      6,
    ),
  ),
  annotations: [
    { date: "2008-01-01", label: "Financial crisis" },
    { date: "2020-01-01", label: "Covid-19" },
  ],
};

const hmtUnemployment: TrendSeries = {
  id: "hmt-unemployment",
  title: "Unemployment rate",
  subtitle: "% of the economically active, aged 16+",
  unit: "percent",
  format: fmtPct,
  shortFormat: fmtPct,
  goodDirection: "down",
  source: "ONS Labour Force Survey",
  sourceUrl:
    "https://www.ons.gov.uk/employmentandlabourmarket/peoplenotinwork/unemployment",
  cadence: "monthly",
  points: realPoints(
    "hmt-unemployment",
    trajectory(
      [
        ["1971-01-01", 3.6],
        ["1976-01-01", 5.5],
        ["1984-06-01", 11.9],
        ["1990-01-01", 6.9],
        ["1993-01-01", 10.6],
        ["2000-01-01", 5.4],
        ["2008-06-01", 5.3],
        ["2011-10-01", 8.4],
        ["2016-01-01", 5.0],
        ["2019-12-01", 3.8],
        ["2020-10-01", 5.1],
        ["2022-06-01", 3.7],
        ["2025-06-01", 4.5],
      ],
      "1971-01-01",
      "2025-06-01",
      220,
      0.12,
      0,
    ),
  ),
  annotations: [
    { date: "1984-01-01", label: "Deindustrialisation" },
    { date: "2008-01-01", label: "Financial crisis" },
    { date: "2020-01-01", label: "Covid-19" },
  ],
};

const hmtDebtInterest: TrendSeries = {
  id: "hmt-debt-interest",
  title: "Debt interest",
  subtitle: "Debt interest as % of government revenue",
  unit: "percent",
  format: fmtPct,
  shortFormat: fmtPct,
  goodDirection: "down",
  source: "World Bank (IMF GFS)",
  sourceUrl: "https://data.worldbank.org/indicator/GC.XPN.INTP.RV.ZS?locations=GB",
  cadence: "annual",
  points: realPoints(
    "hmt-debt-interest",
    annual(
      [
        [1990, 10.5],
        [2000, 7.5],
        [2008, 5.0],
        [2015, 6.0],
        [2021, 4.6],
        [2022, 9.2],
        [2023, 10.4],
        [2025, 8.1],
      ],
      1990,
      2025,
      208,
      0.15,
    ),
  ),
  annotations: [{ date: "2022-01-01", label: "Rates + RPI surge" }],
};

const hmtTaxBurden: TrendSeries = {
  id: "hmt-tax-burden",
  title: "Total tax take",
  subtitle: "Tax as % of GDP (the tax burden)",
  unit: "percent",
  format: fmtPct,
  shortFormat: fmtPctWhole,
  yFormat: fmtPctWhole,
  goodDirection: "down",
  source: "World Bank (IMF GFS)",
  sourceUrl: "https://data.worldbank.org/indicator/GC.TAX.TOTL.GD.ZS?locations=GB",
  cadence: "annual",
  points: realPoints(
    "hmt-tax-burden",
    annual(
      [
        [1990, 33.5],
        [2000, 33.0],
        [2010, 32.0],
        [2019, 33.0],
        [2022, 35.0],
        [2024, 36.5],
        [2025, 37.1],
      ],
      1990,
      2025,
      209,
      0.2,
    ),
  ),
  annotations: [{ date: "2024-01-01", label: "Highest since 1948" }],
};

const hmtDirectPts = annual(
  [
    [1990, 18.0],
    [2000, 18.6],
    [2010, 17.4],
    [2019, 18.6],
    [2025, 20.2],
  ],
  1990,
  2025,
  210,
  0.15,
);
const hmtIndirectPts = annual(
  [
    [1990, 13.2],
    [2000, 12.6],
    [2010, 12.4],
    [2019, 11.6],
    [2025, 11.0],
  ],
  1990,
  2025,
  211,
  0.15,
);
const hmtTaxSplit: TrendSeries = {
  id: "hmt-tax-split",
  title: "Direct vs indirect tax",
  subtitle: "% of government revenue: income/profit taxes vs goods/services taxes",
  unit: "percent",
  format: fmtPct,
  shortFormat: fmtPct,
  goodDirection: "up",
  source: "World Bank (IMF GFS)",
  sourceUrl:
    "https://data.worldbank.org/indicator/GC.TAX.YPKG.RV.ZS?locations=GB",
  cadence: "annual",
  points: realLine("hmt-tax-split", "direct", hmtDirectPts),
  lines: [
    { id: "direct", label: "Direct (income tax + NI)", points: realLine("hmt-tax-split", "direct", hmtDirectPts) },
    { id: "indirect", label: "Indirect (VAT + duties)", points: realLine("hmt-tax-split", "indirect", hmtIndirectPts) },
  ],
  annotations: [],
};

const hmtDeficit: TrendSeries = {
  id: "hmt-deficit",
  title: "Budget deficit",
  subtitle: "Public sector net borrowing, % of GDP",
  unit: "percent",
  format: fmtPct,
  shortFormat: fmtPctWhole,
  yFormat: fmtPctWhole,
  goodDirection: "down",
  source: "ONS / OBR public sector finances",
  sourceUrl:
    "https://www.ons.gov.uk/economy/governmentpublicsectorandtaxes/publicsectorfinance",
  cadence: "annual",
  points: realPoints(
    "hmt-deficit",
    annual(
      [
        [1990, 1.5],
        [1993, 7.5],
        [2001, -1.0],
        [2008, 2.8],
        [2010, 10.2],
        [2016, 3.8],
        [2019, 2.3],
        [2020, 15.1],
        [2023, 5.8],
        [2025, 4.4],
      ],
      1990,
      2025,
      212,
      0.2,
    ),
  ),
  annotations: [
    { date: "2009-01-01", label: "Deficit peak" },
    { date: "2020-01-01", label: "Covid-19" },
  ],
};

// ============================================================
// World Bank international indicators (real, hard-to-fudge)
// ============================================================
const fmt1 = (v: number) => v.toFixed(1);
const fmt0 = (v: number) => v.toFixed(0);

const dfeEduSpendGdp: TrendSeries = {
  id: "dfe-edu-spend-gdp",
  title: "Education spending (% of GDP)",
  subtitle: "Government expenditure on education, % of GDP",
  unit: "percent",
  format: fmtPct,
  shortFormat: fmtPct,
  goodDirection: "up",
  source: "World Bank (UNESCO)",
  sourceUrl: "https://data.worldbank.org/indicator/SE.XPD.TOTL.GD.ZS?locations=GB",
  cadence: "annual",
  points: realPoints("dfe-edu-spend-gdp", annual([[2000, 4.3], [2010, 5.5], [2015, 4.7], [2020, 5.2], [2021, 5.1]], 2000, 2021, 320, 0.05)),
  annotations: [],
};

const dfePupilTeacher: TrendSeries = {
  id: "dfe-pupil-teacher",
  title: "Pupil–teacher ratio (primary)",
  subtitle: "Pupils per teacher, primary schools",
  unit: "count",
  format: fmt0,
  shortFormat: fmt0,
  yFormat: fmt0,
  goodDirection: "down",
  source: "World Bank (UNESCO)",
  sourceUrl: "https://data.worldbank.org/indicator/SE.PRM.ENRL.TC.ZS?locations=GB",
  cadence: "annual",
  points: realPoints("dfe-pupil-teacher", annual([[2000, 19.4], [2010, 19.8], [2015, 20.9], [2020, 20.2]], 2000, 2021, 321, 0.05)),
  annotations: [],
};

const hoHomicideRate: TrendSeries = {
  id: "ho-homicide-rate",
  title: "Homicide rate",
  subtitle: "Intentional homicides per 100,000 people",
  unit: "count",
  format: fmt1,
  shortFormat: fmt1,
  yFormat: fmt1,
  goodDirection: "down",
  source: "World Bank (UNODC)",
  sourceUrl: "https://data.worldbank.org/indicator/VC.IHR.PSRC.P5?locations=GB",
  cadence: "annual",
  points: realPoints("ho-homicide-rate", annual([[2000, 1.6], [2008, 1.3], [2014, 0.9], [2018, 1.2], [2021, 1.0]], 2000, 2021, 322, 0.03)),
  annotations: [],
};

const modDefenceSpendGdp: TrendSeries = {
  id: "mod-defence-spend-gdp",
  title: "Defence spending (% of GDP)",
  subtitle: "Military expenditure, % of GDP",
  unit: "percent",
  format: fmtPct,
  shortFormat: fmtPct,
  goodDirection: "up",
  target: { value: 2.0, label: "NATO 2% target" },
  source: "World Bank (SIPRI)",
  sourceUrl: "https://data.worldbank.org/indicator/MS.MIL.XPND.GD.ZS?locations=GB",
  cadence: "annual",
  points: realPoints("mod-defence-spend-gdp", annual([[1990, 3.6], [2000, 2.4], [2010, 2.4], [2019, 2.0], [2023, 2.3]], 1990, 2023, 323, 0.04)),
  annotations: [{ date: "2022-02-01", label: "Ukraine invasion" }],
};

const dwpPop65: TrendSeries = {
  id: "dwp-pop-65",
  title: "Population aged 65+",
  subtitle: "% of total population (pension pressure)",
  unit: "percent",
  format: fmtPct,
  shortFormat: fmtPct,
  goodDirection: "down",
  source: "World Bank (UN Population)",
  sourceUrl: "https://data.worldbank.org/indicator/SP.POP.65UP.TO.ZS?locations=GB",
  cadence: "annual",
  points: realPoints("dwp-pop-65", annual([[1990, 15.7], [2000, 15.8], [2010, 16.4], [2020, 18.6], [2022, 19.2]], 1990, 2022, 324, 0.03)),
  annotations: [],
};

const dftRoadDeathRate: TrendSeries = {
  id: "dft-road-death-rate",
  title: "Road deaths per 100,000",
  subtitle: "Mortality from road traffic injury, per 100,000",
  unit: "count",
  format: fmt1,
  shortFormat: fmt1,
  yFormat: fmt1,
  goodDirection: "down",
  source: "World Bank (WHO)",
  sourceUrl: "https://data.worldbank.org/indicator/SH.STA.TRAF.P5?locations=GB",
  cadence: "annual",
  points: realPoints("dft-road-death-rate", annual([[2000, 6.1], [2010, 3.7], [2015, 2.9], [2019, 2.9], [2021, 2.6]], 2000, 2021, 325, 0.04)),
  annotations: [],
};

// ---- World Bank wave 2 (compact helper) ----
const fmtUsd = (v: number) => `$${Math.round(v).toLocaleString("en-GB")}`;
const fmtUsdK = (v: number) => `$${(v / 1000).toFixed(1)}k`;

function wbS(o: {
  id: string;
  title: string;
  subtitle: string;
  good: "up" | "down";
  unit?: TrendSeries["unit"];
  format: (v: number) => string;
  shortFormat?: (v: number) => string;
  yFormat?: (v: number) => string;
  target?: { value: number; label: string };
  source: string;
  code: string;
  anchors: [number, number][];
  start: number;
  end: number;
  seed: number;
  amp: number;
  annotations?: TrendSeries["annotations"];
}): TrendSeries {
  return {
    id: o.id,
    title: o.title,
    subtitle: o.subtitle,
    unit: o.unit ?? "count",
    format: o.format,
    shortFormat: o.shortFormat ?? o.format,
    yFormat: o.yFormat ?? o.format,
    goodDirection: o.good,
    target: o.target,
    source: o.source,
    sourceUrl: `https://data.worldbank.org/indicator/${o.code}?locations=GB`,
    cadence: "annual",
    points: realPoints(o.id, annual(o.anchors, o.start, o.end, o.seed, o.amp)),
    annotations: o.annotations ?? [],
  };
}

// Treasury / economy
const hmtGdpGrowth = wbS({ id: "hmt-gdp-growth", title: "GDP growth", subtitle: "Real GDP, annual % change", good: "up", unit: "percent", format: fmtPct, source: "World Bank", code: "NY.GDP.MKTP.KD.ZG", anchors: [[1990, 0.7], [2000, 3.2], [2009, -4.6], [2010, 2.2], [2020, -10.3], [2021, 8.6], [2023, 0.3]], start: 1990, end: 2023, seed: 331, amp: 0.3, annotations: [{ date: "2009-01-01", label: "Financial crisis" }, { date: "2020-01-01", label: "Covid-19" }] });
const hmtInvestment = wbS({ id: "hmt-investment-gdp", title: "Investment", subtitle: "Gross capital formation, % of GDP", good: "up", unit: "percent", format: fmtPct, source: "World Bank", code: "NE.GDI.TOTL.ZS", anchors: [[1990, 22], [2000, 18], [2010, 16], [2019, 17.5], [2022, 18]], start: 1990, end: 2022, seed: 332, amp: 0.3 });
const hmtCurrentAccount = wbS({ id: "hmt-current-account", title: "Current account balance", subtitle: "% of GDP", good: "up", unit: "percent", format: fmtPct, source: "World Bank", code: "BN.CAB.XOKA.GD.ZS", anchors: [[1990, -3.4], [2000, -2.2], [2010, -2.7], [2016, -5.2], [2022, -3.1]], start: 1990, end: 2022, seed: 333, amp: 0.3 });
const hmtEmployment = wbS({ id: "hmt-employment-rate", title: "Employment rate", subtitle: "Employment-to-population, 15+ (%)", good: "up", unit: "percent", format: fmtPct, source: "World Bank (ILO)", code: "SL.EMP.TOTL.SP.ZS", anchors: [[1991, 57], [2000, 58], [2010, 57], [2019, 60], [2022, 59]], start: 1991, end: 2022, seed: 334, amp: 0.3 });
const hmtParticipation = wbS({ id: "hmt-participation", title: "Labour force participation", subtitle: "% of population 15+", good: "up", unit: "percent", format: fmtPct, source: "World Bank (ILO)", code: "SL.TLF.CACT.ZS", anchors: [[1990, 62], [2000, 62], [2010, 62], [2019, 63], [2022, 62]], start: 1990, end: 2022, seed: 335, amp: 0.3 });
const hmtTrade = wbS({ id: "hmt-trade-gdp", title: "Trade openness", subtitle: "Trade (exports + imports), % of GDP", good: "up", unit: "percent", format: fmtPct, source: "World Bank", code: "NE.TRD.GNFS.ZS", anchors: [[1990, 46], [2000, 55], [2010, 58], [2019, 63], [2022, 70]], start: 1990, end: 2022, seed: 336, amp: 0.5 });
const hmtSavings = wbS({ id: "hmt-savings", title: "Gross savings", subtitle: "% of GDP", good: "up", unit: "percent", format: fmtPct, source: "World Bank", code: "NY.GNS.ICTR.ZS", anchors: [[1990, 17], [2000, 15], [2010, 13], [2019, 14], [2022, 15]], start: 1990, end: 2022, seed: 337, amp: 0.3 });
const hmtGniPerCapita = wbS({ id: "hmt-gni-per-capita", title: "GNI per head (PPP)", subtitle: "Gross national income per person, PPP $", good: "up", unit: "currency", format: fmtUsd, shortFormat: fmtUsdK, yFormat: fmtUsdK, source: "World Bank", code: "NY.GNP.PCAP.PP.CD", anchors: [[1990, 16000], [2000, 27000], [2010, 38000], [2019, 48000], [2022, 49000]], start: 1990, end: 2022, seed: 338, amp: 100 });

// DHSC
const dhscHealthSpendPc = wbS({ id: "dhsc-health-spend-pc", title: "Health spending per person", subtitle: "Current health expenditure, $ per person", good: "up", unit: "currency", format: fmtUsd, shortFormat: fmtUsdK, yFormat: fmtUsdK, source: "World Bank (WHO)", code: "SH.XPD.CHEX.PC.CD", anchors: [[2000, 1700], [2010, 3500], [2019, 4500], [2021, 5400]], start: 2000, end: 2021, seed: 340, amp: 20 });
const dhscSuicide = wbS({ id: "dhsc-suicide", title: "Suicide rate", subtitle: "Per 100,000 people", good: "down", format: fmt1, source: "World Bank (WHO)", code: "SH.STA.SUIC.P5", anchors: [[2000, 9.5], [2010, 7.0], [2016, 7.6], [2019, 7.5]], start: 2000, end: 2019, seed: 341, amp: 0.08 });
const dhscMeasles = wbS({ id: "dhsc-measles-imm", title: "Measles immunisation", subtitle: "% of children immunised", good: "up", unit: "percent", format: fmt0, source: "World Bank (WHO/UNICEF)", code: "SH.IMM.MEAS", anchors: [[1990, 87], [2000, 88], [2010, 93], [2019, 91], [2021, 90]], start: 1990, end: 2021, seed: 342, amp: 0.2 });
const dhscOop = wbS({ id: "dhsc-oop", title: "Out-of-pocket health costs", subtitle: "% of total health spending", good: "down", unit: "percent", format: fmtPct, source: "World Bank (WHO)", code: "SH.XPD.OOPC.CH.ZS", anchors: [[2000, 18], [2010, 16], [2019, 17], [2021, 14]], start: 2000, end: 2021, seed: 343, amp: 0.2 });

// DfE / Home Office / MoD
const dfeTertiary = wbS({ id: "dfe-tertiary-enrol", title: "University participation", subtitle: "Tertiary enrolment, % gross", good: "up", unit: "percent", format: fmt0, source: "World Bank (UNESCO)", code: "SE.TER.ENRR", anchors: [[1990, 30], [2000, 58], [2010, 59], [2019, 66], [2020, 70]], start: 1990, end: 2020, seed: 344, amp: 0.4 });
const hoMigrantStock = wbS({ id: "ho-migrant-stock", title: "Foreign-born population", subtitle: "International migrant stock, % of population", good: "up", unit: "percent", format: fmtPct, source: "World Bank (UN)", code: "SM.POP.TOTL.ZS", anchors: [[1990, 6.4], [2000, 7.9], [2010, 11.3], [2015, 13.2], [2020, 13.8]], start: 1990, end: 2020, seed: 345, amp: 0.05 });
const modPersonnel = wbS({ id: "mod-personnel-total", title: "Armed forces personnel", subtitle: "Total military personnel", good: "up", format: fmtThousands, shortFormat: fmtK, yFormat: fmtK, source: "World Bank (IISS)", code: "MS.MIL.TOTL.P1", anchors: [[1990, 308000], [2000, 212000], [2010, 197000], [2019, 156000], [2020, 153000]], start: 1990, end: 2020, seed: 346, amp: 400 });

// DWP / DfT
const dwpOldAge = wbS({ id: "dwp-oldage-dependency", title: "Old-age dependency ratio", subtitle: "People 65+ per 100 of working age", good: "down", format: fmt0, source: "World Bank (UN)", code: "SP.POP.DPND.OL", anchors: [[1990, 24], [2000, 24], [2010, 25], [2020, 29], [2022, 30]], start: 1990, end: 2022, seed: 347, amp: 0.1 });
const dwpFemaleLF = wbS({ id: "dwp-female-participation", title: "Female labour participation", subtitle: "% of female population 15+", good: "up", unit: "percent", format: fmtPct, source: "World Bank (ILO)", code: "SL.TLF.CACT.FE.ZS", anchors: [[1990, 53], [2000, 55], [2010, 56], [2019, 58], [2022, 58]], start: 1990, end: 2022, seed: 348, amp: 0.2 });
const dwpGini = wbS({ id: "dwp-gini", title: "Income inequality (Gini)", subtitle: "Gini index (0 = equal, 100 = unequal)", good: "down", format: fmt1, source: "World Bank", code: "SI.POV.GINI", anchors: [[1990, 34], [2000, 38], [2010, 34], [2017, 35]], start: 1990, end: 2018, seed: 349, amp: 0.2 });
const dwpYouthUnemp = wbS({ id: "dwp-youth-unemp", title: "Youth unemployment", subtitle: "Unemployment, ages 15–24 (%)", good: "down", unit: "percent", format: fmtPct, source: "World Bank (ILO)", code: "SL.UEM.1524.ZS", anchors: [[1991, 14], [2000, 12], [2011, 21], [2019, 11], [2022, 10]], start: 1991, end: 2022, seed: 350, amp: 0.3 });
const dftCo2 = wbS({ id: "dft-co2-pc", title: "CO₂ emissions per person", subtitle: "Tonnes per person, per year", good: "down", format: fmt1, source: "World Bank", code: "EN.ATM.CO2E.PC", anchors: [[1990, 9.7], [2000, 9.0], [2010, 7.5], [2019, 5.2], [2020, 4.9]], start: 1990, end: 2020, seed: 351, amp: 0.05 });

// ============================================================
// Registry
// ============================================================
export const departments: Department[] = [
  {
    code: "dhsc",
    name: "DHSC",
    spendBn: 190,
    fullName: "Health & Social Care",
    blurb:
      "Decades of monthly data on how the department is performing against its stated objectives. Headline numbers in context, not in isolation.",
    rating: "C+",
    synthesis:
      "Waiting list has stopped growing but remains near record highs. The 18-week standard has not been met for a decade and the social-care discharge bottleneck is structural. Agency spend has eased since the 2023 peak; capital delivery is worsening.",
    themes: ["Waiting list", "Urgent care", "Workforce", "Capital"],
    hero: waitingList,
    core: [rtt18Week, dischargeDelays, agencySpend, capitalOverrun],
    supporting: [aePerformance, clinicalPer1000, hospitalBeds, healthSpendGdp, dhscHealthSpendPc, infantMortality, dhscSuicide, dhscMeasles, dhscOop, turnover, vacancyRate, lifeExpectancy],
  },
  {
    code: "dfe",
    name: "DfE",
    spendBn: 90,
    fullName: "Education",
    blurb:
      "How the schools system is performing on the measures that families and economists both care about: outcomes, retention, financial sustainability, and pipeline.",
    rating: "D+",
    synthesis:
      "The disadvantaged attainment gap has widened back beyond its pre-2019 level. Early-career attrition is structurally higher than a decade ago, training recruitment is missing target by a third, and high-needs deficits are compounding.",
    themes: ["Attainment", "Workforce", "Funding", "Pipeline"],
    hero: dfeAttainmentGap,
    core: [dfeEctAttrition, dfeDsgDeficit, dfeTeacherRecruitment],
    supporting: [dfeEduSpendGdp, dfePupilTeacher, dfeTertiary],
  },
  {
    code: "home-office",
    name: "Home Office",
    spendBn: 22,
    fullName: "Home Office",
    pageTitle: "Home Office",
    blurb:
      "Operational throughput on the highest-volume, highest-salience flows: asylum, visas, and the costs of contingency.",
    rating: "D",
    synthesis:
      "The legacy asylum backlog has cleared, but new intake keeps the headline above its 2010s baseline. Hotel run-rate has fallen from the 2023 peak but remains an order of magnitude above pre-2019. Visa SLAs are recovering.",
    themes: ["Throughput", "Workforce", "Value for money", "Service standard"],
    hero: hoAsylumBacklog,
    core: [hoCaseworkerTurnover, hoHotelSpend, hoVisaSla],
    supporting: [hoHomicideRate, hoMigrantStock],
  },
  {
    code: "moj",
    name: "MoJ",
    spendBn: 12,
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
    spendBn: 55,
    fullName: "Defence",
    blurb:
      "Whether the armed forces are at the size, mix, and readiness that the National Security Strategy requires, and whether equipment programmes deliver on time and on budget.",
    rating: "D",
    synthesis:
      "Manning is below requirement across all three services. Voluntary outflow in critical trades has accelerated since Ukraine. The equipment programme remains structurally unaffordable; the IPA portfolio overruns are rising.",
    themes: ["People", "Procurement", "Readiness", "Affordability"],
    hero: modPersonnelShortfall,
    core: [modVoluntaryOutflow, modProcurement, modReadiness],
    supporting: [modDefenceSpendGdp, modPersonnel],
  },
  {
    code: "dwp",
    name: "DWP",
    spendBn: 250,
    fullName: "Work & Pensions",
    blurb:
      "Whether claimants get decisions promptly, whether work coaches have manageable caseloads, and whether the system is losing money to fraud and error.",
    rating: "C-",
    synthesis:
      "PIP clearance has improved from its 2022 peak but remains over twice its 2014 baseline. Work coach ratios are double the pre-UC norm. Fraud and error is structurally elevated since the Covid easements.",
    themes: ["Speed", "Capacity", "Integrity", "Backlog"],
    hero: dwpPipDays,
    core: [dwpWorkCoach, dwpFraudError, dwpUcMr],
    supporting: [dwpPop65, dwpOldAge, dwpFemaleLF, dwpGini, dwpYouthUnemp],
  },
  {
    code: "dft",
    name: "DfT",
    spendBn: 28,
    fullName: "Transport",
    blurb:
      "Daily reliability and long-term asset health: cancellations passengers see, agency backlogs drivers see, and capital programmes taxpayers pay for.",
    rating: "D+",
    synthesis:
      "Rail cancellation scores have not returned to pre-pandemic norms. DVLA has recovered most of its 2021 backlog. Capital portfolio overruns have ballooned; SRN pavement condition is deteriorating.",
    themes: ["Reliability", "Service", "Delivery", "Assets"],
    hero: dftCancellations,
    core: [dftDvlaBacklog, dftCapitalOverrun, dftSrnDegradation],
    supporting: [dftRoadDeathRate, dftCo2],
  },
  {
    code: "treasury",
    name: "HMT",
    spendBn: 105,
    fullName: "Treasury",
    pageTitle: "HM Treasury",
    blurb:
      "The economy and the public finances: living standards people actually feel, the cost of the national debt, and how much tax is taken in total. Sized here by debt interest, the Treasury's largest direct outlay.",
    rating: "D",
    synthesis:
      "Real incomes per head have barely grown since 2008 and pay has lagged prices through the cost-of-living crisis. Debt is near 100% of GDP and debt interest has surged with rates. The tax burden is its highest since the 1940s, while productivity — the ultimate driver of pay and receipts — has flatlined.",
    themes: ["Living standards", "Debt", "Tax", "Cost of living"],
    hero: hmtGdpPerCapita,
    core: [hmtCostOfLiving, hmtDebt, hmtDebtCash, hmtTaxBurden, hmtDebtInterest],
    supporting: [hmtUnemployment, hmtGdpGrowth, hmtEmployment, hmtParticipation, hmtInvestment, hmtTrade, hmtSavings, hmtCurrentAccount, hmtGniPerCapita, hmtRealIncome, hmtProductivity, hmtTaxSplit, hmtDeficit],
  },
];

export function getDepartment(code: string): Department | undefined {
  return departments.find((d) => d.code === code);
}
