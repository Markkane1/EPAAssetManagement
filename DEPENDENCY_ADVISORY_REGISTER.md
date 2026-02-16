# Dependency Advisory Register

> Generated: February 16, 2026  
> Command: `npm audit --workspaces --json`

## Summary

- Current advisory count: `0`
- Critical: `0`
- High: `0`
- Moderate: `0`
- Low: `0`

## Remediation Actions Completed

1. Upgraded client build tooling:
   - `vite` -> `^7.3.1`
   - `@vitejs/plugin-react-swc` -> `^4.2.3`
2. Removed `lovable-tagger` from `client` dev dependencies to eliminate vulnerable nested Vite/esbuild subtree.
3. Updated transitive lint stack dependency to patched line:
   - `@eslint/eslintrc` updated to `3.3.3` (pulls `js-yaml@^4.1.1`).
4. Re-ran workspace audit and confirmed zero outstanding advisories.

## Ownership and Policy

- Security Owner: Backend/API maintainer
- Frontend Toolchain Owner: Frontend maintainer
- Policy: No merge if `npm audit --workspaces` reports high/critical advisories. Moderate/low advisories require explicit issue tracking with owner and due date if not remediated within the sprint.

