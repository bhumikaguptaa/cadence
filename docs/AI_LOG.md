# AI log

## Phase 0: Recon (2026-11-21)

**Generated:** docs/ARCHITECTURE.md from research by web-fetch subagents (Base docs index, CDP Coinbase Wallet SDK docs, npm registry, base/account-sdk source, Circle and Onramp docs).

**You reviewed / changed:** _(fill in after your review)_

**What the AI got wrong or could not confirm:**

- The brief's doc locations were stale; the first round of fetches found nothing on docs.base.org until the CDP migration page was followed.
- Several fetches returned truncated pages or model-summarized tails. Findings are tagged [V]/[S]/[?] in ARCHITECTURE.md; [S] and [?] items are not to be relied on until checked against the installed package types.
- Source facts (manager address, `overridePeriodInSecondsForTestnet`) come from the `master` branch, which may differ from published 2.6.0.

## Phase 1: Scaffold + design system (2026-11-21)

**Generated:** workspace config, Next.js shell, Tailwind token theme, tokens/contrast module with
tests, `/dev/tokens` page, Playwright smoke tests, CI workflow, README, ADRs 001-003, design notes.

**Verified rather than assumed:** `overridePeriodInSecondsForTestnet` exists in published
`@base-org/account@2.6.0` (read from the downloaded tarball). All text/graphic contrast pairs were
computed. TypeScript version pinned after reading peer ranges.

**What the AI got wrong or flagged:**

- First `tokens.css` used a circular `@theme inline` (`--color-paper: var(--color-paper)`). Caught
  while writing the file, rewritten before it ran.
- Added a type-aware lint rule that crashed ESLint; removed in favor of `verbatimModuleSyntax`.
- **Spec conflict found:** covered green and heads-up amber differ by 1.03:1 in lightness, which
  violates the spec's own accessibility rule. Not silently fixed; proposal in docs/DESIGN_NOTES.md.
- Not done: Vercel deploy (needs your account), GitHub remote (not created without your OK), CI has
  never run on GitHub, so "CI green" is unverified until you push.

**You reviewed / changed:** _(fill in after your review)_

## Phase 1 follow-up: accessibility conflict resolution

**Generated:** `amber-ink` token, hatch pattern, grayscale Playwright test, ADR-004.

**What the AI got wrong or flagged:** my first grayscale test failed twice because of my own test
bugs (sampled a rounded corner; used viewport-relative clip while the element was below the fold),
not because the design failed. The test only covers a static sample on /dev/tokens until the real
RhythmStrip exists in Phase 3; the DESIGN_NOTES say so.
