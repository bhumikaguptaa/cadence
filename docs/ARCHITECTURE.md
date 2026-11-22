# Cadence: Architecture & Phase 0 findings

Status: Phase 0 (recon). No application code yet. Research date: 2026-11-21.
Confidence tags: **[V]** verified in a primary source (docs/source/registry), **[S]** from a summarized fetch, **[?]** unverified. Anything tagged [S] or [?] must be re-checked against the installed package's `.d.ts` files in Phase 1/6 before we depend on it.

## 1. What the docs actually say (vs. the brief)

| # | Brief assumption | What I found | Impact |
|---|---|---|---|
| 1 | Docs live at docs.base.org (Accept Recurring Payments, Base Pay Subscriptions, Spend Permissions guide) | **Moved.** docs.base.org/llms.txt has none of these. `/sdks/migrated-products` says the Base Account SDK docs moved to Coinbase Developer Platform (CDP) as the **"Coinbase Wallet SDK"**; the npm package is still `@base-org/account` [V]. Docs now at `docs.cdp.coinbase.com/coinbase-wallet/...` | Use CDP docs as source of truth. |
| 2 | "Base App" | **Renamed Coinbase Wallet.** MiniKit/mini apps are **sunset**; Base App/Coinbase Wallet "supports standard web apps in its in-app browser" [V]. OnchainKit deprecated, no replacement (its Fund component is gone) [V]. | Confirms: build a normal web app, not a mini app. |
| 3 | "Spend permissions in Base App are coming soon" | CDP spend-permissions page: "Spend Permissions in Coinbase Wallet (formerly known as Base App) are coming soon" [V]. The subscriptions guide does **not** repeat this and treats subscriptions as live [V]. | Caveat is about the wallet *app*, not the SDK. Browser web app + Base Account sign-in is fine. **Risk:** users opening Cadence inside the Coinbase Wallet in-app browser may not get spend permissions yet. We'll detect and show a "open in your browser" state. |
| 4 | `base.subscription.subscribe({ recurringCharge, subscriptionOwner, periodInDays })` | Correct [V]. Also takes `testnet`, `requireBalance`, `telemetry`. Returns `{ id, subscriptionOwner, subscriptionPayer, recurringCharge, periodInDays }`; **`id` is the permission hash** [V]. | Our `subscriptions.permission` jsonb + `id` hash map cleanly. |
| 5 | `getStatus` | **Resolved against the 2.6.0 tarball (2026-11-21) [V]:** `base.subscription.getStatus` exists (alias of the internal `getSubscriptionStatus`), on both the browser and node `base` objects. Returns `isSubscribed, recurringCharge, remainingChargeInPeriod, currentPeriodStart, nextPeriodStart, periodInDays`. | Use `base.subscription.getStatus`. Still wrapped by our adapter. |
| 6 | `prepareCharge`/`prepareRevoke` run on the backend, plus `@base-org/account/node` | Partly. `prepareCharge`/`prepareRevoke` just build call data (`[{to,data,value}]`). The backend *executor* is `base.subscription.charge({id, amount, expectedPayer, recipient, paymasterUrl, testnet})` and `.revoke(...)` from `@base-org/account/node`, plus `getOrCreateSubscriptionOwnerWallet({walletName})` [V names, S details]. | Use `charge()` for the scheduler, not hand-rolled prepareCharge. |
| 7 | CDP API key id, secret, wallet secret | Confirmed: `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`, `CDP_WALLET_SECRET`; optional `PAYMASTER_URL` for gasless [V]. `charge()` "requires the permission spender to be your CDP smart wallet" [V]. | The `subscriptionOwner` is a CDP **smart wallet** we create via `getOrCreateSubscriptionOwnerWallet`. One key set per environment. |
| 8 | Lower-level primitives | Import path is **`@base-org/account/spend-permission`**. Exports (V): `requestSpendPermission, fetchPermission, fetchPermissions, getPermissionStatus, prepareSpendCallData, requestRevoke, prepareRevokeCallData, getHash`. `getPermissionStatus` → `{ isActive, remainingSpend }`. `prepareSpendCallData(permission, amount \| 'max-remaining-allowance', recipient?, {rpcUrl}?)` [V]. Other signatures [?]. | Fine for our pre-charge allowance check. |
| 9 | Spend permission struct / manager | Fields: `account, spender, token, allowance(uint160), period(uint48, **seconds**), start, end, salt, extraData` [V]. `SpendPermissionManager = 0xf85210B21cC50302F477BA56686d2019dC9b67Ad` (from SDK `constants.ts` on master) [V source, re-verify on Basescan]. | Period = seconds, anchored at `start`. |
| 10 | Testnet | `testnet: true` → Base Sepolia 84532 [V]. **`overridePeriodInSecondsForTestnet` is present in published 2.6.0 [V]**: in `subscribe.d.ts`/`types.d.ts` (typed so it requires `testnet: true`; `periodInDays` is then ignored) and in `subscribe.js` (runtime throws if used without `testnet: true`). Doc example uses 300 s. | Phase 6's two-period test is unblocked: use ~300 s periods. Remaining unknown is only on-chain behavior (minimum period, SpendPermissionManager rules), which Phase 6 confirms. |
| 11 | USDC only | SDK validates the permission is USDC-on-Base (`validateUSDCBasePermission`) [V]. USDC: Sepolia `0x036CbD53842c5426634e7929541eC2318f3dCF7e`, mainnet `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (Circle page) [V]. 6 decimals [?: no page stated it; confirm via `decimals()` call]. | Matches. |
| 12 | Add USDC from inside the app | OnchainKit Fund is deprecated [V]. Current path: **Coinbase Onramp** (CDP). Server creates a single-use session token (5 min) via `POST api.developer.coinbase.com/onramp/v1/token` with a CDP **Secret** key, then redirect to `https://pay.coinbase.com/buy/select-asset?sessionToken=...` [V]. Trial mode for new integrations; **Base Sepolia support unconfirmed** [?]. | Mainnet: Onramp redirect. Testnet: link to Circle faucet (`faucet.circle.com`) with the exact amount shown. Wallet-tab "Add USDC" has two implementations behind the env flag. |
| 13 | Sign in with Base | SIWE via `wallet_connect` with `signInWithEthereum` capability; verify with viem `verifyMessage`; fallback to `eth_requestAccounts` + `personal_sign`. `SignInWithBaseButton` in `@base-org/account-ui/react`. No CDP creds needed [V]. Example uses mainnet chainId; testnet [?]. | Auth = SIWE nonce + signature → httpOnly session cookie. Smart-wallet signatures are ERC-1271, so verify with viem's public client `verifyMessage` (handles 1271), not raw ecrecover. |
| 14 | Basenames | Docs moved; resolution method not verified [?]. Basenames resolve on Base mainnet via ENS-style resolver; Sepolia has separate deployment. | Defer to Phase 5; wrap in `resolveName()` with address-shortening fallback. |
| 15 | Billing periods are "every 30 days" | On-chain the period is `period` seconds from `start`, not calendar months. `periods.ts` must compute `period_index = floor((now - start) / period)` using the permission's own `start`/`period`. | Core design constraint for `periods.ts`. |

