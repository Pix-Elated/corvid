import { Message, EmbedBuilder, PartialMessage } from 'discord.js';
import { logAuditEvent, AuditColors, truncate } from '../audit';

/**
 * Handle message edits - log before/after content
 */
export async function handleMessageUpdate(
  oldMessage: Message | PartialMessage,
  newMessage: Message | PartialMessage
): Promise<void> {
  // Ignore bot messages
  if (newMessage.author?.bot) return;

  // Ignore if content didn't actually change (could be embed loading)
  if (oldMessage.content === newMessage.content) return;

  // Need guild for logging
  if (!newMessage.guild) return;

  // Skip if we don't have the old content (message wasn't cached)
  if (!oldMessage.content) {
    console.log(`[MessageUpdate] Message edited but old content not cached`);
    return;
  }

  const author = newMessage.author;
  if (!author) return;

  console.log(`[MessageUpdate] Message edited by ${author.tag} in #${newMessage.channel}`);

  const oldContent = truncate(oldMessage.content || '*Empty or not cached*', 1024);
  const newContent = truncate(newMessage.content || '*Empty*', 1024);

  const embed = new EmbedBuilder()
    .setTitle('Message Edited')
    .setColor(AuditColors.MESSAGE_EDIT)
    .setThumbnail(author.displayAvatarURL())
    .addFields(
      { name: 'Author', value: `${author.tag} (${author.id})`, inline: true },
      { name: 'Channel', value: `<#${newMessage.channel.id}>`, inline: true },
      { name: 'Before', value: oldContent },
      { name: 'After', value: newContent }
    )
    .setFooter({ text: `Message ID: ${newMessage.id}` })
    .setTimestamp();

  // Add jump link
  if (newMessage.url) {
    embed.setURL(newMessage.url);
    embed.setDescription(`[Jump to message](${newMessage.url})`);
  }

  await logAuditEvent(newMessage.guild, embed);
}
