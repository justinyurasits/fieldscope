# Fieldscope — product concept
*Working name. Sub safety compliance, scoped and verified — not a binder of boilerplate.*

## Positioning

Every sub on a large GC's jobsite is required to have a safety protocol, a training record, and daily PPE compliance. In practice, all three degrade into paperwork nobody trusts. Fieldscope replaces the paperwork with three things that are actually true: a protocol scoped to the task being performed, a review record with a real timestamp, and a compliance status backed by a photo — for every sub, on every site, every day.

## The problem

The same three gaps show up across sites and subs, at every scale:

| Gap | What actually happens today |
|---|---|
| **Documentation** | Protocols aren't scoped to the work being performed. Subs default to generic boilerplate instead of a protocol matched to the actual task, so it gets ignored. |
| **Training & review** | No reliable way to confirm initial safety reviews happened — or that ongoing reviews are running on schedule, not just checked off a list. |
| **Verification** | No fast way to confirm PPE and site conditions match the requirement, on any given day, across dozens of subs and sites. |

None of these are training problems. They're the predictable result of compliance running on paper and memory at a scale that doesn't support either.

## Who it's for

- **Buyer**: Corporate EH&S / Risk Management — holds budget and cares about a defensible record across the whole portfolio, not one site.
- **Champion & pilot validator**: Project Safety Manager, embedded on one active site — the daily user whose trust the pilot has to earn.
- **Site user**: Superintendent — reviews and routes flagged status, spot-checks the record, doesn't want a new system to babysit.
- **Field user**: Subcontractor's competent person / safety representative — describes the task and submits the daily photo. This has to work in under a couple of minutes with zero training, or the entire compliance record downstream is fiction.

*(Full reasoning in `fieldscope-personas.md`.)*

## How it works

1. **Describe** — before work starts, a foreman or superintendent describes the task in plain language. No form.
2. **Generate** — the system returns a protocol scoped to that task, grounded in the applicable OSHA 1926 sections — not a generic template.
3. **Track** — an initial review and ongoing review cadence are set automatically, with a training curriculum matched to the task. Completion is tracked as real state, so "did this happen" has an actual answer.
4. **Validate** — a daily jobsite photo is checked against that protocol's required PPE and equipment. Compliant or flagged status returns same-day.
5. **Roll up** — safety leadership sees status across every sub, site, and trade in one view — and every status is backed by the specific protocol and photo behind it, not a checkbox.

## Why this, why now

- A protocol scoped to the actual task is the difference between something a foreman reads and something a foreman ignores.
- "Did the review happen" stops being a memory problem when it's timestamped, tracked state instead of a form in a binder.
- Verification only scales if checking PPE across dozens of subs is a photo-pipeline problem, not a walk-the-site problem for one safety manager.

## Non-goals (v1)

- **Not a system of record for OSHA recordkeeping** (300 logs, incident reporting). Complements existing EHS/compliance systems, doesn't replace them.
- **Not a substitute for accredited safety training providers.** Curriculum guidance and tracking, not certified course delivery.
- **Not continuous monitoring.** Daily photo-based spot verification, not live video surveillance — a deliberately different (and more defensible) claim.
- **Not full-corpus OSHA 1926 coverage on day one.** Scoped to the trades in the pilot; expands deliberately, the same way the original concept frames it.
- **Not multi-language in v1.** Photo verification is visual and language-agnostic already; protocol text starts English-only, with translated summaries as a fast-follow rather than a pilot blocker.

## Pilot scope

Not a build-first pitch — a scoping conversation, then a narrow pilot:

1. **Confirm the gap** — which of the three (documentation, training, verification) is costing the client the most today, and on which sites. This is the client's call, not ours.
2. **Pilot narrow** — one site, 1–2 trades, real protocols, real photo validation. Suggested starting point: electrical and scaffolding — both show up disproportionately in OSHA's most-cited standards, so the gap is easy to make visible fast.
3. **Expand deliberately** — extend across subs and sites once the pilot shows the compliance record holds up under the safety manager's own spot-check.

**Draft pilot success criteria** (refine with client):
- A protocol generated for 100% of task types started on-site during the pilot window
- ≥90% of daily verification photos returning a same-day status
- The safety manager independently confirms the record matches what they'd find walking the site themselves

## Working assumptions (to validate with Turner, not blockers)

| Question | Assumption |
|---|---|
| Which trade/site to start with | Electrical and scaffolding on one active project — structurally different hazard profiles (Subpart K vs. L/M), and both show up disproportionately in OSHA's most-cited standards, so the gap is fast to demonstrate. |
| Foreman-driven or superintendent-driven photo submission | Submission sits with the sub's competent person/safety rep — they're on-site with the work daily. Superintendent gets rollup visibility, not submission duty. |
| Do compliance records need to live inside Turner's existing systems | Standalone for the pilot, deliberately — reduces integration risk and timeline. Integration with whatever Turner runs today (Procore, HammerTech, or otherwise) becomes a real conversation only once the pilot earns the right to expand. |
| Non-English-primary crews | Not a pilot blocker — see non-goals above. |
| Does a flagged status need an escalation/notification workflow | Yes, at minimum a notification to the Project Safety Manager. A flag nobody sees isn't a same-day answer, it's a log entry. |
| Who marks a flagged status resolved | The Project Safety Manager, after a corrected photo or a documented override — not the sub. Self-clearing would undercut the record's whole reason for existing. |
| Internal terminology | Use "competent person" and "safety representative" — OSHA-standard terms Turner already uses — rather than inventing new labels. |
| Who holds budget | Corporate EH&S/Risk, with the Project Safety Manager as the on-the-ground champion making the case upward. |

---

*This concept is deliberately narrow. The three non-negotiables for a credible pilot: protocols that visibly reflect the actual task (not templated), a review cadence with real timestamps, and photo verification with a same-day answer. Everything else — the dashboard, the rollup, the polish — supports those three and shouldn't be allowed to become the point.*
