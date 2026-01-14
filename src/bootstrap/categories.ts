import {
  Guild,
  CategoryChannel,
  PermissionFlagsBits,
  OverwriteResolvable,
  Role,
  ChannelType,
  DiscordAPIError,
} from 'discord.js';
import { CategoryConfig, PermissionString } from '../types';
import { trackCategory } from '../server-state';

export interface CategoryCreationResult {
  created: string[];
  skipped: string[];
  errors: string[];
  categoryMap: Map<string, CategoryChannel>;
}

const RATE_LIMIT_DELAY = 1000;
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
 * Convert permission string array to permission bits
 */
function permissionsToBits(permissions: PermissionString[]): bigint {
  let bits = BigInt(0);
  for (const perm of permissions) {
    if (PermissionFlagsBits[perm] !== undefined) {
      bits |= PermissionFlagsBits[perm];
    } else {
      console.warn(`[Categories] Unknown permission: ${perm}`);
    }
  }
  return bits;
}

/**
 * Build permission overwrites for a category
 */
function buildPermissionOverwrites(
  guild: Guild,
  roleMap: Map<string, Role>,
  overwrites: CategoryConfig['permissionOverwrites']
): OverwriteResolvable[] {
  if (!overwrites) return [];

  const result: OverwriteResolvable[] = [];

  for (const overwrite of overwrites) {
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
      console.warn(`[Categories] Role "${overwrite.role}" not found, skipping overwrite`);
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
 * Create categories in the guild (idempotent with retry logic)
 */
export async function createCategories(
  guild: Guild,
  categoryConfigs: CategoryConfig[],
  roleMap: Map<string, Role>
): Promise<CategoryCreationResult> {
  const result: CategoryCreationResult = {
    created: [],
    skipped: [],
    errors: [],
    categoryMap: new Map(),
  };

  // Refresh channel cache
  await guild.channels.fetch();
  const existingCategories = guild.channels.cache.filter(
    (c) => c.type === ChannelType.GuildCategory
  );

  for (const categoryConfig of categoryConfigs) {
    let success = false;
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= MAX_RETRIES && !success; attempt++) {
      try {
        // Check if category already exists
        const existingCategory = existingCategories.find(
          (c) => c.name.toUpperCase() === categoryConfig.name.toUpperCase()
        );

        if (existingCategory) {
          console.log(`[Categories] Category "${categoryConfig.name}" already exists, skipping`);
          result.skipped.push(categoryConfig.name);
          result.categoryMap.set(categoryConfig.name, existingCategory as CategoryChannel);
          trackCategory(categoryConfig.name, existingCategory.id);
          success = true;
          break;
        }

        // Build permission overwrites
        const permissionOverwrites = buildPermissionOverwrites(
          guild,
          roleMap,
          categoryConfig.permissionOverwrites
        );

        // Create the category
        console.log(
          `[Categories] Creating category "${categoryConfig.name}"${attempt > 1 ? ` (attempt ${attempt})` : ''}...`
        );

        const category = await guild.channels.create({
          name: categoryConfig.name,
          type: ChannelType.GuildCategory,
          permissionOverwrites,
          reason: 'Server bootstrap - category creation',
        });

        result.created.push(categoryConfig.name);
        result.categoryMap.set(categoryConfig.name, category);
        trackCategory(categoryConfig.name, category.id);
        console.log(`[Categories] Created category "${categoryConfig.name}"`);
        success = true;

        await sleep(RATE_LIMIT_DELAY);
      } catch (error) {
        lastError = error;

        if (isRetryableError(error) && attempt < MAX_RETRIES) {
          const retryDelay = RATE_LIMIT_DELAY * attempt * 2;
          console.warn(
            `[Categories] Retryable error for "${categoryConfig.name}", waiting ${retryDelay}ms before retry...`
          );
          await sleep(retryDelay);
        } else if (error instanceof DiscordAPIError && error.code === 50013) {
          const errorMessage = `Failed to create category "${categoryConfig.name}": Missing Permissions. Ensure the bot has Manage Channels permission.`;
          console.error(`[Categories] ${errorMessage}`);
          result.errors.push(errorMessage);
          break;
        } else {
          break;
        }
      }
    }

    if (!success && lastError) {
      const errorMessage = `Failed to create category "${categoryConfig.name}": ${lastError}`;
      if (!result.errors.some((e) => e.includes(categoryConfig.name))) {
        console.error(`[Categories] ${errorMessage}`);
        result.errors.push(errorMessage);
      }
    }
  }

  return result;
}

export { permissionsToBits, buildPermissionOverwrites };
