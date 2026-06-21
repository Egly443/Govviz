# Share links (UTM-tagged) — *Agentic Open Data*

Use these instead of the bare URL when you post or send the essay, so the
analytics can attribute traffic to each channel (and, for outreach, to a named
recipient). Campaign is fixed as `agentic-open-data`.

**Canonical page:** `https://egly443.github.io/Govviz/blog`

## By channel

| Channel | Link |
|---|---|
| LinkedIn | `https://egly443.github.io/Govviz/blog?utm_source=linkedin&utm_medium=social&utm_campaign=agentic-open-data` |
| X / Twitter | `https://egly443.github.io/Govviz/blog?utm_source=x&utm_medium=social&utm_campaign=agentic-open-data` |
| Bluesky | `https://egly443.github.io/Govviz/blog?utm_source=bluesky&utm_medium=social&utm_campaign=agentic-open-data` |
| Mastodon | `https://egly443.github.io/Govviz/blog?utm_source=mastodon&utm_medium=social&utm_campaign=agentic-open-data` |
| Hacker News | `https://egly443.github.io/Govviz/blog?utm_source=hn&utm_medium=social&utm_campaign=agentic-open-data` |
| Reddit | `https://egly443.github.io/Govviz/blog?utm_source=reddit&utm_medium=social&utm_campaign=agentic-open-data` |
| Newsletter / Substack | `https://egly443.github.io/Govviz/blog?utm_source=newsletter&utm_medium=email&utm_campaign=agentic-open-data` |
| GitHub README | `https://egly443.github.io/Govviz/blog?utm_source=github&utm_medium=referral&utm_campaign=agentic-open-data` |

## Targeted outreach (who)

For emails/DMs to specific people or organisations, add `utm_content` so you can
see *which* outreach landed — this is the cleanest, privacy-respecting way to
know who engaged (it only reveals identity for links you personally sent to a
known recipient):

| Recipient | Link |
|---|---|
| Email — the ODI | `https://egly443.github.io/Govviz/blog?utm_source=odi&utm_medium=email&utm_campaign=agentic-open-data&utm_content=odi-team` |
| Email — GDS / DSIT | `https://egly443.github.io/Govviz/blog?utm_source=gds&utm_medium=email&utm_campaign=agentic-open-data&utm_content=gds-team` |
| Email — Office for Statistics Regulation | `https://egly443.github.io/Govviz/blog?utm_source=osr&utm_medium=email&utm_campaign=agentic-open-data&utm_content=osr` |
| DM — named individual | `https://egly443.github.io/Govviz/blog?utm_source=direct&utm_medium=dm&utm_campaign=agentic-open-data&utm_content=<their-name>` |

Replace `<their-name>` per recipient. For tidier links, run them through an
open-source shortener (e.g. [Dub.co](https://dub.co)) — the UTM params still
arrive at the page.

## How to read the results

With `VITE_GOATCOUNTER` configured (see the README), GoatCounter records the
`utm_source` / `utm_campaign` / `utm_content` of each visit. In the dashboard:

- **Campaigns / referrers** → which channel drove visits (linkedin vs x vs the
  ODI email…).
- **Pages** → `/blog` views over time; **Locations** → countries.
- **`utm_content`** → which specific outreach a visit came from.

What you get: *how many, from where, which channel/recipient, which country*.
What you do **not** get (by design, and for GDPR/PECR reasons): named individuals
who did not click a link you sent them. To convert anonymous interest into named
contacts, add a consenting email-capture CTA (e.g. Substack/Buttondown); for
organisation-level identification, a company reverse-IP tool (Leadfeeder/RB2B
free tier) can be added later.
