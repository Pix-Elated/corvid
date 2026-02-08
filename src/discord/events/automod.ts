import { Message, EmbedBuilder, TextChannel, ChannelType } from 'discord.js';
import { classifyImage } from '../../image-scanner';

// ── Illegal content patterns (U.S. federal law) ──
// CSAM solicitation, credible violence threats, doxxing patterns
const ILLEGAL_PATTERNS = [
  /ch[i1!]ld\s*p[o0]rn/i,
  /cp\s*links?/i,
  /\bcp\s*trad(?:e|ing)/i,
  /p[e3]do\s*(?:content|pics?|vid)/i,
];

// ── Malicious link patterns ──
// IP-based URLs (almost always phishing/C2)
const IP_URL = /https?:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/i;
// Phishing impersonation patterns in URLs
const PHISHING_PATTERNS = [
  /discord[.-]?(?:nitro|gift|free|app[s.])/i,
  /steam[.-]?commun[i1]ty[.-](?!com\b)/i,
  /dlscord|discorcl|d[i1]sc[o0]rd[.-](?:gift|free)/i,
  /st[e3]am[.-]?(?:communlty|commun[i1]ty[.-](?:net|org|info))/i,
];
// Suspicious TLDs commonly abused for phishing (only flag in URLs, not bare domains)
const SUSPICIOUS_TLD_URL = /https?:\/\/[^\s]+\.(?:tk|ml|ga|cf|gq|top|buzz|rest|cam)\b/i;

// Categories to skip (like Orthodox Warriors guild channels)
const SKIP_CATEGORIES = ['ORTHODOX WARRIORS'];

// Log channel name
const MOD_LOG_CHANNEL = 'moderation-log';

interface AutoModResult {
  action: 'mute' | 'flag' | 'delete' | 'none';
  reason?: string;
  matched?: string;
}

/**
 * Extract all URLs from a message
 */
function extractUrls(content: string): string[] {
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
  return content.match(urlRegex) || [];
}

/**
 * Check message content against automod rules.
 * Only filters actually illegal content and malicious links.
 */
