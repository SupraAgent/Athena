# Deploy

Build and verify the current branch for deployment.

1. Run `npm run build` to verify the build succeeds
2. Run `npx tsc --noEmit` for type checking
3. Check `git status` — warn if there are uncommitted changes
4. Confirm the current branch and latest commit with the user
5. Push to the remote branch
6. Report the deployment status
