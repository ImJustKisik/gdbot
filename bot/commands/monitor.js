const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const db = require('../../db');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('monitor')
        .setDescription('Enable or disable AI monitoring for a user')
        .addUserOption(option => option.setName('user').setDescription('The user to monitor').setRequired(true))
        .addBooleanOption(option => option.setName('enabled').setDescription('Enable or disable monitoring').setRequired(true)),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('user');
        const enabled = interaction.options.getBoolean('enabled');

        // If disabling, do it immediately without confirmation
        if (!enabled) {
            db.setMonitored(targetUser.id, false);
            return interaction.reply({ content: `✅ AI Monitoring for ${targetUser} has been **disabled**.` });
        }

        // If enabling, ask for confirmation
        const confirmButton = new ButtonBuilder()
            .setCustomId('confirm_monitor')
            .setLabel('Confirm Enable')
            .setStyle(ButtonStyle.Danger);

        const cancelButton = new ButtonBuilder()
            .setCustomId('cancel_monitor')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder()
            .addComponents(confirmButton, cancelButton);

        const response = await interaction.reply({
            content: `⚠️ **Confirmation Required**\nAre you sure you want to enable **AI Monitoring** for ${targetUser}? \n\nThis will analyze their messages for toxicity using AI.`,
            components: [row],
            fetchReply: true
        });

        const collector = response.createMessageComponentCollector({ componentType: ComponentType.Button, time: 15000 });

        collector.on('collect', async i => {
            if (i.user.id !== interaction.user.id) {
                return i.reply({ content: 'These buttons are not for you.', ephemeral: true });
            }

            if (i.customId === 'confirm_monitor') {
                db.setMonitored(targetUser.id, true);
                await i.update({ content: `✅ **AI Monitoring Enabled** for ${targetUser}.`, components: [] });
            } else {
                await i.update({ content: '❌ Action cancelled.', components: [] });
            }
        });

        collector.on('end', collected => {
            if (collected.size === 0) {
                interaction.editReply({ content: '❌ Confirmation timed out.', components: [] }).catch(() => {});
            }
        });
    }
};
