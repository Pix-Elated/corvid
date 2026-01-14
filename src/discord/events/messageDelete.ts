import { Message, EmbedBuilder, PartialMessage, Attachment } from 'discord.js';
import { logAuditEvent, AuditColors, truncate } from '../audit';

/**
 * Handle message deletions - log deleted content
 */
export async function handleMessageDelete(message: Message | PartialMessage): Promise<void> {
  // Need guild for logging
  if (!message.guild) return;

  // Ignore bot messages
  if (message.author?.bot) return;

  // Skip if message wasn't cached (we don't know the content)
  if (!message.content && message.attachments.size === 0) {
    console.log(`[MessageDelete] Message deleted but content not cached`);
    return;
  }

  const author = message.author;
  console.log(
    `[MessageDelete] Message deleted ${author ? `by ${author.tag}` : '(unknown author)'} in #${message.channel}`
  );

  const content = message.content ? truncate(message.content, 1024) : '*No text content*';

  const embed = new EmbedBuilder()
    .setTitle('Message Deleted')
    .setColor(AuditColors.MESSAGE_DELETE)
    .addFields({ name: 'Channel', value: `<#${message.channel.id}>`, inline: true })
    .setTimestamp();

  if (author) {
    embed.setThumbnail(author.displayAvatarURL());
    embed.addFields({ name: 'Author', value: `${author.tag} (${author.id})`, inline: true });
  } else {
    embed.addFields({ name: 'Author', value: '*Unknown (not cached)*', inline: true });
  }

  embed.addFields({ name: 'Content', value: content });

  // Log attachments if any
  if (message.attachments.size > 0) {
    const attachmentList = message.attachments
      .map((a: Attachment) => `[${a.name}](${a.url})`)
      .join('\n');
    embed.addFields({
      name: 'Attachments',
      value: truncate(attachmentList, 1024),
    });
  }

  embed.setFooter({ text: `Message ID: ${message.id}` });

  await logAuditEvent(message.guild, embed);
}
