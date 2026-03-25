---
name: "Deploy"
description: "Build verification and deployment workflow."
---

# Deploy

## Pre-deploy Checks
1. Verify `npm run build` succeeds
2. Verify `npx tsc --noEmit` passes
3. Check for uncommitted changes

## Deploy Steps
1. Push latest commits to remote
2. Trigger deployment
3. Verify deployment succeeds

## Post-deploy
- Report deployment status (success/failure)
- If failure: capture error and suggest fixes
