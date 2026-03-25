# API Conventions

## Route Handlers (Next.js apps)
- All API routes live in `app/api/{name}/route.ts`.
- Export named functions: `GET`, `POST`, `PUT`, `DELETE`.
- Always validate request bodies before processing.
- Return proper HTTP status codes and JSON responses.

## Library Exports (packages)
- Export all public types and functions from the package index.
- Use barrel exports for clean import paths.
- Document breaking changes in commit messages.
