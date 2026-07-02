import {
  agencySpend,
  aePerformance,
  ambulanceC2,
  capitalOverrun,
  clinicalPer1000,
  dischargeDelays,
  healthSpendGdp,
  hospitalBeds,
  infantMortality,
  lifeExpectancy,
  ratioSeries,
  realLine,
  realPoints,
  rtt18Week,
  turnover,
  vacancyRate,
  waitingList,
  type TrendSeries,
} from "./data";

export type Department = {
  code: string; // url slug
  name: string; // short, for tab
  fullName: string;
  pageTitle?: string; // H1 override; defaults to `Department for {fullName}`
  blurb: string;
  synthesis: string;
  themes: string[];
  // Approximate Total Managed Expenditure, £bn (HMT Public Spending Statistics /
  // PESA, 2025-26 — real outturn-basis figures, used only to size treemap tiles).
  // HMT is sized by debt interest (its largest direct outlay; see blurb).
  spendBn: number;
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

// International peer set for World Bank comparator charts. Keep in sync with
// WB_PEERS in scripts/build-data.mjs. The chart shows the UK line alone until
// CI bakes the per-country data (TrendPanel drops empty lines).
const WB_PEERS: { code: string; label: string }[] = [
  { code: "deu", label: "Germany" },
  { code: "fra", label: "France" },
];
function wbLines(id: string): TrendSeries["lines"] {
  return [
    { id: "gbr", label: "UK", points: realLine(id, "gbr") },
    ...WB_PEERS.map((p) => ({
      id: p.code,
      label: p.label,
      points: realLine(id, p.code),
    })),
  ];
}

// ============================================================
// DfE — Department for Education
// ============================================================
const dfeAttainmentGap: TrendSeries = {
  id: "dfe-attainment-gap",
  title: "Disadvantaged attainment gap",
  subtitle: "KS4 disadvantage gap index (higher = wider gap)",
  coverage: "England",
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
  points: realPoints("dfe-attainment-gap"),
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
  source: "DfE School Workforce in England (EES)",
  sourceUrl:
    "https://explore-education-statistics.service.gov.uk/find-statistics/school-workforce-in-england",
  cadence: "annual",
  points: realPoints("dfe-ect-attrition"),
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
  points: realPoints("dfe-dsg-deficit"),
  annotations: [
    { date: "2023-01-01", label: "Statutory override extended" },
  ],
};

const dfeTeacherRecruitment: TrendSeries = {
  id: "dfe-teacher-recruitment",
  title: "Teacher training recruitment",
  subtitle: "Postgraduate ITT enrolments vs target (%)",
  coverage: "England",
  unit: "percent",
  format: fmtPct,
  shortFormat: fmtPct,
  goodDirection: "up",
  target: { value: 100, label: "100% of target" },
  source: "DfE ITT Census (EES)",
  sourceUrl:
    "https://explore-education-statistics.service.gov.uk/find-statistics/initial-teacher-training-census",
  cadence: "annual",
  points: realPoints("dfe-teacher-recruitment"),
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
  points: realPoints("ho-asylum-backlog"),
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
  points: realPoints("ho-caseworker-turnover"),
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
  points: realPoints("ho-hotel-spend"),
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
  points: realPoints("ho-visa-sla"),
  annotations: [
    { date: "2022-03-01", label: "Ukraine schemes surge" },
  ],
};

// % of recorded crimes resulting in a charge or summons — the "police don't
// solve crimes" grievance. Collapsed from ~16% (2015) to ~7%.
const hoChargeRate: TrendSeries = {
  id: "ho-charge-rate",
  title: "Crimes resulting in a charge",
  subtitle: "% of recorded offences with a charge or summons",
  unit: "percent",
  format: fmtPct,
  shortFormat: fmtPct,
  goodDirection: "up",
  source: "Home Office, police recorded crime & outcomes open data",
  sourceUrl:
    "https://www.gov.uk/government/statistical-data-sets/police-recorded-crime-and-outcomes-open-data-tables",
  cadence: "annual",
  points: realPoints("ho-charge-rate"),
  annotations: [],
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
  points: realPoints("moj-crown-backlog"),
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
  points: realPoints("moj-officer-resignations"),
  annotations: [
    { date: "2017-09-01", label: "Pay & retention crisis" },
  ],
};

const mojCostPerPrisoner: TrendSeries = {
  id: "moj-cost-per-prisoner",
  vfm: true,
  title: "Average cost per prisoner",
  subtitle: "Direct + overheads, real terms £/yr",
  coverage: "England & Wales",
  basis: "real terms",
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
  points: realPoints("moj-cost-per-prisoner"),
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
  points: realPoints("moj-completion-days"),
  annotations: [
    { date: "2020-03-01", label: "Covid-19", break: true },
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
  points: realPoints("mod-personnel-shortfall"),
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
  points: realPoints("mod-voluntary-outflow"),
  annotations: [],
};

const modProcurement: TrendSeries = {
  id: "mod-procurement",
  lens: "process",
  vfm: true,
  title: "MoD major projects delivery confidence",
  subtitle: "% of MoD GMPP projects rated Amber/Red or Red",
  unit: "percent",
  format: fmtPct,
  shortFormat: fmtPct,
  goodDirection: "down",
  target: { value: 0, label: "None at risk" },
  source: "IPA/NISTA Government Major Projects Portfolio",
  sourceUrl:
    "https://www.gov.uk/government/collections/major-projects-data",
  cadence: "annual",
  points: realPoints("mod-procurement"),
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
  points: realPoints("mod-readiness"),
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
  points: realPoints("dwp-pip-clearance"),
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
  points: realPoints("dwp-work-coach-ratio"),
  annotations: [
    { date: "2020-03-01", label: "UC surge" },
  ],
};

const dwpFraudError: TrendSeries = {
  id: "dwp-fraud-error",
  vfm: true,
  title: "Fraud & error in benefit spend",
  subtitle: "Overpayments as % of total benefit expenditure",
  unit: "percent",
  format: fmtPct,
  shortFormat: fmtPct,
  goodDirection: "down",
  // reference baseline (not a statutory target): ~2017-18 pre-Covid overpayment rate
  target: { value: 1.9, label: "2017-18 level", kind: "reference" },
  source: "DWP fraud and error in the benefit system",
  sourceUrl:
    "https://www.gov.uk/government/collections/fraud-and-error-in-the-benefit-system",
  cadence: "annual",
  points: realPoints("dwp-fraud-error"),
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
  points: realPoints("dwp-uc-mr"),
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
  // reference baseline (not a target): 2018-19 ORR cancellation-score level
  target: { value: 3.0, label: "2018-19 level", kind: "reference" },
  source: "Office of Rail and Road, cancellation statistics",
  sourceUrl: "https://dataportal.orr.gov.uk/statistics/performance/passenger-rail-performance/",
  cadence: "monthly",
  points: realPoints("dft-rail-cancellations"),
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
  points: realPoints("dft-dvla-backlog"),
  annotations: [
    { date: "2021-06-01", label: "Industrial action + Covid" },
  ],
};

const dftCapitalOverrun: TrendSeries = {
  id: "dft-capital-overrun",
  vfm: true,
  title: "DfT major projects delivery confidence",
  subtitle: "% of DfT GMPP projects rated Amber/Red or Red",
  unit: "percent",
  format: fmtPct,
  shortFormat: fmtPct,
  goodDirection: "down",
  target: { value: 0, label: "None at risk" },
  source: "IPA/NISTA Government Major Projects Portfolio",
  sourceUrl:
    "https://www.gov.uk/government/collections/major-projects-data",
  cadence: "annual",
  points: realPoints("dft-capital-overrun"),
  annotations: [
    { date: "2023-10-01", label: "HS2 northern leg cancelled" },
  ],
};

const dftSrnDegradation: TrendSeries = {
  id: "dft-srn-degradation",
  title: "Strategic road network condition",
  subtitle: "% of SRN pavement in good condition (target ≥96.2%)",
  unit: "percent",
  format: fmtPct,
  shortFormat: fmtPct,
  goodDirection: "up",
  source: "Office of Rail and Road — annual assessment of National Highways (Table 3a)",
  sourceUrl:
    "https://www.orr.gov.uk/monitoring-and-regulation/roads-monitoring/annual-assessment-national-highways",
  cadence: "annual",
  points: realPoints("dft-srn-degradation"),
  annotations: [{ date: "2020-01-01", label: "Road period 2 begins" }],
};

// ============================================================
// HM Treasury — economy & public finances
// ============================================================
const hmtGdpPerCapita: TrendSeries = {
  id: "hmt-gdp-per-capita",
  title: "Real GDP per head",
  subtitle: "Chained-volume £ per person",
  coverage: "UK",
  basis: "real terms (chained volume)",
  unit: "currency",
  format: fmtGbpHead,
  shortFormat: fmtGbpHeadShort,
  yFormat: fmtGbpHeadShort,
  deltaFormat: (v) => `${v > 0 ? "+" : ""}£${Math.round(v).toLocaleString("en-GB")}`,
  goodDirection: "up",
  source: "ONS quarterly national accounts",
  sourceUrl: "https://www.ons.gov.uk/economy/grossdomesticproductgdp",
  cadence: "annual",
  points: realPoints("hmt-gdp-per-capita"),
  annotations: [
    { date: "2008-01-01", label: "Financial crisis" },
    { date: "2020-01-01", label: "Covid-19", break: true },
  ],
};

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
  points: realLine("hmt-cost-of-living", "cpi"),
  lines: [
    { id: "cpi", label: "CPI inflation", points: realLine("hmt-cost-of-living", "cpi") },
    { id: "wages", label: "Pay growth", points: realLine("hmt-cost-of-living", "wages") },
  ],
  annotations: [{ date: "2022-01-01", label: "Cost-of-living crisis" }],
};

const hmtRealIncome: TrendSeries = {
  id: "hmt-real-income",
  title: "Real household income per head",
  subtitle: "Real households' disposable income, £ per person",
  coverage: "UK",
  basis: "real terms",
  unit: "currency",
  format: fmtGbpHead,
  shortFormat: fmtGbpHeadShort,
  yFormat: fmtGbpHeadShort,
  deltaFormat: (v) => `${v > 0 ? "+" : ""}£${Math.round(v).toLocaleString("en-GB")}`,
  goodDirection: "up",
  source: "ONS real households' disposable income",
  sourceUrl: "https://www.ons.gov.uk/economy/nationalaccounts",
  cadence: "annual",
  points: realPoints("hmt-real-income"),
  annotations: [],
};

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
  points: realPoints("hmt-productivity"),
  annotations: [{ date: "2008-01-01", label: "Productivity stalls" }],
};

