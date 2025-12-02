const { PermissionsBitField, MessageFlags } = require('discord.js');
const { sendVerificationDM } = require('../../utils/helpers');

async function handleInteraction(interaction) {
    // Handle Buttons
    if (interaction.isButton() && interaction.customId === 'verify_retry') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const sent = await sendVerificationDM(interaction.member);
        if (sent) {
            await interaction.editReply('Verification code sent to your DMs!');
        } else {
            await interaction.editReply('Still cannot send DM. Please check your privacy settings.');
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
