import { TextChannel, Message, Collection, AttachmentBuilder } from 'discord.js';
import { Ticket } from '../types';

/**
 * Format a single message for the transcript
 */
function formatMessage(message: Message): string {
  const timestamp = message.createdAt.toISOString().replace('T', ' ').substring(0, 19);
  const author = message.author.tag;
  const content = message.content || '[No text content]';

  let line = `[${timestamp}] ${author}: ${content}`;

  // Add attachment info if present
  if (message.attachments.size > 0) {
    const attachmentList = message.attachments.map((a) => a.url).join(', ');
    line += `\n  Attachments: ${attachmentList}`;
  }

  // Add embed info if present
  if (message.embeds.length > 0) {
    line += `\n  [Contains ${message.embeds.length} embed(s)]`;
  }

  return line;
}

/**
 * Generate a transcript from a ticket channel
 */
export async function generateTranscript(
  channel: TextChannel,
  ticket: Ticket
): Promise<{ text: string; attachment: AttachmentBuilder }> {
  const messages: Message[] = [];

  // Fetch all messages (Discord limits to 100 per request)
  let lastId: string | undefined;
  let fetchedMessages: Collection<string, Message>;

  do {
    const options: { limit: number; before?: string } = { limit: 100 };
    if (lastId) {
      options.before = lastId;
    }

    fetchedMessages = await channel.messages.fetch(options);
    messages.push(...fetchedMessages.values());
    lastId = fetchedMessages.last()?.id;
  } while (fetchedMessages.size === 100);

  // Sort messages oldest to newest
  messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  // Build transcript header
  const header = [
    '═══════════════════════════════════════════════════════════════',
    `                    TICKET TRANSCRIPT`,
    '═══════════════════════════════════════════════════════════════',
    '',
    `Ticket ID:     ${ticket.id}`,
    `Type:          ${ticket.type.charAt(0).toUpperCase() + ticket.type.slice(1)}`,
    `Subject:       ${ticket.subject}`,
    `Created:       ${new Date(ticket.createdAt).toUTCString()}`,
    `Closed:        ${new Date().toUTCString()}`,
    `Creator ID:    ${ticket.creatorId}`,
    '',
    '───────────────────────────────────────────────────────────────',
    'DESCRIPTION:',
    '───────────────────────────────────────────────────────────────',
    ticket.description,
    '',
    '───────────────────────────────────────────────────────────────',
    'MESSAGES:',
    '───────────────────────────────────────────────────────────────',
    '',
  ].join('\n');

  // Format all messages
  const messageLines = messages.map(formatMessage).join('\n\n');

  // Build footer
  const footer = [
    '',
    '═══════════════════════════════════════════════════════════════',
    `                    END OF TRANSCRIPT`,
    `                    ${messages.length} messages total`,
    '═══════════════════════════════════════════════════════════════',
  ].join('\n');

  const fullText = header + messageLines + footer;

  // Create attachment
  const buffer = Buffer.from(fullText, 'utf-8');
  const attachment = new AttachmentBuilder(buffer, {
    name: `${ticket.id}-transcript.txt`,
    description: `Transcript for ticket ${ticket.id}`,
  });

  return { text: fullText, attachment };
}

/**
 * Generate a short summary for the ticket log embed
 */
export function generateSummary(ticket: Ticket, messageCount: number): string {
  const duration = Math.floor(
    (Date.now() - new Date(ticket.createdAt).getTime()) / (1000 * 60 * 60)
  );
  const durationText = duration < 1 ? 'Less than 1 hour' : `${duration} hour(s)`;

  return [
    `**Ticket ID:** ${ticket.id}`,
    `**Type:** ${ticket.type.charAt(0).toUpperCase() + ticket.type.slice(1)}`,
    `**Subject:** ${ticket.subject}`,
    `**Creator:** <@${ticket.creatorId}>`,
    `**Duration:** ${durationText}`,
    `**Messages:** ${messageCount}`,
  ].join('\n');
}
