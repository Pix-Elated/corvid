import {
  Guild,
  CategoryChannel,
  Role,
  OverwriteResolvable,
  TextChannel,
  VoiceChannel,
  DiscordAPIError,
} from 'discord.js';
import { ChannelConfig, CategoryConfig } from '../types';
import { permissionsToBits } from './categories';
import { trackChannel } from '../server-state';

export interface ChannelCreationResult {
  created: string[];
  skipped: string[];
  errors: string[];
}

type CreatedChannel = TextChannel | VoiceChannel;

const RATE_LIMIT_DELAY = 500;
const MAX_RETRIES = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof DiscordAPIError) {
    return [429, 500, 502, 503, 504].includes(error.status);
  }
  return false;
}

/**
 * Build permission overwrites for a channel
 */
function buildChannelPermissionOverwrites(
  guild: Guild,
  roleMap: Map<string, Role>,
  channelOverwrites: ChannelConfig['permissionOverwrites']
): OverwriteResolvable[] {
  if (!channelOverwrites) return [];

  const result: OverwriteResolvable[] = [];

  for (const overwrite of channelOverwrites) {
    let targetId: string | undefined;

    if (overwrite.role === '@everyone') {
      targetId = guild.id;
    } else {
      const role = roleMap.get(overwrite.role);
      if (role) {
        targetId = role.id;
      } else {
        // Try case-insensitive match
        const roleEntry = Array.from(roleMap.entries()).find(
          ([name]) => name.toLowerCase() === overwrite.role.toLowerCase()
        );
        if (roleEntry) {
          targetId = roleEntry[1].id;
        }
      }
    }

    if (!targetId) {
      console.warn(`[Channels] Role "${overwrite.role}" not found, skipping overwrite`);
      continue;
    }

    result.push({
      id: targetId,
      allow: overwrite.allow ? permissionsToBits(overwrite.allow) : BigInt(0),
      deny: overwrite.deny ? permissionsToBits(overwrite.deny) : BigInt(0),
    });
  }

  return result;
}

/**
 * Create channels within a category (idempotent with retry logic)
 */
