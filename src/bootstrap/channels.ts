import {
  Guild,
  CategoryChannel,
  Role,
  OverwriteResolvable,
  TextChannel,
  NewsChannel,
  VoiceChannel,
} from 'discord.js';
import { ChannelConfig, CategoryConfig } from '../types';
import { permissionsToBits } from './categories';

export interface ChannelCreationResult {
  created: string[];
  skipped: string[];
  errors: string[];
}

type CreatedChannel = TextChannel | NewsChannel | VoiceChannel;

/**
 * Build permission overwrites for a channel, merging category and channel-specific overwrites
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
 * Create channels within a category (idempotent)
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
    try {
      // Check if channel already exists in this category
      const existingChannel = existingChannels.find(
        (c) => c.name.toLowerCase() === channelConfig.name.toLowerCase()
      );

      if (existingChannel) {
        console.log(
          `[Channels] Channel "#${channelConfig.name}" already exists in "${category.name}", skipping`
        );
        result.skipped.push(`${category.name}/${channelConfig.name}`);
        continue;
      }

      // Build channel-specific permission overwrites (if any)
      const permissionOverwrites = channelConfig.permissionOverwrites
        ? buildChannelPermissionOverwrites(guild, roleMap, channelConfig.permissionOverwrites)
        : undefined;

      // Create the channel
      console.log(`[Channels] Creating channel "#${channelConfig.name}" in "${category.name}"...`);

      const channel = (await guild.channels.create({
        name: channelConfig.name,
        type: channelConfig.type,
        parent: category.id,
        topic: channelConfig.topic,
        permissionOverwrites,
        reason: 'Server bootstrap - channel creation',
      })) as CreatedChannel;

      result.created.push(`${category.name}/${channel.name}`);
      console.log(`[Channels] Created channel "#${channelConfig.name}" in "${category.name}"`);
    } catch (error) {
      const errorMessage = `Failed to create channel "#${channelConfig.name}" in "${category.name}": ${error}`;
      console.error(`[Channels] ${errorMessage}`);
      result.errors.push(errorMessage);
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
      const errorMessage = `Category "${categoryConfig.name}" not found, cannot create channels`;
      console.error(`[Channels] ${errorMessage}`);
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
