const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Ban a user')
        .addUserOption(option => option.setName('user').setDescription('The user to ban').setRequired(true))
        .addStringOption(option => option.setName('reason').setDescription('Reason for ban').setRequired(true)),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('user');
        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

        if (!targetMember) {
            return interaction.reply({ content: 'User not found in this server.', ephemeral: true });
        }

        const reason = interaction.options.getString('reason');
        if (!targetMember.bannable) {
            return interaction.reply({ content: '❌ I cannot ban this user.', ephemeral: true });
        }
        await interaction.deferReply({ ephemeral: false });
        await targetMember.ban({ reason });
        await interaction.editReply({ content: `✅ Banned ${targetUser.tag}. Reason: ${reason}` });
    }
};
