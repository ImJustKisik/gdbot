require('dotenv').config();
const { Client, GatewayIntentBits, Partials, REST, Routes, EmbedBuilder, AttachmentBuilder, PermissionsBitField } = require('discord.js');
const express = require('express');
const QRCode = require('qrcode');
const db = require('./db');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel]
});

const app = express();
const PORT = process.env.PORT || 3001;
const verificationTokens = new Map(); // token -> userId

// --- Configuration ---
const WARN_THRESHOLDS = {
    3: { duration: 60 * 60 * 1000, label: '1 hour' }, // 3 warns = 1 hour mute
    5: { duration: 24 * 60 * 60 * 1000, label: '1 day' }, // 5 warns = 1 day mute
    10: { action: 'ban' } // 10 warns = ban
};

const VERIFIED_ROLE_NAME = "Verified"; // Ensure this role exists

// --- Express Server for Verification ---
app.get('/verify', async (req, res) => {
    const { token } = req.query;
    if (!token || !verificationTokens.has(token)) {
        return res.status(400).send('Invalid or expired token.');
    }

    const userId = verificationTokens.get(token);
    const guildId = process.env.GUILD_ID;
    
    try {
        const guild = await client.guilds.fetch(guildId);
        if (!guild) return res.status(500).send('Bot is not in the server.');

        const member = await guild.members.fetch(userId);
        if (!member) return res.status(404).send('User not found in the server.');

        // Find or create role
        let role = guild.roles.cache.find(r => r.name === VERIFIED_ROLE_NAME);
        if (!role) {
             // Optional: Create role if not exists (requires permissions)
             // role = await guild.roles.create({ name: VERIFIED_ROLE_NAME, color: 'Green' });
             return res.status(500).send(`Role "${VERIFIED_ROLE_NAME}" not found. Please contact admin.`);
        }

        await member.roles.add(role);
        verificationTokens.delete(token); // Consume token
        
        res.send('<h1>Verification Successful!</h1><p>You have been verified in the Discord server. You can close this window.</p>');
        
        // Notify user
        try {
            await member.send('You have been successfully verified!');
        } catch (e) {
            // Cannot DM user
        }

    } catch (error) {
        console.error(error);
        res.status(500).send('An error occurred during verification.');
    }
});

