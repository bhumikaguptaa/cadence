# Design notes and conflicts

## Conflicts between the spec and its own accessibility rules

### 1. Covered green vs. heads-up amber were the same lightness (RESOLVED, ADR-004)

Spec §4: "colors that must be told apart also differ in lightness". The original tokens
`covered #1E9A68` and `heads-up bar #C77700` have luminance 0.244 vs 0.253, a **1.03:1** ratio, so a
color-blind user could not tell the covered part of the rhythm strip from the warning by color.

Owner decision (2026-11-21), implemented in tokens and tests:

- Uncovered segments use the `.hatch-uncovered` pattern (diagonal `amber-ink` stripes on the heads-up
  tint) **and** a text label, e.g. "Not covered · $2.89 short". Covered stays solid.
- New token `amber-ink #8A5200` for amber text and thin strokes on light backgrounds: 5.57:1 on
  paper, 6.07 on sheet, 6.39 on surface, 5.68 on heads-up bg. It also differs from covered green by
  1.79:1 in lightness. `headsUpBar #C77700` stays for large fills only (3.02:1 on paper is graphic-only).
- Tests: token contrast pairs (unit); `e2e/grayscale.spec.ts` renders the track sample in grayscale
  and requires the covered segment to be flat (std 0) and the uncovered one textured (std about 73,
  threshold 40), plus the label. **Phase 3 must re-run this same check against the real RhythmStrip**
  (the current test uses a static sample on /dev/tokens, so the real component is not yet covered).

## State: "Open in your browser" (Coinbase Wallet in-app browser)

Why it exists: spend permissions inside the Coinbase Wallet app (formerly Base App) are documented as
"coming soon", so subscribing there may fail. Detection is a heuristic and is **unverified**
(user agent or the provider's flags); the final check is behavior: if the permission request cannot
be made, show this state instead of an error.

Principles applied: calm tone, one exact action, no blame, say what stays safe.

- Serif title: "Open Cadence in your browser"
- Body: "Approving a subscription isn't available inside this app yet. Nothing has been charged and
  nothing was changed."
- One cobalt pill: "Open in browser" (opens the current URL in the system browser; if the OS blocks
  that, the same button copies the link and its label becomes "Link copied").
- No secondary action, no red, never the word "Error".
- Screen reader: heading plus one button; the page title also says it.

## Phase 9 checklist (additions)

- Re-check Base / Coinbase Wallet brand guidance for the sign-in button and "Continue with Base" copy.
- Re-verify the Onramp state of play and apply the mainnet domain allowlist.
- Alerting: owner wallet holding USDC after a settled charge.
