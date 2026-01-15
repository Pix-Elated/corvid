import {
  ButtonInteraction,
  ModalSubmitInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  GuildMember,
  TextChannel,
} from 'discord.js';
import { createTicket, getTicketByChannelId } from '../../tickets';
import { manualCloseTicket } from '../../tickets/autoclose';
import { TicketType } from '../../types';

// Support tickets spawn under SUPPORT category
const SUPPORT_CATEGORY_NAME = 'SUPPORT';

/**
 * Handle ticket creation button clicks
 */
export async function handleTicketButton(interaction: ButtonInteraction): Promise<void> {
  const buttonId = interaction.customId;

  let ticketType: TicketType;
  let modalTitle: string;
  let includesPriority = false;

  switch (buttonId) {
    case 'ticket_feature':
      ticketType = 'feature';
      modalTitle = 'Feature Request';
      break;
    case 'ticket_bug':
      ticketType = 'bug';
      modalTitle = 'Bug Report';
      includesPriority = true;
      break;
    case 'ticket_support':
      ticketType = 'support';
      modalTitle = 'Open Ticket';
      break;
    default:
      return;
  }

  // Build the modal
  const modal = new ModalBuilder().setCustomId(`ticket_modal_${ticketType}`).setTitle(modalTitle);

  const subjectInput = new TextInputBuilder()
    .setCustomId('ticket_subject')
    .setLabel('Subject')
    .setPlaceholder('Brief summary of your request')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(100);

  const descriptionInput = new TextInputBuilder()
    .setCustomId('ticket_description')
    .setLabel('Description')
    .setPlaceholder('Please provide details...')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1000);

  const rows: ActionRowBuilder<TextInputBuilder>[] = [
    new ActionRowBuilder<TextInputBuilder>().addComponents(subjectInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput),
  ];

  if (includesPriority) {
    const priorityInput = new TextInputBuilder()
      .setCustomId('ticket_priority')
      .setLabel('Priority (low/medium/high/critical)')
      .setPlaceholder('medium')
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setMaxLength(10);
    rows.push(new ActionRowBuilder<TextInputBuilder>().addComponents(priorityInput));
  }

  modal.addComponents(...rows);

  await interaction.showModal(modal);
}

/**
 * Handle ticket modal submission
 */
export async function handleTicketModal(interaction: ModalSubmitInteraction): Promise<void> {
  if (!interaction.guild || !interaction.member) {
    await interaction.reply({
      content: 'This can only be used in a server.',
      ephemeral: true,
    });
    return;
  }

  const modalId = interaction.customId;
  const ticketType = modalId.replace('ticket_modal_', '') as TicketType;

  const subject = interaction.fields.getTextInputValue('ticket_subject');
  const description = interaction.fields.getTextInputValue('ticket_description');

  let priority: 'low' | 'medium' | 'high' | 'critical' | undefined;
  if (ticketType === 'bug') {
    const priorityInput = interaction.fields.getTextInputValue('ticket_priority')?.toLowerCase();
    if (['low', 'medium', 'high', 'critical'].includes(priorityInput)) {
      priority = priorityInput as 'low' | 'medium' | 'high' | 'critical';
    } else {
      priority = 'medium';
    }
  }

  await interaction.deferReply({ ephemeral: true });

  // Route based on ticket type
  if (ticketType === 'feature' || ticketType === 'bug') {
    await handlePublicCard(interaction, ticketType, subject, description, priority);
  } else {
    await handlePrivateTicket(interaction, ticketType, subject, description);
  }
}

/**
 * Handle feature requests and bug reports - post public card with thread
 */
