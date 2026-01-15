import {
  Guild,
  TextChannel,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { getCardMessageId, setCardMessageId } from '../info-cards';

interface EmbedPostResult {
  posted: string[];
  updated: string[];
  skipped: string[];
  errors: string[];
}

/**
 * Get the verification panel embed and buttons
 */
function getVerificationEmbed(guild: Guild): {
  embed: EmbedBuilder;
  row: ActionRowBuilder<ButtonBuilder>;
} {
  const rulesChannel = guild.channels.cache.find((ch) => ch.name === 'rules' && ch.isTextBased());
  const rulesLink = rulesChannel ? ` in <#${rulesChannel.id}>` : '';

  const embed = new EmbedBuilder()
    .setTitle('🛡️ Server Verification')
    .setDescription(
      `Welcome to **${guild.name}**!\n\n` +
        'To gain access to the server, please click the button below.\n\n' +
        `By verifying, you agree to follow the server rules${rulesLink}.`
    )
    .setColor(0x9b59b6)
    .setFooter({ text: 'Click the button below to verify' })
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('verify_button')
      .setLabel('Verify')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅')
  );

  return { embed, row };
}

/**
 * Get welcome channel embed
 */
function getWelcomeEmbed(guild: Guild): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(`Welcome to ${guild.name}!`)
    .setColor(0x9b59b6)
    .setDescription(
      '```ansi\n' +
        '\u001b[0;35m╔══════════════════════════════════════╗\n' +
        '\u001b[0;35m║\u001b[0;37m     Thanks for joining us!           \u001b[0;35m║\n' +
        '\u001b[0;35m╚══════════════════════════════════════╝\u001b[0m\n' +
        '```'
    )
    .addFields(
      {
        name: '🚀 Getting Started',
        value:
          '1. Read the rules in #rules\n' +
          '2. Verify yourself in #verify-here\n' +
          '3. Introduce yourself in #general\n' +
          '4. Check out #announcements for updates',
      },
      {
        name: '💬 Need Help?',
        value:
          '• Check #faq for common questions\n' +
          '• Ask in #support-general\n' +
          '• Open a ticket in #create-ticket for private help',
      }
    )
    .setFooter({ text: "We're glad to have you here!" })
    .setTimestamp();
}

/**
 * Get rules channel embed
 */
function getRulesEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('📜 Server Rules')
    .setColor(0xe74c3c)
    .setDescription('Please follow these rules to keep our community safe and welcoming.')
    .addFields(
      {
        name: '1️⃣ Be Respectful',
        value: 'Treat everyone with respect. No harassment, hate speech, or personal attacks.',
      },
      {
        name: '2️⃣ No Spam',
        value: 'No excessive messaging, self-promotion, or advertising without permission.',
      },
      {
        name: '3️⃣ Keep It SFW',
        value: 'No NSFW content. This is a family-friendly community.',
      },
      {
        name: '4️⃣ Stay On Topic',
        value: 'Use channels for their intended purpose. Off-topic chat goes in #off-topic.',
      },
      {
        name: '5️⃣ No Cheating/Exploits',
        value: "Don't share or discuss cheats, hacks, or exploits.",
      },
      {
        name: '6️⃣ Listen to Staff',
        value: 'Follow moderator instructions. If you disagree, discuss it privately.',
      }
    )
    .setFooter({ text: 'Breaking rules may result in warnings, mutes, or bans.' })
    .setTimestamp();
}

/**
 * Get roadmap channel embed
 */
function getRoadmapEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('🗺️ Development Roadmap')
    .setColor(0x2ecc71)
    .setDescription("Here's what we're working on! Check back for updates.")
    .addFields(
      {
        name: '✅ Recently Completed',
        value: '• Core features\n• Basic infrastructure\n• Community setup',
      },
      {
        name: '🔨 In Progress',
        value: '• Quality of life improvements\n• Performance optimizations\n• Bug fixes',
      },
      {
        name: '📋 Planned',
        value: '• New features (see #feature-requests)\n• Community events\n• More content',
      }
    )
    .setFooter({ text: 'Last updated' })
    .setTimestamp();
}

/**
 * Get bug reports panel with button
 */
