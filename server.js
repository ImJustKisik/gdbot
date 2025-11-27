require('dotenv').config();
const express = require('express');
const { Client, GatewayIntentBits, Partials, PermissionsBitField, EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Events, REST, Routes, SlashCommandBuilder } = require('discord.js');
const cors = require('cors');
const QRCode = require('qrcode');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const db = require('./db');

// --- Configuration ---
const PORT = process.env.PORT || 3001;
const GUILD_ID = process.env.GUILD_ID;
const GENAI_API_KEY = process.env.API_KEY;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || `http://localhost:${PORT}/api/auth/callback`;

const ROLE_UNVERIFIED = "Unverified";
const ROLE_VERIFIED = "Verified";
const VERIFICATION_CHANNEL_NAME = "verification"; // Channel to post if DM fails

// --- Discord Client Setup ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Channel, Partials.Message]
});

// --- Express App Setup ---
const app = express();
app.use(cors());
app.use(express.json());

// --- AI Setup ---
let genAIModel = null;
if (GENAI_API_KEY) {
    const genAI = new GoogleGenerativeAI(GENAI_API_KEY);
    genAIModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
}

// --- Helper Functions ---
async function getGuild() {
    return client.guilds.cache.get(GUILD_ID) || await client.guilds.fetch(GUILD_ID);
}

async function generateVerificationMessage(userId) {
    // Use URL object to safely construct the URL
    const oauthUrl = new URL('https://discord.com/api/oauth2/authorize');
    oauthUrl.searchParams.append('client_id', CLIENT_ID);
    oauthUrl.searchParams.append('redirect_uri', REDIRECT_URI);
    oauthUrl.searchParams.append('response_type', 'code');
    oauthUrl.searchParams.append('scope', 'identify guilds');
    oauthUrl.searchParams.append('state', userId);
    
    const finalUrl = oauthUrl.toString();
    
    console.log(`Generated OAuth URL for user ${userId}: ${finalUrl}`);

    const qrCodeData = await QRCode.toDataURL(finalUrl);
    const buffer = Buffer.from(qrCodeData.split(',')[1], 'base64');
    const attachment = new AttachmentBuilder(buffer, { name: 'verification-qr.png' });

    const embed = new EmbedBuilder()
        .setTitle('Verification Required')
        .setDescription('Welcome! Please scan the QR code below using your **phone camera** (do NOT use the Discord app scanner) or click the link to verify.')
        .addFields({ name: 'Verification Link', value: `[Click here to verify](${finalUrl})` })
        .setColor('Blue')
        .setImage('attachment://verification-qr.png');

    return { embeds: [embed], files: [attachment] };
}

async function sendVerificationDM(member) {
    try {
        const messagePayload = await generateVerificationMessage(member.id);
        await member.send(messagePayload);
        return true;
    } catch (error) {
        console.log(`Could not send DM to ${member.user.tag}: ${error.message}`);
        return false;
    }
}

async function analyzeText(text) {
    if (!genAIModel) return null;
    try {
        const prompt = `Analyze the following text for toxicity or rule violations. If it's a violation, suggest a severity score from 1 to 10. Text: "${text}"`;
        const result = await genAIModel.generateContent(prompt);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error("AI Error:", error);
        return null;
    }
}

// --- API Endpoints ---

// Serve static files from React app
const path = require('path');
app.use(express.static(path.join(__dirname, 'client/dist')));

