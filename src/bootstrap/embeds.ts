import {
  Guild,
  TextChannel,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
} from 'discord.js';
import { getCardMessageId, setCardMessageId } from '../info-cards';

interface EmbedPostResult {
  posted: string[];
  updated: string[];
  skipped: string[];
  errors: string[];
}

/**
 * Delete bot messages from a channel, optionally skipping a specific message ID.
 * Used to clean up duplicates while preserving the tracked embed.
 */
async function cleanupBotMessages(
  channel: TextChannel,
  client: Client,
  skipMessageId?: string
): Promise<number> {
  let deleted = 0;
  try {
    const messages = await channel.messages.fetch({ limit: 100 });
    const botMessages = messages.filter(
      (m) => m.author.id === client.user?.id && m.id !== skipMessageId
    );

    for (const [, msg] of botMessages) {
      try {
        await msg.delete();
        deleted++;
        console.log(`[Embeds] Deleted duplicate bot message ${msg.id} from #${channel.name}`);
      } catch (e) {
        console.error(`[Embeds] Failed to delete message ${msg.id}:`, e);
      }
    }
  } catch (e) {
    console.error(`[Embeds] Failed to fetch messages from #${channel.name}:`, e);
  }
  return deleted;
}

/**
 * Try to edit an existing tracked message, or post a new one if not found.
 * Also cleans up duplicate bot messages in the channel.
 */
async function editOrPost(
  channel: TextChannel,
  client: Client,
  channelName: string,
  options: {
    embeds: EmbedBuilder[];
    components?: ActionRowBuilder<ButtonBuilder>[];
    pin?: boolean;
  }
): Promise<'edited' | 'posted'> {
  const trackedId = getCardMessageId(channelName);
  const sendPayload: { embeds: EmbedBuilder[]; components?: ActionRowBuilder<ButtonBuilder>[] } = {
    embeds: options.embeds,
  };
  if (options.components) {
    sendPayload.components = options.components;
  }

  // Try to edit the existing tracked message
  if (trackedId) {
    try {
      const existing = await channel.messages.fetch(trackedId);
      if (existing && existing.author.id === client.user?.id) {
        await existing.edit(sendPayload);
        // Clean up any OTHER bot messages (duplicates from previous bugs)
        await cleanupBotMessages(channel, client, trackedId);
        console.log(`[Embeds] Edited existing message ${trackedId} in #${channelName}`);
        return 'edited';
      }
    } catch {
      // Message was deleted or inaccessible — fall through to post new
      console.log(
        `[Embeds] Tracked message ${trackedId} not found in #${channelName}, posting new`
      );
    }
  }

  // Clean up any leftover bot messages before posting fresh
  await cleanupBotMessages(channel, client);

  // Post fresh
  const message = await channel.send(sendPayload);
  setCardMessageId(channelName, message.id);

  if (options.pin) {
    await message.pin().catch((e) => console.error(`[Embeds] Failed to pin #${channelName}:`, e));
  }

  return 'posted';
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
    .setDescription(
      'We believe in free and open discussion. Say what you mean.\n' +
        'These rules exist solely to keep the server functional and legally compliant.'
    )
    .addFields(
      {
        name: '1️⃣ No Illegal Content',
        value:
          'Nothing that violates U.S. federal law. No CSAM, no credible threats ' +
          'of violence, no doxxing (posting private info like addresses/SSNs).',
      },
      {
        name: '2️⃣ No Spam or Malicious Links',
        value:
          'No excessive flooding, bot spam, scam links, phishing, or malware. ' +
          'Self-promotion requires permission from staff.',
      },
      {
        name: '3️⃣ No Cheating or Exploits',
        value:
          "Don't share or discuss cheats, hacks, dupes, or exploits for RavenQuest. " +
          'Report vulnerabilities to staff privately.',
      },
      {
        name: '4️⃣ Stay On Topic',
        value:
          'Use channels for their intended purpose. Random chat goes in #off-topic. ' +
          'Nobody wants to scroll past your food pics in #bug-reports.',
      },
      {
        name: '5️⃣ Listen to Staff',
        value:
          'Moderator decisions are final in the moment. If you disagree, ' +
          'bring it up privately or open a ticket — not in public chat.',
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
 * Get notification roles panel with toggle buttons
 */
function getRolesPanel(_guild: Guild): {
  embed: EmbedBuilder;
  row: ActionRowBuilder<ButtonBuilder>;
} {
  const embed = new EmbedBuilder()
    .setTitle('🔔 Notification Roles')
    .setColor(0x3498db)
    .setDescription(
      'Click the buttons below to toggle notification roles.\n\n' +
        'These roles are used to ping you for specific types of updates.'
    )
    .addFields({
      name: '📢 Updates Role',
      value:
        'Get notified when new releases are announced.\n' +
        'You will be mentioned in #announcements when updates are available.',
    })
    .setFooter({ text: 'Click to toggle • Your roles update instantly' })
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('toggle_updates_role')
      .setLabel('Toggle Updates')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('📢')
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
 * Post or update all embeds in their respective channels.
 * Tries to edit existing tracked messages first; only posts fresh if the
 * tracked message is missing. Also cleans up duplicate bot messages.
 */
export async function postBootstrapEmbeds(guild: Guild, client: Client): Promise<EmbedPostResult> {
  const result: EmbedPostResult = {
    posted: [],
    updated: [],
    skipped: [],
    errors: [],
  };

  // Helper: find a text channel by name
  const findTextChannel = (name: string): TextChannel | undefined =>
    guild.channels.cache.find((ch) => ch.name === name && ch instanceof TextChannel) as
      | TextChannel
      | undefined;

  // ── Channels with interactive buttons ──

  const panelConfigs: {
    channelName: string;
    getContent: () => { embed: EmbedBuilder; row: ActionRowBuilder<ButtonBuilder> };
    pin?: boolean;
  }[] = [
    { channelName: 'verify-here', getContent: () => getVerificationEmbed(guild) },
    { channelName: 'support-general', getContent: () => getSupportGeneralPanel(), pin: true },
    { channelName: 'roles', getContent: () => getRolesPanel(guild) },
    { channelName: 'bug-reports', getContent: () => getBugReportsPanel() },
    { channelName: 'feature-requests', getContent: () => getFeatureRequestsPanel() },
  ];

  for (const panel of panelConfigs) {
    try {
      const channel = findTextChannel(panel.channelName);
      if (!channel) continue;

      const { embed, row } = panel.getContent();
      const action = await editOrPost(channel, client, panel.channelName, {
        embeds: [embed],
        components: [row],
        pin: panel.pin,
      });
      (action === 'edited' ? result.updated : result.posted).push(panel.channelName);
    } catch (error) {
      result.errors.push(`${panel.channelName}: ${error}`);
    }
  }

  // ── Embed-only info cards (no buttons) ──

  for (const config of EMBED_CONFIGS) {
    try {
      const channel = findTextChannel(config.channelName);
      if (!channel) continue;

      const embed = config.getEmbed(guild);
      const action = await editOrPost(channel, client, config.channelName, {
        embeds: [embed],
      });
      (action === 'edited' ? result.updated : result.posted).push(config.channelName);
    } catch (error) {
      result.errors.push(`${config.channelName}: ${error}`);
    }
  }

  console.log(
    `[Embeds] Posted ${result.posted.length}, updated ${result.updated.length}, skipped ${result.skipped.length}`
  );

  return result;
}
