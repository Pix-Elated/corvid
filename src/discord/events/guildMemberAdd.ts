import { GuildMember, EmbedBuilder } from 'discord.js';
import { logAuditEvent, AuditColors } from '../audit';

/**
 * Handle new member joins - log to moderation channel
 * Note: Verification is handled via @everyone permissions (deny all except verify channel)
 * so new members automatically can only see the verification channel without needing a role
 */
export async function handleGuildMemberAdd(member: GuildMember): Promise<void> {
  if (member.user.bot) {
    console.log(`[MemberAdd] Bot ${member.user.tag} joined`);
    return;
  }

  console.log(`[MemberAdd] New member joined: ${member.user.tag}`);

  // Calculate account age
  const accountAge = formatDuration(Date.now() - member.user.createdAt.getTime());
  const isNewAccount = Date.now() - member.user.createdAt.getTime() < 7 * 24 * 60 * 60 * 1000;

  const embed = new EmbedBuilder()
    .setTitle('Member Joined')
    .setColor(AuditColors.JOIN)
    .setThumbnail(member.user.displayAvatarURL())
    .addFields(
      { name: 'User', value: `${member.user.tag}`, inline: true },
      { name: 'User ID', value: member.user.id, inline: true },
      { name: 'Account Age', value: accountAge + (isNewAccount ? ' ⚠️' : ''), inline: true }
    )
    .setFooter({ text: `Member #${member.guild.memberCount}` })
    .setTimestamp();

  if (isNewAccount) {
    embed.setDescription('⚠️ **New account** - Created less than 7 days ago');
  }

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
