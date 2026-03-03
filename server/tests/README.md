# Server Test Organization

Keep tests grouped by feature/security domain in separate folders:

- `security/`
- `consumables/`
- `requisition/`
- `return-requests/`
- `reports/`
- `employees/`
- `office-sub-locations/`
- `asset-items/`
- `manual/` (manual scripts only)

File naming:

- Automated runtime tests: `*.runtime-test.ts`
- Unit/integration style tests: `*.test.ts` or `*.spec.ts`
- Manual helpers: `*.manual-test.ts`

Run by suite:

```sh
cd server
node scripts/run-test-suites.js <suite>
```

Examples:

```sh
node scripts/run-test-suites.js security
node scripts/run-test-suites.js runtime
node scripts/run-test-suites.js all
```
