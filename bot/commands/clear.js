const { SlashCommandBuilder } = require('discord.js');
const db = require('../../db');
const { logAction } = require('../../utils/helpers');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Clear all punishments for a user')
        .addUserOption(option => option.setName('user').setDescription('The user to clear').setRequired(true)),

    async execute(interaction) {
        await interaction.deferReply();

        const targetUser = interaction.options.getUser('user');
        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

        if (!targetMember) {
            return interaction.editReply({ content: 'User not found in this server.' });
        }

        db.clearPunishments(targetUser.id);

        if (targetMember.moderatable && targetMember.communicationDisabledUntilTimestamp > Date.now()) {
            await targetMember.timeout(null, 'Punishments cleared');
        }

        await logAction(
            interaction.guild,
            'Punishments Cleared',
            `Punishments for ${targetUser.tag} were cleared by ${interaction.user.tag}`,
            'Green',
            [
                { name: 'User', value: `<@${targetUser.id}> (${targetUser.id})` },
                { name: 'Moderator', value: `<@${interaction.user.id}>` }
            ]
        );

        await interaction.editReply({ content: `✅ Cleared points and active timeouts for ${targetUser.tag}.` });
    }
};