## 2. Findings that change the design (read these)

1. **Funds route through a platform-controlled wallet.** `charge()` spends from the subscriber into the CDP subscription-owner smart wallet, and `recipient` triggers a follow-up ERC-20 transfer to the merchant [V in `prepareSpendCallData`]. So on-chain there are two hops: subscriber→owner wallet, then owner→merchant payout. `reconcile.ts` must match the *pair* and the brief's check ("Transfer from subscriber to merchant payout") becomes "Transfer subscriber→owner for amount, and owner→payout for amount, in the same tx." It also means Cadence is briefly a custodian of merchant funds; ADR it. **Open question Q1.**
2. **Single spender per environment.** All subscriptions name the same `subscriptionOwner`, so one compromised wallet secret drains *up to the signed caps* of every subscriber. That's bounded by permissions, and is exactly why the secret is server-only, never logged, and has a rotation plan (§6).
3. **No built-in scheduler or retry.** Dunning, idempotency and period tracking are entirely ours, as the brief assumed. Retrying within a period is safe because allowance is per-period and resets only at the next boundary.
4. **Allowance is per period and does not roll over** [V]. Failed charge not recovered before the period ends = lost for that period. The dunning window (+2d, +5d) must fit inside the period; for short test periods it's scaled (see §5).
5. **Package versions.** `@base-org/account` latest = 2.6.0 (registry, 2026-10-29) [S]. Pin exact version; there's a canary channel I'll avoid.