async function handlePublicCard(
  interaction: ModalSubmitInteraction,
  ticketType: 'feature' | 'bug',
  subject: string,
  description: string,
  priority?: 'low' | 'medium' | 'high' | 'critical'
): Promise<void> {
  const guild = interaction.guild!;

  // Find the target channel
  const channelName = ticketType === 'feature' ? 'feature-requests' : 'bug-reports';
  const targetChannel = guild.channels.cache.find(
    (ch) => ch.name === channelName && ch instanceof TextChannel
  ) as TextChannel | undefined;

  if (!targetChannel) {
    await interaction.editReply({
      content: `Channel #${channelName} not found. Please run /setup first.`,
    });
    return;
  }

  try {
    // Build the card embed
    const isFeature = ticketType === 'feature';
    const embed = new EmbedBuilder()
      .setTitle(`${isFeature ? '🚀' : '🐛'} ${subject}`)
      .setDescription(description)
      .setColor(isFeature ? 0x2ecc71 : 0xe74c3c)
      .addFields({ name: 'Submitted by', value: `<@${interaction.user.id}>`, inline: true })
      .setTimestamp();

    if (ticketType === 'bug' && priority) {
      const priorityColors: Record<string, string> = {
        critical: '🔴',
        high: '🟠',
        medium: '🟡',
        low: '🟢',
      };
      embed.addFields({
        name: 'Priority',
        value: `${priorityColors[priority] || '⚪'} ${priority.toUpperCase()}`,
        inline: true,
      });
    }

    embed.setFooter({ text: 'React with 👍 to support • Reply in thread' });

    // Staff-only convert to ticket button
    const convertRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`convert_to_ticket_${ticketType}`)
        .setLabel('Convert to Ticket')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔒')
    );

    // Post the card with convert button
    const message = await targetChannel.send({ embeds: [embed], components: [convertRow] });

    // Add voting reaction
    await message.react('👍');

    // Create a thread for discussion
    const threadName = subject.substring(0, 100);
    const thread = await message.startThread({
      name: threadName,
      autoArchiveDuration: 4320, // 3 days
    });

    // Post initial message in thread
    await thread.send({
      content:
        `<@${interaction.user.id}> started this ${isFeature ? 'feature request' : 'bug report'}.\n\n` +
        `Feel free to discuss, ask questions, or add more details here!`,
    });

    await interaction.editReply({
      content: `Your ${isFeature ? 'feature request' : 'bug report'} has been posted: ${message.url}`,
    });

    console.log(
      `[Support] ${ticketType} posted in #${channelName} by ${interaction.user.tag}: ${subject}`
    );
  } catch (error) {
    console.error(`[Support] Error posting ${ticketType}:`, error);
    await interaction.editReply({
      content: 'Failed to post. Please try again or contact an administrator.',
    });
  }
}

/**
 * Handle general support - create private ticket channel
 */
async function handlePrivateTicket(
  interaction: ModalSubmitInteraction,
  ticketType: TicketType,
  subject: string,
  description: string
): Promise<void> {
  const guild = interaction.guild!;

  // Find SUPPORT category
  const category = guild.channels.cache.find(
    (ch) => ch.type === ChannelType.GuildCategory && ch.name.toUpperCase() === SUPPORT_CATEGORY_NAME
  );

  if (!category) {
    await interaction.editReply({
      content: 'Support category not found. Please run /setup first.',
    });
    return;
  }

  try {
    // Create the ticket in state first to get the ID
    const tempTicket = createTicket(
      'pending',
      interaction.user.id,
      ticketType,
      subject,
      description
    );

    // Create the channel name
    const username = interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '');
    const channelName = `${tempTicket.id}-${username}`.substring(0, 100);

    // Create the private channel under SUPPORT
    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: category.id,
      topic: `Support ticket: ${subject}`,
      permissionOverwrites: [
        {
          id: guild.id, // @everyone
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: interaction.user.id, // Ticket creator
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles,
          ],
        },
      ],
    });

    // Update ticket with actual channel ID
    const tickets = await import('../../tickets');
    tickets.removeTicket('pending');
    const ticket = tickets.createTicket(
      channel.id,
      interaction.user.id,
      ticketType,
      subject,
      description
    );

    // Build welcome embed
    const welcomeEmbed = new EmbedBuilder()
      .setTitle('🎫 Support Ticket')
      .setDescription(
        `Thank you for creating a support ticket!\n\n` +
          `Our team will be with you shortly. In the meantime, please provide any additional information that might help us assist you.`
      )
      .addFields(
        { name: 'Ticket ID', value: ticket.id, inline: true },
        { name: 'Created by', value: `<@${interaction.user.id}>`, inline: true },
        { name: 'Subject', value: subject },
        { name: 'Description', value: description }
      )
      .setColor(0x3498db)
      .setTimestamp();

    // Close button
    const closeRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_close')
        .setLabel('Close Ticket')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔒')
    );

    await channel.send({
      content: `<@${interaction.user.id}>`,
      embeds: [welcomeEmbed],
      components: [closeRow],
    });

    await interaction.editReply({
      content: `Your support ticket has been created: ${channel}`,
    });

    console.log(`[Tickets] Created ticket ${ticket.id} by ${interaction.user.tag}`);
  } catch (error) {
    console.error('[Tickets] Error creating ticket:', error);
    await interaction.editReply({
      content: 'Failed to create ticket. Please try again or contact an administrator.',
    });
  }
}

