# Decisions (ADRs)

Format: context, decision, rejected alternatives, consequences, interview questions.

---

## ADR-001: Normal responsive web app, not a mini app (Phase 0/1)

**Context.** The brief asked to verify whether Cadence could be a Base App mini app. Docs research
(2026-11-21): MiniKit/mini apps are sunset; Base App was renamed Coinbase Wallet and runs standard web
apps in its in-app browser; spend permissions in that app are documented as "coming soon".

**Decision.** Build a responsive Next.js web app that signs in with Base Account in a regular browser.

**Rejected.** Mini app (sunset). Wallet-in-app-browser-first (spend permissions not yet supported there).

**Consequences.** We need a calm "Open in your browser" state (docs/DESIGN_NOTES.md). The caveat
must be re-checked in Phase 6 and Phase 9.

**Interview questions.**

1. How did you decide the platform when the docs and the brief disagreed? (Verified against primary sources, wrote down what changed.)
2. What is the user-visible failure if a user opens your app in an unsupported wallet browser, and how did you design for it?

---

## ADR-002: Two-hop custody through a platform-controlled owner wallet (Phase 0)

**Context.** The Base subscription API charges through `charge()` from `@base-org/account/node`. The
spender (`subscriptionOwner`) must be a CDP smart wallet. With the `recipient` option, USDC is spent
from the subscriber to the owner wallet and then transferred to the merchant. So Cadence's wallet
briefly holds merchant funds, in the same transaction.

**Decision (owner-approved 2026-11-21).** Accept it. Forward to the merchant `payout_address` in the
same transaction. `reconcile.ts` verifies **both** transfers (subscriber to owner, owner to payout)
for the exact amount; any mismatch goes to `needs_review`. Alert if the owner wallet holds USDC after
a charge settles. Log gas cost per charge (owner wallet pays ETH gas for now).

**Rejected.**

- Merchant as the spender: no custody, but every merchant would run a CDP wallet and secret; loses the
  platform story.
- Hand-built charges without `charge()`: re-implements what the SDK already audited.

**What a non-custodial design would need.** (a) Funds never rest in a Cadence-controlled account: the
merchant, or a protocol contract, must be the direct payee of the spend. Base documents an
escrow-backed "Charge on a Schedule" flow (Commerce Payments Protocol, `SpendPermissionPaymentCollector`)
that pays per period via a fresh `PaymentInfo` and salt; it would need its own evaluation. (b) The
operator key may only trigger charges, not redirect funds: recipient fixed on-chain per permission.
(c) A scheduler we still run, but with no balance to steal. (d) Different failure handling, since
escrow adds states (authorize, capture, void).

**Consequences.** One wallet secret can spend up to every subscriber's signed cap, bounded by their
permissions, so it is server-only, never logged, rotated per a documented plan. The wallet should end
each charge at zero USDC; a non-zero balance is an alert.

**Interview questions.**

1. What is the worst case if the wallet secret leaks, and what limits the blast radius?
2. How would you make this non-custodial, and what would you lose?
3. Why verify both transfers instead of trusting the SDK's `success: true`?

---

## ADR-003: Toolchain choices (Phase 1)

**Decision.** pnpm workspace, Node 24, Next.js 16 (App Router), React 19, Tailwind 4 with tokens in
CSS (`@theme`), Vitest 5, Playwright, ESLint 10 flat config + typescript-eslint, Prettier.
TypeScript is pinned to **5.9.3**, not the newer 7.x: typescript-eslint 8.73 declares support for
`<6.1.0`, so 7.x would break linting. Revisit when typescript-eslint supports it.

TS strictness beyond `strict`: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`verbatimModuleSyntax` (this replaces the `consistent-type-imports` lint rule, which needs
type-aware linting).

**Rejected.** Turborepo (one `pnpm -r` is enough for 3 packages; add if CI time hurts). Storybook for
Phase 3 (leaning to a `/dev/components` page: less to maintain; decide at Phase 3 start). A Tailwind
config file (v4 is CSS-first; the tokens stay in one CSS file that the `ui` package owns).

**Consequences.** Contrast ratios are computed from real token values and asserted in unit tests, so
a token change that breaks accessibility fails CI.

**Interview questions.**

1. Why did you pin TypeScript below the latest major? (Tooling compatibility, checked via peer ranges.)
2. Why compute contrast in tests instead of eyeballing a design file?
3. Why is billing logic in a package with no React or network dependency?

---

## ADR-004: Never rely on color alone for covered vs. uncovered (Phase 1)

**Context.** The spec's covered green (#1E9A68) and heads-up amber (#C77700) have a 1.03:1 lightness
ratio, contradicting the spec's own rule that colors to be told apart must differ in lightness.

**Decision (owner-approved 2026-11-21).** Add a non-color cue: hatching plus a text label on uncovered
rhythm-strip segments. Add `amber-ink #8A5200` (at least 4.5:1 on all light surfaces) for amber text
and thin strokes. Keep the spec's original tokens otherwise.

