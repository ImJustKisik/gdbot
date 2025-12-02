const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../db');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('profile')
        .setDescription('View user profile')
        .addUserOption(option => option.setName('user').setDescription('The user to view').setRequired(true)),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: false });

        const targetUser = interaction.options.getUser('user');
        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

        const user = db.getUser(targetUser.id);
        const embed = new EmbedBuilder()
            .setTitle(`Profile: ${targetUser.tag}`)
            .setThumbnail(targetUser.displayAvatarURL())
            .setColor('Blue')
            .addFields(
                { name: 'Points', value: (user.points || 0).toString(), inline: true },
                { name: 'Warnings', value: (user.warnings?.length || 0).toString(), inline: true },
                { name: 'Status', value: targetMember ? (targetMember.communicationDisabledUntilTimestamp > Date.now() ? 'Muted' : 'Active') : 'Unknown', inline: true }
            );
        
        if (user.warnings && user.warnings.length > 0) {
            const lastWarnings = user.warnings.slice(-3).map(w => `• **${w.reason}** (+${w.points}) - ${new Date(w.date).toLocaleDateString()}`).join('\n');
            embed.addFields({ name: 'Recent Warnings', value: lastWarnings });
        }

        await interaction.editReply({ embeds: [embed] });
    }
};
