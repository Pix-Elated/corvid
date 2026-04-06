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

export const verifyCommand = {
  data: new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Post the verification message with button')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription('Channel to post verification message (defaults to current)')
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
      // Find the rules channel for linking
      const rulesChannel = interaction.guild.channels.cache.find(
        (ch) => ch.name === 'rules' && ch.isTextBased()
      );
      const rulesLink = rulesChannel ? ` in <#${rulesChannel.id}>` : '';

      const embed = new EmbedBuilder()
        .setTitle('🛡️ Server Verification')
        .setDescription(
          `Welcome to **${interaction.guild.name}**!\n\n` +
            'To gain access to the server, please click the button below.\n\n' +
            `By verifying, you agree to follow the server rules${rulesLink}.`
        )
        .setColor(0x9b59b6) // Purple - matches Verified role
        .setFooter({ text: 'Click the button below to verify' })
        .setTimestamp();

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('verify_button')
          .setLabel('Verify')
          .setStyle(ButtonStyle.Success)
          .setEmoji('✅')
      );

      await targetChannel.send({
        embeds: [embed],
        components: [row],
      });

      await interaction.editReply({
        content: `Verification message posted in ${targetChannel}`,
      });

      console.log(
        `[Verify] Verification message posted in #${targetChannel.name} by ${interaction.user.tag}`
      );
    } catch (error) {
      console.error('[Verify] Error posting verification message:', error);
      await interaction.editReply({
        content: 'Failed to post verification message. Check bot permissions.',
      });
    }
  },
};
