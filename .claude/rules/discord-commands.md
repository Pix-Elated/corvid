---
paths:
  - 'src/discord/commands/**'
---

# Discord Slash Command Rules

## Adding a New Command

1. Create file in `src/discord/commands/`
2. Export a `data` object (SlashCommandBuilder) and an `execute` function
3. Register in `src/discord/client.ts`
4. Commands use Discord.js v14 `SlashCommandBuilder` pattern

## Conventions

- Commands must have descriptions (Discord requires them)
- Use `interaction.deferReply()` for operations taking >3 seconds
- Always handle errors with `interaction.reply()` or `interaction.followUp()`
- Use `PermissionFlagsBits` enum for permission checks
- Ephemeral replies for admin-only feedback
