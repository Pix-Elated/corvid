/**
 * Slash commands for the QUEST tracker module.
 *
 * /quest wallet <address>       — Balance, recent transfers, net flow
 * /quest whales                 — Top holders leaderboard
 * /quest transfers <period>     — Largest transfers in period
 * /quest price                  — Current price & token overview
 * /quest track <address> [label] — Add wallet to watchlist
 * /quest untrack <address>      — Remove wallet from watchlist
 * /quest watchlist              — Show all watched wallets
 * /quest channel [channel]      — Set/show the auto-post channel
 * /quest threshold [amount]     — Set/show whale alert threshold
 */
import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  ChannelType,
  TextChannel,
  EmbedBuilder,
} from 'discord.js';
import * as imx from './imx-service';
import * as nftService from './nft-service';
import * as embeds from './embeds';
import * as state from './state';

export const questCommand = {
  data: new SlashCommandBuilder()
    .setName('quest')
    .setDescription('QUEST token tracker on Immutable zkEVM')
    .addSubcommand((sub) =>
      sub
        .setName('wallet')
        .setDescription('View wallet balance and recent transfers')
        .addStringOption((opt) =>
          opt.setName('address').setDescription('Wallet address (0x...)').setRequired(true)
        )
    )
    .addSubcommand((sub) => sub.setName('whales').setDescription('Top QUEST holders leaderboard'))
    .addSubcommand((sub) =>
      sub
        .setName('transfers')
        .setDescription('Largest QUEST transfers in a time period')
        .addStringOption((opt) =>
          opt
            .setName('period')
            .setDescription('Time period')
            .setRequired(false)
            .addChoices(
              { name: '1 hour', value: '1h' },
              { name: '24 hours', value: '24h' },
              { name: '7 days', value: '7d' },
              { name: '30 days', value: '30d' }
            )
        )
    )
    .addSubcommand((sub) =>
      sub.setName('price').setDescription('Current QUEST price and token overview')
    )
    .addSubcommand((sub) =>
      sub
        .setName('track')
        .setDescription('Add a wallet to the watchlist')
        .addStringOption((opt) =>
          opt.setName('address').setDescription('Wallet address (0x...)').setRequired(true)
        )
        .addStringOption((opt) =>
          opt.setName('label').setDescription('Friendly label for this wallet').setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('untrack')
        .setDescription('Remove a wallet from the watchlist')
        .addStringOption((opt) =>
          opt.setName('address').setDescription('Wallet address to remove').setRequired(true)
        )
    )
    .addSubcommand((sub) => sub.setName('watchlist').setDescription('Show all watched wallets'))
    .addSubcommand((sub) =>
      sub
        .setName('channel')
        .setDescription('Set the auto-posting channel for hourly digests')
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setDescription('Channel for auto-posts (leave empty to show current)')
            .setRequired(false)
            .addChannelTypes(ChannelType.GuildText)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('threshold')
        .setDescription('Set the whale alert threshold (min QUEST to flag)')
        .addIntegerOption((opt) =>
          opt
            .setName('amount')
            .setDescription('Minimum QUEST amount (leave empty to show current)')
            .setRequired(false)
            .setMinValue(100)
            .setMaxValue(10_000_000)
        )
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const sub = interaction.options.getSubcommand();

    try {
      switch (sub) {
        case 'wallet':
          return await handleWallet(interaction);
        case 'whales':
          return await handleWhales(interaction);
        case 'transfers':
          return await handleTransfers(interaction);
        case 'price':
          return await handlePrice(interaction);
        case 'track':
          return await handleTrack(interaction);
        case 'untrack':
          return await handleUntrack(interaction);
        case 'watchlist':
          return await handleWatchlist(interaction);
        case 'channel':
          return await handleChannel(interaction);
        case 'threshold':
          return await handleThreshold(interaction);
        default:
          await interaction.reply({ content: 'Unknown subcommand.', ephemeral: true });
      }
    } catch (error) {
      console.error(`[QuestTracker] Error in /quest ${sub}:`, error);
      const msg = error instanceof Error ? error.message : 'Unknown error';
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: `Error: ${msg}` });
      } else {
        await interaction.reply({ content: `Error: ${msg}`, ephemeral: true });
      }
    }
  },
};