## 2a. Decisions (owner answers, 2026-11-21)
1. **Two-hop custody accepted.** Forward to merchant `payout_address` in the same transaction (`recipient` option). `reconcile.ts` verifies **both** transfers (subscriber→owner wallet, owner→payout); any mismatch → `needs_review`. Alert if the owner wallet holds USDC after a charge settles. ADR-002 covers the custody tradeoff and what a non-custodial design would need.
2. **Sign-in button:** keep "Continue with Base"; use the SDK's official `SignInWithBaseButton` (`@base-org/account-ui`, v1.0.1) if it fits the design, otherwise match its guidelines in our own button. Re-check brand guidance in Phase 9.
3. **Scheduler:** GitHub Actions `schedule` calling the protected cron endpoint, plus a protected manual "Run now" endpoint. Both go through the same idempotent, lock-safe processor.
4. **Gas:** owner wallet pays ETH gas. Record gas used and cost per charge (new `charges.gas_used`/`gas_cost_wei`). Paymaster evaluated in Phase 6.
5. **Onramp:** owner applies for CDP Onramp access. Testnet "Add USDC" links to the Circle faucet, labeled TESTNET.
6. **Corrections from 2.6.0 typings:** `charge()` returns a `ChargeResult` whose `id` is the charge tx hash and `subscriptionId` is the permission hash; `charge()` accepts `rpcUrl` (use our own RPC to avoid public rate limits) and `expectedPayer` (always pass it). Node `base.subscription` exposes `charge`, `revoke`, `getOrCreateSubscriptionOwnerWallet`; browser `base.subscription` exposes only `subscribe`, `getStatus`, `prepareCharge`, `prepareRevoke`.

## 3. Mini app vs. web app decision
Web app. Mini apps are sunset; Coinbase Wallet in-app browser runs standard web apps but spend permissions there are "coming soon." ADR-001.

## 4. System architecture

```
Browser (Next.js, wagmi/viem, @base-org/account)
   │  SIWE sign-in, base.subscription.subscribe (passkey), requestRevoke
   ▼
apps/web (Next.js route handlers, zod-validated, session cookie)
   │            ├── /api/cron/charge  (secret-protected, idempotent)
   │            └── /api/onramp/session (mainnet only)
   ▼
packages/billing-core (pure TS, fake clock): money · periods · coverage · chargeMachine · dunning · reconcile
   ▼
Postgres (Neon) via Drizzle  ←→  CDP smart wallet (@base-org/account/node charge/revoke)
                                  viem public client → verify USDC Transfer logs
```

Package layout, data model and invariants are as in the brief §3 with these amendments:
- `subscriptions.permission` jsonb stores the signed permission plus its hash (`id`); add `permission_hash` column (unique) for lookups.
- `charges` gains `period_start`/`period_end` (derived from permission `start`+`period`) and `payout_tx_hash` if the two-hop transfer is separate. UNIQUE (subscription_id, period_index) stays.
- `events` is insert-only: enforce with a DB trigger or revoked UPDATE/DELETE grants.
- Scheduler locking: `SELECT ... FOR UPDATE SKIP LOCKED` on due charges, status flip `scheduled→submitted` in the same transaction *before* the network call, so a double run can never double-submit. Crash between submit and receipt → reconciler resolves by tx hash/logs, never by blind retry.
- Money: `bigint` micro-USDC in `billing-core`; Drizzle `bigint` mode `bigint`; strings on the wire; conversion to the SDK's decimal-string `recurringCharge` happens in one tested function.

## 5. Billing engine notes
- **State machine** exactly as brief §5. `needs_review` is terminal until a human acts.
- **Dunning** constants: retries at +2d and +5d after first failure, then `given_up`. Make it a function of `periodSeconds` (cap retries before period end) so test-period runs (minutes) work.
- **Pre-charge check:** `getPermissionStatus` → if `!isActive` mark canceled with event `permission_revoked` (no error noise); if `remainingSpend < amount` → treat as `needs_review` (it implies we mis-tracked the period), never retry blindly.
- **Post-charge verify:** parse receipt logs with viem; mismatch → `needs_review`.

