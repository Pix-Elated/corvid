import { Guild, ChannelType } from 'discord.js';
import { CategoryConfig } from '../types';

interface CleanupResult {
  channelsDeleted: string[];
  categoriesDeleted: string[];
  errors: string[];
}

/**
 * Get all managed channel and category names from the server structure
 * Returns a map of category name -> allowed channel names
 */
function getManagedStructure(categories: CategoryConfig[]): {
  categoryNames: Set<string>;
  categoryChannelMap: Map<string, Set<string>>;
} {
  const categoryNames = new Set<string>();
  const categoryChannelMap = new Map<string, Set<string>>();

  for (const category of categories) {
    const catName = category.name.toUpperCase();
    categoryNames.add(catName);

    const channelSet = new Set<string>();
    for (const channel of category.channels) {
      channelSet.add(channel.name.toLowerCase());
    }
    categoryChannelMap.set(catName, channelSet);
  }

  return { categoryNames, categoryChannelMap };
}

/**
 * Check if a channel is a ticket channel (dynamically created)
 */
function isTicketChannel(channelName: string): boolean {
  return /^ticket-\d{4}/.test(channelName);
}

/**
 * Cleanup channels and categories not defined in the server structure
 */
export async function cleanupUnmanagedChannels(
  guild: Guild,
  categories: CategoryConfig[]
): Promise<CleanupResult> {
  const result: CleanupResult = {
    channelsDeleted: [],
    categoriesDeleted: [],
    errors: [],
  };

  const { categoryNames, categoryChannelMap } = getManagedStructure(categories);

  // Get all channels in the guild
  const allChannels = guild.channels.cache;

  // Find and delete channels not in the structure
  for (const [, channel] of allChannels) {
    try {
      // Skip categories for now (handle separately)
      if (channel.type === ChannelType.GuildCategory) {
        continue;
      }

      // Skip ticket channels (dynamically managed)
      if (isTicketChannel(channel.name)) {
        continue;
      }

      const parent = channel.parent;

      // Case 1: Channel has no parent (orphaned at top level) - delete it
      if (!parent) {
        console.log(`[Cleanup] Deleting orphaned channel: ${channel.name}`);
        await channel.delete('Cleanup: Channel not in managed server structure');
        result.channelsDeleted.push(channel.name);
        continue;
      }

      // Case 2: Channel is in a managed category
      const parentName = parent.name.toUpperCase();
      if (categoryNames.has(parentName)) {
        // Get allowed channels for this category
        const allowedChannels = categoryChannelMap.get(parentName) || new Set();

        // If channel is not in the allowed list, delete it
        if (!allowedChannels.has(channel.name.toLowerCase())) {
          console.log(
            `[Cleanup] Deleting unmanaged channel "${channel.name}" from category "${parent.name}"`
          );
          await channel.delete('Cleanup: Channel not in managed server structure');
          result.channelsDeleted.push(channel.name);
        }
        continue;
      }

      // Case 3: Channel is in an unmanaged category - leave it alone (will be handled with category)
    } catch (error) {
      const errorMsg = `Failed to delete channel "${channel.name}": ${error}`;
      console.error(`[Cleanup] ${errorMsg}`);
      result.errors.push(errorMsg);
    }
  }

  // Refresh channel cache after deletions
  await guild.channels.fetch();
  const refreshedChannels = guild.channels.cache;

  // Find and delete unmanaged categories
  for (const [, channel] of refreshedChannels) {
    try {
      if (channel.type !== ChannelType.GuildCategory) {
        continue;
      }

      // Check if this category is in our managed structure
      if (!categoryNames.has(channel.name.toUpperCase())) {
        // Check if category is empty (or only has channels we'll delete)
        const childCount = refreshedChannels.filter((c) => c.parentId === channel.id).size;

        if (childCount === 0) {
          console.log(`[Cleanup] Deleting unmanaged category: ${channel.name}`);
          await channel.delete('Cleanup: Category not in managed server structure');
          result.categoriesDeleted.push(channel.name);
        } else {
          console.log(
            `[Cleanup] Skipping unmanaged category "${channel.name}" (has ${childCount} channels)`
          );
        }
      }
    } catch (error) {
      const errorMsg = `Failed to delete category "${channel.name}": ${error}`;
      console.error(`[Cleanup] ${errorMsg}`);
      result.errors.push(errorMsg);
    }
  }

  console.log(
    `[Cleanup] Deleted ${result.channelsDeleted.length} channels, ${result.categoriesDeleted.length} categories`
  );

  return result;
}