// ─── Subcommand Handlers ────────────────────────────────────────────────────

async function handleWallet(interaction: ChatInputCommandInteraction): Promise<void> {
  const address = interaction.options.getString('address', true).trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    await interaction.reply({
      content: 'Invalid wallet address. Must be 0x followed by 40 hex characters.',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply();

  const [balance, transfers] = await Promise.all([
    imx.getWalletBalance(address),
    imx.getWalletTransfers(address, 20),
  ]);

  // Check if it's in the watchlist for a label
  const watched = state
    .getWatchlist()
    .find((w) => w.address.toLowerCase() === address.toLowerCase());
  const embed = embeds.walletEmbed(address, balance, transfers, watched?.label);
  await interaction.editReply({ embeds: [embed] });
}

async function handleWhales(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const [holders, tokenInfo] = await Promise.all([imx.getHolders(15), imx.getTokenInfo()]);

  const embed = embeds.whalesEmbed(holders, tokenInfo);
  await interaction.editReply({ embeds: [embed] });
}

async function handleTransfers(interaction: ChatInputCommandInteraction): Promise<void> {
  const period = interaction.options.getString('period') || '24h';
  await interaction.deferReply();

  const now = new Date();
  let fromDate: Date;
  let periodLabel: string;

  switch (period) {
    case '1h':
      fromDate = new Date(now.getTime() - 60 * 60 * 1000);
      periodLabel = 'Last Hour';
      break;
    case '7d':
      fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      periodLabel = 'Last 7 Days';
      break;
    case '30d':
      fromDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      periodLabel = 'Last 30 Days';
      break;
    default: // 24h
      fromDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      periodLabel = 'Last 24 Hours';
  }

  const transfers = await imx.getTransfers({ fromDate, limit: 500 });
  const embed = embeds.transfersEmbed(transfers, periodLabel);
  await interaction.editReply({ embeds: [embed] });
}

async function handlePrice(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  const tokenInfo = await imx.getTokenInfo();
  const embed = embeds.priceEmbed(tokenInfo);
  await interaction.editReply({ embeds: [embed] });
}

async function handleTrack(interaction: ChatInputCommandInteraction): Promise<void> {
  const address = interaction.options.getString('address', true).trim();
  const label = interaction.options.getString('label') || imx.shortAddr(address);

  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    await interaction.reply({ content: 'Invalid wallet address.', ephemeral: true });
    return;
  }

  const added = state.addWatchedWallet(address, label, interaction.user.id);
  if (added) {
    await interaction.reply({
      embeds: [
        embeds.statusEmbed(
          'Wallet Tracked',
          `Now watching **${label}** (${imx.shortAddr(address)})`
        ),
      ],
    });
  } else {
    await interaction.reply({ content: 'This wallet is already being tracked.', ephemeral: true });
  }
}

async function handleUntrack(interaction: ChatInputCommandInteraction): Promise<void> {
  const address = interaction.options.getString('address', true).trim();
  const removed = state.removeWatchedWallet(address);
  if (removed) {
    await interaction.reply({
      embeds: [embeds.statusEmbed('Wallet Removed', `Stopped tracking ${imx.shortAddr(address)}`)],
    });
  } else {
    await interaction.reply({ content: 'Wallet not found in watchlist.', ephemeral: true });
  }
}

async function handleWatchlist(interaction: ChatInputCommandInteraction): Promise<void> {
  const watchlist = state.getWatchlist();
  if (watchlist.length === 0) {
    await interaction.reply({
      content: 'Watchlist is empty. Use `/quest track` to add wallets.',
      ephemeral: true,
    });
    return;
  }

  const lines = watchlist.map(
    (w, i) =>
      `**${i + 1}.** ${w.label} — \`${w.address}\` (added <t:${Math.floor(new Date(w.addedAt).getTime() / 1000)}:R>)`
  );

  const embed = embeds.statusEmbed('📋 QUEST Watchlist', lines.join('\n'));
  await interaction.reply({ embeds: [embed] });
}

async function handleChannel(interaction: ChatInputCommandInteraction): Promise<void> {
  const channel = interaction.options.getChannel('channel') as TextChannel | null;

  if (!channel) {
    const current = state.getTrackerState().channelId;
    if (current) {
      await interaction.reply({ content: `Auto-post channel: <#${current}>`, ephemeral: true });
    } else {
      await interaction.reply({
        content: 'No auto-post channel configured. Use `/quest channel #channel` to set one.',
        ephemeral: true,
      });
    }
    return;
  }

  // Require admin to set channel
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({
      content: 'Only admins can set the auto-post channel.',
      ephemeral: true,
    });
    return;
  }

  state.setChannel(channel.id);
  await interaction.reply({
    embeds: [
      embeds.statusEmbed('Channel Set', `Hourly QUEST digests will post to <#${channel.id}>`),
    ],
  });
}

