import { Guild, Role, DiscordAPIError } from 'discord.js';
import { RoleConfig } from '../types';
import { trackRole } from '../server-state';

export interface RoleCreationResult {
  created: string[];
  skipped: string[];
  errors: string[];
  roleMap: Map<string, Role>;
}

const RATE_LIMIT_DELAY = 1000; // 1 second between operations
const MAX_RETRIES = 3;

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if an error is retryable
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof DiscordAPIError) {
    // Rate limited, server error, or temporary issues
    return [429, 500, 502, 503, 504].includes(error.status);
  }
  return false;
}

/**
 * Create roles in the guild (idempotent with retry logic)
 * Roles are created in reverse order so higher roles end up above lower ones
 */
export async function createRoles(
  guild: Guild,
  roleConfigs: RoleConfig[]
): Promise<RoleCreationResult> {
  const result: RoleCreationResult = {
    created: [],
    skipped: [],
    errors: [],
    roleMap: new Map(),
  };

  // Refresh role cache
  await guild.roles.fetch();
  const existingRoles = guild.roles.cache;

  // Create roles in reverse order (so hierarchy is correct)
  const reversedConfigs = [...roleConfigs].reverse();

  for (const roleConfig of reversedConfigs) {
    let success = false;
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= MAX_RETRIES && !success; attempt++) {
      try {
        // Check if role already exists (refresh each attempt)
        const existingRole = existingRoles.find(
          (r) => r.name.toLowerCase() === roleConfig.name.toLowerCase()
        );

        if (existingRole) {
          console.log(`[Roles] Role "${roleConfig.name}" already exists, skipping`);
          result.skipped.push(roleConfig.name);
          result.roleMap.set(roleConfig.name, existingRole);
          trackRole(roleConfig.name, existingRole.id);
          success = true;
          break;
        }

        // Create the role
        console.log(
          `[Roles] Creating role "${roleConfig.name}"${attempt > 1 ? ` (attempt ${attempt})` : ''}...`
        );

        const role = await guild.roles.create({
          name: roleConfig.name,
          color: roleConfig.color,
          hoist: roleConfig.hoist ?? false,
          mentionable: roleConfig.mentionable ?? false,
          permissions: roleConfig.permissions,
          reason: 'Server bootstrap - role creation',
        });

        result.created.push(roleConfig.name);
        result.roleMap.set(roleConfig.name, role);
        trackRole(roleConfig.name, role.id);
        console.log(`[Roles] Created role "${roleConfig.name}"`);
        success = true;

        // Rate limit protection
        await sleep(RATE_LIMIT_DELAY);
      } catch (error) {
        lastError = error;

        if (isRetryableError(error) && attempt < MAX_RETRIES) {
          const retryDelay = RATE_LIMIT_DELAY * attempt * 2;
          console.warn(
            `[Roles] Retryable error for "${roleConfig.name}", waiting ${retryDelay}ms before retry...`
          );
          await sleep(retryDelay);
        } else if (error instanceof DiscordAPIError && error.code === 50013) {
          // Missing Permissions - not retryable, but provide helpful message
          const errorMessage = `Failed to create role "${roleConfig.name}": Missing Permissions. Ensure the bot role is positioned above the roles it needs to create.`;
          console.error(`[Roles] ${errorMessage}`);
          result.errors.push(errorMessage);
          break;
        } else {
          // Non-retryable error
          break;
        }
      }
    }

    if (!success && lastError) {
      const errorMessage = `Failed to create role "${roleConfig.name}": ${lastError}`;
      if (!result.errors.some((e) => e.includes(roleConfig.name))) {
        console.error(`[Roles] ${errorMessage}`);
        result.errors.push(errorMessage);
      }
    }
  }

  return result;
}