function getBugReportsPanel(): {
  embed: EmbedBuilder;
  row: ActionRowBuilder<ButtonBuilder>;
} {
  const embed = new EmbedBuilder()
    .setTitle('🐛 Bug Reports')
    .setColor(0xe74c3c)
    .setDescription(
      '```diff\n' +
        '- Found a bug? Help us squash it!\n' +
        '```\n' +
        'Click the button below to submit a bug report.\n' +
        'Your report will be posted here for community discussion.'
    )
    .addFields(
      {
        name: '📋 What to Include',
        value:
          '• What happened vs what you expected\n' +
          '• Steps to reproduce\n' +
          '• Screenshots/videos if possible\n' +
          '• Your device/browser/OS',
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
      }
    )
    .setFooter({ text: 'Click below to report a bug' })
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_bug')
      .setLabel('Report a Bug')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🐛')
  );

  return { embed, row };
}

/**
 * Get feature requests panel with button
 */
function getFeatureRequestsPanel(): {
  embed: EmbedBuilder;
  row: ActionRowBuilder<ButtonBuilder>;
} {
  const embed = new EmbedBuilder()
    .setTitle('🚀 Feature Requests')
    .setColor(0x2ecc71)
    .setDescription(
      '```diff\n' +
        '+ Have an idea? We want to hear it!\n' +
        '```\n' +
        'Click the button below to submit a feature request.\n' +
        'Your request will be posted here for community discussion.'
    )
    .addFields(
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
    .setFooter({ text: 'Click below to submit a feature request' })
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_feature')
      .setLabel('Request a Feature')
      .setStyle(ButtonStyle.Success)
      .setEmoji('🚀')
  );

  return { embed, row };
}

/**
 * Get support-general panel with private ticket button
 */
function getSupportGeneralPanel(): {
  embed: EmbedBuilder;
  row: ActionRowBuilder<ButtonBuilder>;
} {
  const embed = new EmbedBuilder()
    .setTitle('💬 Support Channel')
    .setColor(0x3498db)
    .setDescription(
      '```fix\n' +
        "Need help? You're in the right place!\n" +
        '```\n' +
        'Ask questions, get help, and connect with the community.\n\n' +
        '**Need private 1-on-1 help?** Click the button below to open a private support ticket.'
    )
    .addFields({
      name: '📚 Before Asking',
      value:
        '• Check #faq for common questions\n' +
        '• Search if your question was asked before\n' +
        '• Read the documentation if available',
    })
    .setFooter({ text: 'Be patient and respectful • Help others when you can!' })
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_support')
      .setLabel('Open Private Ticket')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🎫')
  );

  return { embed, row };
}

interface EmbedConfig {
  channelName: string;
  getEmbed: (guild: Guild) => EmbedBuilder;
  getComponents?: () => ActionRowBuilder<ButtonBuilder>;
}

const EMBED_CONFIGS: EmbedConfig[] = [
  { channelName: 'welcome', getEmbed: getWelcomeEmbed },
  { channelName: 'rules', getEmbed: () => getRulesEmbed() },
  { channelName: 'roadmap', getEmbed: () => getRoadmapEmbed() },
];

/**
 * Post or update all embeds in their respective channels
 * Tracks message IDs to update existing embeds on subsequent runs
 */
