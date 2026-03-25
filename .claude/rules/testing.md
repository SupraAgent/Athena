# Testing

## Build Verification
- Always run `npm run build` before committing to catch build errors.
- Run `npx tsc --noEmit` separately to catch type errors the build might miss.

## Pre-commit Checks
- `npm run build` must pass
- `npx tsc --noEmit` must pass
- No console.log statements in committed code (console.error/warn are OK)
