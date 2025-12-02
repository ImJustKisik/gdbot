const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mute')
        .setDescription('Timeout a user')
        .addUserOption(option => option.setName('user').setDescription('The user to mute').setRequired(true))
        .addStringOption(option => option.setName('duration').setDescription('Duration').setRequired(true).addChoices(
            { name: '10 Minutes', value: '10m' },
            { name: '1 Hour', value: '1h' },
            { name: '1 Day', value: '1d' },
            { name: '1 Week', value: '1w' }
        ))
        .addStringOption(option => option.setName('reason').setDescription('Reason for mute').setRequired(true)),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('user');
        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
        
        if (!targetMember) {
            return interaction.reply({ content: 'User not found in this server.', ephemeral: true });
        }

        const durationStr = interaction.options.getString('duration');
        const reason = interaction.options.getString('reason');
        
        let durationMs = 0;
        if (durationStr === '10m') durationMs = 10 * 60 * 1000;
        else if (durationStr === '1h') durationMs = 60 * 60 * 1000;
        else if (durationStr === '1d') durationMs = 24 * 60 * 60 * 1000;
        else if (durationStr === '1w') durationMs = 7 * 24 * 60 * 60 * 1000;

        if (!targetMember.moderatable) {
            return interaction.reply({ content: '❌ I cannot mute this user (missing permissions or user has higher role).', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: false });
        await targetMember.timeout(durationMs, reason);
        await interaction.editReply({ content: `✅ Muted ${targetUser.tag} for ${durationStr}. Reason: ${reason}` });
    }
};
