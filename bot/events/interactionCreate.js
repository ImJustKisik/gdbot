const { PermissionsBitField, MessageFlags } = require('discord.js');
const { sendVerificationDM } = require('../../utils/helpers');
const Sentry = require('@sentry/node');

async function handleInteraction(interaction) {
    // Handle Buttons
    if (interaction.isButton() && interaction.customId === 'verify_retry') {
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
