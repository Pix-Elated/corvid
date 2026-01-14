import { Client, TextChannel, EmbedBuilder } from 'discord.js';
import { getInactiveTickets, getExpiredWarnings, markTicketWarned, removeTicket } from './index';
import { generateTranscript, generateSummary } from './transcript';
import { Ticket } from '../types';

const INACTIVITY_HOURS = 48;
const WARNING_GRACE_HOURS = 1;
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

let autoCloseInterval: NodeJS.Timeout | null = null;

/**
 * Close a ticket and generate transcript
 */
async function closeTicket(client: Client, ticket: Ticket, reason: string): Promise<void> {
  try {
    const channel = await client.channels.fetch(ticket.channelId);
    if (!channel || !(channel instanceof TextChannel)) {
      console.log(`[AutoClose] Channel ${ticket.channelId} not found, removing ticket from state`);
      removeTicket(ticket.channelId);
      return;
    }

    // Generate transcript
    const { text, attachment } = await generateTranscript(channel, ticket);
    const messageCount = text.split('\n\n').length;

    // Find ticket-logs channel
    const guild = channel.guild;
    const logsChannel = guild.channels.cache.find(
      (ch) => ch.name === 'ticket-logs' && ch instanceof TextChannel
    ) as TextChannel | undefined;

    // Post to logs channel
    if (logsChannel) {
      const logEmbed = new EmbedBuilder()
        .setTitle(`Ticket Closed: ${ticket.id}`)
        .setDescription(generateSummary(ticket, messageCount))
        .addFields({ name: 'Reason', value: reason })
        .setColor(0xe74c3c)
        .setTimestamp();

      await logsChannel.send({
        embeds: [logEmbed],
        files: [attachment],
      });
    }

    // DM the ticket creator
    try {
      const creator = await client.users.fetch(ticket.creatorId);
      const dmEmbed = new EmbedBuilder()
        .setTitle(`Your Ticket Has Been Closed`)
        .setDescription(
          `Your ticket **${ticket.id}** (${ticket.subject}) has been closed.\n\n` +
            `**Reason:** ${reason}\n\n` +
            `A transcript of the conversation is attached below.`
        )
        .setColor(0x3498db)
        .setTimestamp();

      // Regenerate attachment for DM (can't reuse)
      const { attachment: dmAttachment } = await generateTranscript(channel, ticket);
      await creator.send({
        embeds: [dmEmbed],
        files: [dmAttachment],
      });
    } catch (dmError) {
      console.log(`[AutoClose] Could not DM user ${ticket.creatorId}:`, dmError);
    }

    // Delete the channel
    await channel.delete(`Ticket closed: ${reason}`);

    // Remove from state
    removeTicket(ticket.channelId);

    console.log(`[AutoClose] Closed ticket ${ticket.id}: ${reason}`);
  } catch (error) {
    console.error(`[AutoClose] Error closing ticket ${ticket.id}:`, error);
  }
}

/**
 * Send inactivity warning to a ticket channel
 */
async function sendWarning(client: Client, ticket: Ticket): Promise<void> {
  try {
    const channel = await client.channels.fetch(ticket.channelId);
    if (!channel || !(channel instanceof TextChannel)) {
      return;
    }

    const warningEmbed = new EmbedBuilder()
      .setTitle('Inactivity Warning')
      .setDescription(
        `This ticket has been inactive for 48 hours.\n\n` +
          `If there is no response within **1 hour**, this ticket will be automatically closed.\n\n` +
          `Send a message to keep this ticket open.`
      )
      .setColor(0xf39c12)
      .setTimestamp();

    await channel.send({ embeds: [warningEmbed] });
    markTicketWarned(ticket.channelId);

    console.log(`[AutoClose] Sent warning for ticket ${ticket.id}`);
  } catch (error) {
    console.error(`[AutoClose] Error sending warning for ticket ${ticket.id}:`, error);
  }
}

/**
 * Check for inactive tickets and handle warnings/closures
 */
async function checkInactiveTickets(client: Client): Promise<void> {
  console.log('[AutoClose] Checking for inactive tickets...');

  // First, close any tickets that were warned and didn't respond
  const expiredTickets = getExpiredWarnings(WARNING_GRACE_HOURS);
  for (const ticket of expiredTickets) {
    await closeTicket(client, ticket, 'Closed due to inactivity (no response after warning)');
  }

  // Then, warn any tickets that are inactive but haven't been warned yet
  const inactiveTickets = getInactiveTickets(INACTIVITY_HOURS);
  for (const ticket of inactiveTickets) {
    // Skip if already warned
    if (!ticket.warnedAt) {
      await sendWarning(client, ticket);
    }
  }
}

/**
 * Start the auto-close checker interval
 */
export function startAutoClose(client: Client): void {
  if (autoCloseInterval) {
    clearInterval(autoCloseInterval);
  }

  // Run initial check after 5 seconds (give time for bot to fully start)
  setTimeout(() => checkInactiveTickets(client), 5000);

  // Then run every hour
  autoCloseInterval = setInterval(() => {
    checkInactiveTickets(client);
  }, CHECK_INTERVAL_MS);

  console.log('[AutoClose] Auto-close checker started (checking every hour)');
}

/**
 * Stop the auto-close checker
 */
export function stopAutoClose(): void {
  if (autoCloseInterval) {
    clearInterval(autoCloseInterval);
    autoCloseInterval = null;
    console.log('[AutoClose] Auto-close checker stopped');
  }
}

/**
 * Manually close a ticket (used by close button handler)
 */
export async function manualCloseTicket(
  client: Client,
  channelId: string,
  closedBy: string
): Promise<boolean> {
  const tickets = await import('./index');
  const ticket = tickets.getTicketByChannelId(channelId);

  if (!ticket) {
    return false;
  }

  await closeTicket(client, ticket, `Manually closed by <@${closedBy}>`);
  return true;
}
