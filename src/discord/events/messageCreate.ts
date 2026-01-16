import { Message, MessageType, TextChannel } from 'discord.js';
import { getConfig } from '../../config';
import { parseMunkMessage } from '../../parser/munk';
import { updateStatus, updateMaintenance } from '../../state';
import { updateTicketActivity } from '../../tickets';
import { handleAutoMod } from './automod';
import { handleReleaseWebhook } from './releaseHandler';
import { recordDeploymentStarting } from '../startup';

/**
 * Handle new messages - auto-mod and parse embeds from the source channel
 */
export async function handleMessageCreate(message: Message): Promise<void> {
  // Auto-delete "X pinned a message" system notifications
  if (message.type === MessageType.ChannelPinnedMessage) {
    try {
      await message.delete();
      console.log('[MessageCreate] Deleted pin notification message');
    } catch (error) {
      console.error('[MessageCreate] Failed to delete pin message:', error);
    }
    return;
  }

  // Update ticket activity if this is a ticket channel
  if (
    message.channel instanceof TextChannel &&
    message.channel.name.match(/^ticket-\d{4}/) &&
    !message.author.bot
  ) {
    updateTicketActivity(message.channel.id);
  }

  // Check for webhook messages in bot-logs
  if (
    message.webhookId &&
    message.channel instanceof TextChannel &&
    message.channel.name === 'bot-logs'
  ) {
    // Check for deployment webhook (sent by GitHub Actions before deploy)
    const content = message.content?.toLowerCase() || '';
    const embedTitle = message.embeds[0]?.title?.toLowerCase() || '';

    if (content.includes('deployment starting') || embedTitle.includes('deployment starting')) {
      console.log(
        '[MessageCreate] Deployment webhook detected, saving timestamp for downtime tracking'
      );
      recordDeploymentStarting();

      // React to acknowledge
      try {
        await message.react('✅');
      } catch {
        // Ignore reaction errors
      }
      return;
    }

    // Check for release webhook
    const wasReleaseWebhook = await handleReleaseWebhook(message);
    if (wasReleaseWebhook) {
      return;
    }
  }

  // Run auto-moderation first
  const wasModerated = await handleAutoMod(message);
  if (wasModerated) {
    // Message was deleted by auto-mod, don't process further
    return;
  }

  const config = getConfig();

  // Skip if no source channel configured
  if (!config.sourceChannelId) {
    return;
  }

  // Only process messages from the monitored channel
  if (message.channel.id !== config.sourceChannelId) {
    return;
  }

  // Only process messages with embeds
  if (message.embeds.length === 0) {
    return;
  }

  console.log('[MessageCreate] Received message with embeds, parsing...');

  const parseResult = parseMunkMessage(message);

  if (!parseResult) {
    console.log('[MessageCreate] Could not parse Munk message');
    return;
  }

  if (parseResult.type === 'status') {
    updateStatus(parseResult.status);
    console.log(`[MessageCreate] Status updated: ${parseResult.status}`);
  } else if (parseResult.type === 'maintenance') {
    updateMaintenance(parseResult.maintenance);
    console.log('[MessageCreate] Maintenance info updated');
  }
}
