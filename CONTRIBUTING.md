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

## Bundle Budget Gate

- Use bundle budget check for client chunk size:
  - `npm run build:client:budget`
  - `npm run perf:bundle`

## Local Quality Gates

- Install repo hooks once:
  - `npm run hooks:install`
- Pre-commit hook runs:
  - `npm run precommit:checks`
- Manual phase gate command set:
  - `npm run lint`
  - `npm run lint:server`
  - `npm run build:server`
  - `npm run test:security`
  - `npm run test:consumables`
  - `npm run build:client`
  - `npm run perf:bundle`

## Test Folder Separation

- Keep server tests under `server/tests/` by domain folder:
  - `server/tests/security/`
  - `server/tests/consumables/`
  - `server/tests/requisition/`
  - `server/tests/return-requests/`
  - `server/tests/reports/`
  - `server/tests/employees/`
  - `server/tests/office-sub-locations/`
  - `server/tests/asset-items/`
  - `server/tests/manual/` for ad-hoc/manual scripts only
- Do not place test files in `server/scripts/`.
- Use folder-scoped scripts to run only the relevant suite when working on a module.
- Use `npm run test:runtime` or domain scripts (`npm run test:requisition -w server`, etc.) for targeted module validation.
