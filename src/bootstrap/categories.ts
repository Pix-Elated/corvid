import {
  Guild,
  CategoryChannel,
  PermissionFlagsBits,
  OverwriteResolvable,
  Role,
  ChannelType,
} from 'discord.js';
import { CategoryConfig, PermissionString } from '../types';

export interface CategoryCreationResult {
  created: string[];
  skipped: string[];
  errors: string[];
  categoryMap: Map<string, CategoryChannel>;
}

/**
 * Convert permission string array to permission bits
 */
function permissionsToBits(permissions: PermissionString[]): bigint {
  let bits = BigInt(0);
  for (const perm of permissions) {
    if (PermissionFlagsBits[perm] !== undefined) {
      bits |= PermissionFlagsBits[perm];
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
      targetId = guild.id; // @everyone role has same ID as guild
    } else {
      const role = roleMap.get(overwrite.role);
      if (role) {
        targetId = role.id;
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
 * Create categories in the guild (idempotent)
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

  // Get existing categories
  const existingCategories = guild.channels.cache.filter(
    (c) => c.type === ChannelType.GuildCategory
  );

  for (const categoryConfig of categoryConfigs) {
    try {
      // Check if category already exists
      const existingCategory = existingCategories.find(
        (c) => c.name.toUpperCase() === categoryConfig.name.toUpperCase()
      );

      if (existingCategory) {
        console.log(`[Categories] Category "${categoryConfig.name}" already exists, skipping`);
        result.skipped.push(categoryConfig.name);
        result.categoryMap.set(categoryConfig.name, existingCategory as CategoryChannel);
        continue;
      }

      // Build permission overwrites
      const permissionOverwrites = buildPermissionOverwrites(
        guild,
        roleMap,
        categoryConfig.permissionOverwrites
      );

      // Create the category
      console.log(`[Categories] Creating category "${categoryConfig.name}"...`);

      const category = await guild.channels.create({
        name: categoryConfig.name,
        type: ChannelType.GuildCategory,
        permissionOverwrites,
        reason: 'Server bootstrap - category creation',
      });

      result.created.push(categoryConfig.name);
      result.categoryMap.set(categoryConfig.name, category);
      console.log(`[Categories] Created category "${categoryConfig.name}"`);
    } catch (error) {
      const errorMessage = `Failed to create category "${categoryConfig.name}": ${error}`;
      console.error(`[Categories] ${errorMessage}`);
      result.errors.push(errorMessage);
    }
  }

  return result;
}

export { permissionsToBits, buildPermissionOverwrites };
