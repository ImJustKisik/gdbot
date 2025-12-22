const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const db = require('../../db');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('monitor')
        .setDescription('Enable or disable AI monitoring for a user or channel')
        .addBooleanOption(option => option.setName('enabled').setDescription('Enable or disable monitoring').setRequired(true))
        .addUserOption(option => option.setName('user').setDescription('The user to monitor').setRequired(false))
        .addChannelOption(option => option.setName('channel').setDescription('The channel to monitor').setRequired(false))
        .addBooleanOption(option => option.setName('detoxify').setDescription('Enable or disable local Detoxify check (default: true)').setRequired(false))
        .addBooleanOption(option => option.setName('ping').setDescription('Ping user on violation? (default: true)').setRequired(false)),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('user');
        const targetChannel = interaction.options.getChannel('channel');
        const enabled = interaction.options.getBoolean('enabled');
        const detoxify = interaction.options.getBoolean('detoxify');
        const ping = interaction.options.getBoolean('ping');

        if (!targetUser && !targetChannel) {
            return interaction.reply({ content: '❌ You must specify either a user or a channel.', ephemeral: true });
        }

        if (targetUser && targetChannel) {
            return interaction.reply({ content: '❌ Please specify only one target (user OR channel).', ephemeral: true });
        }

        // --- Channel Monitoring ---
        if (targetChannel) {
            db.setChannelMonitored(targetChannel.id, enabled, detoxify !== null ? detoxify : true, ping !== null ? ping : true);
            return interaction.reply({ content: `✅ AI Monitoring for ${targetChannel} has been **${enabled ? 'enabled' : 'disabled'}**.\nDetoxify: **${(detoxify !== null ? detoxify : true) ? 'ON' : 'OFF'}**\nPing User: **${(ping !== null ? ping : true) ? 'ON' : 'OFF'}**` });
        }

        // --- User Monitoring ---
        // If disabling, do it immediately without confirmation
        if (!enabled) {
            db.setMonitored(targetUser.id, false);
            return interaction.reply({ content: `✅ AI Monitoring for ${targetUser} has been **disabled**.` });
        }

        // Defer reply to prevent "Unknown interaction" timeout
        await interaction.deferReply();

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

        let message = `⚠️ **Confirmation Required**\nAre you sure you want to enable **AI Monitoring** for ${targetUser}? \n\nThis will analyze their messages for toxicity using AI.`;
        if (detoxify !== null) {
            message += `\n\n**Detoxify Check:** ${detoxify ? 'Enabled' : 'Disabled'}`;
        }
        if (ping !== null) {
            message += `\n**Ping User:** ${ping ? 'Enabled' : 'Disabled'}`;
        }

        const response = await interaction.editReply({
            content: message,
            components: [row]
        });

        const collector = response.createMessageComponentCollector({ componentType: ComponentType.Button, time: 15000 });

        collector.on('collect', async i => {
            if (i.user.id !== interaction.user.id) {
                return i.reply({ content: 'These buttons are not for you.', ephemeral: true });
            }

            if (i.customId === 'confirm_monitor') {
                db.setMonitored(targetUser.id, true, ping !== null ? ping : true);
                if (detoxify !== null) {
                    db.setDetoxifyEnabled(targetUser.id, detoxify);
                }
                await i.update({ content: `✅ **AI Monitoring Enabled** for ${targetUser}.${detoxify !== null ? `\nDetoxify: **${detoxify ? 'ON' : 'OFF'}**` : ''}${ping !== null ? `\nPing User: **${ping ? 'ON' : 'OFF'}**` : ''}`, components: [] });
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
