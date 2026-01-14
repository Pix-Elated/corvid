import { GuildMember } from 'discord.js';

const UNVERIFIED_ROLE_NAME = 'Unverified';

/**
 * Handle new member joins - assign Unverified role automatically
 */
export async function handleGuildMemberAdd(member: GuildMember): Promise<void> {
  // Don't assign role to bots
  if (member.user.bot) {
    console.log(`[MemberAdd] Bot ${member.user.tag} joined, skipping role assignment`);
    return;
  }

  try {
    const unverifiedRole = member.guild.roles.cache.find(
      (r) => r.name.toLowerCase() === UNVERIFIED_ROLE_NAME.toLowerCase()
    );

    if (!unverifiedRole) {
      console.warn('[MemberAdd] Unverified role not found, cannot assign to new member');
      return;
    }

    await member.roles.add(unverifiedRole, 'New member - auto-assigned Unverified role');
    console.log(`[MemberAdd] Assigned Unverified role to ${member.user.tag}`);
  } catch (error) {
    console.error(`[MemberAdd] Failed to assign Unverified role to ${member.user.tag}:`, error);
  }
}
