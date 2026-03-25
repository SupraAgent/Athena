# Code Review

Review the current branch's changes against `main`. For each changed file:

1. Run `git diff main...HEAD` to see all changes
2. Check for:
   - TypeScript type safety (no `any` unless justified)
   - Proper error handling
   - React patterns (proper use of server/client components)
   - Security issues (key exposure, XSS, injection)
   - Performance (unnecessary re-renders, missing memoization)
3. Verify imports are clean (no unused imports, no circular dependencies)

Output a structured review with:
- **Issues** (must fix before merge)
- **Suggestions** (nice to have)
- **Approval status** (approve / request changes)
