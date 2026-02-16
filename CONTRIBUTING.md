# Contributing

## Baseline Security Rules

- Never commit `.env` files, secrets, tokens, or runtime upload artifacts.
- Use cookie auth with CSRF header (`x-csrf-token`) for authenticated mutation requests.
- Keep password handling aligned with server policy:
  - minimum `12` chars
  - upper + lower + number + symbol
- Any password change/reset must invalidate prior sessions via token version bump.
- Keep office-scope authorization checks on every cross-office sensitive mutation path.

## Cleanup and Type Safety Rules

- Avoid `@ts-nocheck`. If unavoidable, track it with an owner and expiry.
- Avoid broad `any`; prefer explicit DTOs, narrow unions, and utility types.
- Keep controllers thin (`parse -> authorize/validate -> delegate -> respond`).
- Reuse shared helpers instead of duplicating parsing/normalization logic.

## Optimization Rules

- Do not introduce unbounded collection reads in hot endpoints.
- Use pagination caps, projections, and `.lean()` on read-heavy routes.
- Keep payload sizes controlled; avoid eager loading large admin views.

## Phase 8 Continuous Ratchet

- Run the monthly ratchet bundle:
  - `npm run phase8:monthly`
- Generated artifacts are written to:
  - `artifacts/phase8/YYYY-MM/debt-metrics.json`
  - `artifacts/phase8/YYYY-MM/security-posture.md`
  - `artifacts/phase8/YYYY-MM/performance-trend.md`
- Performance scenarios covered:
  - `load`
  - `spike`
  - `soak`
- High-debt module changes are CI-gated by:
  - `.github/workflows/high-debt-acceptance.yml`
  - Required gate command: `npm run phase8:acceptance`
  - No-regression check command: `npm run phase8:no-regression`

## Local Quality Gates

- Install repo hooks once:
  - `npm run hooks:install`
- Pre-commit hook runs:
  - `npm run precommit:checks`
- Manual phase gate command set:
  - `npm run lint -w client`
  - `npm run lint:server`
  - `npm run build -w server`
  - `npm run build -w client`
  - `npm run test:security -w server`
  - `npm run perf:bundle`
