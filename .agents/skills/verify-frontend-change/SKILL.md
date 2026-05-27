---
name: verify-frontend-change
description: Run targeted TypeScript, lint, and test checks on changed frontend files before opening a PR.
triggers: ["user"]
---

## Setup
1. `cd superset-frontend`
2. Run `npm install` if `node_modules` does not exist

## Verify Changed Files
1. Identify changed files: !`git diff --name-only`
2. Run TypeScript check: `npx tsc --noEmit`
   - If baseline errors exist, count them BEFORE your changes
   - Verify your changes do not increase the error count
3. Run ESLint on changed files: `npx eslint --no-error-on-unmatched-pattern <changed-files>`
4. Run related tests: `npm test -- --findRelatedTests <changed-files> --passWithNoTests`

## Report
- List each check: pass or fail
- If any check fails, explain which file and why
- If baseline already fails, report baseline count separately

## Current Context
- Branch: !`git branch --show-current`
- Changed files: !`git diff --name-only`