// OAuth2 Callback
app.get('/api/auth/callback', async (req, res) => {
    const { code, state, error, error_description } = req.query; // state is userId
    
    console.log('OAuth Callback received.');
    console.log('Full URL:', req.originalUrl);
    console.log('Query Params:', req.query);

    if (error) {
        return res.status(400).send(`<h1>Authorization Error</h1><p>Discord returned an error: ${error}</p><p>${error_description}</p>`);
    }

    // TEMPORARY FIX: If state is missing, try to recover or bypass (NOT SECURE FOR PRODUCTION, DEBUG ONLY)
    // In a real scenario, we MUST have state to know WHO verified.
    // Let's try to see if we can get the user info from the token and match it?
    // No, we need to know which Discord user initiated the request to link it to the bot's user ID.
    
    if (!code) {
         return res.status(400).send(`<h1>Invalid Request</h1><p>Missing code parameter.</p>`);
    }

    // If state is missing, we can't proceed with the original logic because we don't know who to verify.
    // However, for debugging, let's log this critical failure.
    if (!state) {
        console.error('CRITICAL: State parameter missing from callback URL. Discord did not return it.');
        return res.status(400).send(`<h1>Verification Failed</h1><p>Discord did not return the required identification data (state).</p><p>Please try scanning the QR code again.</p>`);
    }

    try {
        // Exchange code for token
        const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', new URLSearchParams({
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            grant_type: 'authorization_code',
            code,
            redirect_uri: REDIRECT_URI
        }), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        const { access_token, refresh_token } = tokenResponse.data;

        // Fetch User Guilds
        const guildsResponse = await axios.get('https://discord.com/api/users/@me/guilds', {
            headers: { Authorization: `Bearer ${access_token}` }
        });

        const guilds = guildsResponse.data;

        // Update DB
        const userId = state;
        const user = db.getUser(userId);
        user.oauth = {
            accessToken: access_token,
            refreshToken: refresh_token,
            guilds: guilds,
            verifiedAt: new Date().toISOString()
        };
        db.saveUser(userId, user);

        // Update Discord Roles
        const guild = await getGuild();
        const member = await guild.members.fetch(userId);
        if (member) {
            const roleUnverified = guild.roles.cache.find(r => r.name === ROLE_UNVERIFIED);
            const roleVerified = guild.roles.cache.find(r => r.name === ROLE_VERIFIED);

            if (roleUnverified) await member.roles.remove(roleUnverified);
            if (roleVerified) await member.roles.add(roleVerified);
            
            try {
                await member.send("Verification successful! You now have access to the server.");
            } catch (e) {}
        }

        res.send('<h1>Verification Successful!</h1><p>You can close this window and return to Discord.</p>');

    } catch (error) {
        console.error('OAuth Error:', error.response?.data || error.message);
        res.status(500).send('Verification failed. Please try again.');
    }
});

// Get User Guilds (for Dashboard)
app.get('/api/user/:id/guilds', async (req, res) => {
    const { id } = req.params;
    const user = db.getUser(id);
    if (!user || !user.oauth || !user.oauth.guilds) {
        return res.json([]);
    }
    res.json(user.oauth.guilds);
});

