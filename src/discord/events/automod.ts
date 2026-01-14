import { Message, EmbedBuilder, TextChannel, ChannelType } from 'discord.js';

// Words that Discord is known to take action against
// These will trigger auto-mute
const BANNED_WORDS = [
  // Slurs and hate speech (obfuscated patterns to catch variations)
  /n[i1!|]gg[e3a]/i,
  /f[a@4]gg?[o0]/i,
  /r[e3]t[a@4]rd/i,
  /tr[a@4]nn/i,
  /k[i1!]ke/i,
  /sp[i1!]c/i,
  /ch[i1!]nk/i,
  /w[e3]tb[a@4]ck/i,
  /b[e3][a@4]n[e3]r/i,
  // Extreme content
  /ch[i1!]ld\s*p[o0]rn/i,
  /cp\s*links?/i,
  /k[i1!]ll\s*y[o0]urs[e3]lf/i,
  /kys\b/i,
];

// Words that trigger a warning but not auto-mute
const WARNING_WORDS = [
  /\bf+u+c+k+\s*y+o+u+\b/i,
  /\bk+i+l+l+\s+y+o+u+\b/i,
  /\bd+i+e+\s+i+n+\s+a+\s+f+i+r+e+\b/i,
];

// Categories to skip (like Orthodox Warriors guild channels)
const SKIP_CATEGORIES = ['ORTHODOX WARRIORS'];

// Log channel name
const MOD_LOG_CHANNEL = 'moderation-log';

interface AutoModResult {
  action: 'mute' | 'warn' | 'none';
  reason?: string;
  matched?: string;
}

/**
 * Check message content against automod rules
 */
function checkContent(content: string): AutoModResult {
  // Check banned words (auto-mute)
  for (const pattern of BANNED_WORDS) {
    const match = content.match(pattern);
    if (match) {
      return {
        action: 'mute',
        reason: 'Used banned/hateful language',
        matched: match[0],
      };
    }
  }

  // Check warning words
  for (const pattern of WARNING_WORDS) {
    const match = content.match(pattern);
    if (match) {
      return {
        action: 'warn',
        reason: 'Used inappropriate language',
        matched: match[0],
      };
    }
  }

  return { action: 'none' };
}

/**
 * Log moderation action to the mod log channel
 */
async function logToModChannel(
  message: Message,
  action: string,
  reason: string,
  details?: string
): Promise<void> {
  if (!message.guild) return;

  const logChannel = message.guild.channels.cache.find(
    (c) => c.name === MOD_LOG_CHANNEL && c.type === ChannelType.GuildText
  ) as TextChannel | undefined;

  if (!logChannel) return;

  const embed = new EmbedBuilder()
    .setTitle(`AutoMod: ${action}`)
    .setColor(action === 'User Muted' ? 0xe74c3c : 0xf1c40f)
    .addFields(
      { name: 'User', value: `${message.author.tag} (<@${message.author.id}>)`, inline: true },
      { name: 'Channel', value: `<#${message.channel.id}>`, inline: true },
      { name: 'Reason', value: reason }
    )
    .setTimestamp();

  if (details) {
    embed.addFields({ name: 'Details', value: `||${details}||` }); // Spoiler to hide offensive content
  }

  if (message.content) {
    const truncated =
      message.content.length > 500 ? message.content.slice(0, 500) + '...' : message.content;
    embed.addFields({ name: 'Message Content', value: `||${truncated}||` });
  }

  embed.setFooter({ text: `User ID: ${message.author.id}` });

  try {
    await logChannel.send({ embeds: [embed] });
  } catch (error) {
    console.error('[AutoMod] Failed to log to mod channel:', error);
  }
}

/**
 * Handle auto-moderation for messages
 */