**Rejected.** Only darkening the amber (fixes lightness but still leaves color as the sole carrier;
fails for monochrome displays and some color-vision types). Changing the covered green (departs
further from the spec).

**Consequences.** Every state that uses color to carry meaning needs a second channel (text, icon or
pattern). A grayscale readability test guards this; it must be re-run on the real component in Phase 3.

**Interview questions.**

1. WCAG 1.4.1 says color must not be the only means of conveying information. How did you apply it?
2. How do you test "readable in grayscale" automatically, and what are the limits of that test?
3. A design spec contradicts accessibility rules. What do you do? (Flag it, propose, get sign-off, record it.)

---

## ADR-005: billing-core design rules (Phase 2)

**Context.** `packages/billing-core` is the platform piece: pure TypeScript, no React, no network, no
clock reads. Every rule below is enforced by tests (264 tests, property-based where it fits, 99% line
coverage, and a manual mutation check where 12 of 12 deliberately broken lines were caught).

**Decisions.**

1. **Money is bigint micro-USDC.** `parseUsdc` is strict: digits and one optional point only. Signs,
   exponents, separators, spaces and a JS `number` are rejected. More than 6 decimals throws
   `TOO_MANY_DECIMALS`; nothing is ever rounded on input. Rounding exists only in three named helpers,
   `divFloor` (amounts we may spend), `divCeil` (amounts we need, e.g. a top-up), `divRoundHalfUp`
   (display only; exact halves go up). Wire format is a canonical integer string.
2. **Periods mirror the chain.** Seconds, not calendar months; period 0 starts at the permission
   `start`; `start` inclusive, `end` exclusive. Allowance does not roll over, so only the _current_
   period can be charged: a missed period is lost, we never catch up. Each window carries a
   `deadline = min(period end, permission end)`.
3. **Coverage is conservative.** Charges sorted by due time, then subscription id (code-unit order,
   not locale), then amount, so output never depends on input order. The first charge that does not
   fit is "uncovered"; everything after it is also reported uncovered. `shortfall` is the exact
   top-up for that first charge; `coveredTotal + spare == balance` always.
4. **The charge machine never throws on a bad move.** `transition()` returns `{ok:false, error}`.
   All 42 (status x event) pairs are tested against a hand-written table. `flag_anomaly` is legal
   from every state except `needs_review` (even `succeeded`, for late duplicate detection) and clears
   any retry time so the scheduler cannot pick the charge up. Only an explicit human
   `resolve_review` leaves `needs_review`.
5. **Dunning scaling rule (exact).** `offset_k = max(offset_(k-1) + 1, 1, min(cap_k, floor(period *
fractionBps_k / 10000)))`, measured from the first failure. Defaults: 20% capped at 2 days, 50%
   capped at 5 days. 30-day period: +2d, +5d. 5-minute test period: +60s, +150s. A retry is only
   scheduled strictly before the deadline; after the last retry, or if none fits, give up.
6. **Reconcile is strict.** A charge is `matched` only if the transaction contains exactly one
   subscriber to owner USDC transfer and exactly one owner to payout transfer, both for the plan
   amount, and nothing else. Anything else is `needs_review` with all reasons named in a fixed order.
   A reverted transaction is a plain `failed`. A non-zero owner balance afterwards adds an alert.
7. **`guard.ts` (not in the original plan).** One pure pre-charge function for the four brief
   invariants, returning the first violated rule and what to do (`skip`, `mark_revoked`,
   `needs_review`).

**Confirmed by the owner (2026-11-22; these were my assumptions, not from the docs).**

- `cancelAfterGivenUpPeriods = 2`: the first given-up period makes the subscription `past_due`, a
  second consecutive one cancels it.
- A `past_due` subscription is charged for the **current period only** and is **never back-charged**.
  A missed period is gone, not owed. The UI must say so (the `MissedPeriodNote` component, shown on the
  subscription detail screen and in the charge history of `past_due` subscriptions).
- Insufficient remaining allowance on an active permission goes to `needs_review`, not a retry.
- `guard.ts` stays.

**Rejected.** A `Money` class wrapping bigint (more ceremony than value at this size; a named type
alias and strict functions are enough). Floating-point percentages in dunning (basis points keep it
integer). Calendar-month periods (do not match the chain). Marking later smaller charges as covered
after the first shortfall (more accurate but confusing, and the spec says the strip turns amber from
the first shortfall).

**Known limits.** `reconcile` inputs are abstract; real log shapes from the SDK's spend-plus-forward
transaction are confirmed in Phase 6. 5-minute test periods are shorter than the GitHub Actions cron
granularity, so Phase 6 will drive them with the manual "Run now" endpoint.

**Interview questions.**

1. Why is a missed billing period never charged later? (Allowance resets per period and does not roll over.)
2. Why must coverage output not depend on input order, and how did you prove it? (Total order for ties; property test with shuffled input.)
3. Why bigint and strict parsing instead of `parseFloat` and `toFixed(2)`? Name one concrete bug floats cause.
4. Why does reconcile treat "an extra transfer" as an anomaly instead of ignoring it?
5. What does mutation testing tell you that coverage numbers don't?
