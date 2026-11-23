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

## Phase 2: billing-core (2026-11-21)

**Generated:** money, periods, coverage, chargeMachine, dunning, reconcile, guard, their tests, ADR-005.

**Process.** Tests were written before the implementation for money, coverage, chargeMachine, dunning
and reconcile (confirmed red, then green). `periods` and `guard` were written test-and-implementation
in one pass, so they did not get a genuine red step; the mutation check below is what I rely on there.

**Verified:** 264 tests pass; coverage 99.4% statements / 97.4% branches / 98.5% functions / 99.3%
lines (gate is 95%). Manual mutation check: 12 hand-made mutants (boundary flips, inverted
comparisons, removed validation), all killed. This is my own script, not a mutation-testing tool.

**What the AI got wrong or made up:**

- My own test expectations were wrong twice: a "Home example" test whose amounts did not add up to the
  spec's $20.23 spare, and a dunning test that expected no retry when one fit. Caught by running the
  tests; the implementations were right.
- `cancelAfterGivenUpPeriods = 2`, "past_due is still charged", and "insufficient allowance goes to
  needs_review" are my assumptions, listed in ADR-005 for you to confirm.
- Added `guard.ts`, which you did not ask for.
- Local tooling became very slow mid-phase (a typecheck took 75 s; ESLint config imports took 60+ s
  each; a full lint 2m54s) with the CPU idle, then recovered once files were cached. This points at
  slow disk reads (Spotlight was indexing; the repo lives under ~/Desktop, which may be synced), not at
  the code. Unconfirmed. If it recurs, move the repo out of ~/Desktop. CI timing is the real check.

**You reviewed / changed:** _(fill in after your review)_

## Phase 3, commit 1: Storybook setup (2026-11-22)

**Generated:** Storybook 10.6.8 config in `packages/ui/.storybook`, vitest "storybook" project (stories
run as tests in real Chromium, with axe), CI steps (story tests, Storybook build, artifact), a seed
`Foundations/Colors` story, shared `base.css`, ADR-005 owner confirmations.

**Verified rather than assumed:** I planted a story with an unnamed button and low-contrast text and
confirmed the story test FAILS on both axe rules (`button-name`, `color-contrast`), with and without
my setup file. So "axe-clean" in later commits means something. Unit (264), stories (3), web e2e (8),
typecheck, lint and format all pass in the new `~/code/cadence` clone, and lint now takes seconds.

**What the AI got wrong or flagged:**

- I wrote a `setProjectAnnotations` setup file out of habit; Storybook 10.3+ applies the annotations
  automatically (its own log said so). Removed.
- Added `@vitejs/plugin-react` from my plan, then removed it: `@storybook/react-vite` already bundles it.
- Storybook sends anonymous telemetry by default; disabled in `main.ts`.
- Known, not fixed: `eslint-plugin-react` / `-react-hooks` (pulled in by eslint-config-next) declare
  peer support only up to ESLint 9, while we run ESLint 10. Lint works today; if a plugin misbehaves,
  pinning ESLint 9.39.5 is the fix.
- `esbuild`'s build script is ignored by pnpm's default policy; Storybook still builds and tests run.
- Branch protection could not be applied: the repo is still PRIVATE (confirmed three ways), so GitHub
  returns 403. Phase 2 had landed in `phase-1/scaffold` rather than `main`; fixed by PR #3.

**You reviewed / changed:** _(fill in after your review)_

## Phase 3, commit 2: primitives (2026-11-22)

**Generated:** `MoneyText`, `StatusPill`, `MonogramTile`, `ConsentSheet` (native `<dialog>`), their stories
and play tests, `merchantColor` (FNV-1a), `groupThousands`, `cx`, `components.css`.

**Verified:** 36 story tests (render + play + axe), 274 unit tests, 8 e2e, typecheck, lint, Storybook
build. I viewed screenshots of the sheet, pills, palette and awkward names at 390px. Two deliberate
sabotages of `ConsentSheet` were caught: losing focus after close fails 4 tests; removing Esc handling
fails 2. So the focus-return and Esc tests can fail.

**What the AI got wrong:**

- **I deleted the ADR-004 hatch rule.** A script I wrote to replace the reduced-motion block in
  `tokens.css` truncated the rest of the file, including `.hatch-uncovered`. The grayscale e2e test from
  ADR-004 caught it. Restored (now in `components.css`). Lesson: edit CSS with targeted replacements.
- My first focus-trap test asserted "focus is always inside the dialog". A trace showed focus goes to
  `<body>` (browser UI) after the last control, as native modal dialogs do. The test over-asserted; it
  now checks the real guarantee: the page behind never receives focus, by Tab or by script.
- I wrote `merchantColor`'s pinned test values without computing them (wrong order). Two are now
  checked against published FNV-1a vectors; `studio-notes` is a regression pin only.
- Prettier reflowed one expression into an ASI hazard that ESLint flagged; rewritten as statements.
- A static-file server in Python was unreachable here (probably the macOS firewall); used Node.

**Changed from the Phase 1 tokens:** under `prefers-reduced-motion` the durations are no longer zeroed:
the spec says everything becomes a fade, so each component fades instead. `--motion-fade: 200ms` is my
choice; the spec gives no fade duration.

**Design choices to confirm:** `StatusPill` labels and tones (Paid / Pending / Past due / Needs review /
Failed / Canceled / Expired / Scheduled / Active); the Failed pill is an outlined red pill because the
spec defines no light-red background; monogram letters are Instrument Serif at 24-36px so white-on-tile
only needs 3:1 (WCAG large text); `ConsentSheet` closes instantly (the spec only defines the slide-up).

**You reviewed / changed:** _(fill in after your review)_
