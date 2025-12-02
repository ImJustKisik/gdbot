const { SlashCommandBuilder } = require('discord.js');
const { getConfiguredRole, logAction } = require('../../utils/helpers');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('verify')
        .setDescription('Manually verify a user')
        .addUserOption(option => option.setName('user').setDescription('The user to verify').setRequired(true)),

    async execute(interaction) {
        await interaction.deferReply();

        const targetUser = interaction.options.getUser('user');
        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

        if (!targetMember) {
            return interaction.editReply({ content: 'User not found in this server.' });
        }

        const roleUnverified = getConfiguredRole(interaction.guild, 'roleUnverified');
        const roleVerified = getConfiguredRole(interaction.guild, 'roleVerified');

        if (roleUnverified) await targetMember.roles.remove(roleUnverified);
        if (roleVerified) await targetMember.roles.add(roleVerified);

        await logAction(interaction.guild, 'User Verified (Command)', `User <@${targetUser.id}> was manually verified by ${interaction.user.tag}.`, 'Green');

        await interaction.editReply({ content: `✅ Manually verified ${targetUser.tag}.` });
    }
};
