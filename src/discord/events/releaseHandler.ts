import {
  Message,
  TextChannel,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ModalSubmitInteraction,
  PermissionFlagsBits,
  GuildMember,
  Client,
} from 'discord.js';
import {
  setPendingRelease,
  getPendingRelease,
  updatePendingNotification,
  publishRelease,
  discardRelease,
  PendingRelease,
} from '../../releases';

const STAFF_CHANNEL_NAME = 'staff-chat';
const ANNOUNCEMENTS_CHANNEL_NAME = 'announcements';
const UPDATES_ROLE_NAME = 'Updates';

/**
 * Clean up GitHub-generated changelog by removing boilerplate sections
 * Strips: Security Verification, Downloads, Auto-Updates, How to Verify, tables, etc.
 */
function cleanChangelog(changelog: string): string {
  let cleaned = changelog;

  // Remove the main header "## RavenHUD vX.X.X"
  cleaned = cleaned.replace(/^##\s+RavenHUD\s+v[\d.]+\s*\n*/im, '');

  // Remove entire sections we don't want
  cleaned = cleaned.replace(/###\s*Security Verification[\s\S]*?(?=###|$)/gi, '');
  cleaned = cleaned.replace(/###\s*How to Verify[\s\S]*?(?=###|$)/gi, '');
  cleaned = cleaned.replace(/###\s*Downloads[\s\S]*?(?=###|$)/gi, '');
  cleaned = cleaned.replace(/###\s*Auto-Updates[\s\S]*?(?=###|$)/gi, '');
  cleaned = cleaned.replace(/###\s*Release Notes[\s\S]*?(?=###|$)/gi, '');

  // Remove "Built and signed" line
  cleaned = cleaned.replace(/^.*Built and signed.*$/gim, '');

  // Remove markdown tables (lines with |)
  cleaned = cleaned.replace(/^\|.*\|$/gm, '');
  cleaned = cleaned.replace(/^\s*\|?[-:]+\|[-:|\s]+$/gm, '');

  // Convert ### headings to bold (for what remains)
  cleaned = cleaned.replace(/^###\s*(.+)$/gm, '**$1**');

  // Clean up excessive newlines
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  return cleaned.trim();
}

/**
 * Check if a message is from the RavenHUD release webhook
 * Specifically matches the format: "🎉 RavenHUD vX.X.X Released!"
 */
export function isReleaseWebhook(message: Message): boolean {
  // Must be from a webhook
  if (!message.webhookId) return false;

  // Must have embeds
  if (message.embeds.length === 0) return false;

  const embed = message.embeds[0];
  const title = embed.title || '';
  const description = embed.description || '';

  // Specific pattern for RavenHUD releases: "🎉 RavenHUD vX.X.X Released!"
  // or similar patterns with "Released" in title
  const releasePattern = /ravenhud\s+v?\d+\.\d+\.\d+\s+released/i;
  const titleMatches = releasePattern.test(title);

  // Also check for key content markers that identify this as a release
  const hasDownloads = description.toLowerCase().includes('download');
  const hasSecurityVerification = description.toLowerCase().includes('security verification');
  const hasAutoUpdates = description.toLowerCase().includes('auto-updates');

  // Must have the title pattern AND at least one content marker
  return titleMatches || (hasDownloads && (hasSecurityVerification || hasAutoUpdates));
}

/**
 * Extract release information from a GitHub webhook embed
 */
export function extractReleaseInfo(message: Message): {
  version: string;
  changelog: string;
  releaseUrl: string;
} | null {
  if (message.embeds.length === 0) return null;

  const embed = message.embeds[0];

  // Try to extract version from title or description (include the v prefix)
  const versionPattern = /(v?\d+\.\d+\.\d+)/;
  let version = '';

  const titleMatch = embed.title?.match(versionPattern);
  if (titleMatch) {
    version = titleMatch[1];
    // Ensure version starts with v
    if (!version.startsWith('v')) {
      version = 'v' + version;
    }
  } else {
    const descMatch = embed.description?.match(versionPattern);
    if (descMatch) {
      version = descMatch[1];
      if (!version.startsWith('v')) {
        version = 'v' + version;
      }
    }
  }

  if (!version) {
    console.log('[ReleaseHandler] Could not extract version from webhook');
    return null;
  }

  // Get changelog from description or fields
  let changelog = embed.description || '';

  // If there are fields, append them
  if (embed.fields && embed.fields.length > 0) {
    const fieldContent = embed.fields.map((f) => `**${f.name}**\n${f.value}`).join('\n\n');
    changelog = changelog ? `${changelog}\n\n${fieldContent}` : fieldContent;
  }

  // Construct the release URL from version (embed URL is often malformed)
  const releaseUrl = `https://github.com/Pix-Elated/ravenhud/releases/tag/${version}`;

  return { version, changelog, releaseUrl };
}

/**
 * Handle an incoming GitHub release webhook message
 * Deletes the message and queues it for staff approval
 */
export async function handleReleaseWebhook(message: Message): Promise<boolean> {
  // Must be in bot-logs channel
  if (!(message.channel instanceof TextChannel)) return false;
  if (message.channel.name !== 'bot-logs') return false;

  // Check if it's a release webhook
  if (!isReleaseWebhook(message)) return false;

  const releaseInfo = extractReleaseInfo(message);
  if (!releaseInfo) {
    console.log('[ReleaseHandler] Could not extract release info from webhook');
    return false;
  }

  console.log(`[ReleaseHandler] Detected release webhook for ${releaseInfo.version}`);

  // Delete the webhook message
  try {
    await message.delete();
    console.log('[ReleaseHandler] Deleted webhook message');
  } catch (error) {
    console.error('[ReleaseHandler] Failed to delete webhook message:', error);
  }

  // Store the pending release
  const release = setPendingRelease(
    releaseInfo.version,
    releaseInfo.changelog,
    releaseInfo.releaseUrl
  );

  // Notify staff
  await notifyStaffChannel(message.client, release);

  return true;
}

/**
 * Post notification to staff-chat about pending release
 */
async function notifyStaffChannel(client: Client, release: PendingRelease): Promise<void> {
  const guild = client.guilds.cache.first();
  if (!guild) {
    console.error('[ReleaseHandler] No guild found');
    return;
  }

  const staffChannel = guild.channels.cache.find(
    (ch) => ch.name === STAFF_CHANNEL_NAME && ch instanceof TextChannel
  ) as TextChannel | undefined;

  if (!staffChannel) {
    console.error('[ReleaseHandler] Staff channel not found');
    return;
  }

  // Clean and truncate changelog for embed
  let changelog = cleanChangelog(release.changelog);
  const maxChangelogLength = 1000;
  if (changelog.length > maxChangelogLength) {
    changelog = changelog.substring(0, maxChangelogLength) + '...';
  }

  const embed = new EmbedBuilder()
    .setTitle(`New Release Ready: ${release.version}`)
    .setDescription(
      'A new release is ready to be announced.\n\n' +
        'Click **Write Announcement** to add a message explaining this release in plain English, ' +
        'then it will be posted to #announcements.'
    )
    .addFields({
      name: 'Changelog',
      value: changelog || 'No changelog provided',
    })
    .setColor(0x2ecc71)
    .setTimestamp();

  if (release.releaseUrl) {
    embed.setURL(release.releaseUrl);
  }

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('release_publish')
      .setLabel('Write Announcement')
      .setStyle(ButtonStyle.Success)
      .setEmoji('📢'),
    new ButtonBuilder()
      .setCustomId('release_discard')
      .setLabel('Discard')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🗑️')
  );

  try {
    const notificationMessage = await staffChannel.send({
      embeds: [embed],
      components: [row],
    });

    // Store the notification message ID
    updatePendingNotification(notificationMessage.id, staffChannel.id);

    console.log(`[ReleaseHandler] Posted release notification to #${STAFF_CHANNEL_NAME}`);
  } catch (error) {
    console.error('[ReleaseHandler] Failed to post notification:', error);
  }
}

/**
 * Handle the "Write Announcement" button click
 */
export async function handlePublishButton(interaction: ButtonInteraction): Promise<void> {
  // Check permissions
  const member = interaction.member as GuildMember;
  if (!member.permissions.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({
      content: 'You need the Manage Server permission to publish releases.',
      ephemeral: true,
    });
    return;
  }

  const release = getPendingRelease();
  if (!release) {
    await interaction.reply({
      content: 'No pending release found. It may have already been published or discarded.',
      ephemeral: true,
    });
    return;
  }

  // Show modal for announcement message
  const modal = new ModalBuilder()
    .setCustomId('release_modal')
    .setTitle(`Announce ${release.version}`);

  const messageInput = new TextInputBuilder()
    .setCustomId('announcement_message')
    .setLabel('Announcement Message')
    .setPlaceholder('Explain in plain English what this release includes and why it matters...')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMinLength(10)
    .setMaxLength(2000);

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(messageInput));

  await interaction.showModal(modal);
}

/**
 * Handle the announcement modal submission
 */
export async function handlePublishModal(interaction: ModalSubmitInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({
      content: 'This can only be used in a server.',
      ephemeral: true,
    });
    return;
  }

  const customMessage = interaction.fields.getTextInputValue('announcement_message');

  const release = getPendingRelease();
  if (!release) {
    await interaction.reply({
      content: 'No pending release found. It may have already been published or discarded.',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  // Find announcements channel
  const announcementsChannel = interaction.guild.channels.cache.find(
    (ch) => ch.name === ANNOUNCEMENTS_CHANNEL_NAME && ch instanceof TextChannel
  ) as TextChannel | undefined;

  if (!announcementsChannel) {
    await interaction.editReply({
      content: `Could not find #${ANNOUNCEMENTS_CHANNEL_NAME} channel.`,
    });
    return;
  }

  // Clean and truncate changelog for announcement
  let changelog = cleanChangelog(release.changelog);
  const maxChangelogLength = 800;
  if (changelog.length > maxChangelogLength) {
    changelog = changelog.substring(0, maxChangelogLength) + '...';
  }

  // Build the announcement embed
  const embed = new EmbedBuilder()
    .setTitle(`📢 Release ${release.version}`)
    .setDescription(customMessage)
    .setColor(0x5865f2) // Discord blurple
    .setTimestamp();

  if (changelog) {
    embed.addFields({
      name: "What's Changed",
      value: changelog,
    });
  }

  if (release.releaseUrl) {
    embed.addFields({
      name: 'Links',
      value: `[View Full Release](${release.releaseUrl})`,
    });
  }

  try {
    // Find the Updates role to mention
    const updatesRole = interaction.guild.roles.cache.find((r) => r.name === UPDATES_ROLE_NAME);

    // Post to announcements with @Updates mention
    const content = updatesRole ? `<@&${updatesRole.id}>` : undefined;
    await announcementsChannel.send({ content, embeds: [embed] });

    // Mark as published
    publishRelease(interaction.user.id);

    // Update the original notification message
    await updateNotificationMessage(interaction.client, release, 'published', interaction.user.tag);

    await interaction.editReply({
      content: `Release ${release.version} has been announced in #${ANNOUNCEMENTS_CHANNEL_NAME}!`,
    });

    console.log(`[ReleaseHandler] Release ${release.version} published by ${interaction.user.tag}`);
  } catch (error) {
    console.error('[ReleaseHandler] Failed to post announcement:', error);
    await interaction.editReply({
      content: 'Failed to post announcement. Please try again.',
    });
  }
}

/**
 * Handle the "Discard" button click
 */
export async function handleDiscardButton(interaction: ButtonInteraction): Promise<void> {
  // Check permissions
  const member = interaction.member as GuildMember;
  if (!member.permissions.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({
      content: 'You need the Manage Server permission to discard releases.',
      ephemeral: true,
    });
    return;
  }

  const release = getPendingRelease();
  if (!release) {
    await interaction.reply({
      content: 'No pending release found. It may have already been published or discarded.',
      ephemeral: true,
    });
    return;
  }

  // Discard the release
  discardRelease();

  // Update the notification message
  await updateNotificationMessage(interaction.client, release, 'discarded', interaction.user.tag);

  await interaction.reply({
    content: `Release ${release.version} has been discarded.`,
    ephemeral: true,
  });

  console.log(`[ReleaseHandler] Release ${release.version} discarded by ${interaction.user.tag}`);
}

/**
 * Update the staff notification message after publish/discard
 */
async function updateNotificationMessage(
  client: Client,
  release: PendingRelease,
  status: 'published' | 'discarded',
  byUser: string
): Promise<void> {
  if (!release.notificationMessageId || !release.notificationChannelId) return;

  const guild = client.guilds.cache.first();
  if (!guild) return;

  const channel = guild.channels.cache.get(release.notificationChannelId) as TextChannel;
  if (!channel) return;

  try {
    const message = await channel.messages.fetch(release.notificationMessageId);

    const embed = EmbedBuilder.from(message.embeds[0])
      .setColor(status === 'published' ? 0x2ecc71 : 0x95a5a6)
      .setFooter({
        text: `${status === 'published' ? '✅ Published' : '🗑️ Discarded'} by ${byUser}`,
      });

    await message.edit({
      embeds: [embed],
      components: [], // Remove buttons
    });
  } catch (error) {
    console.error('[ReleaseHandler] Failed to update notification message:', error);
  }
}
