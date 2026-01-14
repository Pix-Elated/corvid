import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
  TextChannel,
} from 'discord.js';
import {
  getCardMessageId,
  setCardMessageId,
  removeCardReference,
  getAllCards,
} from '../../info-cards';

// Card definitions - centralized so we can update content easily
function getBugReportsEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('🐛 Bug Reports')
    .setColor(0xe74c3c)
    .setDescription(
      '```diff\n' +
        '- Found a bug? Help us squash it!\n' +
        '```\n' +
        'Please include the following information when reporting bugs:'
    )
    .addFields(
      {
        name: '📋 Required Information',
        value:
          '```yaml\n' +
          '1. What happened?\n' +
          '2. What did you expect?\n' +
          '3. Steps to reproduce\n' +
          '4. Screenshots/videos if possible\n' +
          '5. Your device/browser/OS\n' +
          '```',
      },
      {
        name: '⚡ Priority Levels',
        value:
          '```ansi\n' +
          '\u001b[0;31m[CRITICAL]\u001b[0m App crashes or data loss\n' +
          '\u001b[0;33m[HIGH]\u001b[0m Major feature broken\n' +
          '\u001b[0;34m[MEDIUM]\u001b[0m Feature works but buggy\n' +
          '\u001b[0;32m[LOW]\u001b[0m Minor visual/UX issues\n' +
          '```',
      },
      {
        name: '💡 Tips',
        value:
          '• Search existing reports before posting\n' +
          '• One bug per message\n' +
          '• Be specific and detailed\n' +
          '• Use threads for follow-up discussion',
      }
    )
    .setFooter({ text: 'Thank you for helping improve the app!' })
    .setTimestamp();
}

function getFeatureRequestsEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('🚀 Feature Requests')
    .setColor(0x2ecc71)
    .setDescription(
      '```diff\n' +
        '+ Have an idea? We want to hear it!\n' +
        '```\n' +
        'Help shape the future of the app by suggesting new features.'
    )
    .addFields(
      {
        name: '📝 Request Format',
        value:
          '```yaml\n' +
          'Feature: [Short title]\n' +
          'Description: [What should it do?]\n' +
          'Use Case: [Why is it useful?]\n' +
          'Priority: [Nice-to-have / Important / Critical]\n' +
          '```',
      },
      {
        name: '✨ What makes a great request?',
        value:
          '• Clear problem statement\n' +
          '• Specific solution proposal\n' +
          '• Explains who benefits\n' +
          '• Considers edge cases',
      },
      {
        name: '📊 Voting',
        value:
          'React with 👍 to support ideas you like!\n' + 'Popular requests get higher priority.',
      }
    )
    .setFooter({ text: 'Your ideas make the app better!' })
    .setTimestamp();
}

function getSupportGeneralEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('💬 Support Channel')
    .setColor(0x3498db)
    .setDescription(
      '```fix\n' +
        "Need help? You're in the right place!\n" +
        '```\n' +
        'Ask questions, get help, and connect with the community.'
    )
    .addFields(
      {
        name: '📚 Before Asking',
        value:
          '• Check #faq for common questions\n' +
          '• Search if your question was asked before\n' +
          '• Read the documentation if available',
      },
      {
        name: '🎫 Need Private Help?',
        value:
          'For account issues or sensitive matters,\n' +
          'open a ticket in #create-ticket for 1-on-1 support.',
      },
      {
        name: '⏰ Response Times',
        value:
          '```yaml\n' +
          'Community: Usually within hours\n' +
          'Staff: Within 24-48 hours\n' +
          'Tickets: Priority response\n' +
          '```',
      }
    )
    .setFooter({ text: 'Be patient and respectful • Help others when you can!' })
    .setTimestamp();
}

interface CardConfig {
  channelName: string;
  getEmbed: () => EmbedBuilder;
}

const CARD_CONFIGS: CardConfig[] = [
  { channelName: 'bug-reports', getEmbed: getBugReportsEmbed },
  { channelName: 'feature-requests', getEmbed: getFeatureRequestsEmbed },
  { channelName: 'support-general', getEmbed: getSupportGeneralEmbed },
];

