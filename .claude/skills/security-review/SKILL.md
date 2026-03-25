---
name: "Security Review"
description: "Auto-invoked security review for changes touching auth, API routes, or sensitive data handling."
---

# Security Review

Trigger when changes touch auth, API routes, tokens, or user input handling.

## Checklist
- [ ] No secrets logged, serialized to HTML, or included in error messages
- [ ] Protected routes verify session before processing
- [ ] All inputs validated and sanitized
- [ ] Error responses don't leak internal implementation details
- [ ] No raw `dangerouslySetInnerHTML` without sanitization

Output: Pass/Fail with specific findings and remediation steps.
