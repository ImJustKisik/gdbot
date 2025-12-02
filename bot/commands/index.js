const { SlashCommandBuilder } = require('discord.js');

const commands = [
    new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Warn a user')
        .addUserOption(option => option.setName('user').setDescription('The user to warn').setRequired(true))
        .addStringOption(option => option.setName('reason').setDescription('Reason for warning').setRequired(true))
        .addIntegerOption(option => option.setName('points').setDescription('Points to add (default 1)').setMinValue(1).setMaxValue(20)),
    
    new SlashCommandBuilder()
        .setName('profile')
        .setDescription('View user profile')
        .addUserOption(option => option.setName('user').setDescription('The user to view').setRequired(true)),

    new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Clear all punishments for a user')
        .addUserOption(option => option.setName('user').setDescription('The user to clear').setRequired(true)),

    new SlashCommandBuilder()
        .setName('mute')
        .setDescription('Timeout a user')
        .addUserOption(option => option.setName('user').setDescription('The user to mute').setRequired(true))
        .addStringOption(option => option.setName('duration').setDescription('Duration').setRequired(true).addChoices(
            { name: '10 Minutes', value: '10m' },
            { name: '1 Hour', value: '1h' },
            { name: '1 Day', value: '1d' },
            { name: '1 Week', value: '1w' }
        ))
        .addStringOption(option => option.setName('reason').setDescription('Reason for mute').setRequired(true)),

    new SlashCommandBuilder()
        .setName('unmute')
        .setDescription('Remove timeout from a user')
        .addUserOption(option => option.setName('user').setDescription('The user to unmute').setRequired(true)),

    new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Kick a user')
        .addUserOption(option => option.setName('user').setDescription('The user to kick').setRequired(true))
        .addStringOption(option => option.setName('reason').setDescription('Reason for kick').setRequired(true)),

    new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Ban a user')
        .addUserOption(option => option.setName('user').setDescription('The user to ban').setRequired(true))
        .addStringOption(option => option.setName('reason').setDescription('Reason for ban').setRequired(true)),

    new SlashCommandBuilder()
        .setName('verify')
        .setDescription('Manually verify a user')
        .addUserOption(option => option.setName('user').setDescription('The user to verify').setRequired(true)),
].map(command => command.toJSON());

module.exports = commands;
