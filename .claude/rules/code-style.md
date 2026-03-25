# Code Style

## TypeScript
- Strict mode. No `any` types unless explicitly justified with a comment.
- Prefer `interface` over `type` for object shapes. Use `type` for unions/intersections.
- Use `const` by default. Only use `let` when reassignment is needed.
- Named exports over default exports (except for Next.js pages/layouts).

## React
- Mark client components with `'use client'` at the top. Server components are the default.
- Colocate component-specific types in the same file.
- Use `lucide-react` for icons.

## Tailwind CSS
- Use Tailwind utility classes directly. No custom CSS unless absolutely necessary.
- Follow mobile-first responsive design.

## File Organization
- Components in their feature directories.
- Shared logic in `lib/` or `core/`.
- API routes in `app/api/` (for Next.js apps).