export async function createChannelsInCategory(
  guild: Guild,
  category: CategoryChannel,
  channelConfigs: ChannelConfig[],
  roleMap: Map<string, Role>
): Promise<ChannelCreationResult> {
  const result: ChannelCreationResult = {
    created: [],
    skipped: [],
    errors: [],
  };

  // Get existing channels in this category
  const existingChannels = guild.channels.cache.filter((c) => c.parentId === category.id);

  for (const channelConfig of channelConfigs) {
    let success = false;
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= MAX_RETRIES && !success; attempt++) {
      try {
        // Check if channel already exists in this category
        const existingChannel = existingChannels.find(
          (c) => c.name.toLowerCase() === channelConfig.name.toLowerCase()
        );

        if (existingChannel) {
          // Sync channel-level permission overwrites if the config defines them
          // (ensures new permissions like SendMessagesInThreads are applied on re-bootstrap)
          if (channelConfig.permissionOverwrites && channelConfig.permissionOverwrites.length > 0) {
            const permissionOverwrites = buildChannelPermissionOverwrites(
              guild,
              roleMap,
              channelConfig.permissionOverwrites
            );
            if (permissionOverwrites.length > 0) {
              try {
                await (existingChannel as TextChannel).permissionOverwrites.set(
                  permissionOverwrites,
                  'Server bootstrap - permission sync'
                );
                console.log(
                  `[Channels] Synced permissions for "#${channelConfig.name}" in "${category.name}"`
                );
              } catch (syncError) {
                console.warn(
                  `[Channels] Failed to sync permissions for "#${channelConfig.name}":`,
                  syncError
                );
              }
            }
          }
          result.skipped.push(`${category.name}/${channelConfig.name}`);
          trackChannel(channelConfig.name, existingChannel.id);
          success = true;
          break;
        }

        // Build channel-specific permission overwrites
        const permissionOverwrites = channelConfig.permissionOverwrites
          ? buildChannelPermissionOverwrites(guild, roleMap, channelConfig.permissionOverwrites)
          : undefined;

        // Create the channel
        console.log(
          `[Channels] Creating channel "#${channelConfig.name}" in "${category.name}"${attempt > 1 ? ` (attempt ${attempt})` : ''}...`
        );

        const channel = (await guild.channels.create({
          name: channelConfig.name,
          type: channelConfig.type,
          parent: category.id,
          topic: channelConfig.topic,
          permissionOverwrites,
          reason: 'Server bootstrap - channel creation',
        })) as CreatedChannel;

        result.created.push(`${category.name}/${channel.name}`);
        trackChannel(channelConfig.name, channel.id);
        console.log(`[Channels] Created channel "#${channelConfig.name}" in "${category.name}"`);
        success = true;

        await sleep(RATE_LIMIT_DELAY);
      } catch (error) {
        lastError = error;

        if (isRetryableError(error) && attempt < MAX_RETRIES) {
          const retryDelay = RATE_LIMIT_DELAY * attempt * 2;
          console.warn(
            `[Channels] Retryable error for "#${channelConfig.name}", waiting ${retryDelay}ms before retry...`
          );
          await sleep(retryDelay);
        } else if (error instanceof DiscordAPIError) {
          if (error.code === 50013) {
            const errorMessage = `Failed to create channel "#${channelConfig.name}" in "${category.name}": Missing Permissions`;
            console.error(`[Channels] ${errorMessage}`);
            result.errors.push(errorMessage);
            break;
          } else if (error.code === 50035) {
            // Invalid Form Body - usually means bad channel type
            const errorMessage = `Failed to create channel "#${channelConfig.name}" in "${category.name}": Invalid channel configuration (check channel type)`;
            console.error(`[Channels] ${errorMessage}`);
            result.errors.push(errorMessage);
            break;
          }
        }

        if (attempt === MAX_RETRIES) {
          break;
        }
      }
    }

    if (!success && lastError) {
      const errorMessage = `Failed to create channel "#${channelConfig.name}" in "${category.name}": ${lastError}`;
      if (!result.errors.some((e) => e.includes(channelConfig.name))) {
        console.error(`[Channels] ${errorMessage}`);
        result.errors.push(errorMessage);
      }
    }
  }

  return result;
}

/**
 * Create all channels for all categories
 */
export async function createAllChannels(
  guild: Guild,
  categoryConfigs: CategoryConfig[],
  categoryMap: Map<string, CategoryChannel>,
  roleMap: Map<string, Role>
): Promise<ChannelCreationResult> {
  const result: ChannelCreationResult = {
    created: [],
    skipped: [],
    errors: [],
  };

  for (const categoryConfig of categoryConfigs) {
    const category = categoryMap.get(categoryConfig.name);

    if (!category) {
      // Try case-insensitive match
      const categoryEntry = Array.from(categoryMap.entries()).find(
        ([name]) => name.toUpperCase() === categoryConfig.name.toUpperCase()
      );

      if (categoryEntry) {
        const channelResult = await createChannelsInCategory(
          guild,
          categoryEntry[1],
          categoryConfig.channels,
          roleMap
        );
        result.created.push(...channelResult.created);
        result.skipped.push(...channelResult.skipped);
        result.errors.push(...channelResult.errors);
        continue;
      }

      const errorMessage = `Category "${categoryConfig.name}" not found, cannot create channels. Continuing with other categories...`;
      console.warn(`[Channels] ${errorMessage}`);
      result.errors.push(errorMessage);
      continue;
    }

    const channelResult = await createChannelsInCategory(
      guild,
      category,
      categoryConfig.channels,
      roleMap
    );

    result.created.push(...channelResult.created);
    result.skipped.push(...channelResult.skipped);
    result.errors.push(...channelResult.errors);
  }

  return result;
}