async function handleThreshold(interaction: ChatInputCommandInteraction): Promise<void> {
  const amount = interaction.options.getInteger('amount');

  if (amount == null) {
    const current = state.getTrackerState().whaleThreshold;
    await interaction.reply({
      content: `Current whale threshold: **${current.toLocaleString()} QUEST**`,
      ephemeral: true,
    });
    return;
  }

  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: 'Only admins can change the threshold.', ephemeral: true });
    return;
  }

  state.setWhaleThreshold(amount);
  await interaction.reply({
    embeds: [
      embeds.statusEmbed(
        'Threshold Updated',
        `Whale alerts will trigger for transfers ≥ **${amount.toLocaleString()} QUEST**`
      ),
    ],
  });
}

// ─── Setup Command ──────────────────────────────────────────────────────────

/**
 * /setup-quest-tracking — Creates the #quest-tracker channel under Community
 * category, configures it for auto-posting, and sends an intro card.
 */
export const setupQuestTrackingCommand = {
  data: new SlashCommandBuilder()
    .setName('setup-quest-tracking')
    .setDescription('Create the QUEST tracker channel and configure auto-posting')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.guild) {
      await interaction.reply({
        content: 'This command must be used in a server.',
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply();

    const guild = interaction.guild;
    const channelName = 'quest-tracker';

    // Check if channel already exists
    const existing = guild.channels.cache.find(
      (ch) => ch.name === channelName && ch.type === ChannelType.GuildText
    ) as TextChannel | undefined;

    if (existing) {
      // Channel exists — just configure it
      state.setChannel(existing.id);
      await interaction.editReply({
        embeds: [
          embeds.statusEmbed(
            'QUEST Tracker Ready',
            `Channel <#${existing.id}> already exists. Configured for hourly auto-posts.`
          ),
        ],
      });
      return;
    }

    // Find or create the Community category
    let category = guild.channels.cache.find(
      (ch) => ch.name.toLowerCase() === 'community' && ch.type === ChannelType.GuildCategory
    );

    if (!category) {
      category = await guild.channels.create({
        name: 'Community',
        type: ChannelType.GuildCategory,
      });
    }

    // Create the channel
    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: category.id,
      topic:
        'Automated QUEST token tracking — whale movements, transfer volume, and holder analytics on Immutable zkEVM',
    });

    // Configure for auto-posting
    state.setChannel(channel.id);

    // Send intro card
    const introEmbed = new EmbedBuilder()
      .setTitle('📊 QUEST Token Tracker')
      .setDescription(
        'This channel receives **hourly automated digests** of QUEST token activity on Immutable zkEVM.\n\n' +
          '**What gets posted:**\n' +
          '• Transfer volume and count\n' +
          '• Whale movements (large transfers)\n' +
          '• Watchlisted wallet activity\n' +
          '• Current QUEST price\n\n' +
          '**Commands:**\n' +
          '`/quest wallet <address>` — Wallet balance & transfers\n' +
          '`/quest whales` — Top holder leaderboard\n' +
          '`/quest transfers` — Largest recent transfers\n' +
          '`/quest price` — Token overview\n' +
          '`/quest track <address>` — Watch a wallet\n' +
          '`/quest watchlist` — View watched wallets'
      )
      .setColor(0xc9a959)
      .setFooter({ text: 'QUEST on Immutable zkEVM • Data updates hourly' })
      .setTimestamp();

    await channel.send({ embeds: [introEmbed] });

    await interaction.editReply({
      embeds: [
        embeds.statusEmbed(
          'QUEST Tracker Created',
          `<#${channel.id}> is now set up under **${category.name}**.\nHourly digests will start posting automatically.`
        ),
      ],
    });
  },
};

