import { Guild, Client, TextChannel, EmbedBuilder } from 'discord.js';
import { getCardMessageId, setCardMessageId } from '../info-cards';

const CARD_KEY = 'hall-of-shame-banlist';
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const BAN_LIST_URL =
  'https://raw.githubusercontent.com/Pix-Elated/ravenhud/master/data/hall-of-shame.json';

interface BanEntry {
  type: string;
  name: string;
  discordId?: string;
  reason: string;
  added: string;
}

interface BanListData {
  version: number;
  entries: BanEntry[];
}

let refreshInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Fetch the public ban list from the RavenHud website repo.
 */
async function fetchBanList(): Promise<BanEntry[]> {
  const response = await fetch(BAN_LIST_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch ban list: ${response.status} ${response.statusText}`);
  }
  const data = (await response.json()) as BanListData;
  return data.entries ?? [];
}

/**
 * Build an embed showing the public ban list from RavenHud.
 */
async function buildBanListEmbed(): Promise<EmbedBuilder> {
  const entries = await fetchBanList();

  const embed = new EmbedBuilder()
    .setTitle('\uD83D\uDD28 Hall of Shame — Ban List')
    .setColor(0xef4444)
    .setFooter({ text: `Refreshed daily \u2022 ${entries.length} total entries` })
    .setTimestamp();

  if (entries.length === 0) {
    embed.setDescription('No entries recorded. The community is spotless... for now.');
    return embed;
  }

  // Show all entries (Discord embed description limit is 4096 chars)
  const lines = entries.map((entry) => {
    const reason = entry.reason.length > 80 ? entry.reason.slice(0, 77) + '...' : entry.reason;
    const id = entry.discordId ? ` (${entry.discordId})` : '';
    return `**${entry.name}**${id} — ${reason}`;
  });

  // Truncate if description would exceed Discord's 4096 char limit
  let description = '';
  let shown = 0;
  for (const line of lines) {
    if (description.length + line.length + 1 > 3900) break;
    description += (shown > 0 ? '\n' : '') + line;
    shown++;
  }

  embed.setDescription(description);

  if (shown < entries.length) {
    embed.addFields({
      name: '\u200b',
      value: `...and **${entries.length - shown}** more.`,
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

  const embed = await buildBanListEmbed();
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