// --- Bot Events ---
client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);
    
    // Register Slash Commands
    const commands = [
        {
            name: 'verify',
            description: 'Get a QR code to verify yourself',
        },
        {
            name: 'warn',
            description: 'Warn a user',
            options: [
                {
                    name: 'user',
                    type: 6, // USER
                    description: 'The user to warn',
                    required: true,
                },
                {
                    name: 'reason',
                    type: 3, // STRING
                    description: 'Reason for the warning',
                    required: true,
                }
            ],
            default_member_permissions: PermissionsBitField.Flags.ModerateMembers.toString()
        },
        {
            name: 'unwarn',
            description: 'Remove a warning from a user',
            options: [
                {
                    name: 'user',
                    type: 6, // USER
                    description: 'The user to unwarn',
                    required: true,
                },
                {
                    name: 'amount',
                    type: 4, // INTEGER
                    description: 'Amount of warns to remove (default 1)',
                    required: false,
                }
            ],
            default_member_permissions: PermissionsBitField.Flags.ModerateMembers.toString()
        },
        {
            name: 'warnings',
            description: 'Check warnings for a user',
            options: [
                {
                    name: 'user',
                    type: 6, // USER
                    description: 'The user to check',
                    required: false,
                }
            ]
        }
    ];

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);

    try {
        console.log('Started refreshing application (/) commands.');
        await rest.put(
            Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID),
            { body: commands },
        );
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }

    // Start Express Server
    app.listen(PORT, () => {
        console.log(`Verification server running on port ${PORT}`);
    });
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    if (commandName === 'verify') {
        const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        verificationTokens.set(token, interaction.user.id);

        // In production, use your public IP or domain
        const verifyUrl = `http://localhost:${PORT}/verify?token=${token}`;
        
        try {
            const qrCodeData = await QRCode.toDataURL(verifyUrl);
            const buffer = Buffer.from(qrCodeData.split(',')[1], 'base64');
            const attachment = new AttachmentBuilder(buffer, { name: 'qrcode.png' });

            const embed = new EmbedBuilder()
                .setTitle('Verification')
                .setDescription('Scan the QR code below or click the link to verify your account.')
                .addFields({ name: 'Link', value: `[Click here to verify](${verifyUrl})` })
                .setImage('attachment://qrcode.png')
                .setColor('Blue');

            await interaction.reply({ embeds: [embed], files: [attachment], ephemeral: true });
        } catch (err) {
            console.error(err);
            await interaction.reply({ content: 'Error generating QR code.', ephemeral: true });
        }
    }

    if (commandName === 'warn') {
        const user = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason');
        const member = await interaction.guild.members.fetch(user.id);

        if (!member) return interaction.reply({ content: 'User not found.', ephemeral: true });

        const userData = db.getUser(user.id);
        userData.warns += 1;
        userData.history.push({
            type: 'warn',
            reason: reason,
            moderator: interaction.user.id,
            timestamp: Date.now()
        });

        let punishment = null;
        
        // Check thresholds
        if (WARN_THRESHOLDS[userData.warns]) {
            const threshold = WARN_THRESHOLDS[userData.warns];
            if (threshold.action === 'ban') {
                if (member.bannable) {
                    await member.ban({ reason: 'Reached 10 warnings' });
                    punishment = 'Banned';
                } else {
                    punishment = 'Failed to ban (missing permissions)';
                }
            } else if (threshold.duration) {
                if (member.moderatable) {
                    await member.timeout(threshold.duration, 'Reached warning threshold');
                    punishment = `Muted for ${threshold.label}`;
                } else {
                    punishment = 'Failed to mute (missing permissions)';
                }
            }
        }

        db.saveUser(user.id, userData);

        const embed = new EmbedBuilder()
            .setTitle('User Warned')
            .setDescription(`${user} has been warned.`)
            .addFields(
                { name: 'Reason', value: reason },
                { name: 'Total Warns', value: userData.warns.toString() }
            )
            .setColor('Orange');

        if (punishment) {
            embed.addFields({ name: 'Punishment', value: punishment });
        }

        await interaction.reply({ embeds: [embed] });
    }

    if (commandName === 'unwarn') {
        const user = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount') || 1;
        
        const userData = db.getUser(user.id);
        if (userData.warns <= 0) {
            return interaction.reply({ content: 'User has no warnings.', ephemeral: true });
        }

        userData.warns = Math.max(0, userData.warns - amount);
        userData.history.push({
            type: 'unwarn',
            amount: amount,
            moderator: interaction.user.id,
            timestamp: Date.now()
        });

        db.saveUser(user.id, userData);

        await interaction.reply({ content: `Removed ${amount} warning(s) from ${user}. Total now: ${userData.warns}` });
    }

    if (commandName === 'warnings') {
        const user = interaction.options.getUser('user') || interaction.user;
        const userData = db.getUser(user.id);

        const embed = new EmbedBuilder()
            .setTitle(`Warnings for ${user.username}`)
            .setDescription(`Total Warns: ${userData.warns}`)
            .setColor('Yellow');

        // Show last 5 history items
        const history = userData.history.slice(-5).reverse();
        if (history.length > 0) {
            const historyText = history.map(h => {
                const date = new Date(h.timestamp).toLocaleDateString();
                return `**${h.type.toUpperCase()}** (${date}): ${h.reason || 'No reason'} (Mod: <@${h.moderator}>)`;
            }).join('\n');
            embed.addFields({ name: 'Recent History', value: historyText });
        }

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
});

client.login(process.env.DISCORD_BOT_TOKEN);
