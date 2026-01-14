import { Message } from 'discord.js';
import { getConfig } from '../../config';
import { parseMunkMessage } from '../../parser/munk';
import { updateStatus, updateMaintenance } from '../../state';

/**
 * Handle new messages - parse embeds from the source channel
 */
export function handleMessageCreate(message: Message): void {
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
