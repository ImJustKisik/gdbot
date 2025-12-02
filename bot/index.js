const { Events, REST, Routes, Collection } = require('discord.js');
const client = require('./client');
const commandModules = require('./commands');
const handleInteraction = require('./events/interactionCreate');
const handleGuildMemberAdd = require('./events/guildMemberAdd');
const { DISCORD_BOT_TOKEN, CLIENT_ID, GUILD_ID } = require('../utils/config');

async function startBot() {
    // Initialize commands collection
    client.commands = new Collection();
    const commandsData = [];

    for (const module of commandModules) {
        client.commands.set(module.data.name, module);
        commandsData.push(module.data.toJSON());
    }

    client.once(Events.ClientReady, async () => {
        console.log(`Discord Bot logged in as ${client.user.tag}`);
        
        // Register Slash Commands
        const rest = new REST({ version: '10' }).setToken(DISCORD_BOT_TOKEN);
        try {
            console.log('Started refreshing application (/) commands.');
            await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commandsData });
            console.log('Successfully reloaded application (/) commands.');
        } catch (error) {
            console.error(error);
        }
    
        // Initial fetch to populate cache
        try {
            const guild = client.guilds.cache.get(GUILD_ID) || await client.guilds.fetch(GUILD_ID);
            if (guild) {
                console.log('Fetching members to populate cache...');
                await guild.members.fetch();
                console.log(`Members cached: ${guild.members.cache.size}`);
            }
        } catch (err) {
            console.error('Error during startup fetch:', err);
        }
    });

    client.on(Events.GuildMemberAdd, handleGuildMemberAdd);
    client.on(Events.InteractionCreate, handleInteraction);

    // DEBUG: Check token before login
    console.log("---------------------------------------------------");
    console.log("DEBUG: Token check");
    if (!DISCORD_BOT_TOKEN) {
        console.error("ERROR: DISCORD_BOT_TOKEN is missing in process.env");
    } else {
        console.log(`Token found. Length: ${DISCORD_BOT_TOKEN.length}`);
        console.log(`First 5 chars: '${DISCORD_BOT_TOKEN.substring(0, 5)}'`);
        console.log(`Last 5 chars:  '${DISCORD_BOT_TOKEN.substring(DISCORD_BOT_TOKEN.length - 5)}'`);
    }
    console.log("---------------------------------------------------");

    await client.login(DISCORD_BOT_TOKEN);
}

module.exports = { startBot, client };
