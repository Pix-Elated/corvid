---
name: add-command
description: Scaffold a new Discord slash command with proper Discord.js v14 patterns
disable-model-invocation: true
argument-hint: command-name
---

# Add Discord Slash Command: $ARGUMENTS

Create a new slash command following project conventions.

## Steps

1. Create `src/discord/commands/$ARGUMENTS.ts`:

```typescript
import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('$ARGUMENTS')
  .setDescription('Description here');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  try {
    // Command logic here
    await interaction.editReply('Done!');
  } catch (error) {
    console.error(`Error in /$ARGUMENTS:`, error);
    await interaction.editReply('An error occurred.');
  }
}
```

2. Register in `src/discord/client.ts` command loader

3. Run `npm run typecheck` to verify

## Conventions

- Use `deferReply()` for operations >3 seconds
- Use `ephemeral: true` for admin-only feedback
- Always catch errors and reply with user-friendly message
- Add command description (Discord requires it)
- Use `PermissionFlagsBits` for permission gates
