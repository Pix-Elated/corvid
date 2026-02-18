---
paths:
  - 'src/state/**'
  - 'src/tickets/**'
  - 'src/warnings/**'
  - 'src/reaction-roles/**'
  - 'src/server-state/**'
---

# State Management Rules

State is persisted as JSON files. No database.

## Conventions

- Always write state atomically (write to temp file, then rename)
- Handle missing/corrupt JSON files gracefully (default to empty state)
- Keep state files small -- don't store full Discord message objects
- State types must be defined in `src/types/index.ts`
- Never store sensitive data (tokens, passwords) in state files
