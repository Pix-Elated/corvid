import { Guild, Role } from 'discord.js';
import { RoleConfig } from '../types';

export interface RoleCreationResult {
  created: string[];
  skipped: string[];
  errors: string[];
  roleMap: Map<string, Role>;
}

/**
 * Create roles in the guild (idempotent)
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

  // Get existing roles
  const existingRoles = guild.roles.cache;

  // Create roles in reverse order (so hierarchy is correct)
  const reversedConfigs = [...roleConfigs].reverse();

  for (const roleConfig of reversedConfigs) {
    try {
      // Check if role already exists
      const existingRole = existingRoles.find((r) => r.name === roleConfig.name);

      if (existingRole) {
        console.log(`[Roles] Role "${roleConfig.name}" already exists, skipping`);
        result.skipped.push(roleConfig.name);
        result.roleMap.set(roleConfig.name, existingRole);
        continue;
      }

      // Create the role
      console.log(`[Roles] Creating role "${roleConfig.name}"...`);

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
      console.log(`[Roles] Created role "${roleConfig.name}"`);
    } catch (error) {
      const errorMessage = `Failed to create role "${roleConfig.name}": ${error}`;
      console.error(`[Roles] ${errorMessage}`);
      result.errors.push(errorMessage);
    }
  }

  return result;
}