// ─── NFT Commands ───────────────────────────────────────────────────────────

/**
 * /nft portfolio <address> — Wallet's RavenQuest NFT portfolio
 * /nft whales              — Top 15 NFT holders across all collections
 */
export const nftCommand = {
  data: new SlashCommandBuilder()
    .setName('nft')
    .setDescription('RavenQuest NFT lookup')
    .addSubcommand((sub) =>
      sub
        .setName('portfolio')
        .setDescription("Look up a wallet's RavenQuest NFT portfolio")
        .addStringOption((opt) =>
          opt.setName('address').setDescription('Wallet address (0x...)').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('whales')
        .setDescription('Top 15 RavenQuest NFT holders')
        .addStringOption((opt) =>
          opt
            .setName('collection')
            .setDescription('Filter to a specific collection (default: all)')
            .setRequired(false)
            .addChoices(
              { name: 'All Collections', value: 'all' },
              { name: 'Land', value: 'land' },
              { name: 'Munks', value: 'munks' },
              { name: 'Moas', value: 'moas' },
              { name: 'RavenCards', value: 'cards' },
              { name: 'Cosmetics', value: 'cosmetics' }
            )
        )
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const sub = interaction.options.getSubcommand();

    try {
      switch (sub) {
        case 'portfolio':
          return await handleNftPortfolio(interaction);
        case 'whales':
          return await handleNftWhales(interaction);
        default:
          await interaction.reply({ content: 'Unknown subcommand.', ephemeral: true });
      }
    } catch (error) {
      console.error(`[QuestTracker] Error in /nft ${sub}:`, error);
      const msg = error instanceof Error ? error.message : 'Unknown error';
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: `Error: ${msg}` });
      } else {
        await interaction.reply({ content: `Error: ${msg}`, ephemeral: true });
      }
    }
  },
};

async function handleNftPortfolio(interaction: ChatInputCommandInteraction): Promise<void> {
  const address = interaction.options.getString('address', true).trim();

  if (!/^0x[a-fA-F0-9]{40}$/i.test(address)) {
    await interaction.reply({
      content: 'Invalid wallet address. Must be 0x followed by 40 hex characters.',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply();

  const portfolio = await nftService.getPortfolio(address);

  if (portfolio.totalNFTs === 0) {
    await interaction.editReply({
      content: `No RavenQuest NFTs found for \`${imx.shortAddr(address)}\`.`,
    });
    return;
  }

  await interaction.editReply({ embeds: [embeds.portfolioEmbed(portfolio)] });
}

async function handleNftWhales(interaction: ChatInputCommandInteraction): Promise<void> {
  const collection = interaction.options.getString('collection') || 'all';
  await interaction.deferReply();

  const category = collection === 'all' ? undefined : collection;
  const whales = await nftService.getNFTWhales(15, category);

  if (whales.length === 0) {
    await interaction.editReply({ content: 'No NFT holder data available.' });
    return;
  }

  // Pass collection name to embed for the title
  const collectionName = category
    ? Object.values(nftService.RQ_COLLECTIONS).find((c) => c.category === category)?.name ||
      category
    : undefined;
  await interaction.editReply({ embeds: [embeds.nftWhalesEmbed(whales, collectionName)] });
}