/**
 * Handle close ticket button
 */
export async function handleCloseButton(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({
      content: 'This can only be used in a server.',
      ephemeral: true,
    });
    return;
  }

  const ticket = getTicketByChannelId(interaction.channel?.id || '');
  if (!ticket) {
    await interaction.reply({
      content: 'This channel is not a valid ticket.',
      ephemeral: true,
    });
    return;
  }

  // Check if user is ticket creator or has mod permissions
  const member = interaction.member as GuildMember;
  const isCreator = ticket.creatorId === interaction.user.id;
  const isMod = member.permissions.has(PermissionFlagsBits.ModerateMembers);

  if (!isCreator && !isMod) {
    await interaction.reply({
      content: 'Only the ticket creator or staff can close this ticket.',
      ephemeral: true,
    });
    return;
  }

  // Show confirmation
  const confirmEmbed = new EmbedBuilder()
    .setTitle('Close Ticket?')
    .setDescription(
      'Are you sure you want to close this ticket?\n\n' +
        'A transcript will be saved and you will receive a copy via DM.'
    )
    .setColor(0xf39c12);

  const confirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_close_confirm')
      .setLabel('Yes, Close Ticket')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('ticket_close_cancel')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
  );

  await interaction.reply({
    embeds: [confirmEmbed],
    components: [confirmRow],
    ephemeral: true,
  });
}

/**
 * Handle close confirmation
 */
export async function handleCloseConfirm(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferUpdate();

  const success = await manualCloseTicket(
    interaction.client,
    interaction.channel?.id || '',
    interaction.user.id
  );

  if (!success) {
    await interaction.followUp({
      content: 'Failed to close ticket. It may have already been closed.',
      ephemeral: true,
    });
  }
  // If successful, channel will be deleted so no need to reply
}

/**
 * Handle close cancellation
 */
export async function handleCloseCancel(interaction: ButtonInteraction): Promise<void> {
  await interaction.update({
    content: 'Ticket close cancelled.',
    embeds: [],
    components: [],
  });
}

/**
 * Handle convert to ticket button (staff only)
 */
