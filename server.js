require('dotenv').config();
const express = require('express');
const { Client, GatewayIntentBits, Partials, PermissionsBitField, EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Events, REST, Routes, SlashCommandBuilder } = require('discord.js');
const cors = require('cors');
const QRCode = require('qrcode');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const session = require('express-session');
const SQLiteStore = require('./session-store');
const db = require('./db');

// --- Configuration ---
const PORT = process.env.PORT || 3001;
const GUILD_ID = process.env.GUILD_ID;
const GENAI_API_KEY = process.env.API_KEY;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || `http://localhost:${PORT}/api/auth/callback`;
const SESSION_SECRET = process.env.SESSION_SECRET || 'super-secret-key-change-this';

const ROLE_UNVERIFIED = "Unverified";
const ROLE_VERIFIED = "Verified";
const VERIFICATION_CHANNEL_NAME = "verification"; // Channel to post if DM fails

// --- Settings Management ---
const DEFAULT_SETTINGS = {
    logChannelId: "",
    verificationChannelId: "",
    autoMuteThreshold: 20,
    autoMuteDuration: 60, // minutes
    roleUnverified: "Unverified",
    roleVerified: "Verified"
};

function getAppSetting(key) {
    const val = db.getSetting(key);
    return val !== null ? val : DEFAULT_SETTINGS[key];
}

async function logAction(guild, title, description, color = 'Blue', fields = []) {
    const logChannelId = getAppSetting('logChannelId');
    if (!logChannelId) return;

    const channel = guild.channels.cache.get(logChannelId);
    if (!channel) return;

    const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(color)
        .addFields(fields)
        .setTimestamp();

    try {
        await channel.send({ embeds: [embed] });
    } catch (e) {
        console.error('Failed to send log:', e);
    }
}

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
app.use(session({
    store: new SQLiteStore(),
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false, // Set to true if using HTTPS
        maxAge: 1000 * 60 * 60 // 1 hour
    } 
}));

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

// Middleware to check if user is authenticated and admin
const requireAuth = (req, res, next) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
};

// Auth: Login URL
app.get('/api/auth/login', (req, res) => {
    const oauthUrl = new URL('https://discord.com/api/oauth2/authorize');
    oauthUrl.searchParams.append('client_id', CLIENT_ID);
    oauthUrl.searchParams.append('redirect_uri', REDIRECT_URI);
    oauthUrl.searchParams.append('response_type', 'code');
    oauthUrl.searchParams.append('scope', 'identify guilds');
    oauthUrl.searchParams.append('state', 'dashboard_login');
    res.redirect(oauthUrl.toString());
});

// Auth: Check Session
app.get('/api/auth/me', (req, res) => {
    if (req.session.user) {
        res.json({ authenticated: true, user: req.session.user });
    } else {
        res.json({ authenticated: false });
    }
});

