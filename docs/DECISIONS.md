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