export async function handleConvertToTicket(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.guild || !interaction.member) {
    await interaction.reply({
      content: 'This can only be used in a server.',
      ephemeral: true,
    });
    return;
  }

  // Check if user is admin/mod
  const member = interaction.member as GuildMember;
  const isMod = member.permissions.has(PermissionFlagsBits.ModerateMembers);

  if (!isMod) {
    await interaction.reply({
      content: 'Only staff members can convert public posts to private tickets.',
      ephemeral: true,
    });
    return;
  }

  // Get the original message with the embed
  const message = interaction.message;
  const embed = message.embeds[0];

  if (!embed) {
    await interaction.reply({
      content: 'Could not find the original post.',
      ephemeral: true,
    });
    return;
  }

  // Extract ticket type from button ID (convert_to_ticket_feature or convert_to_ticket_bug)
  const ticketType = interaction.customId.replace('convert_to_ticket_', '') as 'feature' | 'bug';

  // Show modal for conversion options
  const modal = new ModalBuilder()
    .setCustomId(`convert_modal_${message.id}_${ticketType}`)
    .setTitle('Convert to Private Ticket');

  const deleteOption = new TextInputBuilder()
    .setCustomId('delete_public')
    .setLabel('Delete public version? (yes/no)')
    .setPlaceholder('yes')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(3);

  const reasonInput = new TextInputBuilder()
    .setCustomId('convert_reason')
    .setLabel('Reason for conversion (optional)')
    .setPlaceholder('e.g., Contains sensitive info, needs private discussion')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(500);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(deleteOption),
    new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput)
  );

  await interaction.showModal(modal);
}

/**
 * Handle convert modal submission
 */