// Auth: Logout
app.post('/api/auth/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// OAuth2 Callback
app.get('/api/auth/callback', async (req, res) => {
    const { code, state, error, error_description } = req.query; // state is userId OR 'dashboard_login'
    
    console.log('OAuth Callback received.');
    console.log('Full URL:', req.originalUrl);
    console.log('Query Params:', req.query);

    if (error) {
        return res.status(400).send(`<h1>Authorization Error</h1><p>Discord returned an error: ${error}</p><p>${error_description}</p>`);
    }
    
    if (!code) {
         return res.status(400).send(`<h1>Invalid Request</h1><p>Missing code parameter.</p>`);
    }

    if (!state) {
        console.error('CRITICAL: State parameter missing from callback URL.');
        return res.status(400).send(`<h1>Verification Failed</h1><p>Missing state parameter.</p>`);
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

        // --- DASHBOARD LOGIN FLOW ---
        if (state === 'dashboard_login') {
            // Fetch User Info
            const userResponse = await axios.get('https://discord.com/api/users/@me', {
                headers: { Authorization: `Bearer ${access_token}` }
            });
            const discordUser = userResponse.data;

            // Check if user is in the guild and has permissions
            // We can fetch the guild member from our bot's cache
            const guild = await getGuild();
            let member = null;
            try {
                member = await guild.members.fetch(discordUser.id);
            } catch (e) {
                console.log('User not found in guild');
            }

            if (!member) {
                return res.status(403).send('<h1>Access Denied</h1><p>You are not a member of the target server.</p>');
            }

            // Check permissions (Administrator or Manage Guild or Moderate Members)
            const isAdmin = member.permissions.has(PermissionsBitField.Flags.Administrator) || 
                            member.permissions.has(PermissionsBitField.Flags.ManageGuild) ||
                            member.permissions.has(PermissionsBitField.Flags.ModerateMembers);

            if (!isAdmin) {
                return res.status(403).send('<h1>Access Denied</h1><p>You do not have moderation permissions on this server.</p>');
            }

            // Create Session
            req.session.user = {
                id: discordUser.id,
                username: discordUser.username,
                avatar: `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`,
                isAdmin: true
            };

            return res.redirect('/');
        }

        // --- VERIFICATION FLOW (Existing) ---
        // Fetch User Guilds
        const guildsResponse = await axios.get('https://discord.com/api/users/@me/guilds', {
            headers: { Authorization: `Bearer ${access_token}` }
        });

        const guilds = guildsResponse.data;

        // Update DB
        const userId = state;
        db.updateOAuth(userId, {
            accessToken: access_token,
            refreshToken: refresh_token,
            guilds: guilds,
            verifiedAt: new Date().toISOString()
        });

        // Update Discord Roles
        const guild = await getGuild();
        const member = await guild.members.fetch(userId);
        if (member) {
            const unverifiedRoleName = getAppSetting('roleUnverified');
            const verifiedRoleName = getAppSetting('roleVerified');
            
            const roleUnverified = guild.roles.cache.find(r => r.name === unverifiedRoleName);
            const roleVerified = guild.roles.cache.find(r => r.name === verifiedRoleName);

            if (roleUnverified) await member.roles.remove(roleUnverified);
            if (roleVerified) await member.roles.add(roleVerified);
            
            await logAction(guild, 'User Verified', `User <@${userId}> verified successfully via QR/OAuth.`, 'Green');

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
app.get('/api/user/:id/guilds', requireAuth, async (req, res) => {
    const { id } = req.params;
    const user = db.getUser(id);
    if (!user || !user.oauth || !user.oauth.guilds) {
        return res.json([]);
    }
    res.json(user.oauth.guilds);
});

// 1. Synchronization (GET /api/users)
app.get('/api/users', requireAuth, async (req, res) => {
    try {
        const guild = await getGuild();
        if (!guild) return res.status(500).json({ error: 'Guild not found' });

        // Use cache to avoid rate limits (Opcode 8 error)
        const members = guild.members.cache;
        // Use optimized summary fetch to avoid parsing huge OAuth data
        const localUsers = db.getUsersSummary();
        
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

// --- Settings API ---
app.get('/api/settings', requireAuth, (req, res) => {
    const settings = db.getAllSettings();
    res.json({ ...DEFAULT_SETTINGS, ...settings });
});

app.post('/api/settings', requireAuth, (req, res) => {
    const newSettings = req.body;
    for (const [key, value] of Object.entries(newSettings)) {
        db.setSetting(key, value);
    }
    res.json({ success: true });
});

// --- Roles API ---
app.get('/api/roles', requireAuth, async (req, res) => {
    try {
        const guild = await getGuild();
        const roles = guild.roles.cache
            .filter(r => r.name !== '@everyone')
            .map(r => ({ id: r.id, name: r.name }))
            .sort((a, b) => a.name.localeCompare(b.name));
        res.json(roles);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch roles' });
    }
});

// --- Presets API ---
app.get('/api/presets', requireAuth, (req, res) => {
    try {
        const presets = db.getPresets();
        res.json(presets);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch presets' });
    }
});

app.post('/api/presets', requireAuth, (req, res) => {
    const { name, points } = req.body;
    if (!name || !points) return res.status(400).json({ error: 'Missing fields' });
    try {
        db.addPreset(name, points);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to add preset' });
    }
});

app.delete('/api/presets/:id', requireAuth, (req, res) => {
    try {
        db.deletePreset(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete preset' });
    }
});

// 2. System of Punishments (POST /api/warn)
app.post('/api/warn', requireAuth, async (req, res) => {
    const { userId, points, reason } = req.body;
    if (!userId || !points || !reason) return res.status(400).json({ error: 'Missing fields' });

    try {
        const guild = await getGuild();
        const member = await guild.members.fetch(userId);
        
        if (!member) return res.status(404).json({ error: 'User not found in guild' });

        // Update DB
        const warning = {
            reason,
            points: parseInt(points),
            date: new Date().toISOString(),
            moderator: req.session.user.username
        };
        db.addWarning(userId, warning);
        
        // Fetch updated user for response logic
        const user = db.getUser(userId);

        // Log Action (Background)
        logAction(guild, 'User Warned', `User <@${userId}> was warned by ${req.session.user.username}`, 'Orange', [
            { name: 'Reason', value: reason },
            { name: 'Points', value: `+${points} (Total: ${user.points})` }
        ]).catch(console.error);

        // Discord Action: Send DM (Background)
        const dmPromise = (async () => {
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
        })();

        // Auto-Mute Rule
        let actionTaken = 'Warned';
        const threshold = getAppSetting('autoMuteThreshold');
        const duration = getAppSetting('autoMuteDuration');

        if (user.points > threshold) {
            if (member.moderatable) {
                // Await timeout as it is a critical moderation action
                await member.timeout(duration * 60 * 1000, `Auto-mute: Exceeded ${threshold} points`);
                actionTaken = `Warned & Auto-Muted (${duration}m)`;
                
                // Log Mute (Background)
                logAction(guild, 'Auto-Mute Triggered', `User <@${userId}> exceeded ${threshold} points.`, 'Red', [
                    { name: 'Duration', value: `${duration} minutes` }
                ]).catch(console.error);

                // Send DM about mute (Background)
                dmPromise.then(async () => {
                    try {
                        await member.send(`You have been automatically muted for ${duration} minutes due to exceeding ${threshold} penalty points.`);
                    } catch (e) {}
                });
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
app.post('/api/clear', requireAuth, async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'Missing userId' });

    try {
        const guild = await getGuild();
        const member = await guild.members.fetch(userId);

        // Reset DB
        const user = db.getUser(userId);
        const oldPoints = user.points;
        
        db.clearPunishments(userId);

        // Log (Background)
        logAction(guild, 'Punishments Cleared', `User <@${userId}> punishments were cleared by ${req.session.user.username}`, 'Green', [
            { name: 'Points Removed', value: oldPoints.toString() }
        ]).catch(console.error);

        // Remove Timeout (Critical - Await)
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
app.post('/api/verify/send-dm', requireAuth, async (req, res) => {
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

// 5. Analytics (GET /api/stats)
app.get('/api/stats/guilds', requireAuth, (req, res) => {
    try {
        const stats = db.getGuildStats();
        res.json(stats);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch guild stats' });
    }
});

app.get('/api/stats/activity', requireAuth, (req, res) => {
    try {
        const stats = db.getWarningStats();
        res.json(stats);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch activity stats' });
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
    const roleName = getAppSetting('roleUnverified');
    const roleUnverified = member.guild.roles.cache.find(r => r.name === roleName);
    if (roleUnverified) {
        await member.roles.add(roleUnverified);
    } else {
        console.warn(`Role "${roleName}" not found.`);
    }

    // Send DM
    const sent = await sendVerificationDM(member);

    if (!sent) {
        // Send to channel if DM failed
        const channelId = getAppSetting('verificationChannelId');
        let channel = null;
        if (channelId) channel = member.guild.channels.cache.get(channelId);
        if (!channel) channel = member.guild.channels.cache.find(c => c.name === VERIFICATION_CHANNEL_NAME) || member.guild.systemChannel;
        
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

            const warning = {
                reason,
                points,
                date: new Date().toISOString(),
                moderator: interaction.user.tag
            };
            db.addWarning(targetUser.id, warning);
            
            const user = db.getUser(targetUser.id);

            // Log Action
            await logAction(interaction.guild, 'User Warned (Command)', `User <@${targetUser.id}> was warned by ${interaction.user.tag}`, 'Orange', [
                { name: 'Reason', value: reason },
                { name: 'Points', value: `+${points} (Total: ${user.points})` }
            ]);

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
            const threshold = getAppSetting('autoMuteThreshold');
            const duration = getAppSetting('autoMuteDuration');

            if (user.points > threshold && targetMember.moderatable) {
                await targetMember.timeout(duration * 60 * 1000, `Auto-mute: Exceeded ${threshold} points`);
                autoMuteMsg = `\n**User was also auto-muted for ${duration} minutes.**`;
                
                await logAction(interaction.guild, 'Auto-Mute Triggered', `User <@${targetUser.id}> exceeded ${threshold} points.`, 'Red', [
                    { name: 'Duration', value: `${duration} minutes` }
                ]);
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
            db.clearPunishments(targetUser.id);

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
            const unverifiedRoleName = getAppSetting('roleUnverified');
            const verifiedRoleName = getAppSetting('roleVerified');
            
            const roleUnverified = interaction.guild.roles.cache.find(r => r.name === unverifiedRoleName);
            const roleVerified = interaction.guild.roles.cache.find(r => r.name === verifiedRoleName);

            if (roleUnverified) await targetMember.roles.remove(roleUnverified);
            if (roleVerified) await targetMember.roles.add(roleVerified);

            await logAction(interaction.guild, 'User Verified (Command)', `User <@${targetUser.id}> was manually verified by ${interaction.user.tag}.`, 'Green');

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