// 1. Synchronization (GET /api/users)
app.get('/api/users', async (req, res) => {
    try {
        const guild = await getGuild();
        if (!guild) return res.status(500).json({ error: 'Guild not found' });

        // Use cache to avoid rate limits (Opcode 8 error)
        const members = guild.members.cache;
        const localUsers = db.getAllUsers();
        
        const responseData = members.map(member => {
            const localUser = localUsers[member.id] || { points: 0, warnings: [] };
            
            // Determine status
            let status = 'Verified'; // Default
            if (member.roles.cache.some(role => role.name === 'Muted') || member.communicationDisabledUntilTimestamp > Date.now()) {
                status = 'Muted';
            }
            
            // Update local DB with latest Discord info if needed (optional, but good for consistency)
            if (!localUsers[member.id]) {
                // We don't necessarily save everyone to DB immediately to keep it small, 
                // but the spec says "User: ... contains fields from Discord"
            }

            return {
                id: member.id,
                username: member.user.username,
                avatar: member.user.displayAvatarURL(),
                points: localUser.points || 0,
                warnings: localUser.warnings || [],
                status: status
            };
        });

        res.json(responseData);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// 2. System of Punishments (POST /api/warn)
app.post('/api/warn', async (req, res) => {
    const { userId, points, reason } = req.body;
    if (!userId || !points || !reason) return res.status(400).json({ error: 'Missing fields' });

    try {
        const guild = await getGuild();
        const member = await guild.members.fetch(userId);
        
        if (!member) return res.status(404).json({ error: 'User not found in guild' });

        // Update DB
        const user = db.getUser(userId);
        user.points = (user.points || 0) + parseInt(points);
        user.warnings = user.warnings || [];
        user.warnings.push({
            reason,
            points: parseInt(points),
            date: new Date().toISOString(),
            moderator: 'WebAdmin' // Simplified for now
        });
        db.saveUser(userId, user);

        // Discord Action: Send DM
        try {
            const embed = new EmbedBuilder()
                .setTitle('You have been warned')
                .setColor('Orange')
                .addFields(
                    { name: 'Reason', value: reason },
                    { name: 'Points Added', value: points.toString() },
                    { name: 'Total Points', value: user.points.toString() }
                );
            await member.send({ embeds: [embed] });
        } catch (dmError) {
            console.log(`Could not DM user ${userId}`);
        }

        // Auto-Mute Rule
        let actionTaken = 'Warned';
        if (user.points > 20) {
            if (member.moderatable) {
                await member.timeout(60 * 60 * 1000, 'Auto-mute: Exceeded 20 points'); // 1 hour
                actionTaken = 'Warned & Auto-Muted (1h)';
                
                // Send another DM about mute
                try {
                    await member.send("You have been automatically muted for 1 hour due to exceeding 20 penalty points.");
                } catch (e) {}
            } else {
                actionTaken = 'Warned (Auto-mute failed: Missing permissions)';
            }
        }

        res.json({ success: true, user, action: actionTaken });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 3. Clear Punishments (POST /api/clear)
app.post('/api/clear', async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'Missing userId' });

    try {
        const guild = await getGuild();
        const member = await guild.members.fetch(userId);

        // Reset DB
        const user = db.getUser(userId);
        user.points = 0;
        user.warnings = []; // Optional: clear history too? Spec says "Obnulyayet bally", implies reset.
        db.saveUser(userId, user);

        // Remove Timeout
        if (member && member.moderatable && member.communicationDisabledUntilTimestamp > Date.now()) {
            await member.timeout(null, 'Punishments cleared by admin');
        }

        res.json({ success: true, message: 'User record cleared' });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 4. Verification (POST /api/verify/send-dm)
app.post('/api/verify/send-dm', async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'Missing userId' });

    try {
        const guild = await getGuild();
        const member = await guild.members.fetch(userId);
        if (!member) return res.status(404).json({ error: 'User not found' });

        // Use the helper function to ensure consistency and include state
        const messagePayload = await generateVerificationMessage(userId);
        await member.send(messagePayload);

        res.json({ success: true, message: 'Verification DM sent' });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to send verification DM' });
    }
});

// --- Slash Commands Definition ---
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

// --- Start Server ---
client.once('ready', async () => {
    console.log(`Discord Bot logged in as ${client.user.tag}`);
    
    // Register Slash Commands
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);
    try {
        console.log('Started refreshing application (/) commands.');
        await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
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

    // Handle React routing, return all requests to React app
    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, 'client/dist', 'index.html'));
    });

    app.listen(PORT, () => {
        console.log(`Backend API running on port ${PORT}`);
        console.log(`Redirect URI configured as: ${REDIRECT_URI}`);
    });
});

// --- Bot Events ---
client.on(Events.GuildMemberAdd, async (member) => {
    if (member.guild.id !== GUILD_ID) return;

    console.log(`New member joined: ${member.user.tag}`);

    // Add Unverified Role
    const roleUnverified = member.guild.roles.cache.find(r => r.name === ROLE_UNVERIFIED);
    if (roleUnverified) {
        await member.roles.add(roleUnverified);
    } else {
        console.warn(`Role "${ROLE_UNVERIFIED}" not found.`);
    }

    // Send DM
    const sent = await sendVerificationDM(member);

    if (!sent) {
        // Send to channel if DM failed
        const channel = member.guild.channels.cache.find(c => c.name === VERIFICATION_CHANNEL_NAME) || member.guild.systemChannel;
        if (channel) {
            const retryButton = new ButtonBuilder()
                .setCustomId('verify_retry')
                .setLabel('Resend Verification Code')
                .setStyle(ButtonStyle.Primary);

            const row = new ActionRowBuilder().addComponents(retryButton);

            await channel.send({
                content: `${member}, I couldn't send you a DM. Please open your DMs and click the button below to verify.`,
                components: [row]
            });
        }
    }
});

