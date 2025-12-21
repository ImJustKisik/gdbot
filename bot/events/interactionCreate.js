const { PermissionsBitField, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder } = require('discord.js');
const { sendVerificationDM } = require('../../utils/helpers');
const Sentry = require('@sentry/node');
const db = require('../../db');
const { checkAppealValidity, createAppealSummary } = require('../../utils/ai');
const { GUILD_ID } = require('../../utils/config');

async function handleInteraction(interaction) {
    // Handle Buttons
    if (interaction.isButton()) {
        if (interaction.customId === 'verify_retry') {
            try {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                const sent = await sendVerificationDM(interaction.member);
                if (sent) {
                    await interaction.editReply('Verification code sent to your DMs!');
                } else {
                    await interaction.editReply('Still cannot send DM. Please check your privacy settings.');
                }
            } catch (error) {
                Sentry.captureException(error, {
                    tags: { type: 'button', customId: 'verify_retry' },
                    user: { id: interaction.user.id, username: interaction.user.tag }
                });
                console.error(error);
            }
            return;
        }

        if (interaction.customId === 'appeal_dismiss') {
            await interaction.update({ components: [] });
            await interaction.followUp({ content: 'Принято.', flags: MessageFlags.Ephemeral });
            return;
        }

        if (interaction.customId.startsWith('appeal_start:')) {
            const [_, type, id] = interaction.customId.split(':');
            
            const modal = new ModalBuilder()
                .setCustomId(`appeal_modal:${type}:${id}`)
                .setTitle('Апелляция наказания');

            const reasonInput = new TextInputBuilder()
                .setCustomId('appeal_reason')
                .setLabel('Почему вы не согласны?')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Опишите ситуацию подробно...')
                .setRequired(true)
                .setMinLength(20)
                .setMaxLength(1000);

            const firstActionRow = new ActionRowBuilder().addComponents(reasonInput);
            modal.addComponents(firstActionRow);

            await interaction.showModal(modal);
            return;
        }
    }

    // Handle Modal Submit
    if (interaction.isModalSubmit()) {
        if (interaction.customId.startsWith('appeal_modal:')) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            
            const [_, type, id] = interaction.customId.split(':');
            const appealText = interaction.fields.getTextInputValue('appeal_reason');
            
            // 1. AI Filter
            const filterResult = await checkAppealValidity(appealText);
            if (filterResult && !filterResult.valid) {
                await interaction.editReply({ 
                    content: `❌ Апелляция отклонена автоматическим фильтром.\nПричина: ${filterResult.reason || 'Некорректное содержание'}` 
                });
                return;
            }

            // 2. Get Context
            let context = '';
            let reason = 'Unknown';
            if (type === 'warn') {
                const warning = db.getWarning(id);
                if (warning) {
                    context = `Warning ID: ${id}\nReason: ${warning.reason}\nPoints: ${warning.points}\nDate: ${warning.date}`;
                    reason = warning.reason;
                } else {
                    context = `Warning ID: ${id} (Not found in DB)`;
                }
            } else if (type === 'mute') {
                context = `Mute Timestamp: ${new Date(parseInt(id)).toISOString()}`;
                reason = 'Mute';
            }

            // 3. AI Summary
            const summaryResult = await createAppealSummary(appealText, context);
            const summary = summaryResult ? summaryResult.summary : 'AI Summary failed.';
            const recommendation = summaryResult ? summaryResult.recommendation : 'N/A';

            // 4. Save to DB
            db.createAppeal({
                user_id: interaction.user.id,
                type,
                punishment_id: id,
                reason,
                appeal_text: appealText,
                ai_summary: summary,
                status: 'pending'
            });

            // 5. Notify Moderators
            const guild = interaction.client.guilds.cache.get(GUILD_ID);
            if (guild) {
                const appealsChannel = guild.channels.cache.find(c => c.name === 'appeals');
                if (appealsChannel) {
                    const embed = new EmbedBuilder()
                        .setTitle('⚖️ Новая апелляция')
                        .setColor('Blue')
                        .addFields(
                            { name: 'User', value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true },
                            { name: 'Type', value: type.toUpperCase(), inline: true },
                            { name: 'Punishment Context', value: context.substring(0, 1024) },
                            { name: 'User Appeal', value: appealText.substring(0, 1024) },
                            { name: '🤖 AI Summary', value: summary },
                            { name: '🤖 AI Recommendation', value: recommendation }
                        )
                        .setTimestamp();

                    await appealsChannel.send({ embeds: [embed] });
                } else {
                    console.error('Channel #appeals not found!');
                }
            }

            await interaction.editReply({ content: '✅ Ваша апелляция отправлена модераторам.' });
            return;
        }
    }

    // Handle Autocomplete
    if (interaction.isAutocomplete()) {
        const command = interaction.client.commands.get(interaction.commandName);
        if (!command) {
            console.error(`No command matching ${interaction.commandName} was found.`);
            return;
        }

        try {
            await command.autocomplete(interaction);
        } catch (error) {
            Sentry.captureException(error, {
                tags: { type: 'autocomplete', command: interaction.commandName },
                user: { id: interaction.user.id, username: interaction.user.tag }
            });
            console.error(error);
        }
        return;
    }

    // Handle Slash Commands
    if (!interaction.isChatInputCommand()) return;

    // Permission Check (Basic: Moderate Members)
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
        return interaction.reply({ content: 'You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
    }

    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
        console.error(`No command matching ${interaction.commandName} was found.`);
        return;
    }

    try {
        await command.execute(interaction);
    } catch (error) {
        // Ignore "Unknown interaction" errors as they usually mean double-processing or timeout
        if (error.code === 10062) return;

        Sentry.captureException(error, {
            tags: { type: 'command', command: interaction.commandName },
            user: { id: interaction.user.id, username: interaction.user.tag },
            extra: {
                guildId: interaction.guildId,
                channelId: interaction.channelId,
                options: interaction.options.data
            }
        });

        console.error('Error executing command:', error);
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: 'There was an error executing this command!', flags: MessageFlags.Ephemeral });
            } else {
                await interaction.reply({ content: 'There was an error executing this command!', flags: MessageFlags.Ephemeral });
            }
        } catch (err) {
            // Ignore errors when trying to report an error
            if (err.code !== 10062) {
                console.error('Error sending error message:', err);
            }
        }
    }
}

module.exports = handleInteraction;