function checkContent(content: string): AutoModResult {
  // Check for illegal content (CSAM solicitation) — auto-mute
  for (const pattern of ILLEGAL_PATTERNS) {
    const match = content.match(pattern);
    if (match) {
      return {
        action: 'mute',
        reason: 'Illegal content (potential CSAM solicitation)',
        matched: match[0],
      };
    }
  }

  // Check URLs for malicious patterns — delete message
  const urls = extractUrls(content);
  for (const url of urls) {
    // IP-based URLs
    if (IP_URL.test(url)) {
      return {
        action: 'delete',
        reason: 'Suspicious IP-based URL (potential phishing/malware)',
        matched: url,
      };
    }
    // Phishing impersonation
    for (const pattern of PHISHING_PATTERNS) {
      if (pattern.test(url)) {
        return {
          action: 'delete',
          reason: 'Suspected phishing link (impersonation URL)',
          matched: url,
        };
      }
    }
    // Suspicious TLDs
    if (SUSPICIOUS_TLD_URL.test(url)) {
      return {
        action: 'flag',
        reason: 'URL with suspicious TLD',
        matched: url,
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
    .setColor(action.includes('Muted') ? 0xe74c3c : action.includes('Flag') ? 0xf59e0b : 0xf1c40f)
    .addFields(
      { name: 'User', value: `${message.author.tag} (<@${message.author.id}>)`, inline: true },
      { name: 'Channel', value: `<#${message.channel.id}>`, inline: true },
      { name: 'Reason', value: reason }
    )
    .setTimestamp();

  if (details) {
    embed.addFields({ name: 'Details', value: `||${details}||` });
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
 * Scan image attachments with the NSFW classifier.
 * Runs on ALL images regardless of account age.
 * High-confidence explicit → auto-delete + mute.
 * Medium-confidence → flag to mod-log for staff review.
 */
async function checkAttachments(message: Message): Promise<boolean> {
  if (message.attachments.size === 0) return false;

  const imageAttachments = message.attachments.filter((a) => a.contentType?.startsWith('image/'));
  if (imageAttachments.size === 0) return false;

  for (const [, attachment] of imageAttachments) {
    const result = await classifyImage(attachment.url);
    if (!result) continue;

    if (result.action === 'delete') {
      // High confidence explicit content — delete message and mute user
      try {
        await message.delete();
      } catch {
        // Message may already be deleted
      }

      const duration = 24 * 60 * 60 * 1000; // 24 hours
      try {
        await message.member?.timeout(duration, 'AutoMod: Explicit image detected by NSFW scanner');
      } catch {
        // May lack permission or user is admin
      }

      const pctStr = `${(result.topProbability * 100).toFixed(1)}%`;
      await logToModChannel(
        message,
        'Image Deleted + Muted (24h)',
        `NSFW scanner: **${result.topClass}** at ${pctStr} confidence`,
        `Image: ${attachment.url}\nAll scores: ${result.predictions.map((p) => `${p.className}: ${(p.probability * 100).toFixed(1)}%`).join(', ')}`
      );

      try {
        const embed = new EmbedBuilder()
          .setTitle('Auto-Moderation: Explicit Image Removed')
          .setDescription(`You have been muted in **${message.guild!.name}** for 24 hours.`)
          .setColor(0xe74c3c)
          .addFields({ name: 'Reason', value: 'Explicit image detected by automated scanner' })
          .setTimestamp();
        await message.author.send({ embeds: [embed] });
      } catch {
        // DMs disabled
      }

      console.log(`[AutoMod] NSFW delete: ${message.author.tag} — ${result.topClass} (${pctStr})`);
      return true;
    }

    if (result.action === 'flag') {
      // Medium confidence — flag for staff review, don't delete
      const pctStr = `${(result.topProbability * 100).toFixed(1)}%`;
      await logToModChannel(
        message,
        'Flagged — Possible Explicit Image',
        `NSFW scanner: **${result.topClass}** at ${pctStr} confidence`,
        `Image: ${attachment.url}\nAll scores: ${result.predictions.map((p) => `${p.className}: ${(p.probability * 100).toFixed(1)}%`).join(', ')}`
      );
      console.log(`[AutoMod] NSFW flag: ${message.author.tag} — ${result.topClass} (${pctStr})`);
      // Don't return true — message stays, staff can review
    }
  }

  return false;
}

/**
 * Handle auto-moderation for messages.
 * Filters: illegal content, malicious links, explicit images (via NSFW scanner).
 * Does NOT filter language or opinions.
 */
export async function handleAutoMod(message: Message): Promise<boolean> {
  // Ignore bots
  if (message.author.bot) return false;

  // Ignore DMs
  if (!message.guild || !message.member) return false;

  // Skip certain categories
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

  // Check text content
  const result = checkContent(message.content);

  if (result.action === 'none') {
    // Still check attachments from new accounts
    await checkAttachments(message);
    return false;
  }

  try {
    if (result.action === 'mute') {
      // Delete + mute for illegal content
      await message.delete();
      const duration = 24 * 60 * 60 * 1000; // 24 hours for illegal content
      await message.member.timeout(duration, `AutoMod: ${result.reason}`);
      await logToModChannel(message, 'User Muted (24h)', result.reason!, result.matched);

      try {
        const embed = new EmbedBuilder()
          .setTitle('Auto-Moderation: You have been muted')
          .setDescription(`You have been muted in **${message.guild.name}** for 24 hours.`)
          .setColor(0xe74c3c)
          .addFields({ name: 'Reason', value: result.reason! })
          .setTimestamp();
        await message.author.send({ embeds: [embed] });
      } catch {
        // User has DMs disabled
      }

      console.log(`[AutoMod] Muted ${message.author.tag} for: ${result.reason}`);
    } else if (result.action === 'delete') {
      // Delete the message (malicious link)
      await message.delete();
      await logToModChannel(message, 'Message Deleted', result.reason!, result.matched);

      try {
        const embed = new EmbedBuilder()
          .setTitle('Auto-Moderation: Message Removed')
          .setDescription(`Your message in **${message.guild.name}** was removed.`)
          .setColor(0xf1c40f)
          .addFields({ name: 'Reason', value: result.reason! })
          .setTimestamp();
        await message.author.send({ embeds: [embed] });
      } catch {
        // User has DMs disabled
      }

      console.log(`[AutoMod] Deleted message from ${message.author.tag}: ${result.reason}`);
    } else if (result.action === 'flag') {
      // Don't delete — just flag to mod-log for staff review
      await logToModChannel(message, 'Flagged — Suspicious Link', result.reason!, result.matched);
      console.log(`[AutoMod] Flagged ${message.author.tag}: ${result.reason}`);
      return false; // Message stays visible
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
