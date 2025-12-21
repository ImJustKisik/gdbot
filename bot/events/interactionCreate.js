const { PermissionsBitField, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits } = require('discord.js');
const { sendVerificationDM, getAppSetting } = require('../../utils/helpers');
const Sentry = require('@sentry/node');
const db = require('../../db');
const { checkAppealValidity, createAppealSummary } = require('../../utils/ai');
const { GUILD_ID } = require('../../utils/config');

async function handleInteraction(interaction) {
    console.log(`[Interaction Debug] Received interaction: ${interaction.customId || interaction.commandName} (Type: ${interaction.type})`);

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
            const appealsEnabled = getAppSetting('appealsEnabled') !== 'false'; // Default true
            if (!appealsEnabled) {
                await interaction.reply({ content: '❌ Система апелляций временно отключена администрацией.', flags: MessageFlags.Ephemeral });
                return;
            }

            const [_, type, id] = interaction.customId.split(':');
            
            // Check if appeal already exists
            const existingAppeal = db.getAppealByPunishmentId(id);
            if (existingAppeal) {
                await interaction.reply({ content: '❌ Вы уже подали апелляцию на это наказание.', flags: MessageFlags.Ephemeral });
                return;
            }
            
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
                const appealsChannelId = getAppSetting('appealsChannelId');
                const appealsChannel = appealsChannelId 
                    ? guild.channels.cache.get(appealsChannelId) 
                    : guild.channels.cache.find(c => c.name === 'appeals');

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

                    const row = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId(`appeal_review:${interaction.user.id}:${id}`)
                                .setLabel('Рассмотреть')
                                .setStyle(ButtonStyle.Primary),
                            new ButtonBuilder()
                                .setCustomId(`appeal_reject_dm:${interaction.user.id}:${id}`)
                                .setLabel('Отклонить')
                                .setStyle(ButtonStyle.Danger)
                        );

                    await appealsChannel.send({ embeds: [embed], components: [row] });
                } else {
                    console.error('Channel #appeals not found!');
                }
            }

            await interaction.editReply({ content: '✅ Ваша апелляция отправлена модераторам.' });
            return;
        }

        // Handle Appeal Review (Create Ticket)
        if (interaction.customId.startsWith('appeal_review:')) {
            console.log(`[Appeal Debug] Starting review for ${interaction.customId}`);
            try {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                console.log('[Appeal Debug] Deferred reply');
                
                const [_, userId, punishmentId] = interaction.customId.split(':');
                const guild = interaction.guild;
                
                // Check permissions
                if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
                    console.log('[Appeal Debug] Permission denied');
                    await interaction.editReply({ content: 'У вас нет прав для этого действия.' });
                    return;
                }

                const ticketsCategoryId = getAppSetting('ticketsCategoryId');
                console.log(`[Appeal Debug] Category ID: ${ticketsCategoryId}`);
                const category = ticketsCategoryId ? guild.channels.cache.get(ticketsCategoryId) : null;

                if (!category && ticketsCategoryId) {
                    console.log('[Appeal Debug] Category not found in cache');
                    await interaction.editReply({ content: 'Категория тикетов не найдена. Проверьте настройки.' });
                    return;
                }

                const channelName = `appeal-${userId}`;
                const existingChannel = guild.channels.cache.find(c => c.name === channelName);
                if (existingChannel) {
                    console.log(`[Appeal Debug] Channel exists: ${existingChannel.id}`);
                    await interaction.editReply({ content: `Канал рассмотрения уже существует: ${existingChannel}` });
                    return;
                }

                console.log('[Appeal Debug] Creating channel...');
                const channel = await guild.channels.create({
                    name: channelName,
                    type: ChannelType.GuildText,
                    parent: category ? category.id : null,
                    permissionOverwrites: [
                        {
                            id: guild.id,
                            deny: [PermissionFlagsBits.ViewChannel],
                        },
                        {
                            id: userId,
                            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
                        },
                        {
                            id: interaction.user.id,
                            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
                        }
                    ]
                });
                console.log(`[Appeal Debug] Channel created: ${channel.id}`);

                // Fetch appeal details
                const appeal = db.getAppealByPunishmentId(punishmentId);
                console.log(`[Appeal Debug] Appeal fetched: ${appeal ? appeal.id : 'null'}`);
                
                const embed = new EmbedBuilder()
                    .setTitle('Рассмотрение апелляции')
                    .setDescription(`Апелляция от <@${userId}>`)
                    .addFields(
                        { name: 'Причина наказания', value: appeal ? appeal.reason : 'N/A' },
                        { name: 'Текст апелляции', value: appeal ? appeal.appeal_text : 'N/A' },
                        { name: 'AI Summary', value: appeal ? appeal.ai_summary : 'N/A' }
                    )
                    .setColor('Yellow');

                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`appeal_decision:approve:${userId}:${punishmentId}`)
                            .setLabel('Снять наказание')
                            .setStyle(ButtonStyle.Success),
                        new ButtonBuilder()
                            .setCustomId(`appeal_decision:deny:${userId}:${punishmentId}`)
                            .setLabel('Оставить в силе')
                            .setStyle(ButtonStyle.Danger)
                    );

                console.log('[Appeal Debug] Sending message to ticket channel...');
                await channel.send({ content: `<@${userId}> <@${interaction.user.id}>`, embeds: [embed], components: [row] });
                
                // Update appeal status
                if (appeal) {
                    db.updateAppealStatus(appeal.id, 'reviewing');
                }

                // Log to dashboard
                console.log('[Appeal Debug] Logging action...');
                await logAction(guild, 'Appeal Review Started', `Moderator ${interaction.user.tag} started reviewing appeal for <@${userId}>`, 'Yellow');

                await interaction.editReply({ content: `Канал создан: ${channel}` });
                console.log('[Appeal Debug] Done.');
            } catch (error) {
                console.error('Error in appeal_review:', error);
                // Try to reply if not already replied
                try {
                    if (!interaction.deferred && !interaction.replied) {
                        await interaction.reply({ content: 'Произошла ошибка при создании тикета.', flags: MessageFlags.Ephemeral });
                    } else {
                        await interaction.editReply({ content: 'Произошла ошибка при создании тикета.' });
                    }
                } catch (e) {
                    // Ignore
                }
            }
            return;
        }

        // Handle Appeal Decision
        if (interaction.customId.startsWith('appeal_decision:')) {
            const [_, decision, userId, punishmentId] = interaction.customId.split(':');
            
             // Check permissions
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
                return interaction.reply({ content: 'У вас нет прав для этого действия.', flags: MessageFlags.Ephemeral });
            }

            const appeal = db.getAppealByPunishmentId(punishmentId);
            const guild = interaction.guild;

            if (decision === 'approve') {
                // Remove punishment
                if (appeal && appeal.type === 'warn') {
                    // We need to find the warning and remove points? 
                    // Or just clear all punishments? The prompt says "Снять наказание".
                    // Let's assume we remove the specific warning if possible, but our DB structure makes it hard to remove just one warning's points without recalculating.
                    // For now, let's just clear the warning from DB and subtract points.
                    
                    const warning = db.getWarning(punishmentId);
                    if (warning) {
                        // Manually remove warning and update points
                        db.db.prepare('DELETE FROM warnings WHERE id = ?').run(punishmentId);
                        db.db.prepare('UPDATE users_v2 SET points = points - ? WHERE id = ?').run(warning.points, userId);
                        
                        await interaction.channel.send('✅ Предупреждение удалено, баллы сняты.');
                    } else {
                        await interaction.channel.send('⚠️ Предупреждение не найдено в БД (возможно уже удалено).');
                    }
                } else if (appeal && appeal.type === 'mute') {
                    const member = await guild.members.fetch(userId).catch(() => null);
                    if (member) {
                        await member.timeout(null, 'Appeal Approved');
                        await interaction.channel.send('✅ Мут снят.');
                    }
                }

                if (appeal) db.updateAppealStatus(appeal.id, 'approved');
                await logAction(guild, 'Appeal Approved', `Appeal for <@${userId}> approved by ${interaction.user.tag}`, 'Green');

            } else {
                if (appeal) db.updateAppealStatus(appeal.id, 'rejected');
                await logAction(guild, 'Appeal Rejected', `Appeal for <@${userId}> rejected by ${interaction.user.tag}`, 'Red');
                await interaction.channel.send('❌ Наказание оставлено в силе.');
            }

            // Disable buttons
            const disabledRow = ActionRowBuilder.from(interaction.message.components[0]);
            disabledRow.components.forEach(c => c.setDisabled(true));
            await interaction.message.edit({ components: [disabledRow] });

            await interaction.reply({ content: 'Решение принято.', flags: MessageFlags.Ephemeral });
            
            // Close channel after delay
            setTimeout(() => {
                interaction.channel.delete().catch(() => {});
            }, 10000);
            return;
        }

        // Handle Quick Reject (DM)
        if (interaction.customId.startsWith('appeal_reject_dm:')) {
             const [_, userId, punishmentId] = interaction.customId.split(':');
             
             // Check permissions
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
                return interaction.reply({ content: 'У вас нет прав для этого действия.', flags: MessageFlags.Ephemeral });
            }

            const appeal = db.getAppealByPunishmentId(punishmentId);
            if (appeal) db.updateAppealStatus(appeal.id, 'rejected');

            const guild = interaction.guild;
            const member = await guild.members.fetch(userId).catch(() => null);
            if (member) {
                try {
                    await member.send('Ваша апелляция была отклонена модераторами.');
                } catch (e) {}
            }

            await logAction(guild, 'Appeal Rejected', `Appeal for <@${userId}> rejected by ${interaction.user.tag} (Quick Action)`, 'Red');
            
            await interaction.reply({ content: 'Апелляция отклонена.', flags: MessageFlags.Ephemeral });
            
            // Disable buttons on the original message
            const disabledRow = ActionRowBuilder.from(interaction.message.components[0]);
            disabledRow.components.forEach(c => c.setDisabled(true));
            await interaction.message.edit({ components: [disabledRow] });
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
