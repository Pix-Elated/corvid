import { Guild, ChannelType } from 'discord.js';
import { CategoryConfig } from '../types';

interface CleanupResult {
  channelsDeleted: string[];
  categoriesDeleted: string[];
  errors: string[];
}

/**
 * Get all managed channel and category names from the server structure
 */
function getManagedNames(categories: CategoryConfig[]): {
  categoryNames: Set<string>;
  channelNames: Set<string>;
} {
  const categoryNames = new Set<string>();
  const channelNames = new Set<string>();

  for (const category of categories) {
    categoryNames.add(category.name.toUpperCase());
    for (const channel of category.channels) {
      channelNames.add(channel.name.toLowerCase());
    }
  }

  return { categoryNames, channelNames };
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

  const { categoryNames, channelNames } = getManagedNames(categories);

  // Get all channels in the guild
  const allChannels = guild.channels.cache;

  // Find and delete unmanaged text/voice channels (not in any category or in unmanaged category)
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

      // Check if channel is in a managed category
      const parent = channel.parent;

      if (parent) {
        // Channel has a parent category - check if the category is managed
        if (categoryNames.has(parent.name.toUpperCase())) {
          // Category is managed, check if this specific channel is in the structure
          if (!channelNames.has(channel.name.toLowerCase())) {
            // Channel is not in the structure - but only delete if it's in a managed category
            // This prevents deleting channels that were intentionally added
            console.log(
              `[Cleanup] Skipping channel "${channel.name}" in managed category (may be intentional)`
            );
          }
          continue;
        }
      }

      // Channel has no parent (orphaned at top level) - delete it
      if (!parent) {
        console.log(`[Cleanup] Deleting orphaned channel: ${channel.name}`);
        await channel.delete('Cleanup: Channel not in managed server structure');
        result.channelsDeleted.push(channel.name);
      }
    } catch (error) {
      const errorMsg = `Failed to delete channel "${channel.name}": ${error}`;
      console.error(`[Cleanup] ${errorMsg}`);
      result.errors.push(errorMsg);
    }
  }

  // Find and delete unmanaged categories (empty ones that aren't in structure)
  for (const [, channel] of allChannels) {
    try {
      if (channel.type !== ChannelType.GuildCategory) {
        continue;
      }

      // Check if this category is in our managed structure
      if (!categoryNames.has(channel.name.toUpperCase())) {
        // Check if category is empty
        const childCount = allChannels.filter((c) => c.parentId === channel.id).size;

        if (childCount === 0) {
          console.log(`[Cleanup] Deleting empty unmanaged category: ${channel.name}`);
          await channel.delete('Cleanup: Empty category not in managed server structure');
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
