# Fix Issue

Fix the GitHub issue specified by the argument: $ARGUMENTS

1. Fetch the issue details using `gh issue view`
2. Read all relevant source files to understand the context
3. Implement the fix with minimal changes
4. Run `npm run build` to verify no build errors
5. Run `npx tsc --noEmit` to verify type safety
6. Create a descriptive commit referencing the issue number (e.g., "fix: resolve #123 — description")

If the issue is unclear or requires design decisions, ask before implementing.
