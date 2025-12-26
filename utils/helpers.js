const { EmbedBuilder, AttachmentBuilder, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
// const QRCode = require('qrcode'); // Disabled due to SIGILL crashes with Canvas
const axios = require('axios');
const db = require('../db');
const { createVerificationState } = require('../verification-state');
const { CLIENT_ID, REDIRECT_URI, DEFAULT_SETTINGS, GUILD_ID } = require('./config');
const client = require('../bot/client');

const SNOWFLAKE_REGEX = /^\d{5,}$/;

function getAppSetting(key) {
    const val = db.getSetting(key);
    const value = val !== null ? val : DEFAULT_SETTINGS[key];
    if (key === 'aiEnabled' || key === 'appealsEnabled') {
        return value === 'true' || value === true;
    }
    return value;
}

function isSnowflake(value) {
    return typeof value === 'string' && SNOWFLAKE_REGEX.test(value);
}

function findChannelBySetting(guild, value) {
    if (!value) return null;
    if (isSnowflake(value)) {
        return guild.channels.cache.get(value) || null;
    }
    const needle = value.toLowerCase();
    return guild.channels.cache.find(channel => (channel.name || '').toLowerCase() === needle) || null;
}

function isTextBasedGuildChannel(channel) {
    return Boolean(channel && (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement));
}

function normalizeChannelSetting(guild, value, label) {
    if (value === undefined) return undefined;
    if (!value) return '';
    const channel = findChannelBySetting(guild, value);
    if (!channel) {
        throw new Error(`${label} не найден. Укажите существующий канал.`);
    }
    if (!isTextBasedGuildChannel(channel)) {
        throw new Error(`${label} должен быть текстовым каналом сервера.`);
    }
    return channel.id;
}

function normalizeRoleSetting(guild, value, label) {
    if (value === undefined) return undefined;
    if (!value) return '';
    const role = findRoleBySetting(guild, value);
    if (!role) {
        throw new Error(`${label} не найдена. Укажите существующую роль.`);
    }
    return role.id;
}

function findRoleBySetting(guild, value) {
    if (!value) return null;
    if (isSnowflake(value)) {
        return guild.roles.cache.get(value) || null;
    }
    const needle = value.toLowerCase();
    return guild.roles.cache.find(role => role.name.toLowerCase() === needle) || null;
}

function getConfiguredRole(guild, settingKey) {
    const value = getAppSetting(settingKey);
    const role = findRoleBySetting(guild, value);
    if (!role && value) {
        console.warn(`Configured role for ${settingKey}="${value}" not found.`);
    }
    return role;
}

async function logAction(guild, title, description, color = 'Blue', fields = [], imageUrl = null) {
    // Determine channel type based on color/title context
    // Red/Orange usually implies moderation action
    const isModAction = ['Red', 'Orange'].includes(color) || title.includes('Warn') || title.includes('Punish') || title.includes('Mute') || title.includes('Ban') || title.includes('Kick');
    
    // Save to Database for Dashboard
    try {
        const type = isModAction ? 'moderation' : (title.includes('Verify') ? 'verify' : 'system');
        db.addLog(type, title, description, color, fields, imageUrl);
    } catch (e) {
        console.error('Failed to save log to DB:', e);
    }

    let targetChannelId = getAppSetting('logChannelId') || null;

    if (isModAction) {
        const modLogId = getAppSetting('modLogChannelId');
        if (modLogId) {
            const modChannel = guild.channels.cache.get(modLogId);
            if (modChannel) {
                targetChannelId = modLogId;
            } else {
                console.warn(`Configured modLogChannelId="${modLogId}" not found. Falling back to logChannelId.`);
            }
        }
    }

    if (!targetChannelId) return;

    const channel = guild.channels.cache.get(targetChannelId);
    if (!channel) {
        console.warn(`Log channel with id="${targetChannelId}" not found in guild ${guild.id}.`);
        return;
    }

    const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(color)
        .addFields(fields)
        .setTimestamp();

    if (imageUrl) {
        embed.setImage(imageUrl);
    }

    // Fire-and-forget to avoid blocking command handlers; errors are logged.
    channel.send({ embeds: [embed] }).catch((e) => {
        console.error('Failed to send log:', e);
    });
}

async function generateVerificationMessage(userId) {
    const stateToken = createVerificationState(userId);
    // Use URL object to safely construct the URL
    const oauthUrl = new URL('https://discord.com/api/oauth2/authorize');
    oauthUrl.searchParams.append('client_id', CLIENT_ID);
    oauthUrl.searchParams.append('redirect_uri', REDIRECT_URI);
    oauthUrl.searchParams.append('response_type', 'code');
    oauthUrl.searchParams.append('scope', 'identify guilds');
    oauthUrl.searchParams.append('state', stateToken);
    
    const finalUrl = oauthUrl.toString();
    
    console.log(`[DEBUG] Generated OAuth URL for user ${userId}: ${finalUrl}`);

    try {
        console.log('[DEBUG] Starting QR code generation (via API)...');
        
        // Use external API to generate QR code to avoid local Canvas/Native module crashes (SIGILL)
        const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(finalUrl)}`;
        const response = await axios.get(qrApiUrl, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data);
        
        console.log(`[DEBUG] QR code generated via API. Buffer length: ${buffer.length}`);
        
        const attachment = new AttachmentBuilder(buffer, { name: 'verification-qr.png' });
        console.log('[DEBUG] AttachmentBuilder created.');

        const embed = new EmbedBuilder()
            .setTitle('Требуется верификация')
            .setDescription(`Добро пожаловать! Для доступа к серверу необходимо пройти верификацию.

### [👉 НАЖМИТЕ СЮДА, ЧТОБЫ ВЕРИФИЦИРОВАТЬСЯ 👈](${finalUrl})

Или отсканируйте QR-код с помощью **камеры телефона** (не используйте сканер Discord).`)
            .setColor('Blue')
            .setThumbnail('attachment://verification-qr.png');

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('resend_verification_dm')
                    .setLabel('🔄 Получить новую ссылку')
                    .setStyle(ButtonStyle.Secondary)
            );

        console.log('[DEBUG] Returning message payload.');
        return { embeds: [embed], files: [attachment], components: [row] };
    } catch (err) {
        console.error('[DEBUG] Error generating verification message:', err);
        throw err;
    }
}

async function fetchGuildMemberSafe(guild, userId) {
    const member = await guild.members.fetch(userId).catch(error => {
        if (error.code === 10007 || error.status === 404) {
            return null;
        }
        throw error;
    });
    return member;
}

async function sendVerificationDM(member) {
    try {
        console.log(`[DEBUG] Sending verification DM to ${member.user.tag} (${member.id})...`);
        const messagePayload = await generateVerificationMessage(member.id);
        console.log('[DEBUG] Payload generated. Sending DM...');
        await member.send(messagePayload);
        console.log('[DEBUG] DM sent successfully.');
        return true;
    } catch (error) {
        console.log(`Could not send DM to ${member.user.tag}: ${error.message}`);
        return false;
    }
}

async function getGuild() {
    return client.guilds.cache.get(GUILD_ID) || await client.guilds.fetch(GUILD_ID);
}

module.exports = {
    getAppSetting,
    isSnowflake,
    findChannelBySetting,
    isTextBasedGuildChannel,
    normalizeChannelSetting,
    normalizeRoleSetting,
    findRoleBySetting,
    getConfiguredRole,
    logAction,
    generateVerificationMessage,
    fetchGuildMemberSafe,
    sendVerificationDM,
    getGuild
};
