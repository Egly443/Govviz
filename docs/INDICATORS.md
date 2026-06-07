# Govviz — indicator selection (spec)

Working spec for the real-data dashboard. This is a **manifest**, not data: it
lists what we measure and where it comes from. Raw datasets are never committed —
they're fetched in CI and baked into the deploy (see "Sourcing").

## Selection principles

- **Three lenses per department:** Competence/performance (**C**), Value for
  money (**VFM**), and Leading/root-cause or hard-to-fudge Outcome (**L/O**).
- **Per-head where it reveals something** — population-adjust (per 1,000 / per
  capita) so problems that absolute counts hide as population grows show up.
- **Root-cause pairs on one chart** — put the symptom and its driver on the same
  axes (e.g. nurse vacancies vs nurses trained). The "shortage vs supply"
  pattern recurs: nurses, teachers, soldiers, caseworkers, court capacity.
- **Hard to fudge** — prefer independent publishers (ONS, OBR, NAO, IFS,
  regulators, OECD, surveys) where a credible series exists; otherwise the best
  departmental series, favouring long unbroken history.
- **Matters to ordinary people**, and **graphable over decades** where possible.

Feasibility for machine-fetching: 🟢 clean CSV/JSON/API · 🟡 ODS/Excel/HTML
(parseable, more brittle) · 🔴 hard. (Confirmed when the fetch runs in CI.)

## Sourcing (no datasets in the repo)

A CI build step fetches each series from its official source, normalises to a
compact `public/data/series.json` (git-ignored), shipped in `dist/`. The app
loads that same-origin JSON at runtime. The existing synthetic generators remain
the dev/offline fallback. Optional scheduled monthly Action keeps numbers fresh.

## Charts that show two lines

Many panels are **paired** (shared axis, two lines). Built via a new multi-line
TrendPanel capability. Pairs are marked ⇄.

---

## DHSC — Health & Social Care

**Clinical performance**
- RTT waiting list size — NHS England, monthly, 2007 — **C** 🟢
- RTT % within 18 weeks — NHS England, monthly, 2007 — **C** 🟢
- A&E 4-hour performance ⇄ hospital beds per 1,000 people — NHS England + OECD — **C/L** 🟡 (capacity as root cause)

**Outcomes (hard to fudge)**
- Healthy life expectancy at birth — ONS, annual — **O** 🟡
- Avoidable/treatable mortality rate — ONS, annual, 2001 — **O** 🟡

**Workforce — the root-cause narrative (all paired)**
- Vacancy rate: nursing ⇄ medical — NHS Vacancy Statistics, quarterly — **L** 🟡
- Training intake: medical-school places ⇄ nursing acceptances — MSC/UCAS, annual — **L** 🟡
- Per 1,000 population: doctors ⇄ nurses — OECD, annual — **O** 🟡
- On the register: doctors (GMC) ⇄ nurses (NMC) — regulators, annual — **L** 🟡

**Value for money**
- Real-terms health spend per head — PESA/IFS + ONS population, annual — **VFM** 🟡
- Delayed discharges (beds/day medically fit to leave) — NHS England — **L/VFM** 🟡

## DfE — Education

- Disadvantage attainment gap (months) — Education Policy Institute, annual — **O** 🟡
- PISA reading/maths/science — OECD, triennial, 2000 — **O** 🟢
- Attainment gap ⇄ persistent absence rate — EPI + DfE — **L** 🟢 (absence as driver)
- Teacher vacancies ⇄ ITT recruitment vs target — DfE — **L** 🟢/🟡 (shortage vs supply)
- Teacher 5-year retention — DfE School Workforce, annual — **L** 🟢
- Pupil:teacher ratio — DfE, annual, decades — **C** 🟢 (per-head)
- Real-terms per-pupil funding — IFS, annual — **VFM** 🟡
- High-needs (DSG) deficit — DfE/LGA, annual, 2018 — **VFM** 🟡

## Home Office

- CSEW victimisation (crime experienced) — ONS, since 1981 — **O** 🟡
- Charge/summons rate ⇄ police officers per 1,000 — Home Office — **C/L** 🟡 (capacity vs outcome)
- Asylum backlog ⇄ asylum caseworkers — Home Office/NAO, quarterly — **C/L** 🟢/🟡 (shortage vs supply)
- Asylum decision timeliness — Home Office — **C** 🟡
- Asylum accommodation cost (per head in support) — NAO/HO accounts — **VFM** 🟡
- Police officers per 1,000 population — Home Office, since 2003 — **L** 🟢 (per-head)