const hmtDebt: TrendSeries = {
  id: "hmt-psnd",
  title: "Public sector net debt",
  subtitle: "% of GDP",
  unit: "percent",
  format: fmtPct,
  shortFormat: fmtPctWhole,
  yFormat: fmtPctWhole,
  goodDirection: "down",
  // reference baseline (not current policy): the former Sustainable Investment
  // Rule 40%-of-GDP debt ceiling (pre-2008), shown as a historical marker
  target: { value: 40, label: "Former 40% ceiling (pre-2008)", kind: "reference" },
  source: "ONS / OBR public sector finances",
  sourceUrl:
    "https://www.ons.gov.uk/economy/governmentpublicsectorandtaxes/publicsectorfinance",
  cadence: "annual",
  points: realPoints("hmt-psnd"),
  annotations: [
    { date: "2008-01-01", label: "Bank bailouts" },
    { date: "2020-01-01", label: "Covid-19", break: true },
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
  // No target: £3tn was just a round marker above the current level, which made
  // record debt score green. Scored on its own range instead (record high = red).
  source: "ONS / OBR public sector finances",
  sourceUrl:
    "https://www.ons.gov.uk/economy/governmentpublicsectorandtaxes/publicsectorfinance",
  cadence: "annual",
  // Stored in £ billion; formatted as £ trillion.
  points: realPoints("hmt-psnd-cash"),
  annotations: [
    { date: "2008-01-01", label: "Financial crisis" },
    { date: "2020-01-01", label: "Covid-19", break: true },
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
  points: realPoints("hmt-unemployment"),
  annotations: [
    { date: "1984-01-01", label: "Deindustrialisation" },
    { date: "2008-01-01", label: "Financial crisis" },
    { date: "2020-01-01", label: "Covid-19", break: true },
  ],
};

const hmtDebtInterest: TrendSeries = {
  id: "hmt-debt-interest",
  vfm: true,
  title: "Debt interest",
  subtitle: "Debt interest as % of government revenue",
  unit: "percent",
  format: fmtPct,
  shortFormat: fmtPct,
  goodDirection: "down",
  source: "World Bank (IMF GFS)",
  sourceUrl: "https://data.worldbank.org/indicator/GC.XPN.INTP.RV.ZS?locations=GB",
  cadence: "annual",
  points: realPoints("hmt-debt-interest"),
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
  points: realPoints("hmt-tax-burden"),
  annotations: [{ date: "2024-01-01", label: "Highest since 1948" }],
};

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
  points: realLine("hmt-tax-split", "direct"),
  lines: [
    { id: "direct", label: "Direct (income tax + NI)", points: realLine("hmt-tax-split", "direct") },
    { id: "indirect", label: "Indirect (VAT + duties)", points: realLine("hmt-tax-split", "indirect") },
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
  points: realPoints("hmt-deficit"),
  annotations: [
    { date: "2009-01-01", label: "Deficit peak" },
    { date: "2020-01-01", label: "Covid-19", break: true },
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
  points: realPoints("dfe-edu-spend-gdp"),
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
  points: realPoints("dfe-pupil-teacher"),
  annotations: [],
};

const hoHomicideRate: TrendSeries = {
  id: "ho-homicide-rate",
  title: "Homicide rate",
  unit: "count",
  format: fmt1,
  shortFormat: fmt1,
  yFormat: fmt1,
  goodDirection: "down",
  source: "World Bank (UNODC)",
  sourceUrl: "https://data.worldbank.org/indicator/VC.IHR.PSRC.P5?locations=GB",
  subtitle: "Intentional homicides per 100,000 people — UK vs Germany & France",
  cadence: "annual",
  points: realLine("ho-homicide-rate", "gbr"),
  lines: wbLines("ho-homicide-rate"),
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
  points: realPoints("mod-defence-spend-gdp"),
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
  points: realPoints("dwp-pop-65"),
  annotations: [],
};

const dftRoadDeathRate: TrendSeries = {
  id: "dft-road-death-rate",
  title: "Road deaths per 100,000",
  subtitle: "Mortality from road traffic injury, per 100,000 — UK vs Germany & France",
  unit: "count",
  format: fmt1,
  shortFormat: fmt1,
  yFormat: fmt1,
  goodDirection: "down",
  source: "World Bank (WHO)",
  sourceUrl: "https://data.worldbank.org/indicator/SH.STA.TRAF.P5?locations=GB",
  cadence: "annual",
  points: realLine("dft-road-death-rate", "gbr"),
  lines: wbLines("dft-road-death-rate"),
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
  target?: { value: number; label: string; kind?: "standard" | "reference" };
  source: string;
  code: string;
  anchors: [number, number][];
  start: number;
  end: number;
  seed: number;
  amp: number;
  annotations?: TrendSeries["annotations"];
  // When true, draw UK vs international peers (CI bakes a { gbr, deu, fra }
  // multi-line series for this id via wbCompare in build-data.mjs).
  compare?: boolean;
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
    coverage: o.compare ? "UK vs Germany & France" : "UK",
    cadence: "annual",
    points: o.compare
      ? realLine(o.id, "gbr")
      : realPoints(o.id),
    lines: o.compare ? wbLines(o.id) : undefined,
    annotations: o.annotations ?? [],
  };
}

// Treasury / economy
const hmtGdpGrowth = wbS({ id: "hmt-gdp-growth", title: "GDP growth", subtitle: "Real GDP, annual % change", good: "up", unit: "percent", format: fmtPct, source: "World Bank", code: "NY.GDP.MKTP.KD.ZG", anchors: [[1990, 0.7], [2000, 3.2], [2009, -4.6], [2010, 2.2], [2020, -10.3], [2021, 8.6], [2023, 0.3]], start: 1990, end: 2023, seed: 331, amp: 0.3, annotations: [{ date: "2009-01-01", label: "Financial crisis" }, { date: "2020-01-01", label: "Covid-19", break: true }] });
const hmtInvestment = wbS({ id: "hmt-investment-gdp", title: "Investment", subtitle: "Gross capital formation, % of GDP", good: "up", unit: "percent", format: fmtPct, source: "World Bank", code: "NE.GDI.TOTL.ZS", anchors: [[1990, 22], [2000, 18], [2010, 16], [2019, 17.5], [2022, 18]], start: 1990, end: 2022, seed: 332, amp: 0.3 });
const hmtCurrentAccount = wbS({ id: "hmt-current-account", title: "Current account balance", subtitle: "% of GDP", good: "up", unit: "percent", format: fmtPct, source: "World Bank", code: "BN.CAB.XOKA.GD.ZS", anchors: [[1990, -3.4], [2000, -2.2], [2010, -2.7], [2016, -5.2], [2022, -3.1]], start: 1990, end: 2022, seed: 333, amp: 0.3 });
const hmtEmployment = wbS({ id: "hmt-employment-rate", title: "Employment rate", subtitle: "Employment-to-population, 15+ (%)", good: "up", unit: "percent", format: fmtPct, source: "World Bank (ILO)", code: "SL.EMP.TOTL.SP.ZS", anchors: [[1991, 57], [2000, 58], [2010, 57], [2019, 60], [2022, 59]], start: 1991, end: 2022, seed: 334, amp: 0.3 });
const hmtParticipation = wbS({ id: "hmt-participation", title: "Labour force participation", subtitle: "% of population 15+", good: "up", unit: "percent", format: fmtPct, source: "World Bank (ILO)", code: "SL.TLF.CACT.ZS", anchors: [[1990, 62], [2000, 62], [2010, 62], [2019, 63], [2022, 62]], start: 1990, end: 2022, seed: 335, amp: 0.3 });
const hmtTrade = wbS({ id: "hmt-trade-gdp", title: "Trade openness", subtitle: "Trade (exports + imports), % of GDP", good: "up", unit: "percent", format: fmtPct, source: "World Bank", code: "NE.TRD.GNFS.ZS", anchors: [[1990, 46], [2000, 55], [2010, 58], [2019, 63], [2022, 70]], start: 1990, end: 2022, seed: 336, amp: 0.5 });
const hmtSavings = wbS({ id: "hmt-savings", title: "Gross savings", subtitle: "% of GDP", good: "up", unit: "percent", format: fmtPct, source: "World Bank", code: "NY.GNS.ICTR.ZS", anchors: [[1990, 17], [2000, 15], [2010, 13], [2019, 14], [2022, 15]], start: 1990, end: 2022, seed: 337, amp: 0.3 });
const hmtGniPerCapita = wbS({ id: "hmt-gni-per-capita", title: "GNI per head (PPP)", subtitle: "Gross national income per person, PPP $ — UK vs Germany & France", good: "up", unit: "currency", format: fmtUsd, shortFormat: fmtUsdK, yFormat: fmtUsdK, source: "World Bank", code: "NY.GNP.PCAP.PP.CD", anchors: [[1990, 16000], [2000, 27000], [2010, 38000], [2019, 48000], [2022, 49000]], start: 1990, end: 2022, seed: 338, amp: 100, compare: true });

// DHSC
const dhscHealthSpendPc = wbS({ id: "dhsc-health-spend-pc", title: "Health spending per person", subtitle: "Current health expenditure, $ per person — UK vs Germany & France", good: "up", unit: "currency", format: fmtUsd, shortFormat: fmtUsdK, yFormat: fmtUsdK, source: "World Bank (WHO)", code: "SH.XPD.CHEX.PC.CD", anchors: [[2000, 1700], [2010, 3500], [2019, 4500], [2021, 5400]], start: 2000, end: 2021, seed: 340, amp: 20, compare: true });
// Value-for-money: dollars of annual health spend per year of life expectancy.
// A crude allocative-efficiency proxy — rising means each pound buys less
// longevity. Real wherever both inputs are real (WB health spend + ONS life
// tables), so it never fabricates: derivedFrom drives the provenance badge.
const dhscSpendPerLifeYear = ratioSeries({
  id: "dhsc-spend-per-life-year",
  title: "Health spend per year of life",
  subtitle: "Annual health spend ($/person) ÷ life expectancy — lower = more longevity per $",
  num: dhscHealthSpendPc,
  den: lifeExpectancy,
  unit: "currency",
  format: (v) => `$${Math.round(v)}`,
  shortFormat: (v) => `$${Math.round(v)}`,
  yFormat: (v) => `$${Math.round(v)}`,
  deltaFormat: (v) => `${v > 0 ? "+" : ""}$${Math.round(v)}`,
  goodDirection: "down",
  vfm: true,
  source: "World Bank (WHO) ÷ ONS national life tables",
  sourceUrl: "https://data.worldbank.org/indicator/SH.XPD.CHEX.PC.CD?locations=GB",
});

const dhscSuicide = wbS({ id: "dhsc-suicide", title: "Suicide rate", subtitle: "Per 100,000 people", good: "down", format: fmt1, source: "World Bank (WHO)", code: "SH.STA.SUIC.P5", anchors: [[2000, 9.5], [2010, 7.0], [2016, 7.6], [2019, 7.5]], start: 2000, end: 2019, seed: 341, amp: 0.08 });
const dhscMeasles = wbS({ id: "dhsc-measles-imm", title: "Measles immunisation", subtitle: "% of children immunised", good: "up", unit: "percent", format: fmt0, source: "World Bank (WHO/UNICEF)", code: "SH.IMM.MEAS", anchors: [[1990, 87], [2000, 88], [2010, 93], [2019, 91], [2021, 90]], start: 1990, end: 2021, seed: 342, amp: 0.2 });
const dhscOop = wbS({ id: "dhsc-oop", title: "Out-of-pocket health costs", subtitle: "% of total health spending", good: "down", unit: "percent", format: fmtPct, source: "World Bank (WHO)", code: "SH.XPD.OOPC.CH.ZS", anchors: [[2000, 18], [2010, 16], [2019, 17], [2021, 14]], start: 2000, end: 2021, seed: 343, amp: 0.2 });

// DfE / Home Office / MoD
const dfeTertiary = wbS({ id: "dfe-tertiary-enrol", title: "University participation", subtitle: "Tertiary enrolment, % gross", good: "up", unit: "percent", format: fmt0, source: "World Bank (UNESCO)", code: "SE.TER.ENRR", anchors: [[1990, 30], [2000, 58], [2010, 59], [2019, 66], [2020, 70]], start: 1990, end: 2020, seed: 344, amp: 0.4 });
const dfeSpendPerPupil = wbS({ id: "dfe-spend-per-pupil", title: "Spending per primary pupil", subtitle: "Govt expenditure per pupil, % of GDP per head — UK vs Germany & France", good: "up", unit: "percent", format: fmt0, source: "World Bank (UNESCO)", code: "SE.XPD.PRIM.PC.ZS", anchors: [[2000, 18], [2010, 22], [2015, 23], [2019, 22], [2020, 24]], start: 2000, end: 2020, seed: 352, amp: 0.2, compare: true });
const hoMigrantStock = wbS({ id: "ho-migrant-stock", title: "Foreign-born population", subtitle: "International migrant stock, % of population", good: "up", unit: "percent", format: fmtPct, source: "World Bank (UN)", code: "SM.POP.TOTL.ZS", anchors: [[1990, 6.4], [2000, 7.9], [2010, 11.3], [2015, 13.2], [2020, 13.8]], start: 1990, end: 2020, seed: 345, amp: 0.05 });
const modPersonnel = wbS({ id: "mod-personnel-total", title: "Armed forces personnel", subtitle: "Total military personnel", good: "up", format: fmtThousands, shortFormat: fmtK, yFormat: fmtK, source: "World Bank (IISS)", code: "MS.MIL.TOTL.P1", anchors: [[1990, 308000], [2000, 212000], [2010, 197000], [2019, 156000], [2020, 153000]], start: 1990, end: 2020, seed: 346, amp: 400 });

// DWP / DfT
const dwpOldAge = wbS({ id: "dwp-oldage-dependency", title: "Old-age dependency ratio", subtitle: "People 65+ per 100 of working age", good: "down", format: fmt0, source: "World Bank (UN)", code: "SP.POP.DPND.OL", anchors: [[1990, 24], [2000, 24], [2010, 25], [2020, 29], [2022, 30]], start: 1990, end: 2022, seed: 347, amp: 0.1 });
const dwpFemaleLF = wbS({ id: "dwp-female-participation", title: "Female labour participation", subtitle: "% of female population 15+", good: "up", unit: "percent", format: fmtPct, source: "World Bank (ILO)", code: "SL.TLF.CACT.FE.ZS", anchors: [[1990, 53], [2000, 55], [2010, 56], [2019, 58], [2022, 58]], start: 1990, end: 2022, seed: 348, amp: 0.2 });
const dwpGini = wbS({ id: "dwp-gini", title: "Income inequality (Gini)", subtitle: "Gini index (0 = equal, 100 = unequal) — UK vs Germany & France", good: "down", format: fmt1, source: "World Bank", code: "SI.POV.GINI", anchors: [[1990, 34], [2000, 38], [2010, 34], [2017, 35]], start: 1990, end: 2018, seed: 349, amp: 0.2, compare: true });
const dwpYouthUnemp = wbS({ id: "dwp-youth-unemp", title: "Youth unemployment", subtitle: "Unemployment, ages 15–24 (%)", good: "down", unit: "percent", format: fmtPct, source: "World Bank (ILO)", code: "SL.UEM.1524.ZS", anchors: [[1991, 14], [2000, 12], [2011, 21], [2019, 11], [2022, 10]], start: 1991, end: 2022, seed: 350, amp: 0.3 });
const dftCo2 = wbS({ id: "dft-co2-pc", title: "CO₂ emissions per person", subtitle: "Tonnes per person, per year — UK vs Germany & France", good: "down", format: fmt1, source: "World Bank", code: "EN.ATM.CO2E.PC", anchors: [[1990, 9.7], [2000, 9.0], [2010, 7.5], [2019, 5.2], [2020, 4.9]], start: 1990, end: 2020, seed: 351, amp: 0.05, compare: true });

// ============================================================
// MHCLG — Housing, Communities & Local Government
// ============================================================
const mhclgTempAccom: TrendSeries = {
  id: "mhclg-temp-accommodation",
  title: "Households in temporary accommodation",
  subtitle: "Households housed in TA at quarter-end, England",
  unit: "count",
  format: fmtThousands,
  shortFormat: fmtK,
  yFormat: fmtK,
  deltaFormat: fmtThousandsSigned,
  goodDirection: "down",
  source: "MHCLG statutory homelessness live tables (TA1)",
  sourceUrl: "https://www.gov.uk/government/statistical-data-sets/live-tables-on-homelessness",
  cadence: "quarterly",
  points: realPoints("mhclg-temp-accommodation"),
  annotations: [{ date: "2020-01-01", label: "Covid-19", break: true }],
};

const mhclgNetDwellings: TrendSeries = {
  id: "mhclg-net-dwellings",
  title: "New homes added",
  subtitle: "Net additional dwellings per year, England",
  unit: "count",
  format: fmtThousands,
  shortFormat: fmtK,
  yFormat: fmtK,
  deltaFormat: fmtThousandsSigned,
  goodDirection: "up",
  target: { value: 300000, label: "300k/yr target", kind: "standard" },
  source: "MHCLG housing supply: net additional dwellings",
  sourceUrl: "https://www.gov.uk/government/collections/net-supply-of-housing",
  cadence: "annual",
  points: realPoints("mhclg-net-dwellings"),
  annotations: [],
};

const mhclgAffordability: TrendSeries = {
  id: "mhclg-affordability",
  title: "Housing affordability",
  subtitle: "Median house price ÷ median gross annual earnings, England",
  unit: "count",
  format: (v) => `${v.toFixed(1)}×`,
  shortFormat: (v) => `${v.toFixed(1)}×`,
  yFormat: (v) => `${v.toFixed(0)}×`,
  deltaFormat: (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}×`,
  goodDirection: "down",
  source: "ONS house price to workplace-based earnings ratio",
  sourceUrl:
    "https://www.ons.gov.uk/peoplepopulationandcommunity/housing/datasets/ratioofhousepricetoworkplacebasedearningslowerquartileandmedian",
  cadence: "annual",
  points: realPoints("mhclg-affordability"),
  annotations: [],
};

// ============================================================
// Defra — Environment, Food & Rural Affairs
// ============================================================
const defraSewage: TrendSeries = {
  id: "defra-sewage-hours",
  title: "Sewage spill hours",
  subtitle: "Storm overflow spill duration, England, million hours/yr",
  unit: "count",
  format: (v) => `${(v / 1e6).toFixed(2)}m hrs`,
  shortFormat: (v) => `${(v / 1e6).toFixed(1)}m`,
  yFormat: (v) => `${(v / 1e6).toFixed(1)}m`,
  deltaFormat: (v) => `${v > 0 ? "+" : ""}${(v / 1e6).toFixed(2)}m`,
  goodDirection: "down",
  source: "Environment Agency storm overflow EDM annual returns",
  sourceUrl: "https://www.gov.uk/government/statistics/storm-overflow-spill-data",
  cadence: "annual",
  points: realPoints("defra-sewage-hours"),
  annotations: [],
};

const defraBathingWater: TrendSeries = {
  id: "defra-bathing-water",
  title: "Bathing water quality",
  subtitle: "% of designated bathing waters rated Good or Excellent, England",
  unit: "percent",
  format: fmtPct,
  shortFormat: fmtPct,
  goodDirection: "up",
  source: "Defra / Environment Agency bathing water classifications",
  sourceUrl: "https://www.gov.uk/government/statistics/bathing-water-quality-statistics",
  cadence: "annual",
  points: realPoints("defra-bathing-water"),
  annotations: [{ date: "2024-01-01", label: "Stricter classification" }],
};

const defraRecycling: TrendSeries = {
  id: "defra-recycling",
  title: "Household recycling rate",
  subtitle: "% of household waste recycled, England",
  unit: "percent",
  format: fmtPct,
  shortFormat: fmtPct,
  goodDirection: "up",
  target: { value: 65, label: "65% by 2035", kind: "standard" },
  source: "Defra statistics on waste",
  sourceUrl: "https://www.gov.uk/government/statistics/uk-waste-data",
  cadence: "annual",
  points: realPoints("defra-recycling"),
  methodology:
    "Computed as (dry recycling + organic waste) ÷ total household waste collected, England, per year.",
  annotations: [],
};

const defraPm25 = wbS({
  id: "defra-pm25",
  title: "Air pollution (PM2.5)",
  subtitle: "Mean population exposure to fine particulates, µg/m³",
  good: "down",
  format: fmt1,
  source: "World Bank (OECD/IHME)",
  code: "EN.ATM.PM25.MC.M3",
  anchors: [[1990, 15], [2000, 13.5], [2010, 12], [2015, 11], [2017, 10.5]],
  start: 1990,
  end: 2019,
  seed: 414,
  amp: 0.1,
});

const defraForest = wbS({
  id: "defra-forest",
  title: "Woodland cover",
  subtitle: "Forest area, % of UK land area",
  good: "up",
  format: fmt1,
  source: "World Bank (FAO)",
  code: "AG.LND.FRST.ZS",
  anchors: [[1990, 11.5], [2000, 11.9], [2010, 12.9], [2020, 13.2]],
  start: 1990,
  end: 2021,
  seed: 415,
  amp: 0.05,
});

// ============================================================
// DESNZ — Department for Energy Security & Net Zero
// ============================================================
// Hero is real (World Bank renewables share). Territorial emissions and fuel
// poverty are wired to placeholders pending a gov.uk fetcher (see CLAUDE.md).
const desnzRenewables = wbS({ id: "desnz-renewables-share", title: "Renewable energy share", subtitle: "Renewables as % of total final energy consumption", good: "up", unit: "percent", format: fmtPct, source: "World Bank (IEA)", code: "EG.FEC.RNEW.ZS", anchors: [], start: 1990, end: 2021, seed: 401, amp: 0 });
const desnzEmissions: TrendSeries = {
  id: "desnz-ghg-emissions",
  title: "Greenhouse gas emissions",
  subtitle: "UK territorial emissions, million tonnes CO₂e (net zero by 2050)",
  unit: "count",
  format: (v) => `${Math.round(v)} Mt`,
  shortFormat: (v) => `${Math.round(v)}Mt`,
  goodDirection: "down",
  source: "DESNZ, Final UK greenhouse gas emissions national statistics",
  sourceUrl:
    "https://www.gov.uk/government/collections/final-uk-greenhouse-gas-emissions-national-statistics",
  cadence: "annual",
  points: realPoints("desnz-ghg-emissions"),
  annotations: [],
};
const desnzFuelPoverty: TrendSeries = {
  id: "desnz-fuel-poverty",
  title: "Households in fuel poverty",
  subtitle: "% of English households (Low Income Low Energy Efficiency)",
  unit: "percent",
  format: fmtPct,
  shortFormat: fmtPct,
  goodDirection: "down",
  source: "DESNZ, Annual Fuel Poverty Statistics",
  sourceUrl: "https://www.gov.uk/government/collections/fuel-poverty-statistics",
  cadence: "annual",
  points: realPoints("desnz-fuel-poverty"),
  annotations: [],
};

// ============================================================
// DSIT — Department for Science, Innovation & Technology
// ============================================================
const dsitRandD = wbS({ id: "dsit-rd-gdp", title: "R&D spending", subtitle: "Gross domestic R&D expenditure (GERD), % of GDP", good: "up", unit: "percent", format: fmtPct, target: { value: 2.4, label: "2.4% R&D-intensity target", kind: "standard" }, source: "World Bank (OECD/UNESCO)", code: "GB.XPD.RSDV.GD.ZS", anchors: [], start: 1996, end: 2021, seed: 411, amp: 0 });
const dsitResearchers = wbS({ id: "dsit-researchers", title: "Researchers in R&D", subtitle: "Researchers per million people", good: "up", unit: "count", format: fmtThousands, shortFormat: fmtK, yFormat: fmtK, source: "World Bank (OECD/UNESCO)", code: "SP.POP.SCIE.RD.P6", anchors: [], start: 1996, end: 2021, seed: 412, amp: 0 });
const dsitBroadband: TrendSeries = {
  id: "dsit-gigabit-broadband",
  title: "Gigabit broadband coverage",
  subtitle: "% of UK premises with gigabit-capable broadband available",
  unit: "percent",
  format: fmtPct,
  shortFormat: fmtPct,
  goodDirection: "up",
  source: "Ofcom, Connected Nations",
  sourceUrl:
    "https://www.ofcom.org.uk/phones-and-broadband/coverage-and-speeds/connected-nations-update",
  cadence: "annual",
  points: realPoints("dsit-gigabit-broadband"),
  annotations: [],
};

// ============================================================
// DBT — Department for Business & Trade
// ============================================================
const dbtExports = wbS({ id: "dbt-exports-gdp", title: "Exports", subtitle: "Exports of goods & services, % of GDP", good: "up", unit: "percent", format: fmtPct, source: "World Bank (ONS)", code: "NE.EXP.GNFS.ZS", anchors: [], start: 1990, end: 2023, seed: 421, amp: 0 });
const dbtHighTech = wbS({ id: "dbt-hightech-exports", title: "High-tech exports", subtitle: "% of manufactured exports", good: "up", unit: "percent", format: fmtPct, source: "World Bank (UN Comtrade)", code: "TX.VAL.TECH.MF.ZS", anchors: [], start: 1990, end: 2022, seed: 422, amp: 0 });
const dbtBusinessInvestment: TrendSeries = {
  id: "dbt-business-investment",
  title: "Business investment",
  subtitle: "UK business investment, £bn per quarter (chained volume, seasonally adjusted)",
  unit: "gbp",
  format: fmtGbpBn,
  shortFormat: fmtGbpBnShort,
  goodDirection: "up",
  source: "ONS, Business investment in the UK (series NPEL)",
  sourceUrl:
    "https://www.ons.gov.uk/economy/grossdomesticproductgdp/timeseries/npel/cxnv",
  cadence: "quarterly",
  points: realPoints("dbt-business-investment"),
  annotations: [],
};

// ============================================================
// DCMS — Department for Culture, Media & Sport
// ============================================================
const dcmsTourism = wbS({ id: "dcms-tourism-arrivals", title: "Inbound tourism", subtitle: "International tourist arrivals, millions", good: "up", unit: "count", format: (v) => `${(v / 1e6).toFixed(1)}m`, shortFormat: (v) => `${(v / 1e6).toFixed(0)}m`, yFormat: (v) => `${(v / 1e6).toFixed(0)}m`, source: "World Bank (UN Tourism)", code: "ST.INT.ARVL", anchors: [], start: 1995, end: 2022, seed: 431, amp: 0 });
const dcmsCreativeGva: TrendSeries = {
  id: "dcms-creative-gva",
  title: "Creative industries GVA",
  subtitle: "Gross value added of the creative industries, £ billion",
  unit: "gbp",
  format: fmtGbpBn,
  shortFormat: fmtGbpBnShort,
  goodDirection: "up",
  source: "DCMS, Economic Estimates: gross value added",
  sourceUrl: "https://www.gov.uk/government/collections/dcms-sectors-economic-estimates",
  cadence: "annual",
  points: realPoints("dcms-creative-gva"),
  annotations: [],
};
const dcmsSport: TrendSeries = {
  id: "dcms-sport-participation",
  title: "Adult sport participation",
  subtitle: "% of adults active (150+ minutes a week), Active Lives",
  unit: "percent",
  format: fmtPct,
  shortFormat: fmtPct,
  goodDirection: "up",
  source: "Sport England, Active Lives Adult Survey",
  sourceUrl: "https://www.sportengland.org/research-and-data/data/active-lives",
  cadence: "annual",
  points: realPoints("dcms-sport-participation"),
  caveat:
    "Survey estimate (Active Lives) — subject to sampling error; not a full population count.",
  annotations: [],
};

// ============================================================
// FCDO — Foreign, Commonwealth & Development Office
// ============================================================
// No clean machine-readable source yet (ODA is published via the gov.uk SID
// collection as ODS) — both indicators render placeholders pending a fetcher.
const fcdoOdaGni: TrendSeries = {
  id: "fcdo-oda-gni",
  title: "Aid spending (ODA)",
  subtitle: "UK official development assistance, % of gross national income",
  unit: "percent",
  format: (v) => `${v.toFixed(2)}%`,
  shortFormat: (v) => `${v.toFixed(2)}%`,
  goodDirection: "up",
  target: { value: 0.7, label: "0.7% UN/statutory target", kind: "standard" },
  source: "FCDO, Statistics on International Development",
  sourceUrl: "https://www.gov.uk/government/collections/statistics-on-international-development",
  cadence: "annual",
  points: realPoints("fcdo-oda-gni"),
  annotations: [],
};
const fcdoOdaTotal: TrendSeries = {
  id: "fcdo-oda-total",
  title: "Total ODA",
  subtitle: "UK net official development assistance, £ billion",
  unit: "gbp",
  format: fmtGbpBn,
  shortFormat: fmtGbpBnShort,
  goodDirection: "up",
  source: "FCDO, Statistics on International Development",
  sourceUrl: "https://www.gov.uk/government/collections/statistics-on-international-development",
  cadence: "annual",
  points: realPoints("fcdo-oda-total"),
  annotations: [],
};

// ============================================================
// Cabinet Office
// ============================================================
const cabGmpp: TrendSeries = {
  id: "cab-gmpp-confidence",
  lens: "process",
  title: "Major projects delivery confidence",
  subtitle: "% of Government Major Projects Portfolio rated green / amber-green",
  unit: "percent",
  format: fmtPct,
  shortFormat: fmtPct,
  goodDirection: "up",
  source: "Infrastructure & Projects Authority, GMPP annual report",
  sourceUrl: "https://www.gov.uk/government/collections/major-projects-data",
  cadence: "annual",
  points: realPoints("cab-gmpp-confidence"),
  annotations: [],
};
const cabCivilService: TrendSeries = {
  id: "cab-civil-service-headcount",
  lens: "process",
  title: "Civil service headcount",
  // Direction is contested (efficiency vs capacity); oriented "down" only to
  // colour the tile, not as a value judgement — see the department synthesis.
  subtitle: "Full-time-equivalent civil servants",
  unit: "count",
  format: fmtThousands,
  shortFormat: fmtK,
  yFormat: fmtK,
  goodDirection: "down",
  source: "Cabinet Office / ONS, Civil Service Statistics",
  sourceUrl: "https://www.gov.uk/government/collections/civil-service-statistics",
  cadence: "annual",
  points: realPoints("cab-civil-service-headcount"),
  annotations: [],
};

// ============================================================
// Deepening indicators (2026-06): WB/ONS one-liners + salient "ordinary
// people" series for the newer departments, plus HMRC.
// ============================================================
// DESNZ — energy use per person (WB, real) + domestic electricity price (gov.uk).
const desnzEnergyUse = wbS({ id: "desnz-energy-use-pc", title: "Energy use per person", subtitle: "Kg of oil equivalent per capita", good: "down", unit: "count", format: (v) => `${Math.round(v).toLocaleString("en-GB")}`, shortFormat: (v) => `${(v / 1000).toFixed(1)}k`, source: "World Bank (IEA)", code: "EG.USE.PCAP.KG.OE", anchors: [], start: 1960, end: 2015, seed: 441, amp: 0 });
const desnzElecPrice: TrendSeries = {
  id: "desnz-electricity-price",
  title: "Domestic electricity price",
  subtitle: "Average UK standard domestic electricity price, pence per kWh",
  unit: "count",
  format: (v) => `${v.toFixed(1)}p`,
  shortFormat: (v) => `${v.toFixed(0)}p`,
  goodDirection: "down",
  source: "DESNZ, Quarterly Energy Prices",
  sourceUrl: "https://www.gov.uk/government/collections/quarterly-energy-prices",
  cadence: "quarterly",
  points: realPoints("desnz-electricity-price"),
  annotations: [],
};

// DSIT — internet users + mobile subscriptions (WB, real).
const dsitInternet = wbS({ id: "dsit-internet-users", title: "Internet users", subtitle: "% of individuals using the internet", good: "up", unit: "percent", format: fmtPct, source: "World Bank (ITU)", code: "IT.NET.USER.ZS", anchors: [], start: 1990, end: 2023, seed: 442, amp: 0 });
const dsitMobile = wbS({ id: "dsit-mobile-subs", title: "Mobile subscriptions", subtitle: "Mobile-cellular subscriptions per 100 people", good: "up", unit: "count", format: (v) => v.toFixed(0), source: "World Bank (ITU)", code: "IT.CEL.SETS.P2", anchors: [], start: 1980, end: 2023, seed: 443, amp: 0 });

// DBT — inward FDI (WB, real) + retail sales volume (ONS CDID J5EK, real).
const dbtFdi = wbS({ id: "dbt-fdi", title: "Foreign direct investment", subtitle: "Net inflows, % of GDP", good: "up", unit: "percent", format: fmtPct, source: "World Bank (IMF BoP)", code: "BX.KLT.DINV.WD.GD.ZS", anchors: [], start: 1970, end: 2023, seed: 444, amp: 0 });
const dbtRetail: TrendSeries = {
  id: "dbt-retail-sales",
  title: "Retail sales",
  subtitle: "Retail sales volume index (2022 = 100, incl. fuel, seasonally adjusted)",
  unit: "count",
  format: (v) => v.toFixed(1),
  shortFormat: (v) => v.toFixed(0),
  goodDirection: "up",
  source: "ONS, Retail Sales Index (series J5EK)",
  sourceUrl: "https://www.ons.gov.uk/businessindustryandtrade/retailindustry/timeseries/j5ek/drsi",
  cadence: "monthly",
  points: realPoints("dbt-retail-sales"),
  annotations: [],
};


// Cabinet Office — FOI requests answered in time (gov.uk FOI statistics).
const cabFoi: TrendSeries = {
  id: "cab-foi-intime",
  title: "FOI requests answered in time",
  subtitle: "% of Freedom of Information requests answered within the statutory deadline",
  unit: "percent",
  format: fmtPct,
  shortFormat: fmtPct,
  goodDirection: "up",
  source: "Cabinet Office, Freedom of Information statistics",
  sourceUrl: "https://www.gov.uk/government/collections/government-foi-statistics",
  cadence: "quarterly",
  points: realPoints("cab-foi-intime"),
  annotations: [],
};

// ============================================================
// HMRC — HM Revenue & Customs (non-ministerial, added 2026-06)
// ============================================================
const hmrcCallWait: TrendSeries = {
  id: "hmrc-call-wait",
  lens: "experience",
  title: "Phone wait times",
  subtitle: "Average speed of answer to an HMRC adviser, minutes",
  unit: "count",
  format: (v) => `${v.toFixed(1)} min`,
  shortFormat: (v) => `${v.toFixed(0)}m`,
  goodDirection: "down",
  source: "HMRC monthly performance reports",
  sourceUrl: "https://www.gov.uk/government/collections/hmrc-monthly-performance-reports",
  cadence: "monthly",
  points: realPoints("hmrc-call-wait"),
  annotations: [],
};
const hmrcTaxGap: TrendSeries = {
  id: "hmrc-tax-gap",
  lens: "process",
  title: "Tax gap",
  subtitle: "Tax not collected as % of total theoretical liabilities",
  unit: "percent",
  format: fmtPct,
  shortFormat: fmtPct,
  goodDirection: "down",
  source: "HMRC, Measuring tax gaps",
  sourceUrl: "https://www.gov.uk/government/statistics/measuring-tax-gaps",
  cadence: "annual",
  points: realPoints("hmrc-tax-gap"),
  annotations: [],
};

// ============================================================
// Citizen-experience indicators (2026-06, Phase 1 of the gap-closing backlog —
// docs/backlog-citizen-indicators.md). Consumer-side, externally sourced, long
// series: what households actually feel, not departmental throughput.
// ============================================================
// HMT — food prices (the weekly shop). ONS CPI food & non-alcoholic beverages
// index, 2015 = 100 (CDID D7BU) — a clean ons() one-liner.
const hmtFoodPrices: TrendSeries = {
  id: "hmt-food-prices",
  lens: "experience",
  title: "Food prices",
  subtitle: "CPI food & non-alcoholic drink price index (2015 = 100)",
  unit: "count",
  format: (v) => v.toFixed(1),
  shortFormat: (v) => v.toFixed(0),
  yFormat: (v) => v.toFixed(0),
  deltaFormat: (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}`,
  goodDirection: "down",
  source: "ONS Consumer Prices Index — food & non-alcoholic beverages (D7BU)",
  sourceUrl: "https://www.ons.gov.uk/economy/inflationandpriceindices/timeseries/d7bu/mm23",
  cadence: "monthly",
  points: realPoints("hmt-food-prices"),
  annotations: [{ date: "2022-01-01", label: "Cost-of-living crisis" }],
};

// DfE — persistent absence from school (kids missing 10%+ of sessions). DfE
// "Pupil absence in schools in England" via EES (absence-by-characteristics
// data set), national all-pupils row, full year.
const dfePersistentAbsence: TrendSeries = {
  id: "dfe-persistent-absence",
  title: "Persistent absence from school",
  subtitle: "% of pupils missing 10%+ of sessions, state schools, England",
  unit: "percent",
  format: fmtPct,
  shortFormat: fmtPct,
  goodDirection: "down",
  source: "DfE, Pupil absence in schools in England (EES)",
  sourceUrl:
    "https://explore-education-statistics.service.gov.uk/find-statistics/pupil-absence-in-schools-in-england",
  cadence: "annual",
  points: realPoints("dfe-persistent-absence"),
  annotations: [{ date: "2020-01-01", label: "Pandemic" }],
};

// MHCLG — private rents (the renter's monthly cost). ONS Price Index of Private
// Rents historical series (chain-linked PIPR/IPHRP, monthly from 2005).
const mhclgPrivateRents: TrendSeries = {
  id: "mhclg-private-rents",
  lens: "experience",
  title: "Private rents",
  subtitle: "Price Index of Private Rents, UK (rebased index)",
  unit: "count",
  format: (v) => v.toFixed(1),
  shortFormat: (v) => v.toFixed(0),
  yFormat: (v) => v.toFixed(0),
  deltaFormat: (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}`,
  goodDirection: "down",
  source: "ONS Price Index of Private Rents (PIPR), historical series",
  sourceUrl:
    "https://www.ons.gov.uk/economy/inflationandpriceindices/datasets/priceindexofprivaterentsukhistoricalseries",
  cadence: "monthly",
  points: realPoints("mhclg-private-rents"),
  annotations: [{ date: "2022-01-01", label: "Cost-of-living crisis" }],
};

// Home Office — net migration (the headline number). ONS Long-term
// international migration. Direction is contested; oriented "down" only to
// colour the tile, not as a value judgement (cf. civil-service headcount).
const hoNetMigration: TrendSeries = {
  id: "ho-net-migration",
  title: "Net migration",
  subtitle: "Long-term international net migration, UK, year ending",
  unit: "count",
  format: fmtThousands,
  shortFormat: fmtK,
  yFormat: fmtK,
  deltaFormat: fmtThousandsSigned,
  goodDirection: "down",
  source: "ONS, Long-term international migration, provisional",
  sourceUrl:
    "https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/internationalmigration",
  cadence: "annual",
  points: realPoints("ho-net-migration"),
  caveat:
    "Long-term migration estimates (LTIM) are provisional and routinely revised; methodology and data sources have changed over the series.",
  annotations: [{ date: "2021-01-01", label: "Post-Brexit points system" }],
};

// Home Office — shoplifting (the crime people see). ONS police-recorded crime.
const hoShoplifting: TrendSeries = {
  id: "ho-shoplifting",
  lens: "experience",
  title: "Shoplifting offences",
  subtitle: "Police-recorded shoplifting, England & Wales, per year",
  unit: "count",
  format: fmtThousands,
  shortFormat: fmtK,
  yFormat: fmtK,
  deltaFormat: fmtThousandsSigned,
  goodDirection: "down",
  source: "ONS / Home Office police-recorded crime (Crime in England & Wales appendix tables)",
  sourceUrl:
    "https://www.ons.gov.uk/peoplepopulationandcommunity/crimeandjustice/datasets/crimeinenglandandwalesappendixtables",
  cadence: "annual",
  points: realPoints("ho-shoplifting"),
  caveat:
    "Police-recorded crime — sensitive to recording-practice changes and reporting rates, and differs from the Crime Survey for England & Wales' victimisation-based estimate.",
  annotations: [{ date: "2022-01-01", label: "Post-pandemic surge" }],
};

// MHCLG — council tax (the bill that rises every year). MHCLG live tables,
// average Band D, England, financial year since 1993-94.
const mhclgCouncilTax: TrendSeries = {
  id: "mhclg-council-tax",
  lens: "experience",
  title: "Council tax",
  subtitle: "Average Band D council tax, England (£/yr)",
  unit: "currency",
  format: (v) => `£${Math.round(v).toLocaleString("en-GB")}`,
  shortFormat: (v) => `£${(v / 1000).toFixed(1)}k`,
  yFormat: (v) => `£${(v / 1000).toFixed(1)}k`,
  deltaFormat: (v) => `${v > 0 ? "+" : ""}£${Math.round(v)}`,
  goodDirection: "down",
  source: "MHCLG, Council Tax levels set by local authorities (live tables)",
  sourceUrl: "https://www.gov.uk/government/statistical-data-sets/live-tables-on-council-tax",
  cadence: "annual",
  points: realPoints("mhclg-council-tax"),
  annotations: [],
};

// MHCLG — rough sleeping (people on the street). MHCLG annual autumn snapshot.
const mhclgRoughSleeping: TrendSeries = {
  id: "mhclg-rough-sleeping",
  lens: "experience",
  title: "Rough sleeping",
  subtitle: "People estimated sleeping rough on a single night, England",
  unit: "count",
  format: fmtThousands,
  shortFormat: (v) => `${(v / 1000).toFixed(1)}k`,
  yFormat: (v) => `${(v / 1000).toFixed(1)}k`,
  deltaFormat: fmtThousandsSigned,
  goodDirection: "down",
  source: "MHCLG, Rough sleeping snapshot in England",
  sourceUrl: "https://www.gov.uk/government/statistical-data-sets/tables-on-rough-sleeping",
  cadence: "annual",
  points: realPoints("mhclg-rough-sleeping"),
  annotations: [{ date: "2020-01-01", label: "Everyone In" }],
};

// DfT — local road condition (potholes). DfT road condition statistics: % of
// local-authority 'A' roads that should be considered for maintenance.
const dftLocalRoads: TrendSeries = {
  id: "dft-local-roads",
  title: "Local road condition",
  subtitle: "% of local 'A' roads that should be considered for maintenance, England",
  unit: "percent",
  format: fmtPct,
  shortFormat: fmtPct,
  goodDirection: "down",
  source: "DfT, Road condition statistics (RDC)",
  sourceUrl: "https://www.gov.uk/government/statistical-data-sets/road-condition-statistics-data-tables-rdc",
  cadence: "annual",
  points: realPoints("dft-local-roads"),
  methodology:
    "Mean across the English regions (the source reports a value per region, not a single England figure).",
  annotations: [],
};

// DfT — rail fares (the fare that rises every January). ONS CPI rail index.
const dftRailFares: TrendSeries = {
  id: "dft-rail-fares",
  lens: "experience",
  title: "Rail fares",
  subtitle: "CPI rail fares index — passenger transport by railway (2015 = 100)",
  unit: "count",
  format: (v) => v.toFixed(1),
  shortFormat: (v) => v.toFixed(0),
  yFormat: (v) => v.toFixed(0),
  deltaFormat: (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}`,
  goodDirection: "down",
  source: "ONS Consumer Prices Index — passenger transport by railway (D7EF)",
  sourceUrl: "https://www.ons.gov.uk/economy/inflationandpriceindices/timeseries/d7ef/mm23",
  cadence: "monthly",
  points: realPoints("dft-rail-fares"),
  annotations: [],
};

// MHCLG — social housing waiting list (years on the council-house list).
const mhclgWaitlist: TrendSeries = {
  id: "mhclg-social-waitlist",
  title: "Social housing waiting list",
  subtitle: "Households on local authority housing waiting lists, England",
  unit: "count",
  format: fmtThousands,
  shortFormat: (v) => `${(v / 1e6).toFixed(2)}m`,
  yFormat: (v) => `${(v / 1e6).toFixed(1)}m`,
  deltaFormat: fmtThousandsSigned,
  goodDirection: "down",
  source: "MHCLG live tables on rents, lettings and tenancies (Table 600)",
  sourceUrl: "https://www.gov.uk/government/statistical-data-sets/live-tables-on-rents-lettings-and-tenancies",
  cadence: "annual",
  points: realPoints("mhclg-social-waitlist"),
  methodology:
    "Summed across the nine English regions (no national total is published in the source table).",
  annotations: [],
};

// DHSC — GP appointment access (the everyday NHS front door). GP Patient Survey;
// wiring pending a dedicated round (2024 survey redesign broke the series).
const dhscGpAccess: TrendSeries = {
  id: "dhsc-gp-access",
  title: "GP appointment access",
  subtitle: "% of patients with a good experience of making a GP appointment (GP Patient Survey)",
  unit: "percent",
  format: fmtPct,
  shortFormat: fmtPct,
  goodDirection: "up",
  source: "NHS England / Ipsos, GP Patient Survey",
  sourceUrl: "https://www.england.nhs.uk/statistics/statistical-work-areas/gp-patient-survey/",
  cadence: "annual",
  points: realPoints("dhsc-gp-access"),
  caveat:
    "GP Patient Survey estimate; the 2024 questionnaire redesign creates a break in the series — figures before and after are not directly comparable.",
  annotations: [{ date: "2024-01-01", label: "Survey redesign" }],
};

// HMT — regional gap (the "levelling-up" divide). ONS balanced regional GVA per
// head: London as a multiple of the UK average.
const hmtRegionalGap: TrendSeries = {
  id: "hmt-regional-gap",
  title: "Regional divide",
  subtitle: "London GVA per head as a multiple of the UK average",
  unit: "count",
  format: (v) => `${v.toFixed(2)}×`,
  shortFormat: (v) => `${v.toFixed(2)}×`,
  yFormat: (v) => `${v.toFixed(1)}×`,
  deltaFormat: (v) => `${v > 0 ? "+" : ""}${v.toFixed(2)}×`,
  goodDirection: "down",
  source: "ONS, Regional gross value added (balanced) per head",
  sourceUrl:
    "https://www.ons.gov.uk/economy/grossvalueaddedgva/datasets/nominalregionalgrossvalueaddedbalancedperheadandincomecomponents",
  cadence: "annual",
  points: realPoints("hmt-regional-gap"),
  methodology:
    "Ratio of London GVA per head to the UK average (London ÷ UK), per year. Higher = wider regional gap.",
  annotations: [],
};

// Home Office — passport processing (will my passport arrive in time). HMPO
// transparency data; wiring pending a dedicated round (quarterly, SLA changes).
const hoPassportTimes: TrendSeries = {
  id: "ho-passport-times",
  title: "Passport processing",
  subtitle: "% of straightforward passport applications within the service standard",
  unit: "percent",
  format: fmtPct,
  shortFormat: fmtPct,
  goodDirection: "up",
  source: "HM Passport Office transparency data",
  sourceUrl: "https://www.gov.uk/government/organisations/hm-passport-office",
  cadence: "quarterly",
  points: realPoints("ho-passport-times"),
  annotations: [{ date: "2022-01-01", label: "Backlog surge" }],
};

// ============================================================
// Registry
// ============================================================

/**
 * Provenance for the treemap tile sizing. Unlike every *series* (which is
 * fetched and byte-hashed in CI), `spendBn` is a hand-entered editorial
 * estimate — so it is labelled honestly as such, with its source and vintage,
 * rather than presented with the same authority as the charts. Surfaced in the
 * overview footnote and the methodology page.
 */
export const SPEND_BASIS = {
  source: "HM Treasury, Public Spending Statistics (PESA)",
  url: "https://www.gov.uk/government/collections/public-expenditure-statistical-analyses-pesa",
  asOf: "2025–26",
  measure: "Total Managed Expenditure",
  note: "Approximate departmental TME, rounded; HMT is sized by debt interest (its largest direct outlay). A static editorial estimate used only to size tiles — not a fetched, validated series like the charts.",
} as const;

export const departments: Department[] = [
  {
    code: "dhsc",
    name: "DHSC",
    spendBn: 204,
    fullName: "Health & Social Care",
    blurb:
      "Decades of monthly data on how the department is performing against its stated objectives. Headline numbers in context, not in isolation.",
    synthesis:
      "The waiting list has stopped growing but remains close to its highest in the published series. The 18-week standard has not been met for a decade and the social-care discharge bottleneck is structural. Agency spend has eased since the 2023 peak; capital delivery is worsening.",
    themes: ["Waiting list", "Urgent care", "Workforce", "Capital"],
    hero: waitingList,
    core: [rtt18Week, ambulanceC2, dischargeDelays, agencySpend, capitalOverrun, dhscSpendPerLifeYear],
    supporting: [dhscGpAccess, aePerformance, clinicalPer1000, hospitalBeds, healthSpendGdp, dhscHealthSpendPc, infantMortality, dhscSuicide, dhscMeasles, dhscOop, turnover, vacancyRate, lifeExpectancy],
  },
  {
    code: "dfe",
    name: "DfE",
    spendBn: 95,
    fullName: "Education",
    blurb:
      "How the schools system is performing on the measures that families and economists both care about: outcomes, retention, financial sustainability, and pipeline.",
    synthesis:
      "The disadvantaged attainment gap has widened back beyond its pre-2019 level. Early-career attrition is structurally higher than a decade ago, training recruitment is missing target by a third, and high-needs deficits are compounding.",
    themes: ["Attainment", "Workforce", "Funding", "Pipeline"],
    hero: dfeAttainmentGap,
    core: [dfePersistentAbsence, dfeEctAttrition, dfeDsgDeficit, dfeTeacherRecruitment, dfeSpendPerPupil],
    supporting: [dfeEduSpendGdp, dfePupilTeacher, dfeTertiary],
  },
  {
    code: "home-office",
    name: "Home Office",
    spendBn: 21,
    fullName: "Home Office",
    pageTitle: "Home Office",
    blurb:
      "Operational throughput on the highest-volume, highest-salience flows: asylum, visas, and the costs of contingency.",
    synthesis:
      "The legacy asylum backlog has cleared, but new intake keeps the headline above its 2010s baseline. Hotel run-rate has fallen from the 2023 peak but remains an order of magnitude above pre-2019. Visa SLAs are recovering.",
    themes: ["Throughput", "Workforce", "Value for money", "Service standard"],
    hero: hoAsylumBacklog,
    core: [hoNetMigration, hoChargeRate, hoShoplifting, hoCaseworkerTurnover, hoHotelSpend, hoVisaSla],
    supporting: [hoPassportTimes, hoHomicideRate, hoMigrantStock],
  },
  {
    code: "moj",
    name: "MoJ",
    spendBn: 13,
    fullName: "Justice",
    blurb:
      "The throughput, cost, and capacity of the criminal-justice system. Hard to fudge: courts list cases publicly and prisons publish costs.",
    synthesis:
      "Crown Court outstanding cases continue to grow; completion times are over 700 days. Prison officer attrition has eased from its 2022 peak but unit costs keep rising faster than inflation.",
    themes: ["Backlog", "Cost", "Workforce", "Speed"],
    hero: mojCrownBacklog,
    core: [mojPrisonOfficerResign, mojCostPerPrisoner, mojCompletionDays],
  },
  {
    code: "mod",
    name: "MoD",
    spendBn: 56,
    fullName: "Defence",
    blurb:
      "Whether the armed forces are at the size, mix, and readiness that the National Security Strategy requires, and whether equipment programmes deliver on time and on budget.",
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
    spendBn: 290,
    fullName: "Work & Pensions",
    blurb:
      "Whether claimants get decisions promptly, whether work coaches have manageable caseloads, and whether the system is losing money to fraud and error.",
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
    spendBn: 30,
    fullName: "Transport",
    blurb:
      "Daily reliability and long-term asset health: cancellations passengers see, agency backlogs drivers see, and capital programmes taxpayers pay for.",
    synthesis:
      "Rail cancellation scores have not returned to pre-pandemic levels. DVLA has recovered most of its 2021 backlog. Capital portfolio overruns have risen sharply; SRN pavement condition is deteriorating.",
    themes: ["Reliability", "Service", "Delivery", "Assets"],
    hero: dftCancellations,
    core: [dftRailFares, dftLocalRoads, dftDvlaBacklog, dftCapitalOverrun, dftSrnDegradation],
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
    synthesis:
      "Real incomes per head have barely grown since 2008 and pay has lagged prices through the cost-of-living crisis. Debt is near 100% of GDP and debt interest has surged with rates. The tax burden is its highest since the 1940s, while productivity — the ultimate driver of pay and receipts — has flatlined.",
    themes: ["Living standards", "Debt", "Tax", "Cost of living"],
    hero: hmtGdpPerCapita,
    core: [hmtCostOfLiving, hmtFoodPrices, hmtDebt, hmtDebtCash, hmtTaxBurden, hmtDebtInterest],
    supporting: [hmtRegionalGap, hmtUnemployment, hmtGdpGrowth, hmtEmployment, hmtParticipation, hmtInvestment, hmtTrade, hmtSavings, hmtCurrentAccount, hmtGniPerCapita, hmtRealIncome, hmtProductivity, hmtTaxSplit, hmtDeficit],
  },
  {
    code: "mhclg",
    name: "MHCLG",
    spendBn: 30,
    fullName: "Housing, Communities & Local Government",
    pageTitle: "Ministry of Housing, Communities & Local Government",
    blurb:
      "Whether people can get and keep a roof: the supply of new homes, the affordability gap, and the households councils are housing in temporary accommodation.",
    synthesis:
      "Households in temporary accommodation are at their highest in the published series and housebuilding is running well below the 300,000-a-year ambition; affordability is close to its weakest on the ONS series.",
    themes: ["Homelessness", "Supply", "Affordability"],
    hero: mhclgTempAccom,
    core: [mhclgPrivateRents, mhclgCouncilTax, mhclgRoughSleeping, mhclgNetDwellings, mhclgAffordability],
    supporting: [mhclgWaitlist],
  },
  {
    code: "defra",
    name: "Defra",
    spendBn: 8,
    fullName: "Environment, Food & Rural Affairs",
    pageTitle: "Department for Environment, Food & Rural Affairs",
    blurb:
      "The environmental outcomes government is accountable for stewarding — even where private companies (water, waste) deliver and regulators (the Environment Agency, Ofwat) are meant to enforce.",
    synthesis:
      "Household recycling has plateaued for a decade; long-run air quality is the clear improvement and woodland cover is edging up. Storm-overflow spills and bathing-water quality — privately delivered and EA-regulated — remain near the centre of public concern.",
    themes: ["Waste", "Air", "Water"],
    hero: defraRecycling,
    core: [defraPm25, defraForest],
    supporting: [defraBathingWater, defraSewage],
  },
  {
    code: "desnz",
    name: "DESNZ",
    spendBn: 13,
    fullName: "Energy Security & Net Zero",
    pageTitle: "Department for Energy Security & Net Zero",
    blurb:
      "The decarbonisation trajectory the department is accountable for, alongside the energy security and affordability it must protect on the way.",
    synthesis:
      "The renewable share of energy has climbed steadily and territorial emissions are well down on 1990, but the pace must roughly double to stay on the carbon-budget path to net zero by 2050 — while fuel poverty remains elevated after the energy-price shock.",
    themes: ["Emissions", "Renewables", "Affordability"],
    hero: desnzRenewables,
    core: [desnzEmissions, desnzFuelPoverty, desnzElecPrice],
    supporting: [desnzEnergyUse],
  },
  {
    code: "dsit",
    name: "DSIT",
    spendBn: 16,
    fullName: "Science, Innovation & Technology",
    pageTitle: "Department for Science, Innovation & Technology",
    blurb:
      "Whether the UK is investing in research at the intensity a high-productivity economy needs, and whether the digital infrastructure that growth runs on is reaching everyone.",
    synthesis:
      "R&D intensity has risen towards the 2.4%-of-GDP ambition (helped by an ONS methodology revision), and gigabit broadband has gone from niche to majority coverage in a few years; the open question is whether the researcher base keeps pace with the spending.",
    themes: ["Research", "Connectivity", "Talent"],
    hero: dsitRandD,
    core: [dsitResearchers, dsitBroadband],
    supporting: [dsitInternet, dsitMobile],
  },
  {
    code: "dbt",
    name: "DBT",
    spendBn: 6,
    fullName: "Business & Trade",
    pageTitle: "Department for Business & Trade",
    blurb:
      "The external-facing health of the economy the department promotes: how much the UK exports, how sophisticated those exports are, and whether business is investing.",
    synthesis:
      "Exports as a share of GDP have held up but the high-tech share of manufactured exports has drifted, and business investment has lagged peers since 2016 — the long-running weakness behind the productivity gap.",
    themes: ["Exports", "Innovation", "Investment"],
    hero: dbtExports,
    core: [dbtHighTech, dbtBusinessInvestment, dbtRetail],
    supporting: [dbtFdi],
  },
  {
    code: "dcms",
    name: "DCMS",
    spendBn: 2,
    fullName: "Culture, Media & Sport",
    pageTitle: "Department for Culture, Media & Sport",
    blurb:
      "The economic and participation footprint of the sectors the department sponsors — creative industries, tourism and sport — which punch well above their budget line.",
    synthesis:
      "The creative industries have grown faster than the wider economy and inbound tourism has recovered towards its pre-pandemic peak; adult sport participation has been broadly flat, a persistent public-health frustration.",
    themes: ["Creative economy", "Tourism", "Participation"],
    hero: dcmsTourism,
    core: [dcmsCreativeGva, dcmsSport],
  },
  {
    code: "fcdo",
    name: "FCDO",
    spendBn: 8,
    fullName: "Foreign, Commonwealth & Development Office",
    pageTitle: "Foreign, Commonwealth & Development Office",
    blurb:
      "The most quantifiable lever of UK foreign policy: how much the UK spends on overseas development, against the statutory benchmark it set itself.",
    synthesis:
      "Aid spending has fallen well below the 0.7%-of-GNI statutory target since the 2021 cut to 0.5%, with a further planned reduction towards 0.3% — a deliberate policy choice, shown here against the benchmark rather than judged.",
    themes: ["Development", "Commitment"],
    hero: fcdoOdaGni,
    core: [fcdoOdaTotal],
  },
  {
    code: "cabinet-office",
    name: "Cabinet Office",
    spendBn: 2,
    fullName: "Cabinet Office",
    pageTitle: "Cabinet Office",
    blurb:
      "The centre of government is hard to score on outcomes — it coordinates rather than delivers — so the honest measures are how well the projects it oversees are delivering and how the size of the civil service is moving.",
    synthesis:
      "Delivery confidence across the Government Major Projects Portfolio has been persistently mixed, with a large share of the highest-value projects rated less than confident; civil-service headcount grew sharply post-2016 and is now the subject of reduction targets (direction here is contested, not a verdict).",
    themes: ["Delivery", "Workforce", "Transparency"],
    hero: cabGmpp,
    core: [cabCivilService],
    supporting: [cabFoi],
  },
  {
    code: "hmrc",
    name: "HMRC",
    spendBn: 6,
    fullName: "HM Revenue & Customs",
    pageTitle: "HM Revenue & Customs",
    blurb:
      "The tax authority most people actually deal with — whether you can get through on the phone, and how much of the tax owed actually gets collected.",
    synthesis:
      "Phone waiting times climbed steeply through the early 2020s as HMRC pushed callers towards digital channels and the contact centres struggled; the tax gap has drifted down over two decades but remains tens of billions a year.",
    themes: ["Service", "Compliance"],
    hero: hmrcCallWait,
    core: [hmrcTaxGap],
  },
];

export function getDepartment(code: string): Department | undefined {
  return departments.find((d) => d.code === code);
}
