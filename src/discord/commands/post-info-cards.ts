import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
  TextChannel,
} from 'discord.js';

export const postInfoCardsCommand = {
  data: new SlashCommandBuilder()
    .setName('post-info-cards')
    .setDescription('Post info cards to bug-reports and feature-requests channels')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.guild) {
      await interaction.reply({
        content: 'This command can only be used in a server.',
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const results: string[] = [];

    // Bug Reports Card
    const bugReportsChannel = interaction.guild.channels.cache.find(
      (ch) => ch.name === 'bug-reports' && ch instanceof TextChannel
    ) as TextChannel | undefined;

    if (bugReportsChannel) {
      const bugEmbed = new EmbedBuilder()
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

      try {
        await bugReportsChannel.send({ embeds: [bugEmbed] });
        results.push(`✅ Posted to #bug-reports`);
      } catch (error) {
        results.push(`❌ Failed to post to #bug-reports`);
        console.error('[InfoCards] Error posting to bug-reports:', error);
      }
    } else {
      results.push(`⚠️ #bug-reports channel not found`);
    }

    // Feature Requests Card
    const featureRequestsChannel = interaction.guild.channels.cache.find(
      (ch) => ch.name === 'feature-requests' && ch instanceof TextChannel
    ) as TextChannel | undefined;

    if (featureRequestsChannel) {
      const featureEmbed = new EmbedBuilder()
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
              'React with 👍 to support ideas you like!\n' +
              'Popular requests get higher priority.',
          }
        )
        .setFooter({ text: 'Your ideas make the app better!' })
        .setTimestamp();

      try {
        await featureRequestsChannel.send({ embeds: [featureEmbed] });
        results.push(`✅ Posted to #feature-requests`);
      } catch (error) {
        results.push(`❌ Failed to post to #feature-requests`);
        console.error('[InfoCards] Error posting to feature-requests:', error);
      }
    } else {
      results.push(`⚠️ #feature-requests channel not found`);
    }

    // Support General Card
    const supportGeneralChannel = interaction.guild.channels.cache.find(
      (ch) => ch.name === 'support-general' && ch instanceof TextChannel
    ) as TextChannel | undefined;

    if (supportGeneralChannel) {
      const supportEmbed = new EmbedBuilder()
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

      try {
        await supportGeneralChannel.send({ embeds: [supportEmbed] });
        results.push(`✅ Posted to #support-general`);
      } catch (error) {
        results.push(`❌ Failed to post to #support-general`);
        console.error('[InfoCards] Error posting to support-general:', error);
      }
    } else {
      results.push(`⚠️ #support-general channel not found`);
    }

    await interaction.editReply({
      content: `**Info Cards Posted:**\n${results.join('\n')}`,
    });

    console.log(`[InfoCards] Info cards posted by ${interaction.user.tag}: ${results.join(', ')}`);
  },
};
