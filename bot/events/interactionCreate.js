const { PermissionsBitField } = require('discord.js');
const { sendVerificationDM } = require('../../utils/helpers');

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

    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
        console.error(`No command matching ${interaction.commandName} was found.`);
        return;
    }

    try {
        await command.execute(interaction);
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
