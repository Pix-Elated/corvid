import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  version as discordJsVersion,
} from 'discord.js';
import os from 'os';
import { getTicketStats } from '../../tickets';
import { getPanelsForGuild } from '../../reaction-roles';

const startTime = Date.now();

export const statusCommand = {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('View bot status, uptime, and system stats'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    const client = interaction.client;
    const uptime = Date.now() - startTime;
    const processUptime = process.uptime() * 1000;

    // System stats
    const memUsage = process.memoryUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const cpuUsage = os.loadavg()[0]; // 1 minute load average
    const cpuCount = os.cpus().length;
    const cpuModel = os.cpus()[0]?.model || 'Unknown';
    const platform = `${os.type()} ${os.release()}`;
    const nodeVersion = process.version;

    // Discord stats
    const guilds = client.guilds.cache.size;
    const channels = client.channels.cache.size;
    const users = client.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0);
    const ping = client.ws.ping;

    // Bot-specific stats
    const ticketStats = getTicketStats();
    const rolePanels = interaction.guild ? getPanelsForGuild(interaction.guild.id).length : 0;

    // Format helpers
    const formatBytes = (bytes: number): string => {
      if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(2)} GB`;
      if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(2)} MB`;
      return `${(bytes / 1024).toFixed(2)} KB`;
    };

    const formatUptime = (ms: number): string => {
      const seconds = Math.floor(ms / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);

      const parts: string[] = [];
      if (days > 0) parts.push(`${days}d`);
      if (hours % 24 > 0) parts.push(`${hours % 24}h`);
      if (minutes % 60 > 0) parts.push(`${minutes % 60}m`);
      if (seconds % 60 > 0 || parts.length === 0) parts.push(`${seconds % 60}s`);

      return parts.join(' ');
    };

    // Build the nerdy embed
    const embed = new EmbedBuilder()
      .setTitle('⚡ Corvid System Status')
      .setColor(0x9b59b6) // Purple/cyberpunk
      .setThumbnail(client.user?.displayAvatarURL() || '')
      .setDescription(
        '```ansi\n' +
          '\u001b[0;35m╔══════════════════════════════════════╗\n' +
          '\u001b[0;35m║\u001b[0;37m        CORVID v1.1 • ONLINE          \u001b[0;35m║\n' +
          '\u001b[0;35m╚══════════════════════════════════════╝\u001b[0m\n' +
          '```'
      )
      .addFields(
        {
          name: '🕐 Uptime',
          value:
            '```yaml\n' +
            `Bot: ${formatUptime(uptime)}\n` +
            `Process: ${formatUptime(processUptime)}\n` +
            '```',
          inline: true,
        },
        {
          name: '📡 Latency',
          value:
            '```yaml\n' +
            `WebSocket: ${ping}ms\n` +
            `API: ${Date.now() - interaction.createdTimestamp}ms\n` +
            '```',
          inline: true,
        },
        {
          name: '💾 Memory',
          value:
            '```yaml\n' +
            `Heap: ${formatBytes(memUsage.heapUsed)}/${formatBytes(memUsage.heapTotal)}\n` +
            `RSS: ${formatBytes(memUsage.rss)}\n` +
            `System: ${formatBytes(usedMem)}/${formatBytes(totalMem)}\n` +
            '```',
          inline: false,
        },
        {
          name: '🖥️ System',
          value:
            '```yaml\n' +
            `Platform: ${platform}\n` +
            `CPU: ${cpuModel.slice(0, 40)}\n` +
            `Cores: ${cpuCount} • Load: ${cpuUsage.toFixed(2)}\n` +
            '```',
          inline: false,
        },
        {
          name: '📊 Discord Stats',
          value:
            '```yaml\n' +
            `Guilds: ${guilds}\n` +
            `Channels: ${channels}\n` +
            `Users: ${users.toLocaleString()}\n` +
            '```',
          inline: true,
        },
        {
          name: '🎫 Bot Features',
          value:
            '```yaml\n' +
            `Active Tickets: ${ticketStats.active}\n` +
            `Total Tickets: ${ticketStats.total}\n` +
            `Role Panels: ${rolePanels}\n` +
            '```',
          inline: true,
        },
        {
          name: '⚙️ Runtime',
          value:
            '```yaml\n' +
            `Node.js: ${nodeVersion}\n` +
            `Discord.js: v${discordJsVersion}\n` +
            `PID: ${process.pid}\n` +
            '```',
          inline: false,
        }
      )
      .setFooter({
        text: `Requested by ${interaction.user.tag} • ${new Date().toISOString()}`,
        iconURL: interaction.user.displayAvatarURL(),
      })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    console.log(`[Status] Status command executed by ${interaction.user.tag}`);
  },
};
