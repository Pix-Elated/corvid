import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
  TextChannel,
  ChannelType,
} from 'discord.js';
import { recordPopulate, trackMessage } from '../../server-state';

// Channel content configuration
const CHANNEL_EMBEDS: Record<string, EmbedBuilder[]> = {
  welcome: [
    new EmbedBuilder()
      .setTitle('Welcome to RavenHUD')
      .setDescription(
        'This is the official community Discord for **RavenHUD** - a companion overlay tool for RavenQuest.\n\n' +
          'Track cosmetics, trophies, tradepacks, farming, and more with an always-on-top overlay that works while you play.'
      )
      .setColor(0x9b59b6) // Purple
      .addFields(
        {
          name: 'Quick Links',
          value:
            '🌐 [Website](https://therealpixelated.github.io/ravenhud)\n' +
            '🐦 [Twitter/X](https://x.com/therealpixelated)',
          inline: true,
        },
        {
          name: 'Getting Started',
          value:
            '1. Download RavenHUD from the website\n' +
            '2. Check out #announcements for updates\n' +
            '3. Report bugs in #bug-reports\n' +
            '4. Chat with the community in #general',
          inline: true,
        }
      )
      .setFooter({ text: 'RavenHUD • Community Discord' })
      .setTimestamp(),
  ],

  rules: [
    new EmbedBuilder()
      .setTitle('Server Rules')
      .setDescription(
        "We keep things simple here. Follow these rules and we'll all get along fine."
      )
      .setColor(0xe74c3c) // Red
      .addFields(
        {
          name: '1. Keep it Legal',
          value:
            'No illegal content, activities, or discussions. This includes piracy, hacking, doxxing, etc.',
        },
        {
          name: '2. No NSFW Content',
          value: 'Keep all content safe for work. No explicit images, videos, or discussions.',
        },
        {
          name: '3. Be Respectful',
          value: 'Disagree respectfully. No harassment, hate speech, or personal attacks.',
        },
        {
          name: '4. No Spam',
          value:
            'No excessive self-promotion, repeated messages, or bot commands outside designated channels.',
        }
      )
      .addFields({
        name: 'Consequences',
        value:
          '⚠️ Warning → 🔇 Mute → 🔨 Ban\n\nSeverity depends on the violation. Serious offenses skip straight to ban.',
      })
      .setFooter({ text: 'Last updated' })
      .setTimestamp(),
  ],

  announcements: [
    new EmbedBuilder()
      .setTitle('Announcements')
      .setDescription(
        'This channel is for official announcements only.\n\n' +
          "You'll find updates about:\n" +
          '• New releases and patches\n' +
          '• Important changes\n' +
          '• Events and community news\n' +
          '• Maintenance notifications\n\n' +
          'Stay tuned for updates!'
      )
      .setColor(0x3498db) // Blue
      .setFooter({ text: 'RavenHUD Announcements' })
      .setTimestamp(),
  ],

  roadmap: [
    new EmbedBuilder()
      .setTitle('RavenHUD Roadmap')
      .setDescription('Current development status and planned features.')
      .setColor(0x2ecc71) // Green
      .addFields(
        {
          name: '📍 Current Status',
          value:
            '**Alpha** - Available through January 2026\n' +
            'Testing and gathering community feedback',
        },
        {
          name: '🎯 Next Milestone',
          value:
            '**Beta v1.0.0** - Target: February 1, 2026\n' +
            'First stable release with core features',
        },
        {
          name: '💬 We Want Your Feedback',
          value:
            'This is your chance to shape RavenHUD!\n' +
            '• Report bugs in #bug-reports\n' +
            '• Suggest features in #feature-requests\n' +
            '• Discuss ideas in #general',
        },
        {
          name: '⚠️ Known Limitations',
          value:
            '• Some data points may be missing or inaccurate\n' +
            '• Features are subject to change\n' +
            '• Expect bugs during alpha',
        }
      )
      .setFooter({ text: 'Last updated' })
      .setTimestamp(),
  ],

  faq: [
    new EmbedBuilder()
      .setTitle('Frequently Asked Questions')
      .setDescription(
        'Common questions will be added here as they come up.\n\n' +
          "Have a question that isn't answered? Ask in #support-general!"
      )
      .setColor(0xf1c40f) // Gold
      .addFields(
        {
          name: 'Q: Where do I download RavenHUD?',
          value:
            'A: Visit [our website](https://therealpixelated.github.io/ravenhud) to download the latest version.',
        },
        {
          name: 'Q: Is RavenHUD safe to use?',
          value:
            'A: Yes! RavenHUD is code-signed and scanned with VirusTotal. Check the Security section on the website for verification steps.',
        },
        {
          name: 'Q: Will I get banned for using RavenHUD?',
          value:
            "A: RavenHUD is an overlay tool that doesn't interact with the game client. It only displays information - it doesn't automate or modify anything.",
        }
      )
      .setFooter({ text: 'More FAQs will be added as questions come in' })
      .setTimestamp(),
  ],
};

export const populateCommand = {
  data: new SlashCommandBuilder()
    .setName('populate')
    .setDescription('Populate information channels with default content and pin messages')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((option) =>
      option
        .setName('channel')
        .setDescription('Specific channel to populate (or "all" for all channels)')
        .setRequired(false)
        .addChoices(
          { name: 'All Channels', value: 'all' },
          { name: '#welcome', value: 'welcome' },
          { name: '#rules', value: 'rules' },
          { name: '#announcements', value: 'announcements' },
          { name: '#roadmap', value: 'roadmap' },
          { name: '#faq', value: 'faq' }
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

    await interaction.deferReply({ ephemeral: true });

    const targetChannel = interaction.options.getString('channel') || 'all';
    const results: string[] = [];
    const channelsToPopulate =
      targetChannel === 'all' ? Object.keys(CHANNEL_EMBEDS) : [targetChannel];

    for (const channelName of channelsToPopulate) {
      const embeds = CHANNEL_EMBEDS[channelName];
      if (!embeds) {
        results.push(`❌ ${channelName}: No content defined`);
        continue;
      }

      // Find the channel
      const channel = interaction.guild.channels.cache.find(
        (c) => c.name === channelName && c.type === ChannelType.GuildText
      ) as TextChannel | undefined;

      if (!channel) {
        results.push(`❌ #${channelName}: Channel not found`);
        continue;
      }

      try {
        // Check for existing pinned messages to avoid duplicates
        const pins = await channel.messages.fetchPinned();
        if (pins.size > 0) {
          results.push(`⚠️ #${channelName}: Already has pinned messages, skipping`);
          continue;
        }

        // Send and pin each embed
        for (let i = 0; i < embeds.length; i++) {
          const embed = embeds[i];
          const message = await channel.send({ embeds: [embed] });
          await message.pin();
          // Track the message for future reference
          trackMessage(`populate_${channelName}_${i}`, channel.id, message.id);
        }

        results.push(`✅ #${channelName}: Posted and pinned`);
      } catch (error) {
        console.error(`[Populate] Error populating #${channelName}:`, error);
        results.push(
          `❌ #${channelName}: Failed - ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    // Record populate completion
    recordPopulate();

    await interaction.editReply({
      content: `**Channel Population Results:**\n${results.join('\n')}`,
    });
  },
};