## 6. Security plan (summary; full doc in Phase 8)
- CDP secrets only in server env (Vercel encrypted env vars), validated at boot with zod, wrapped in a redacting logger. Separate CDP projects/keys for testnet vs mainnet.
- Rotation: create new wallet secret in CDP → deploy → verify a testnet charge → delete old. Note: rotating the **wallet secret** does not change the owner address; confirm exact procedure in CDP docs [?] before Phase 9.
- Cron endpoint: bearer secret + constant-time compare; also reject non-POST.
- SIWE: server-issued single-use nonce, domain/chainId/expiry checks.
- Per-merchant row scoping in a single data-access layer; isolation test in Phase 4.

## 7. Phase task list
- **P1** workspace, Next.js, strict TS, ESLint/Prettier, Vitest, Playwright, CI, tokens (Tailwind + CSS vars), fonts, Vercel shell, README.
- **P2** billing-core TDD (money → periods → coverage → chargeMachine → dunning → reconcile), fast-check, ≥95% coverage.
- **P3** components + dev page/Storybook, axe, snapshots 390/1280, reduced motion.
- **P4** Drizzle schema/migrations, route handlers, zod, SIWE auth, rate limit, request-ID logs, Postgres integration tests (testcontainers or Neon branch), isolation test.
- **P5** subscriber screens + extra states, demo data labeled "Sample data".
- **P6** Sepolia end-to-end (subscribe, charge ×2, fail on low balance, recover, cancel); Playwright with mocked wallet.
- **P7** merchant dashboard, demo merchant, plan creator; stretch webhooks.
- **P8** hardening, Lighthouse budget, analytics, security pass.
- **P9** mainnet flag, friends test, README.

## 8. Open questions for you
1. **Custody/two-hop (finding 2.1):** OK to accept that merchant funds transit the CDP owner wallet and we forward to `payout_address` in the same transaction? (Alternative: drop `recipient`, have merchants be the spender, which loses the multi-merchant platform story.) My recommendation: accept and ADR it.
2. **Name:** the SDK/docs now say "Coinbase Wallet"; in UI copy I'll say "Continue with Base" as in your design unless you want me to follow the rebrand. Recommendation: keep "Base" in the wordmark button (that's what `SignInWithBaseButton` ships), re-check before launch.
3. **Cron frequency:** Vercel's Hobby plan limits cron to once daily [?, verify]. For short test periods we need minute-level. Options: Vercel Pro, GitHub Actions `schedule` (5-min min), or an external pinger. Recommendation: GitHub Actions schedule + manual "Run now" for demos.
4. **Mainnet Onramp** requires CDP trial-mode approval and a domain allowlist; fine to apply early?
5. **Gas:** pay gas from the owner wallet in ETH, or use a paymaster (`PAYMASTER_URL`)? Recommendation: start with ETH on Sepolia, evaluate paymaster in P6.

## 9. Accounts to set up (in order)
1. GitHub repo (private until Phase 9) → branch protection on `main`.
2. **Neon** Postgres (one project, branches for dev/test/prod).
3. **CDP account/project** (portal.cdp.coinbase.com): create a **Secret API Key** (id + secret) and a **Wallet Secret**. These are money-moving; store in a password manager, not in files or chat.
4. **Faucets:** Circle (faucet.circle.com → Base Sepolia, USDC) and CDP faucet (ETH, 0.1/24h). You'll need ≥3 test wallets: subscriber (funded), low-balance subscriber, merchant payout. Subscriber wallets are Base Accounts (passkey), created through the app.
5. **RPC provider** (Alchemy or similar, free tier) for reliable Sepolia reads; public `sepolia.base.org` is rate-limited.
6. **Vercel** project linked to the repo; env vars per environment.
7. (Phase 9) CDP Onramp trial approval + domain allowlist; optional custom domain.

## 10. Not yet verified (carry into Phase 1/6)
Phase 9 checklist item: re-check Base/Coinbase Wallet brand guidance for the sign-in button and wordmark copy.
Resolved: 2.6.0 export surface, `getStatus` name, `overridePeriodInSecondsForTestnet`. Still open: reference pages for `charge`, `revoke`, `getOrCreateSubscriptionOwnerWallet`, `fetchPermission(s)`, `getPermissionStatus` signatures; chain-specific manager addresses; Onramp on Sepolia; Basename resolution path; SIWE on Sepolia; wallet-secret rotation procedure; Vercel cron limits; USDC `decimals()` on-chain.