export async function handleAutoMod(message: Message): Promise<boolean> {
  // Ignore bots
  if (message.author.bot) return false;

  // Ignore DMs
  if (!message.guild || !message.member) return false;

  // Skip certain categories (like guild channels)
  if (message.channel.type === ChannelType.GuildText) {
    const category = message.channel.parent?.name;
    if (category && SKIP_CATEGORIES.includes(category)) {
      return false;
    }
  }

  // Skip if user has ModerateMembers permission (staff)
  if (message.member.permissions.has('ModerateMembers')) {
    return false;
  }

  const result = checkContent(message.content);

  if (result.action === 'none') {
    return false;
  }

  try {
    // Delete the offending message
    await message.delete();

    if (result.action === 'mute') {
      // Auto-mute for 10 minutes
      const duration = 10 * 60 * 1000; // 10 minutes
      await message.member.timeout(duration, `AutoMod: ${result.reason}`);

      // Log the action
      await logToModChannel(message, 'User Muted (10 min)', result.reason!, result.matched);

      // DM the user
      try {
        const embed = new EmbedBuilder()
          .setTitle(`Auto-Moderation: You've been muted`)
          .setDescription(
            `You've been automatically muted in **${message.guild.name}** for 10 minutes.`
          )
          .setColor(0xe74c3c)
          .addFields(
            { name: 'Reason', value: result.reason! },
            {
              name: 'Note',
              value:
                'This was an automated action. If you believe this was a mistake, contact a moderator.',
            }
          )
          .setTimestamp();
        await message.author.send({ embeds: [embed] });
      } catch {
        // User has DMs disabled
      }

      console.log(`[AutoMod] Muted ${message.author.tag} for: ${result.reason}`);
    } else if (result.action === 'warn') {
      // Just log the warning, no mute
      await logToModChannel(message, 'Message Deleted (Warning)', result.reason!, result.matched);

      // DM the user
      try {
        const embed = new EmbedBuilder()
          .setTitle(`Auto-Moderation: Message Removed`)
          .setDescription(`Your message in **${message.guild.name}** was automatically removed.`)
          .setColor(0xf1c40f)
          .addFields(
            { name: 'Reason', value: result.reason! },
            {
              name: 'Note',
              value:
                'Please review the server rules. Repeated violations may result in a mute or ban.',
            }
          )
          .setTimestamp();
        await message.author.send({ embeds: [embed] });
      } catch {
        // User has DMs disabled
      }

      console.log(`[AutoMod] Warned ${message.author.tag} for: ${result.reason}`);
    }

    return true;
  } catch (error) {
    console.error('[AutoMod] Error processing message:', error);
    return false;
  }
}

/**
 * Log manual moderation actions (called from mod commands)
 */
export async function logModAction(
  guild: Message['guild'],
  action: string,
  targetUser: { tag: string; id: string; displayAvatarURL: () => string },
  moderator: { tag: string; id: string },
  reason: string,
  duration?: string
): Promise<void> {
  if (!guild) return;

  const logChannel = guild.channels.cache.find(
    (c) => c.name === MOD_LOG_CHANNEL && c.type === ChannelType.GuildText
  ) as TextChannel | undefined;

  if (!logChannel) return;

  const embed = new EmbedBuilder()
    .setTitle(action)
    .setColor(
      action.includes('Ban')
        ? 0xe74c3c
        : action.includes('Kick')
          ? 0xe67e22
          : action.includes('Mute')
            ? 0xf1c40f
            : 0x3498db
    )
    .addFields(
      { name: 'User', value: `${targetUser.tag} (<@${targetUser.id}>)`, inline: true },
      { name: 'Moderator', value: `${moderator.tag} (<@${moderator.id}>)`, inline: true },
      { name: 'Reason', value: reason }
    )
    .setThumbnail(targetUser.displayAvatarURL())
    .setFooter({ text: `User ID: ${targetUser.id}` })
    .setTimestamp();

  if (duration) {
    embed.addFields({ name: 'Duration', value: duration, inline: true });
  }

  try {
    await logChannel.send({ embeds: [embed] });
  } catch (error) {
    console.error('[ModLog] Failed to log action:', error);
  }
}
