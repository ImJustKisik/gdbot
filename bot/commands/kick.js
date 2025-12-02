const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Kick a user')
        .addUserOption(option => option.setName('user').setDescription('The user to kick').setRequired(true))
        .addStringOption(option => option.setName('reason').setDescription('Reason for kick').setRequired(true)),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('user');
        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

        if (!targetMember) {
            return interaction.reply({ content: 'User not found in this server.', ephemeral: true });
        }

        const reason = interaction.options.getString('reason');
        if (!targetMember.kickable) {
            return interaction.reply({ content: '❌ I cannot kick this user.', ephemeral: true });
        }
        await interaction.deferReply({ ephemeral: false });
        await targetMember.kick(reason);
        await interaction.editReply({ content: `✅ Kicked ${targetUser.tag}. Reason: ${reason}` });
    }
};
