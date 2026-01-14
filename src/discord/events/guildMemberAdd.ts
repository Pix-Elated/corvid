import { GuildMember } from 'discord.js';

/**
 * Handle new member joins - just log for now
 * Note: Verification is handled via @everyone permissions (deny all except verify channel)
 * so new members automatically can only see the verification channel without needing a role
 */
export async function handleGuildMemberAdd(member: GuildMember): Promise<void> {
  if (member.user.bot) {
    console.log(`[MemberAdd] Bot ${member.user.tag} joined`);
    return;
  }

  console.log(`[MemberAdd] New member joined: ${member.user.tag}`);
  // No role assignment needed - @everyone permissions restrict access
  // User will only see #verify-here until they click the verify button
}
