# AI log

## Phase 0: Recon (2026-11-21)

**Generated:** docs/ARCHITECTURE.md from research by web-fetch subagents (Base docs index, CDP Coinbase Wallet SDK docs, npm registry, base/account-sdk source, Circle and Onramp docs).

**You reviewed / changed:** _(fill in after your review)_

**What the AI got wrong or could not confirm:**
- The brief's doc locations were stale; the first round of fetches found nothing on docs.base.org until the CDP migration page was followed.
- Several fetches returned truncated pages or model-summarized tails. Findings are tagged [V]/[S]/[?] in ARCHITECTURE.md; [S] and [?] items are not to be relied on until checked against the installed package types.
- Source facts (manager address, `overridePeriodInSecondsForTestnet`) come from the `master` branch, which may differ from published 2.6.0.
