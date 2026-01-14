import { ButtonInteraction, GuildMember } from 'discord.js';
import { getPanel } from '../../reaction-roles';

/**
 * Handle role toggle button clicks
 * Button format: role_toggle_<panelId>_<roleId>
 */
export async function handleRoleButton(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.guild || !interaction.member) {
    await interaction.reply({
      content: 'This can only be used in a server.',
      ephemeral: true,
    });
    return;
  }

  const customId = interaction.customId;
  // Parse: role_toggle_panel-0001_123456789
  const parts = customId.split('_');
  if (parts.length < 4) {
    await interaction.reply({
      content: 'Invalid button configuration.',
      ephemeral: true,
    });
    return;
  }

  const panelId = parts[2]; // e.g., "panel-0001"
  const roleId = parts[3]; // e.g., "123456789012345678"

  // Validate panel exists
  const panel = getPanel(panelId);
  if (!panel) {
    await interaction.reply({
      content: 'This role panel no longer exists.',
      ephemeral: true,
    });
    return;
  }

  // Validate role is in panel
  const roleConfig = panel.roles.find((r) => r.roleId === roleId);
  if (!roleConfig) {
    await interaction.reply({
      content: 'This role is no longer available.',
      ephemeral: true,
    });
    return;
  }

  // Get the actual role from guild
  const role = interaction.guild.roles.cache.get(roleId);
  if (!role) {
    await interaction.reply({
      content: `The role **${roleConfig.roleName}** no longer exists in this server.`,
      ephemeral: true,
    });
    return;
  }

  // Check bot can manage this role
  const botMember = interaction.guild.members.me;
  if (!botMember) {
    await interaction.reply({
      content: 'Bot member not found.',
      ephemeral: true,
    });
    return;
  }

  if (role.position >= botMember.roles.highest.position) {
    await interaction.reply({
      content: `I cannot assign **${role.name}** - it's higher than my highest role.`,
      ephemeral: true,
    });
    return;
  }

  if (role.managed) {
    await interaction.reply({
      content: `I cannot assign **${role.name}** - it's managed by an integration.`,
      ephemeral: true,
    });
    return;
  }

  const member = interaction.member as GuildMember;

  try {
    if (member.roles.cache.has(roleId)) {
      // Remove role
      await member.roles.remove(role);
      await interaction.reply({
        content: `${roleConfig.emoji} Removed **${role.name}** role.`,
        ephemeral: true,
      });
      console.log(`[ReactionRoles] Removed ${role.name} from ${member.user.tag}`);
    } else {
      // Add role
      await member.roles.add(role);
      await interaction.reply({
        content: `${roleConfig.emoji} Added **${role.name}** role!`,
        ephemeral: true,
      });
      console.log(`[ReactionRoles] Added ${role.name} to ${member.user.tag}`);
    }
  } catch (error) {
    console.error('[ReactionRoles] Error toggling role:', error);
    await interaction.reply({
      content: 'Failed to update your role. Please contact an administrator.',
      ephemeral: true,
    });
  }
}
