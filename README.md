# Cadence.

Subscriptions you can actually see: recurring USDC subscriptions on Base, with a timeline of what
lands when and a warning before a charge would fail.

> Status: **Phase 1 (scaffold + design system)**. Product screens, billing engine and payments
> arrive in later phases. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Run it

Requirements: Node 24, pnpm 10.

```bash
pnpm install
pnpm dev            # http://localhost:3000  (design tokens: /dev/tokens)
pnpm typecheck && pnpm lint && pnpm test
pnpm exec playwright install chromium   # once
pnpm e2e            # builds, serves on :3100, runs smoke tests at 390px and 1280px
pnpm format         # prettier
```

## Layout

- `apps/web`: Next.js App Router app
- `packages/billing-core`: pure TypeScript billing logic (Phase 2)
- `packages/ui`: design tokens (`tokens.css` is the source of truth) and, from Phase 3, components
- `docs/`: architecture, decisions (ADRs), design conflicts, AI log
- `e2e/`: Playwright tests

## Deploying the shell to Vercel

1. Import the GitHub repo in Vercel. Root directory: repo root.
2. Framework preset: Next.js. Build command: `pnpm build`. Output: handled by Next.
3. No environment variables are needed yet.

Secrets (CDP wallet secret, database URL) are server-only and arrive in later phases.
