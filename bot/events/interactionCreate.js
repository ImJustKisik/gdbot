const { PermissionsBitField, EmbedBuilder } = require('discord.js');
const db = require('../../db');
const { logAction, getAppSetting, getConfiguredRole, sendVerificationDM } = require('../../utils/helpers');

async function handleInteraction(interaction) {
    // Handle Buttons
    if (interaction.isButton() && interaction.customId === 'verify_retry') {
        await interaction.deferReply({ ephemeral: true });
        const sent = await sendVerificationDM(interaction.member);
        if (sent) {
            await interaction.editReply('Verification code sent to your DMs!');
        } else {
            await interaction.editReply('Still cannot send DM. Please check your privacy settings.');
        }
        return;
    }

    // Handle Slash Commands
    if (!interaction.isChatInputCommand()) return;

    // Permission Check (Basic: Moderate Members)
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
        return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    }

    const { commandName } = interaction;
    const targetUser = interaction.options.getUser('user');
    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    if (!targetMember && commandName !== 'profile') { // Profile might work for left users if we had history, but for now let's require member
        return interaction.reply({ content: 'User not found in this server.', ephemeral: true });
    }

    try {
        if (commandName === 'warn') {
            await interaction.deferReply({ ephemeral: false });

            const reason = interaction.options.getString('reason');
            const points = interaction.options.getInteger('points') || 1;

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
            return;

        } else if (commandName === 'profile') {
            await interaction.deferReply({ ephemeral: false });

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
            return;

        } else if (commandName === 'clear') {
            await interaction.deferReply({ ephemeral: false });

            db.clearPunishments(targetUser.id);

            if (targetMember.moderatable && targetMember.communicationDisabledUntilTimestamp > Date.now()) {
                await targetMember.timeout(null, 'Punishments cleared');
            }

            await interaction.editReply({ content: `✅ Cleared points and active timeouts for ${targetUser.tag}.` });
            return;

        } else if (commandName === 'mute') {
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
            return;

        } else if (commandName === 'unmute') {
            if (!targetMember.moderatable) {
                return interaction.reply({ content: '❌ I cannot unmute this user.', ephemeral: true });
            }
            await interaction.deferReply({ ephemeral: false });
            await targetMember.timeout(null, 'Unmuted by command');
            await interaction.editReply({ content: `✅ Unmuted ${targetUser.tag}.` });
            return;

        } else if (commandName === 'kick') {
            const reason = interaction.options.getString('reason');
            if (!targetMember.kickable) {
                return interaction.reply({ content: '❌ I cannot kick this user.', ephemeral: true });
            }
            await interaction.deferReply({ ephemeral: false });
            await targetMember.kick(reason);
            await interaction.editReply({ content: `✅ Kicked ${targetUser.tag}. Reason: ${reason}` });
            return;

        } else if (commandName === 'ban') {
            const reason = interaction.options.getString('reason');
            if (!targetMember.bannable) {
                return interaction.reply({ content: '❌ I cannot ban this user.', ephemeral: true });
            }
            await interaction.deferReply({ ephemeral: false });
            await targetMember.ban({ reason });
            await interaction.editReply({ content: `✅ Banned ${targetUser.tag}. Reason: ${reason}` });
            return;

        } else if (commandName === 'verify') {
            await interaction.deferReply({ ephemeral: false });

            const roleUnverified = getConfiguredRole(interaction.guild, 'roleUnverified');
            const roleVerified = getConfiguredRole(interaction.guild, 'roleVerified');

            if (roleUnverified) await targetMember.roles.remove(roleUnverified);
            if (roleVerified) await targetMember.roles.add(roleVerified);

            await logAction(interaction.guild, 'User Verified (Command)', `User <@${targetUser.id}> was manually verified by ${interaction.user.tag}.`, 'Green');

            await interaction.editReply({ content: `✅ Manually verified ${targetUser.tag}.` });
            return;
        }

    } catch (error) {
        console.error(error);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: 'There was an error executing this command!', ephemeral: true });
        } else {
            await interaction.reply({ content: 'There was an error executing this command!', ephemeral: true });
        }
    }
}

module.exports = handleInteraction;