export const postInfoCardsCommand = {
  data: new SlashCommandBuilder()
    .setName('info-cards')
    .setDescription('Manage info cards in support channels')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub.setName('post').setDescription('Post or update info cards in all support channels')
    )
    .addSubcommand((sub) =>
      sub.setName('update').setDescription('Update existing info cards (edit in place)')
    )
    .addSubcommand((sub) => sub.setName('delete').setDescription('Delete all tracked info cards'))
    .addSubcommand((sub) => sub.setName('status').setDescription('Show status of all info cards'))
    .addSubcommand((sub) =>
      sub
        .setName('refresh')
        .setDescription('Delete old cards and post new ones')
        .addStringOption((opt) =>
          opt
            .setName('channel')
            .setDescription('Specific channel to refresh (or all)')
            .setRequired(false)
            .addChoices(
              { name: 'All channels', value: 'all' },
              { name: 'bug-reports', value: 'bug-reports' },
              { name: 'feature-requests', value: 'feature-requests' },
              { name: 'support-general', value: 'support-general' }
            )
        )
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.guild) {
      await interaction.reply({
        content: 'This command can only be used in a server.',
        ephemeral: true,
      });
      return;
    }

    const subcommand = interaction.options.getSubcommand();
    await interaction.deferReply({ ephemeral: true });

    const results: string[] = [];

    switch (subcommand) {
      case 'post':
      case 'update': {
        for (const config of CARD_CONFIGS) {
          const result = await postOrUpdateCard(interaction, config, subcommand === 'update');
          results.push(result);
        }
        break;
      }

      case 'delete': {
        for (const config of CARD_CONFIGS) {
          const result = await deleteCard(interaction, config.channelName);
          results.push(result);
        }
        break;
      }

      case 'status': {
        const cards = getAllCards();
        for (const config of CARD_CONFIGS) {
          const messageId = cards[config.channelName];
          const channel = interaction.guild.channels.cache.find(
            (ch) => ch.name === config.channelName && ch instanceof TextChannel
          ) as TextChannel | undefined;

          if (!channel) {
            results.push(`⚠️ #${config.channelName}: Channel not found`);
            continue;
          }

          if (!messageId) {
            results.push(`❌ #${config.channelName}: No card tracked`);
            continue;
          }

          // Check if message still exists
          try {
            await channel.messages.fetch(messageId);
            results.push(`✅ #${config.channelName}: Card exists (ID: ${messageId})`);
          } catch {
            results.push(`⚠️ #${config.channelName}: Card deleted (stale reference)`);
          }
        }
        break;
      }

      case 'refresh': {
        const targetChannel = interaction.options.getString('channel') || 'all';
        const configs =
          targetChannel === 'all'
            ? CARD_CONFIGS
            : CARD_CONFIGS.filter((c) => c.channelName === targetChannel);

        for (const config of configs) {
          // Delete old card first
          await deleteCard(interaction, config.channelName);
          // Post new card
          const result = await postOrUpdateCard(interaction, config, false);
          results.push(result);
        }
        break;
      }
    }

    await interaction.editReply({
      content: `**Info Cards - ${subcommand.toUpperCase()}:**\n${results.join('\n')}`,
    });

    console.log(`[InfoCards] ${subcommand} by ${interaction.user.tag}: ${results.join(', ')}`);
  },
};

async function postOrUpdateCard(
  interaction: ChatInputCommandInteraction,
  config: CardConfig,
  updateOnly: boolean
): Promise<string> {
  const channel = interaction.guild!.channels.cache.find(
    (ch) => ch.name === config.channelName && ch instanceof TextChannel
  ) as TextChannel | undefined;

  if (!channel) {
    return `⚠️ #${config.channelName}: Channel not found`;
  }

  const existingMessageId = getCardMessageId(config.channelName);
  const embed = config.getEmbed();

  // Try to update existing message
  if (existingMessageId) {
    try {
      const message = await channel.messages.fetch(existingMessageId);
      await message.edit({ embeds: [embed] });
      return `✏️ #${config.channelName}: Updated existing card`;
    } catch {
      // Message was deleted, clear the reference
      removeCardReference(config.channelName);
      if (updateOnly) {
        return `⚠️ #${config.channelName}: Card was deleted, use 'post' to create new`;
      }
    }
  } else if (updateOnly) {
    return `⚠️ #${config.channelName}: No card to update, use 'post' first`;
  }

  // Post new message
  try {
    const message = await channel.send({ embeds: [embed] });
    setCardMessageId(config.channelName, message.id);
    return `✅ #${config.channelName}: Posted new card`;
  } catch (error) {
    console.error(`[InfoCards] Error posting to ${config.channelName}:`, error);
    return `❌ #${config.channelName}: Failed to post`;
  }
}

async function deleteCard(
  interaction: ChatInputCommandInteraction,
  channelName: string
): Promise<string> {
  const channel = interaction.guild!.channels.cache.find(
    (ch) => ch.name === channelName && ch instanceof TextChannel
  ) as TextChannel | undefined;

  if (!channel) {
    removeCardReference(channelName);
    return `⚠️ #${channelName}: Channel not found`;
  }

  const messageId = getCardMessageId(channelName);
  if (!messageId) {
    return `⚠️ #${channelName}: No card tracked`;
  }

  try {
    const message = await channel.messages.fetch(messageId);
    await message.delete();
    removeCardReference(channelName);
    return `🗑️ #${channelName}: Card deleted`;
  } catch {
    removeCardReference(channelName);
    return `⚠️ #${channelName}: Card already deleted`;
  }
}
