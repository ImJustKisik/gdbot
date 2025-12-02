const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../db');
const { logAction, getAppSetting } = require('../../utils/helpers');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Warn a user')
        .addUserOption(option => option.setName('user').setDescription('The user to warn').setRequired(true))
        .addStringOption(option => option.setName('reason').setDescription('Reason for warning').setRequired(true))
        .addIntegerOption(option => option.setName('points').setDescription('Points to add (default 1)').setMinValue(1).setMaxValue(20)),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: false });

        const targetUser = interaction.options.getUser('user');
        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
        const reason = interaction.options.getString('reason');
        const points = interaction.options.getInteger('points') || 1;

        if (!targetMember) {
            return interaction.editReply({ content: 'User not found in this server.' });
        }

        const warning = {
            reason,
            points,
            date: new Date().toISOString(),
            moderator: interaction.user.tag
        };
        db.addWarning(targetUser.id, warning);
        
        const user = db.getUser(targetUser.id);

        await logAction(interaction.guild, 'User Warned (Command)', `User <@${targetUser.id}> was warned by ${interaction.user.tag}`, 'Orange', [
            { name: 'Reason', value: reason },
            { name: 'Points', value: `+${points} (Total: ${user.points})` }
        ]);

        try {
            const embed = new EmbedBuilder()
                .setTitle('You have been warned')
                .setColor('Orange')
                .addFields(
                    { name: 'Reason', value: reason },
                    { name: 'Points Added', value: points.toString() },
                    { name: 'Total Points', value: user.points.toString() }
                );
            await targetMember.send({ embeds: [embed] });
        } catch (e) {}

        let autoMuteMsg = '';

        const escalations = db.getEscalations();
        const activeRule = escalations
            .sort((a, b) => b.threshold - a.threshold)
            .find(rule => user.points >= rule.threshold);

        const defaultAutoMuteThreshold = Number(getAppSetting('autoMuteThreshold')) || 0;
        const defaultAutoMuteDuration = Number(getAppSetting('autoMuteDuration')) || 60;

        if (activeRule) {
            if (targetMember.moderatable) {
                try {
                    if (activeRule.action === 'mute') {
                        const duration = activeRule.duration || 60;
                        await targetMember.timeout(duration * 60 * 1000, `Auto-punish: Reached ${activeRule.threshold} points`);
                        autoMuteMsg = `\n**User was also auto-muted for ${duration} minutes.**`;
                        
                        await logAction(interaction.guild, 'Auto-Punishment Triggered', `User <@${targetUser.id}> reached ${activeRule.threshold} points.`, 'Red', [
                            { name: 'Action', value: 'Mute' },
                            { name: 'Duration', value: `${duration} minutes` }
                        ]);

                    } else if (activeRule.action === 'kick') {
                        await targetMember.kick(`Auto-punish: Reached ${activeRule.threshold} points`);
                        autoMuteMsg = `\n**User was also auto-kicked.**`;
                        
                        await logAction(interaction.guild, 'Auto-Punishment Triggered', `User <@${targetUser.id}> reached ${activeRule.threshold} points.`, 'Red', [
                            { name: 'Action', value: 'Kick' }
                        ]);

                    } else if (activeRule.action === 'ban') {
                        await targetMember.ban({ reason: `Auto-punish: Reached ${activeRule.threshold} points` });
                        autoMuteMsg = `\n**User was also auto-banned.**`;
                        
                        await logAction(interaction.guild, 'Auto-Punishment Triggered', `User <@${targetUser.id}> reached ${activeRule.threshold} points.`, 'Red', [
                            { name: 'Action', value: 'Ban' }
                        ]);
                    }
                } catch (err) {
                    console.error('Auto-punish failed:', err);
                    autoMuteMsg = `\n**(Auto-${activeRule.action} failed: Missing permissions)**`;
                }
            } else {
                autoMuteMsg = `\n**(Auto-${activeRule.action} failed: User not moderatable)**`;
            }
        } else if (defaultAutoMuteThreshold > 0 && user.points >= defaultAutoMuteThreshold) {
            if (targetMember.moderatable) {
                const duration = Math.max(1, defaultAutoMuteDuration);
                try {
                    await targetMember.timeout(duration * 60 * 1000, `Auto-punish (default): Reached ${defaultAutoMuteThreshold} points`);
                    autoMuteMsg = `\n**User was also auto-muted for ${duration} minutes (default rule).**`;

                    await logAction(interaction.guild, 'Auto-Punishment Triggered', `User <@${targetUser.id}> reached the default ${defaultAutoMuteThreshold} point threshold.`, 'Red', [
                        { name: 'Action', value: 'Mute (Default Rule)' },
                        { name: 'Duration', value: `${duration} minutes` }
                    ]);
                } catch (err) {
                    console.error('Default auto-mute failed:', err);
                    autoMuteMsg = `\n**(Default auto-mute failed: Missing permissions)**`;
                }
            } else {
                autoMuteMsg = '\n**(Default auto-mute failed: User not moderatable)**';
            }
        }

        const baseMessage = `✅ Warned ${targetUser.tag} for "${reason}" (+${points} points). Total: ${user.points}.`;
        await interaction.editReply({ content: `${baseMessage}${autoMuteMsg}` });
    }
};
