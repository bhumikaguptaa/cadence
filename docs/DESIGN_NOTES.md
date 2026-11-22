# Design notes and conflicts

## Conflicts between the spec and its own accessibility rules

### 1. Covered green vs. heads-up amber are the same lightness

Spec §4: "colors that must be told apart also differ in lightness". The tokens `covered #1E9A68` and
`heads-up bar #C77700` have luminance 0.244 vs 0.253, a **1.03:1** ratio. A color-blind user (and
grayscale printing) cannot tell the covered part of the rhythm strip from the amber warning by color.

Decision pending owner OK. Proposal, keeping the exact token values:

- Uncovered segments of the track use a **diagonal hatch** plus a text label ("$2.89 short") and a
  warning icon on the first uncovered marker. Covered stays solid.
- The summary line and the equivalent list below the strip already state coverage in words.
- Alternative if you want color to carry it: darken the amber bar to about `#8A5200` (≈ 5:1 on paper),
  which also separates it from green by lightness.

`packages/ui/src/tokens.test.ts` pins this fact so no component assumes color alone works.

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
