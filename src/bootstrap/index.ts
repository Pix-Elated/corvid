import { Guild } from 'discord.js';
import { BootstrapResult } from '../types';
import { defaultServerStructure } from '../config/server-structure';
import { createRoles } from './roles';
import { createCategories } from './categories';
import { createAllChannels } from './channels';
import { cleanupUnmanagedChannels } from './cleanup';
import { postBootstrapEmbeds } from './embeds';

/**
 * Bootstrap a Discord server with roles, categories, and channels
 * This operation is idempotent - safe to run multiple times
 */
export async function bootstrapServer(guild: Guild): Promise<BootstrapResult> {
  console.log(`[Bootstrap] Starting server bootstrap for "${guild.name}"...`);

  const result: BootstrapResult = {
    success: false,
    rolesCreated: [],
    rolesSkipped: [],
    categoriesCreated: [],
    categoriesSkipped: [],
    channelsCreated: [],
    channelsSkipped: [],
    channelsDeleted: [],
    categoriesDeleted: [],
    embedsPosted: [],
    embedsUpdated: [],
    embedsSkipped: [],
    errors: [],
  };

  try {
    // Step 1: Create roles
    console.log('[Bootstrap] Step 1: Creating roles...');
    const roleResult = await createRoles(guild, defaultServerStructure.roles);
    result.rolesCreated = roleResult.created;
    result.rolesSkipped = roleResult.skipped;
    result.errors.push(...roleResult.errors);

    // Step 2: Create categories
    console.log('[Bootstrap] Step 2: Creating categories...');
    const categoryResult = await createCategories(
      guild,
      defaultServerStructure.categories,
      roleResult.roleMap
    );
    result.categoriesCreated = categoryResult.created;
    result.categoriesSkipped = categoryResult.skipped;
    result.errors.push(...categoryResult.errors);

    // Step 3: Create channels
    console.log('[Bootstrap] Step 3: Creating channels...');
    const channelResult = await createAllChannels(
      guild,
      defaultServerStructure.categories,
      categoryResult.categoryMap,
      roleResult.roleMap
    );
    result.channelsCreated = channelResult.created;
    result.channelsSkipped = channelResult.skipped;
    result.errors.push(...channelResult.errors);

    // Step 4: Cleanup unmanaged channels and categories
    console.log('[Bootstrap] Step 4: Cleaning up unmanaged channels...');
    const cleanupResult = await cleanupUnmanagedChannels(guild, defaultServerStructure.categories);
    result.channelsDeleted = cleanupResult.channelsDeleted;
    result.categoriesDeleted = cleanupResult.categoriesDeleted;
    result.errors.push(...cleanupResult.errors);

    // Step 5: Post embeds (verification, tickets, info cards)
    console.log('[Bootstrap] Step 5: Posting embeds...');
    const embedResult = await postBootstrapEmbeds(guild, guild.client);
    result.embedsPosted = embedResult.posted;
    result.embedsUpdated = embedResult.updated;
    result.embedsSkipped = embedResult.skipped;
    result.errors.push(...embedResult.errors);

    // Mark success if no critical errors
    result.success = result.errors.length === 0;

    console.log('[Bootstrap] Server bootstrap completed');
    console.log(
      `[Bootstrap] Roles: ${result.rolesCreated.length} created, ${result.rolesSkipped.length} skipped`
    );
    console.log(
      `[Bootstrap] Categories: ${result.categoriesCreated.length} created, ${result.categoriesSkipped.length} skipped, ${result.categoriesDeleted.length} deleted`
    );
    console.log(
      `[Bootstrap] Channels: ${result.channelsCreated.length} created, ${result.channelsSkipped.length} skipped, ${result.channelsDeleted.length} deleted`
    );
    console.log(
      `[Bootstrap] Embeds: ${result.embedsPosted.length} posted, ${result.embedsUpdated.length} updated, ${result.embedsSkipped.length} skipped`
    );

    if (result.errors.length > 0) {
      console.log(`[Bootstrap] Errors: ${result.errors.length}`);
      result.errors.forEach((err) => console.error(`  - ${err}`));
    }
  } catch (error) {
    const errorMessage = `Bootstrap failed with error: ${error}`;
    console.error(`[Bootstrap] ${errorMessage}`);
    result.errors.push(errorMessage);
  }

  return result;
}
