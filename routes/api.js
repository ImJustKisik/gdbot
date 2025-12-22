const express = require('express');
const { EmbedBuilder, ChannelType } = require('discord.js');
const db = require('../db');
const { 
    getGuild, 
    fetchGuildMemberSafe, 
    logAction, 
    normalizeChannelSetting, 
    normalizeRoleSetting, 
    isTextBasedGuildChannel, 
    getAppSetting, 
    generateVerificationMessage 
} = require('../utils/helpers');
const { DEFAULT_SETTINGS } = require('../utils/config');
const { requireAuth } = require('../utils/middleware');
const { DEFAULT_PROMPT, DEFAULT_RULES } = require('../utils/ai');

const router = express.Router();

// Get User Guilds (for Dashboard)
router.get('/user/:id/guilds', requireAuth, async (req, res) => {
    const { id } = req.params;
    const user = db.getUser(id);
    if (!user || !user.oauth || !user.oauth.guilds) {
        return res.json([]);
    }
    res.json(user.oauth.guilds);
});

// 1. Synchronization (GET /api/users)
router.get('/users', requireAuth, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const startIndex = (page - 1) * limit;

        const guild = await getGuild();
        if (!guild) return res.status(500).json({ error: 'Guild not found' });

        // Ensure cache is populated to avoid returning empty data
        if (guild.members.cache.size === 0) {
            try {
                await guild.members.fetch();
            } catch (fetchError) {
                console.error('Failed to populate member cache:', fetchError);
                return res.status(503).json({ error: 'Member cache unavailable, please try again shortly.' });
            }
        }

        const members = guild.members.cache;
        if (members.size === 0) {
            return res.status(503).json({ error: 'Member cache unavailable, please try again shortly.' });
        }

        // Convert Map to Array and SORT for stable pagination
        // Sorting by username ensures that the order doesn't change randomly between requests
        const allMembers = Array.from(members.values()).sort((a, b) => 
            a.user.username.localeCompare(b.user.username)
        );
        
        const paginatedMembers = allMembers.slice(startIndex, startIndex + limit);
        const targetIds = paginatedMembers.map(m => m.id);

        // Fetch DB data ONLY for the users on this page (Non-blocking optimization)
        const localUsers = db.getUsersSummary(targetIds);
        
        const responseData = paginatedMembers.map(member => {
            const localUser = localUsers[member.id] || { points: 0, warningsCount: 0 };
            
            // Determine status
            let status = 'Unverified'; // Default to Unverified
            
            const roleVerifiedName = getAppSetting('roleVerified') || 'Verified';
            const roleUnverifiedName = getAppSetting('roleUnverified') || 'Unverified';

            const hasVerifiedRole = member.roles.cache.some(r => r.name === roleVerifiedName || r.id === roleVerifiedName);
            const hasUnverifiedRole = member.roles.cache.some(r => r.name === roleUnverifiedName || r.id === roleUnverifiedName);
            const isMuted = member.roles.cache.some(role => role.name === 'Muted') || member.communicationDisabledUntilTimestamp > Date.now();

            if (isMuted) {
                status = 'Muted';
            } else if (hasVerifiedRole) {
                status = 'Verified';
            } else if (hasUnverifiedRole) {
                status = 'Unverified';
            } else {
                // Fallback logic: if no roles match, assume Verified if they don't have the Unverified role explicitly
                // Or keep as Unverified if you want strict checking.
                // Let's assume if they are in the DB as verified (oauth table), they are verified.
                if (localUser.verifiedAt) {
                    status = 'Verified';
                }
            }
            
            return {
                id: member.id,
                username: member.user.username,
                avatar: member.user.displayAvatarURL(),
                points: localUser.points || 0,
                isMonitored: localUser.isMonitored || false,
                warningsCount: localUser.warningsCount || 0,
                warnings: [],
                status: status
            };
        });

        res.json({
            data: responseData,
            total: allMembers.length,
            page,
            totalPages: Math.ceil(allMembers.length / limit)
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

router.get('/users/:id/warnings', requireAuth, (req, res) => {
    try {
        const user = db.getUser(req.params.id);
        res.json({ 
            warnings: user.warnings || [],
            invite: user.invite || null
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch user warnings' });
    }
});

// --- Settings API ---
router.get('/settings', requireAuth, (req, res) => {
    const settings = db.getAllSettings();
    res.json({ ...DEFAULT_SETTINGS, ...settings });
});

router.get('/settings/bundle', requireAuth, async (req, res) => {
    try {
        const guild = await getGuild();
        const settings = db.getAllSettings();
        
        // Merge with defaults, including AI defaults
        const mergedSettings = { 
            ...DEFAULT_SETTINGS, 
            ...settings,
            aiPrompt: settings.aiPrompt || DEFAULT_PROMPT,
            aiRules: settings.aiRules || DEFAULT_RULES
        };

        const presets = db.getPresets();
        const escalations = db.getEscalations();
        
        const roles = guild.roles.cache
            .filter(r => r.name !== '@everyone')
            .map(r => ({ value: r.id, label: r.name }))
            .sort((a, b) => a.label.localeCompare(b.label));
            
        const channels = guild.channels.cache
            .filter(channel => isTextBasedGuildChannel(channel) || channel.type === ChannelType.GuildCategory)
            .map(channel => {
                const prefix = channel.type === ChannelType.GuildCategory ? '[Category] ' : '#';
                return { value: channel.id, label: `${prefix}${channel.name}` };
            })
            .sort((a, b) => a.label.localeCompare(b.label));

        res.json({
            settings: mergedSettings,
            presets,
            escalations,
            roles,
            channels
        });
    } catch (error) {
        console.error('Failed to fetch settings bundle:', error);
        res.status(500).json({ error: 'Failed to fetch settings bundle' });
    }
});

router.post('/settings', requireAuth, async (req, res) => {
    try {
        const guild = await getGuild();
        const payload = req.body || {};

        const normalized = {};
        const logChannelId = normalizeChannelSetting(guild, payload.logChannelId, 'Log Channel');
        const modLogChannelId = normalizeChannelSetting(guild, payload.modLogChannelId, 'Mod Log Channel');
        const verificationChannelId = normalizeChannelSetting(guild, payload.verificationChannelId, 'Verification Channel');
        const roleUnverified = normalizeRoleSetting(guild, payload.roleUnverified, 'Unverified Role');
        const roleVerified = normalizeRoleSetting(guild, payload.roleVerified, 'Verified Role');
        const parseNumberSetting = (value, label, { min = 0, max = 100000, allowZero = true } = {}) => {
            if (value === undefined) return undefined;
            if (value === '' || value === null) {
                return allowZero ? 0 : min;
            }
            const parsed = Number(value);
            if (!Number.isFinite(parsed)) {
                throw new Error(`${label} должно быть числом.`);
            }
            const rounded = Math.round(parsed);
            if (rounded < min || rounded > max) {
                throw new Error(`${label} должно быть в диапазоне ${min}-${max}.`);
            }
            return rounded;
        };

        if (logChannelId !== undefined) normalized.logChannelId = logChannelId;
        if (modLogChannelId !== undefined) normalized.modLogChannelId = modLogChannelId;
        if (verificationChannelId !== undefined) normalized.verificationChannelId = verificationChannelId;
        if (roleUnverified !== undefined) normalized.roleUnverified = roleUnverified;
        if (roleVerified !== undefined) normalized.roleVerified = roleVerified;

        const autoMuteThreshold = parseNumberSetting(payload.autoMuteThreshold, 'Auto-mute threshold', { min: 0, max: 200, allowZero: true });
        const autoMuteDuration = parseNumberSetting(payload.autoMuteDuration, 'Auto-mute duration', { min: 1, max: 10080, allowZero: false });

        if (autoMuteThreshold !== undefined) normalized.autoMuteThreshold = autoMuteThreshold;
        if (autoMuteDuration !== undefined) normalized.autoMuteDuration = autoMuteDuration;

        // AI Settings
        if (payload.aiEnabled !== undefined) normalized.aiEnabled = payload.aiEnabled;
        if (payload.aiThreshold !== undefined) normalized.aiThreshold = parseNumberSetting(payload.aiThreshold, 'AI Threshold', { min: 0, max: 100 });
        if (payload.aiAction !== undefined) normalized.aiAction = payload.aiAction;
        if (payload.aiPrompt !== undefined) normalized.aiPrompt = payload.aiPrompt;
        if (payload.aiRules !== undefined) normalized.aiRules = payload.aiRules;

        // Appeals Settings
        if (payload.appealsEnabled !== undefined) normalized.appealsEnabled = payload.appealsEnabled;
        if (payload.appealsChannelId !== undefined) normalized.appealsChannelId = payload.appealsChannelId;
        if (payload.ticketsCategoryId !== undefined) normalized.ticketsCategoryId = payload.ticketsCategoryId;

        for (const [key, value] of Object.entries(normalized)) {
            db.setSetting(key, value);
        }

        res.json({ success: true, settings: { ...DEFAULT_SETTINGS, ...db.getAllSettings() } });
    } catch (error) {
        console.error('Failed to save settings:', error);
        res.status(400).json({ error: error.message || 'Failed to save settings' });
    }
});

// --- Roles API ---
router.get('/roles', requireAuth, async (req, res) => {
    try {
        const guild = await getGuild();
        const roles = guild.roles.cache
            .filter(r => r.name !== '@everyone')
            .map(r => ({ value: r.id, label: r.name }))
            .sort((a, b) => a.label.localeCompare(b.label));
        res.json(roles);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch roles' });
    }
});

router.get('/channels', requireAuth, async (req, res) => {
    try {
        const guild = await getGuild();
        const channels = guild.channels.cache
            .filter(channel => isTextBasedGuildChannel(channel) || channel.type === ChannelType.GuildCategory)
            .map(channel => {
                const prefix = channel.type === ChannelType.GuildCategory ? '[Category] ' : '#';
                return { value: channel.id, label: `${prefix}${channel.name}` };
            })
            .sort((a, b) => a.label.localeCompare(b.label));
        res.json(channels);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch channels' });
    }
});

// --- Presets API ---
router.get('/presets', requireAuth, (req, res) => {
    try {
        const presets = db.getPresets();
        res.json(presets);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch presets' });
    }
});

router.post('/presets', requireAuth, (req, res) => {
    const { name, points } = req.body;
    if (!name || !points) return res.status(400).json({ error: 'Missing fields' });
    try {
        db.addPreset(name, points);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to add preset' });
    }
});

router.delete('/presets/:id', requireAuth, (req, res) => {
    try {
        db.deletePreset(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete preset' });
    }
});

// --- Escalations API ---
router.get('/escalations', requireAuth, (req, res) => {
    try {
        const rules = db.getEscalations();
        res.json(rules);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch escalations' });
    }
});

router.post('/escalations', requireAuth, (req, res) => {
    const { name, threshold, action, duration } = req.body;
    if (!threshold || !action) return res.status(400).json({ error: 'Missing fields' });
    try {
        db.addEscalation(name, threshold, action, duration || 0);
        res.json({ success: true });
    } catch (error) {
        console.error('Error adding escalation:', error);
        res.status(500).json({ error: 'Failed to add escalation: ' + error.message });
    }
});

router.delete('/escalations/:id', requireAuth, (req, res) => {
    try {
        db.deleteEscalation(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete escalation' });
    }
});

// --- Logs API ---
router.get('/logs', requireAuth, (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;
        const type = req.query.type || null;
        
        const logs = db.getLogs(limit, offset, type);
        res.json(logs);
    } catch (error) {
        console.error('Failed to fetch logs:', error);
        res.status(500).json({ error: 'Failed to fetch logs' });
    }
});

// --- Stats API ---
router.get('/stats/guilds', requireAuth, (req, res) => {
    try {
        const stats = db.getGuildStats();
        res.json(stats);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch guild stats' });
    }
});

router.get('/stats/activity', requireAuth, (req, res) => {
    try {
        const stats = db.getWarningStats();
        res.json(stats);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch activity stats' });
    }
});

// Get Invite Stats
router.get('/stats/invites', requireAuth, async (req, res) => {
    try {
        const stats = db.getInvitesStats();
        
        // Enrich with usernames if possible
        const guild = await getGuild();
        if (guild) {
            for (const inviter of stats.topInviters) {
                try {
                    const member = await fetchGuildMemberSafe(guild, inviter.inviter_id);
                    if (member) {
                        inviter.username = member.user.username;
                        inviter.avatar = member.user.displayAvatarURL();
                    } else {
                        inviter.username = 'Unknown User';
                    }
                } catch (e) {
                    inviter.username = 'Unknown User';
                }
            }
        }
        
        res.json(stats);
    } catch (error) {
        console.error('Error fetching invite stats:', error);
        res.status(500).json({ error: 'Failed to fetch invite stats' });
    }
});

// --- Moderation API ---
router.post('/warn', requireAuth, async (req, res) => {
    const { userId, reason, points, anonymous } = req.body;
    if (!userId || !reason || !points) return res.status(400).json({ error: 'Missing fields' });

    try {
        const guild = await getGuild();
        const member = await fetchGuildMemberSafe(guild, userId);
        
        if (!member) return res.status(404).json({ error: 'User not found in guild' });

        const moderatorName = anonymous ? 'Dashboard' : (req.session.user?.username || 'Dashboard Admin');

        db.addWarning(userId, {
            reason,
            points: parseInt(points),
            moderator: moderatorName,
            date: new Date().toISOString()
        });

        const user = db.getUser(userId);
        
        // Auto-mute check
        const autoMuteThreshold = getAppSetting('autoMuteThreshold') || DEFAULT_SETTINGS.autoMuteThreshold;
        if (user.points >= autoMuteThreshold && member.moderatable) {
             const duration = getAppSetting('autoMuteDuration') || DEFAULT_SETTINGS.autoMuteDuration;
             await member.timeout(duration * 60 * 1000, 'Auto-mute: Exceeded points threshold');
             await logAction(guild, 'Auto-Mute', `User <@${userId}> muted for ${duration}m (Points: ${user.points})`, 'Red');
        }

        await logAction(guild, 'Warn (Dashboard)', `User <@${userId}> warned by ${moderatorName}. Reason: ${reason}`, 'Orange');

        // Send DM
        try {
            await member.send({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('You have been warned')
                        .setColor('Orange')
                        .addFields(
                            { name: 'Reason', value: reason },
                            { name: 'Points Added', value: points.toString() },
                            { name: 'Total Points', value: user.points.toString() }
                        )
                ]
            });
        } catch (err) {
            console.log(`Failed to send DM to ${userId}: ${err.message}`);
        }

        res.json({ success: true, user });
    } catch (error) {
        console.error('Warn error:', error);
        res.status(500).json({ error: 'Failed to warn user' });
    }
});

router.post('/clear', requireAuth, async (req, res) => {
    const { userId, anonymous } = req.body;
    if (!userId) return res.status(400).json({ error: 'Missing userId' });

    try {
        const guild = await getGuild();
        const member = await fetchGuildMemberSafe(guild, userId);

        db.clearPunishments(userId);
        
        if (member && member.moderatable) {
            await member.timeout(null, 'Points cleared via Dashboard');
        }

        const moderatorName = anonymous ? 'Dashboard' : (req.session.user?.username || 'Dashboard Admin');
        await logAction(guild, 'Clear (Dashboard)', `User <@${userId}> points cleared by ${moderatorName}`, 'Green');

        res.json({ success: true });
    } catch (error) {
        console.error('Clear error:', error);
        res.status(500).json({ error: 'Failed to clear user' });
    }
});

// Get All Active Invites with Aliases
router.get('/invites', requireAuth, async (req, res) => {
    try {
        const guild = await getGuild();
        if (!guild) return res.status(500).json({ error: 'Guild not found' });

        const invites = await guild.invites.fetch();
        const aliases = db.getAllInviteAliases();

        const result = [];
        for (const invite of invites.values()) {
            result.push({
                code: invite.code,
                uses: invite.uses,
                inviter: invite.inviter ? {
                    id: invite.inviter.id,
                    username: invite.inviter.username,
                    avatar: invite.inviter.displayAvatarURL()
                } : null,
                alias: aliases[invite.code] || null,
                url: invite.url
            });
        }

        // Sort by uses desc
        result.sort((a, b) => b.uses - a.uses);

        res.json(result);
    } catch (error) {
        console.error('Error fetching invites:', error);
        res.status(500).json({ error: 'Failed to fetch invites' });
    }
});

// Set Invite Alias
router.post('/invites/:code/alias', requireAuth, async (req, res) => {
    const { code } = req.params;
    const { alias } = req.body;

    try {
        db.setInviteAlias(code, alias);
        res.json({ success: true });
    } catch (error) {
        console.error('Error setting invite alias:', error);
        res.status(500).json({ error: 'Failed to set alias' });
    }
});

// Get Invite Joins
router.get('/invites/:code/joins', requireAuth, async (req, res) => {
    try {
        const { code } = req.params;
        const joins = db.getInviteJoins(code);
        const guild = await getGuild();
        
        const enrichedJoins = await Promise.all(joins.map(async (join) => {
            const member = await fetchGuildMemberSafe(guild, join.id);
            return {
                id: join.id,
                username: member ? member.user.username : 'Unknown User',
                avatar: member ? member.user.displayAvatarURL() : null,
                joinedAt: join.joined_at,
                points: join.points
            };
        }));
        
        res.json(enrichedJoins);
    } catch (error) {
        console.error('Error fetching invite joins:', error);
        res.status(500).json({ error: 'Failed to fetch invite joins' });
    }
});

// Get Invite Stats
router.get('/stats/invites', requireAuth, async (req, res) => {
    try {
        const stats = db.getInvitesStats();
        
        // Enrich with usernames if possible
        const guild = await getGuild();
        if (guild) {
            for (const inviter of stats.topInviters) {
                try {
                    const member = await fetchGuildMemberSafe(guild, inviter.inviter_id);
                    if (member) {
                        inviter.username = member.user.username;
                        inviter.avatar = member.user.displayAvatarURL();
                    } else {
                        inviter.username = 'Unknown User';
                    }
                } catch (e) {
                    inviter.username = 'Unknown User';
                }
            }
        }
        
        res.json(stats);
    } catch (error) {
        console.error('Error fetching invite stats:', error);
        res.status(500).json({ error: 'Failed to fetch invite stats' });
    }
});

// --- Embed Builder Routes ---

// Get Text Channels
router.get('/channels', requireAuth, async (req, res) => {
    try {
        const guild = await getGuild();
        if (!guild) return res.status(500).json({ error: 'Guild not found' });

        const channels = guild.channels.cache
            .filter(c => c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement)
            .map(c => ({ id: c.id, name: c.name }))
            .sort((a, b) => a.name.localeCompare(b.name));

        res.json(channels);
    } catch (error) {
        console.error('Error fetching channels:', error);
        res.status(500).json({ error: 'Failed to fetch channels' });
    }
});

// Send Embed
router.post('/embeds/send', requireAuth, async (req, res) => {
    try {
        const { channelId, content, embed } = req.body;
        const guild = await getGuild();
        if (!guild) return res.status(500).json({ error: 'Guild not found' });

        const channel = guild.channels.cache.get(channelId);
        if (!channel) return res.status(404).json({ error: 'Channel not found' });

        const messagePayload = {};
        if (content) messagePayload.content = content;

        if (embed && (embed.title || embed.description || embed.fields?.length > 0 || embed.image)) {
            const embedBuilder = new EmbedBuilder();
            if (embed.title) embedBuilder.setTitle(embed.title);
            if (embed.description) embedBuilder.setDescription(embed.description);
            if (embed.color) embedBuilder.setColor(embed.color);
            if (embed.url) embedBuilder.setURL(embed.url);
            if (embed.image) embedBuilder.setImage(embed.image);
            if (embed.thumbnail) embedBuilder.setThumbnail(embed.thumbnail);
            if (embed.footer?.text) embedBuilder.setFooter({ text: embed.footer.text, iconURL: embed.footer.icon_url });
            if (embed.author?.name) embedBuilder.setAuthor({ name: embed.author.name, iconURL: embed.author.icon_url, url: embed.author.url });
            
            if (embed.fields && Array.isArray(embed.fields)) {
                embed.fields.forEach(f => {
                    if (f.name && f.value) embedBuilder.addFields({ name: f.name, value: f.value, inline: !!f.inline });
                });
            }
            messagePayload.embeds = [embedBuilder];
        }

        await channel.send(messagePayload);
        res.json({ success: true });
    } catch (error) {
        console.error('Error sending embed:', error);
        res.status(500).json({ error: 'Failed to send embed: ' + error.message });
    }
});

// Fetch Message for Editing
router.get('/embeds/fetch', requireAuth, async (req, res) => {
    try {
        const { channelId, messageId } = req.query;
        if (!channelId || !messageId) return res.status(400).json({ error: 'Missing channelId or messageId' });

        const guild = await getGuild();
        if (!guild) return res.status(500).json({ error: 'Guild not found' });

        const channel = guild.channels.cache.get(channelId);
        if (!channel) return res.status(404).json({ error: 'Channel not found' });

        try {
            const message = await channel.messages.fetch(messageId);
            res.json(message);
        } catch (e) {
            return res.status(404).json({ error: 'Message not found' });
        }
    } catch (error) {
        console.error('Error fetching message:', error);
        res.status(500).json({ error: 'Failed to fetch message' });
    }
});

// Edit Embed
router.post('/embeds/edit', requireAuth, async (req, res) => {
    try {
        const { channelId, messageId, content, embed } = req.body;
        const guild = await getGuild();
        if (!guild) return res.status(500).json({ error: 'Guild not found' });

        const channel = guild.channels.cache.get(channelId);
        if (!channel) return res.status(404).json({ error: 'Channel not found' });

        let message;
        try {
            message = await channel.messages.fetch(messageId);
        } catch (e) {
            return res.status(404).json({ error: 'Message not found' });
        }

        if (message.author.id !== guild.client.user.id) {
            return res.status(403).json({ error: 'Cannot edit messages sent by other users' });
        }

        const messagePayload = {};
        // If content is empty string, we might want to remove it, but Discord requires either content or embed.
        // If user sends empty string, we set it to null to remove it, UNLESS there are no embeds.
        messagePayload.content = content || null;

        if (embed && (embed.title || embed.description || embed.fields?.length > 0 || embed.image)) {
            const embedBuilder = new EmbedBuilder();
            if (embed.title) embedBuilder.setTitle(embed.title);
            if (embed.description) embedBuilder.setDescription(embed.description);
            if (embed.color) embedBuilder.setColor(embed.color);
            if (embed.url) embedBuilder.setURL(embed.url);
            if (embed.image) embedBuilder.setImage(embed.image);
            if (embed.thumbnail) embedBuilder.setThumbnail(embed.thumbnail);
            if (embed.footer?.text) embedBuilder.setFooter({ text: embed.footer.text, iconURL: embed.footer.icon_url });
            if (embed.author?.name) embedBuilder.setAuthor({ name: embed.author.name, iconURL: embed.author.icon_url, url: embed.author.url });
            
            if (embed.fields && Array.isArray(embed.fields)) {
                embed.fields.forEach(f => {
                    if (f.name && f.value) embedBuilder.addFields({ name: f.name, value: f.value, inline: !!f.inline });
                });
            }
            messagePayload.embeds = [embedBuilder];
        } else {
            messagePayload.embeds = [];
        }

        await message.edit(messagePayload);
        res.json({ success: true });
    } catch (error) {
        console.error('Error editing embed:', error);
        res.status(500).json({ error: 'Failed to edit embed: ' + error.message });
    }
});


module.exports = router;
