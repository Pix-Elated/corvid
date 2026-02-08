import { Guild, Client, TextChannel, EmbedBuilder, GuildBan } from 'discord.js';
import { getCardMessageId, setCardMessageId } from '../info-cards';

const CARD_KEY = 'hall-of-shame-banlist';
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_DISPLAY_BANS = 25; // Discord embed field limit

let refreshInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Build an embed showing the server's ban list.
 */
async function buildBanListEmbed(guild: Guild): Promise<EmbedBuilder> {
  const bans = await guild.bans.fetch();
  const banArray = [...bans.values()];

  const embed = new EmbedBuilder()
    .setTitle('🔨 Hall of Shame — Ban List')
    .setColor(0xef4444) // Red
    .setFooter({ text: `Refreshed daily • ${banArray.length} total bans` })
    .setTimestamp();

  if (banArray.length === 0) {
    embed.setDescription('No bans recorded. The community is spotless... for now.');
    return embed;
  }

  // Sort by most recent first (Discord returns them in order of ban)
  // Format each ban as a line
  const displayBans = banArray.slice(0, MAX_DISPLAY_BANS);
  const lines = displayBans.map((ban: GuildBan) => {
    const reason = ban.reason ? ban.reason.slice(0, 80) : 'No reason provided';
    return `**${ban.user.tag}** — ${reason}`;
  });

  embed.setDescription(lines.join('\n'));

  if (banArray.length > MAX_DISPLAY_BANS) {
    embed.addFields({
      name: '\u200b', // zero-width space
      value: `...and **${banArray.length - MAX_DISPLAY_BANS}** more.`,
    });
  }

  return embed;
}

/**
 * Post or update the ban list card in #hall-of-shame.
 */
export async function postOrUpdateBanList(guild: Guild, client: Client): Promise<void> {
  const channel = guild.channels.cache.find(
    (ch) => ch.name === 'hall-of-shame' && ch instanceof TextChannel
  ) as TextChannel | undefined;

  if (!channel) {
    console.log('[HallOfShame] #hall-of-shame channel not found, skipping ban list card');
    return;
  }

  const embed = await buildBanListEmbed(guild);
  const trackedId = getCardMessageId(CARD_KEY);

  // Try to edit existing message
  if (trackedId) {
    try {
      const existing = await channel.messages.fetch(trackedId);
      if (existing && existing.author.id === client.user?.id) {
        await existing.edit({ embeds: [embed] });
        console.log(`[HallOfShame] Updated ban list card (${trackedId})`);
        return;
      }
    } catch {
      console.log('[HallOfShame] Tracked ban list message not found, posting new');
    }
  }

  // Post fresh
  const message = await channel.send({ embeds: [embed] });
  setCardMessageId(CARD_KEY, message.id);
  console.log(`[HallOfShame] Posted new ban list card (${message.id})`);
}

/**
 * Start a daily refresh of the ban list card.
 * Call once during bootstrap after the bot is ready.
 */
export function startBanListRefresh(guild: Guild, client: Client): void {
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }

  refreshInterval = setInterval(async () => {
    try {
      await postOrUpdateBanList(guild, client);
    } catch (error) {
      console.error('[HallOfShame] Failed to refresh ban list card:', error);
    }
  }, REFRESH_INTERVAL_MS);

  console.log('[HallOfShame] Daily ban list refresh scheduled');
}