## MoJ — Justice

- Crown Court outstanding caseload ⇄ sitting days / judicial capacity — MoJ, quarterly — **C/L** 🟢/🟡 (backlog vs capacity)
- Offence-to-completion time — MoJ, quarterly — **C** 🟢
- Proven reoffending rate — MoJ, since 2002 — **O** 🟢
- Prison population vs usable capacity (crowding) — MoJ, weekly — **C/L** 🟢
- Prisoners per 100,000 population — MoJ/ONS — **O** 🟢 (per-head, internationally comparable)
- Cost per prison place — HMPPS accounts, annual — **VFM** 🟡
- Assaults in prisons (rate) — MoJ Safety in Custody, quarterly — **L/O** 🟢

## MoD — Defence

- Trained strength vs requirement (shortfall) — MoD, quarterly — **C** 🟡
- Recruitment intake ⇄ voluntary outflow — MoD, quarterly — **L** 🟡 (the "bathtub": in vs out)
- GMPP defence cost variance + Equipment Plan affordability gap — IPA/NAO, annual — **VFM** 🟡
- AFCAS satisfaction with service life ⇄ accommodation — MoD survey, since 2007 — **O/L** 🟡
- Regulars per capita / as % of population — MoD/ONS — **context** 🟡 (per-head)

## DWP — Work & Pensions

- Relative child poverty (AHC) ⇄ pensioner poverty (AHC) — DWP HBAI, since 1994 — **O** 🟡 (paired)
- PIP clearance time ⇄ PIP/UC backlog vs caseworkers — DWP, quarterly — **C/L** 🟢 (capacity)
- UC paid in full & on time — DWP, quarterly, 2017 — **C** 🟡
- Fraud & error (% of expenditure) — DWP, NAO-audited, annual — **VFM/O** 🟡
- Work-coach caseload (claimants per coach) — DWP/NAO — **L** 🟡 (per-head capacity)

## DfT — Transport

- Reported road deaths — DfT, annual, **since 1926** — **O** 🟢
- Road deaths per billion vehicle-miles ⇄ KSI casualties — DfT, annual — **O** 🟢 (exposure-adjusted)
- Rail cancellations score — ORR, since 2014 — **C** 🟢
- Rail punctuality / PPM — ORR, since 1997 — **C** 🟢
- Local road condition (% needing maintenance) ⇄ road maintenance spend — DfT — **L/VFM** 🟡 (cause)
- Major scheme cost overrun (HS2/portfolio) — NAO/IPA, annual — **VFM** 🟡

## HM Treasury — economy & public finances  *(new)*

Sui generis: HMT's own budget is tiny but it's the fiscal centre. Treemap sizing
proposed by **debt interest** (~£100bn, a real Treasury-controlled outlay) so the
block reads as significant — see open question.

**Living standards (per-head, the stuff people feel)**
- Real GDP per capita — ONS, quarterly, decades — **O** 🟢 *(hero — growth vs population)*
- CPI inflation ⇄ nominal wage growth (→ real wages) — ONS, monthly — **O** 🟢 (cost of living)
- Real household disposable income per head — ONS, annual — **O** 🟢
- Productivity (output per hour) ⇄ real wages — ONS — **L/O** 🟢 (root cause of stagnant pay & receipts)

**Public finances**
- Public sector net debt as % of GDP — ONS/OBR, since ~1900 — **O** 🟢
- Debt interest spending ⇄ debt level (or per household) — OBR/ONS — **VFM** 🟡 (cost of the debt)
- Total tax take as % of GDP (tax burden) — ONS/OBR, decades — **O** 🟢
- Tax: direct (income tax + NI) ⇄ indirect (VAT + duties) — HMRC/ONS — **context** 🟡 (paired)
- Public sector net borrowing (deficit) as % GDP — ONS/OBR — **C** 🟢

## Decisions

1. **Treasury treemap size** — sized by **debt interest (~£100bn)**.
2. **Keep the 🟡 integrity flagships** (CSEW, HBAI, healthy life expectancy,
   AFCAS, tax burden) — worth the brittleness.
3. **DHSC runs deepest**, and the **other departments get dug deeper too** to
   match (more root-cause pairs / per-head metrics as each is wired).
