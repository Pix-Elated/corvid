import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  TextChannel,
} from 'discord.js';

export const ticketSetupCommand = {
  data: new SlashCommandBuilder()
    .setName('ticket-setup')
    .setDescription('Post the ticket creation panel with buttons')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription('Channel to post ticket panel (defaults to current)')
        .setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.guild) {
      await interaction.reply({
        content: 'This command can only be used in a server.',
        ephemeral: true,
      });
      return;
    }

    const targetChannel =
      (interaction.options.getChannel('channel') as TextChannel) ||
      (interaction.channel as TextChannel);

    if (!targetChannel || !targetChannel.isTextBased()) {
      await interaction.reply({
        content: 'Invalid channel specified.',
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const embed = new EmbedBuilder()
        .setTitle('🎫 Support Tickets')
        .setDescription(
          'Need help? Click one of the buttons below to open a support ticket.\n\n' +
            '**Feature Request** - Suggest new features or improvements\n' +
            "**Bug Report** - Report issues or problems you've encountered\n" +
            '**General Support** - Get help with questions or concerns\n\n' +
            '_A private channel will be created where you can discuss with our team._'
        )
        .setColor(0x3498db)
        .setFooter({ text: 'Select a ticket type below' })
        .setTimestamp();

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('ticket_feature')
          .setLabel('Feature Request')
          .setStyle(ButtonStyle.Success)
          .setEmoji('🚀'),
        new ButtonBuilder()
          .setCustomId('ticket_bug')
          .setLabel('Bug Report')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🐛'),
        new ButtonBuilder()
          .setCustomId('ticket_support')
          .setLabel('General Support')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('💬')
      );

      await targetChannel.send({
        embeds: [embed],
        components: [row],
      });

      await interaction.editReply({
        content: `Ticket panel posted in ${targetChannel}`,
      });

      console.log(
        `[TicketSetup] Ticket panel posted in #${targetChannel.name} by ${interaction.user.tag}`
      );
    } catch (error) {
      console.error('[TicketSetup] Error posting ticket panel:', error);
      await interaction.editReply({
        content: 'Failed to post ticket panel. Check bot permissions.',
      });
    }
  },
};