client.on(Events.InteractionCreate, async (interaction) => {
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
            const reason = interaction.options.getString('reason');
            const points = interaction.options.getInteger('points') || 1;

            const user = db.getUser(targetUser.id);
            user.points = (user.points || 0) + points;
            user.warnings = user.warnings || [];
            user.warnings.push({
                reason,
                points,
                date: new Date().toISOString(),
                moderator: interaction.user.tag
            });
            db.saveUser(targetUser.id, user);

            // DM User
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

            // Auto-Mute Check
            let autoMuteMsg = '';
            if (user.points > 20 && targetMember.moderatable) {
                await targetMember.timeout(60 * 60 * 1000, 'Auto-mute: Exceeded 20 points');
                autoMuteMsg = '\n**User was also auto-muted for 1 hour.**';
            }

            await interaction.reply({ content: `✅ Warned ${targetUser.tag} for "${reason}" (+${points} points). Total: ${user.points}.${autoMuteMsg}`, ephemeral: false });

        } else if (commandName === 'profile') {
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

            await interaction.reply({ embeds: [embed] });

        } else if (commandName === 'clear') {
            const user = db.getUser(targetUser.id);
            user.points = 0;
            // user.warnings = []; // Uncomment to clear history too
            db.saveUser(targetUser.id, user);

            if (targetMember.moderatable && targetMember.communicationDisabledUntilTimestamp > Date.now()) {
                await targetMember.timeout(null, 'Punishments cleared');
            }

            await interaction.reply({ content: `✅ Cleared points and active timeouts for ${targetUser.tag}.` });

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

            await targetMember.timeout(durationMs, reason);
            await interaction.reply({ content: `✅ Muted ${targetUser.tag} for ${durationStr}. Reason: ${reason}` });

        } else if (commandName === 'unmute') {
            if (!targetMember.moderatable) {
                return interaction.reply({ content: '❌ I cannot unmute this user.', ephemeral: true });
            }
            await targetMember.timeout(null, 'Unmuted by command');
            await interaction.reply({ content: `✅ Unmuted ${targetUser.tag}.` });

        } else if (commandName === 'kick') {
            const reason = interaction.options.getString('reason');
            if (!targetMember.kickable) {
                return interaction.reply({ content: '❌ I cannot kick this user.', ephemeral: true });
            }
            await targetMember.kick(reason);
            await interaction.reply({ content: `✅ Kicked ${targetUser.tag}. Reason: ${reason}` });

        } else if (commandName === 'ban') {
            const reason = interaction.options.getString('reason');
            if (!targetMember.bannable) {
                return interaction.reply({ content: '❌ I cannot ban this user.', ephemeral: true });
            }
            await targetMember.ban({ reason });
            await interaction.reply({ content: `✅ Banned ${targetUser.tag}. Reason: ${reason}` });

        } else if (commandName === 'verify') {
            const roleUnverified = interaction.guild.roles.cache.find(r => r.name === ROLE_UNVERIFIED);
            const roleVerified = interaction.guild.roles.cache.find(r => r.name === ROLE_VERIFIED);

            if (roleUnverified) await targetMember.roles.remove(roleUnverified);
            if (roleVerified) await targetMember.roles.add(roleVerified);

            await interaction.reply({ content: `✅ Manually verified ${targetUser.tag}.` });
        }

    } catch (error) {
        console.error(error);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: 'There was an error executing this command!', ephemeral: true });
        } else {
            await interaction.reply({ content: 'There was an error executing this command!', ephemeral: true });
        }
    }
});

// DEBUG: Check token before login
const token = process.env.DISCORD_BOT_TOKEN;
console.log("---------------------------------------------------");
console.log("DEBUG: Token check");
if (!token) {
    console.error("ERROR: DISCORD_BOT_TOKEN is missing in process.env");
} else {
    console.log(`Token found. Length: ${token.length}`);
    console.log(`First 5 chars: '${token.substring(0, 5)}'`);
    console.log(`Last 5 chars:  '${token.substring(token.length - 5)}'`);
    if (token.includes(' ')) console.error("WARNING: Token contains spaces!");
    if (token.includes('"')) console.error("WARNING: Token contains quotes!");
}
console.log("---------------------------------------------------");

client.login(process.env.DISCORD_BOT_TOKEN);
