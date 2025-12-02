const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unmute')
        .setDescription('Remove timeout from a user')
        .addUserOption(option => option.setName('user').setDescription('The user to unmute').setRequired(true)),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('user');
        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

        if (!targetMember) {
            return interaction.reply({ content: 'User not found in this server.', ephemeral: true });
        }

        if (!targetMember.moderatable) {
            return interaction.reply({ content: '❌ I cannot unmute this user.', ephemeral: true });
        }
        await interaction.deferReply({ ephemeral: false });
        await targetMember.timeout(null, 'Unmuted by command');
        await interaction.editReply({ content: `✅ Unmuted ${targetUser.tag}.` });
    }
};
