import { GuildMember, EmbedBuilder, PartialGuildMember } from 'discord.js';
import { logAuditEvent, AuditColors } from '../audit';

/**
 * Handle member leaves - log to moderation channel
 */
export async function handleGuildMemberRemove(
  member: GuildMember | PartialGuildMember
): Promise<void> {
  if (member.user.bot) {
    console.log(`[MemberRemove] Bot ${member.user.tag} left`);
    return;
  }

  console.log(`[MemberRemove] Member left: ${member.user.tag}`);

  // Calculate how long they were in the server
  const joinedAt = member.joinedAt;
  const duration = joinedAt
    ? formatDuration(Date.now() - joinedAt.getTime())
    : 'Unknown';

  const roles = member.roles.cache
    .filter((r) => r.name !== '@everyone')
    .map((r) => r.name)
    .join(', ') || 'None';

  const embed = new EmbedBuilder()
    .setTitle('Member Left')
    .setColor(AuditColors.LEAVE)
    .setThumbnail(member.user.displayAvatarURL())
    .addFields(
      { name: 'User', value: `${member.user.tag}`, inline: true },
      { name: 'User ID', value: member.user.id, inline: true },
      { name: 'Time in Server', value: duration, inline: true },
      { name: 'Roles', value: roles.length > 1024 ? roles.slice(0, 1021) + '...' : roles }
    )
    .setFooter({ text: `Account created: ${member.user.createdAt.toDateString()}` })
    .setTimestamp();

  await logAuditEvent(member.guild, embed);
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} day${days > 1 ? 's' : ''}`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''}`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''}`;
  return `${seconds} second${seconds > 1 ? 's' : ''}`;
}