export async function postBootstrapEmbeds(guild: Guild): Promise<EmbedPostResult> {
  const result: EmbedPostResult = {
    posted: [],
    updated: [],
    skipped: [],
    errors: [],
  };

  // Post verification panel
  try {
    const verifyChannel = guild.channels.cache.find(
      (ch) => ch.name === 'verify-here' && ch instanceof TextChannel
    ) as TextChannel | undefined;

    if (verifyChannel) {
      const { embed, row } = getVerificationEmbed(guild);
      const existingId = getCardMessageId('verify-here');

      if (existingId) {
        try {
          const existingMessage = await verifyChannel.messages.fetch(existingId);
          await existingMessage.edit({ embeds: [embed], components: [row] });
          result.updated.push('verify-here');
        } catch {
          // Message was deleted, post new one
          const message = await verifyChannel.send({ embeds: [embed], components: [row] });
          setCardMessageId('verify-here', message.id);
          result.posted.push('verify-here');
        }
      } else {
        const message = await verifyChannel.send({ embeds: [embed], components: [row] });
        setCardMessageId('verify-here', message.id);
        result.posted.push('verify-here');
      }
    }
  } catch (error) {
    result.errors.push(`verify-here: ${error}`);
  }

  // Post support panel with private ticket button to support-general
  try {
    const supportChannel = guild.channels.cache.find(
      (ch) => ch.name === 'support-general' && ch instanceof TextChannel
    ) as TextChannel | undefined;

    if (supportChannel) {
      const { embed, row } = getSupportGeneralPanel();
      const existingId = getCardMessageId('support-general');

      if (existingId) {
        try {
          const existingMessage = await supportChannel.messages.fetch(existingId);
          await existingMessage.edit({ embeds: [embed], components: [row] });
          result.updated.push('support-general');
        } catch {
          // Message was deleted, post new one
          const message = await supportChannel.send({ embeds: [embed], components: [row] });
          setCardMessageId('support-general', message.id);
          result.posted.push('support-general');
        }
      } else {
        const message = await supportChannel.send({ embeds: [embed], components: [row] });
        setCardMessageId('support-general', message.id);
        result.posted.push('support-general');
      }
    }
  } catch (error) {
    result.errors.push(`support-general: ${error}`);
  }

  // Post bug reports panel with button
  try {
    const bugChannel = guild.channels.cache.find(
      (ch) => ch.name === 'bug-reports' && ch instanceof TextChannel
    ) as TextChannel | undefined;

    if (bugChannel) {
      const { embed, row } = getBugReportsPanel();
      const existingId = getCardMessageId('bug-reports');

      if (existingId) {
        try {
          const existingMessage = await bugChannel.messages.fetch(existingId);
          await existingMessage.edit({ embeds: [embed], components: [row] });
          result.updated.push('bug-reports');
        } catch {
          // Message was deleted, post new one
          const message = await bugChannel.send({ embeds: [embed], components: [row] });
          setCardMessageId('bug-reports', message.id);
          result.posted.push('bug-reports');
        }
      } else {
        const message = await bugChannel.send({ embeds: [embed], components: [row] });
        setCardMessageId('bug-reports', message.id);
        result.posted.push('bug-reports');
      }
    }
  } catch (error) {
    result.errors.push(`bug-reports: ${error}`);
  }

  // Post feature requests panel with button
  try {
    const featureChannel = guild.channels.cache.find(
      (ch) => ch.name === 'feature-requests' && ch instanceof TextChannel
    ) as TextChannel | undefined;

    if (featureChannel) {
      const { embed, row } = getFeatureRequestsPanel();
      const existingId = getCardMessageId('feature-requests');

      if (existingId) {
        try {
          const existingMessage = await featureChannel.messages.fetch(existingId);
          await existingMessage.edit({ embeds: [embed], components: [row] });
          result.updated.push('feature-requests');
        } catch {
          // Message was deleted, post new one
          const message = await featureChannel.send({ embeds: [embed], components: [row] });
          setCardMessageId('feature-requests', message.id);
          result.posted.push('feature-requests');
        }
      } else {
        const message = await featureChannel.send({ embeds: [embed], components: [row] });
        setCardMessageId('feature-requests', message.id);
        result.posted.push('feature-requests');
      }
    }
  } catch (error) {
    result.errors.push(`feature-requests: ${error}`);
  }

  // Post info cards
  for (const config of EMBED_CONFIGS) {
    try {
      const channel = guild.channels.cache.find(
        (ch) => ch.name === config.channelName && ch instanceof TextChannel
      ) as TextChannel | undefined;

      if (!channel) {
        continue;
      }

      const embed = config.getEmbed(guild);
      const existingId = getCardMessageId(config.channelName);

      if (existingId) {
        try {
          const existingMessage = await channel.messages.fetch(existingId);
          await existingMessage.edit({ embeds: [embed] });
          result.updated.push(config.channelName);
          continue;
        } catch {
          // Card was deleted, post a new one
        }
      }

      const message = await channel.send({ embeds: [embed] });
      setCardMessageId(config.channelName, message.id);
      result.posted.push(config.channelName);
    } catch (error) {
      result.errors.push(`${config.channelName}: ${error}`);
    }
  }

  console.log(
    `[Embeds] Posted ${result.posted.length}, updated ${result.updated.length}, skipped ${result.skipped.length}`
  );

  return result;
}