export async function handleConvertModal(interaction: ModalSubmitInteraction): Promise<void> {
  if (!interaction.guild || !interaction.member) {
    await interaction.reply({
      content: 'This can only be used in a server.',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  // Parse modal ID: convert_modal_{messageId}_{ticketType}
  const modalParts = interaction.customId.split('_');
  const messageId = modalParts[2];
  const ticketType = modalParts[3] as 'feature' | 'bug';

  const deletePublic =
    interaction.fields.getTextInputValue('delete_public').toLowerCase() === 'yes';
  const reason = interaction.fields.getTextInputValue('convert_reason') || undefined;

  const guild = interaction.guild;
  const channel = interaction.channel as TextChannel;

  try {
    // Fetch the original message
    const originalMessage = await channel.messages.fetch(messageId);
    const embed = originalMessage.embeds[0];

    if (!embed) {
      await interaction.editReply({ content: 'Could not find the original post.' });
      return;
    }

    // Extract info from embed - remove leading emoji and space
    const subject = embed.title?.replace(/^(\u{1F680}|\u{1F41B})\s*/u, '') || 'Converted Ticket';
    const description = embed.description || '';

    // Find the creator from the embed field
    const submittedByField = embed.fields.find((f) => f.name === 'Submitted by');
    const creatorMatch = submittedByField?.value.match(/<@(\d+)>/);
    const creatorId = creatorMatch ? creatorMatch[1] : interaction.user.id;

    // Find SUPPORT category
    const category = guild.channels.cache.find(
      (ch) =>
        ch.type === ChannelType.GuildCategory && ch.name.toUpperCase() === SUPPORT_CATEGORY_NAME
    );

    if (!category) {
      await interaction.editReply({
        content: 'Support category not found. Please run /setup first.',
      });
      return;
    }

    // Create the ticket
    const tickets = await import('../../tickets');
    const tempTicket = tickets.createTicket('pending', creatorId, ticketType, subject, description);

    // Create channel name
    const creator = await guild.members.fetch(creatorId).catch(() => null);
    const username = creator?.user.username.toLowerCase().replace(/[^a-z0-9]/g, '') || 'user';
    const channelName = `${tempTicket.id}-${username}`.substring(0, 100);

    // Create the private channel
    const ticketChannel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: category.id,
      topic: `Converted ${ticketType}: ${subject}`,
      permissionOverwrites: [
        {
          id: guild.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: creatorId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles,
          ],
        },
      ],
    });

    // Update ticket with actual channel ID
    tickets.removeTicket('pending');
    const ticket = tickets.createTicket(
      ticketChannel.id,
      creatorId,
      ticketType,
      subject,
      description
    );

    // Build welcome embed for converted ticket
    const isFeature = ticketType === 'feature';
    const welcomeEmbed = new EmbedBuilder()
      .setTitle(`🔒 Converted ${isFeature ? 'Feature Request' : 'Bug Report'}`)
      .setDescription(
        `This ${isFeature ? 'feature request' : 'bug report'} has been converted to a private ticket.\n\n` +
          (reason ? `**Reason:** ${reason}\n\n` : '') +
          `**Original post:**\n${description}`
      )
      .addFields(
        { name: 'Ticket ID', value: ticket.id, inline: true },
        { name: 'Created by', value: `<@${creatorId}>`, inline: true },
        { name: 'Converted by', value: `<@${interaction.user.id}>`, inline: true },
        { name: 'Subject', value: subject }
      )
      .setColor(isFeature ? 0x2ecc71 : 0xe74c3c)
      .setTimestamp();

    // Close button
    const closeRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_close')
        .setLabel('Close Ticket')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔒')
    );

    await ticketChannel.send({
      content: `<@${creatorId}>`,
      embeds: [welcomeEmbed],
      components: [closeRow],
    });

    // If deleting public version, migrate thread messages first
    if (deletePublic && originalMessage.thread) {
      const thread = originalMessage.thread;

      // Fetch all messages from thread
      const allMessages: { author: string; content: string; timestamp: Date }[] = [];
      let lastId: string | undefined;
      let hasMore = true;

      // Paginate through thread messages
      while (hasMore) {
        const fetchedMessages = await thread.messages.fetch({
          limit: 100,
          ...(lastId ? { before: lastId } : {}),
        });

        if (fetchedMessages.size === 0) {
          hasMore = false;
          continue;
        }

        for (const [, msg] of fetchedMessages) {
          // Skip bot messages (like the initial thread message)
          if (!msg.author.bot) {
            allMessages.push({
              author: msg.author.tag,
              content: msg.content,
              timestamp: msg.createdAt,
            });
          }
        }

        lastId = fetchedMessages.last()?.id;
        if (fetchedMessages.size < 100) hasMore = false;
      }

      // Sort messages chronologically
      allMessages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      // Post migrated messages to ticket if any exist
      if (allMessages.length > 0) {
        const migratedEmbed = new EmbedBuilder()
          .setTitle('📜 Previous Discussion')
          .setDescription('The following messages were migrated from the public thread:')
          .setColor(0x95a5a6);

        await ticketChannel.send({ embeds: [migratedEmbed] });

        // Group messages into chunks to avoid hitting message limits
        let messageChunk = '';
        for (const msg of allMessages) {
          const line = `**${msg.author}:** ${msg.content}\n`;
          if (messageChunk.length + line.length > 1900) {
            await ticketChannel.send(messageChunk);
            messageChunk = line;
          } else {
            messageChunk += line;
          }
        }
        if (messageChunk) {
          await ticketChannel.send(messageChunk);
        }
      }

      // Delete the thread and original message
      await thread.delete('Converted to private ticket');
      await originalMessage.delete();
    } else if (!deletePublic) {
      // Update the original message to show it's been converted
      const updatedEmbed = EmbedBuilder.from(embed)
        .setFooter({ text: `🔒 Converted to private ticket by ${interaction.user.tag}` })
        .setColor(0x95a5a6);

      await originalMessage.edit({
        embeds: [updatedEmbed],
        components: [], // Remove the convert button
      });
    }

    await interaction.editReply({
      content: `Ticket created: ${ticketChannel}\n${deletePublic ? 'Public post and thread deleted.' : 'Public post marked as converted.'}`,
    });

    console.log(
      `[Tickets] Converted ${ticketType} to ticket ${ticket.id} by ${interaction.user.tag}${deletePublic ? ' (deleted public)' : ''}`
    );
  } catch (error) {
    console.error('[Tickets] Error converting to ticket:', error);
    await interaction.editReply({
      content: 'Failed to convert to ticket. Please try again or contact an administrator.',
    });
  }
}
