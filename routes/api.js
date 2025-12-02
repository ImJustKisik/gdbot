const express = require('express');
const { EmbedBuilder } = require('discord.js');
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

        // Use optimized summary fetch to avoid parsing huge OAuth data
        const localUsers = db.getUsersSummary();
        
        const responseData = members.map(member => {
            const localUser = localUsers[member.id] || { points: 0, warningsCount: 0 };
            
            // Determine status
            let status = 'Verified'; // Default
            if (member.roles.cache.some(role => role.name === 'Muted') || member.communicationDisabledUntilTimestamp > Date.now()) {
                status = 'Muted';
            }
            
            return {
                id: member.id,
                username: member.user.username,
                avatar: member.user.displayAvatarURL(),
                points: localUser.points || 0,
                warningsCount: localUser.warningsCount || 0,
                warnings: [],
                status: status
            };
        });

        res.json(responseData);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

router.get('/users/:id/warnings', requireAuth, (req, res) => {
    try {
        const user = db.getUser(req.params.id);
        res.json({ warnings: user.warnings || [] });
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
        const presets = db.getPresets();
        const escalations = db.getEscalations();
        
        const roles = guild.roles.cache
            .filter(r => r.name !== '@everyone')
            .map(r => ({ id: r.id, name: r.name }))
            .sort((a, b) => a.name.localeCompare(b.name));
            
        const channels = guild.channels.cache
            .filter(channel => isTextBasedGuildChannel(channel))
            .map(channel => ({ id: channel.id, name: channel.name || `#${channel.id}` }))
            .sort((a, b) => a.name.localeCompare(b.name));

        res.json({
            settings: { ...DEFAULT_SETTINGS, ...settings },
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
        if (verificationChannelId !== undefined) normalized.verificationChannelId = verificationChannelId;
        if (roleUnverified !== undefined) normalized.roleUnverified = roleUnverified;
        if (roleVerified !== undefined) normalized.roleVerified = roleVerified;

        const autoMuteThreshold = parseNumberSetting(payload.autoMuteThreshold, 'Auto-mute threshold', { min: 0, max: 200, allowZero: true });
        const autoMuteDuration = parseNumberSetting(payload.autoMuteDuration, 'Auto-mute duration', { min: 1, max: 10080, allowZero: false });

        if (autoMuteThreshold !== undefined) normalized.autoMuteThreshold = autoMuteThreshold;
        if (autoMuteDuration !== undefined) normalized.autoMuteDuration = autoMuteDuration;

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
            .map(r => ({ id: r.id, name: r.name }))
            .sort((a, b) => a.name.localeCompare(b.name));
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
            .filter(channel => isTextBasedGuildChannel(channel))
            .map(channel => ({ id: channel.id, name: channel.name || `#${channel.id}` }))
            .sort((a, b) => a.name.localeCompare(b.name));
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

// 2. System of Punishments (POST /api/warn)
router.post('/warn', requireAuth, async (req, res) => {
    const { userId, points, reason } = req.body;
    const parsedPoints = Number(points);
    if (!userId || typeof reason !== 'string' || !reason.trim()) return res.status(400).json({ error: 'Missing fields' });
    if (!Number.isInteger(parsedPoints) || parsedPoints < 1 || parsedPoints > 20) {
        return res.status(400).json({ error: 'Points must be an integer between 1 and 20' });
    }

    try {
        const guild = await getGuild();
        const member = await fetchGuildMemberSafe(guild, userId);
        
        if (!member) return res.status(404).json({ error: 'User not found in guild' });

        // Update DB
        const warning = {
            reason,
            points: parsedPoints,
            date: new Date().toISOString(),
            moderator: req.session.user.username
        };
        db.addWarning(userId, warning);
        
        // Fetch updated user for response logic
        const user = db.getUser(userId);

        // Log Action (Background)
        logAction(guild, 'User Warned', `User <@${userId}> was warned by ${req.session.user.username}`, 'Orange', [
            { name: 'Reason', value: reason },
            { name: 'Points', value: `+${parsedPoints} (Total: ${user.points})` }
        ]).catch(console.error);

        // Discord Action: Send DM (Background)
        const dmPromise = (async () => {
            try {
                const embed = new EmbedBuilder()
                    .setTitle('You have been warned')
                    .setColor('Orange')
                    .addFields(
                        { name: 'Reason', value: reason },
                        { name: 'Points Added', value: parsedPoints.toString() },
                        { name: 'Total Points', value: user.points.toString() }
                    );
                await member.send({ embeds: [embed] });
            } catch (dmError) {
                console.log(`Could not DM user ${userId}`);
            }
        })();

        // Auto-Mute / Escalation Rule
        let actionTaken = 'Warned';
        
        const escalations = db.getEscalations();
        const activeRule = escalations
            .sort((a, b) => b.threshold - a.threshold)
            .find(rule => user.points >= rule.threshold);

        const defaultAutoMuteThreshold = Number(getAppSetting('autoMuteThreshold')) || 0;
        const defaultAutoMuteDuration = Number(getAppSetting('autoMuteDuration')) || 60;
        const shouldApplyFallbackMute = !activeRule && defaultAutoMuteThreshold > 0 && user.points >= defaultAutoMuteThreshold;

        if (activeRule) {
            if (member.moderatable) {
                try {
                    if (activeRule.action === 'mute') {
                        const duration = activeRule.duration || 60;
                        await member.timeout(duration * 60 * 1000, `Auto-punish: Reached ${activeRule.threshold} points`);
                        actionTaken = `Warned & Auto-Muted (${duration}m)`;
                        
                        logAction(guild, 'Auto-Punishment Triggered', `User <@${userId}> reached ${activeRule.threshold} points.`, 'Red', [
                            { name: 'Action', value: 'Mute' },
                            { name: 'Duration', value: `${duration} minutes` }
                        ]).catch(console.error);

                        dmPromise.then(async () => {
                            try { await member.send(`You have been automatically muted for ${duration} minutes due to reaching ${activeRule.threshold} penalty points.`); } catch (e) {}
                        });

                    } else if (activeRule.action === 'kick') {
                        await member.kick(`Auto-punish: Reached ${activeRule.threshold} points`);
                        actionTaken = `Warned & Auto-Kicked`;
                        
                        logAction(guild, 'Auto-Punishment Triggered', `User <@${userId}> reached ${activeRule.threshold} points.`, 'Red', [
                            { name: 'Action', value: 'Kick' }
                        ]).catch(console.error);

                    } else if (activeRule.action === 'ban') {
                        await member.ban({ reason: `Auto-punish: Reached ${activeRule.threshold} points` });
                        actionTaken = `Warned & Auto-Banned`;
                        
                        logAction(guild, 'Auto-Punishment Triggered', `User <@${userId}> reached ${activeRule.threshold} points.`, 'Red', [
                            { name: 'Action', value: 'Ban' }
                        ]).catch(console.error);
                    }
                } catch (err) {
                    console.error('Auto-punish failed:', err);
                    actionTaken = `Warned (Auto-${activeRule.action} failed: Missing permissions)`;
                }
            } else {
                actionTaken = `Warned (Auto-${activeRule.action} failed: User not moderatable)`;
            }
        } else if (shouldApplyFallbackMute) {
            if (member.moderatable) {
                const duration = Math.max(1, defaultAutoMuteDuration);
                try {
                    await member.timeout(duration * 60 * 1000, `Auto-punish (default): Reached ${defaultAutoMuteThreshold} points`);
                    actionTaken = `Warned & Auto-Muted (${duration}m)`;

                    logAction(guild, 'Auto-Punishment Triggered', `User <@${userId}> reached the default ${defaultAutoMuteThreshold} point threshold.`, 'Red', [
                        { name: 'Action', value: 'Mute (Default Rule)' },
                        { name: 'Duration', value: `${duration} minutes` }
                    ]).catch(console.error);

                    dmPromise.then(async () => {
                        try { await member.send(`You have been automatically muted for ${duration} minutes due to reaching ${defaultAutoMuteThreshold} penalty points.`); } catch (e) {}
                    });
                } catch (err) {
                    console.error('Default auto-mute failed:', err);
                    actionTaken = 'Warned (Default auto-mute failed: Missing permissions)';
                }
            } else {
                actionTaken = 'Warned (Default auto-mute failed: User not moderatable)';
            }
        }

        res.json({ success: true, user, action: actionTaken });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 3. Clear Punishments (POST /api/clear)
router.post('/clear', requireAuth, async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'Missing userId' });

    try {
    const guild = await getGuild();
    const member = await fetchGuildMemberSafe(guild, userId);

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
router.post('/verify/send-dm', requireAuth, async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'Missing userId' });

    try {
    const guild = await getGuild();
    const member = await fetchGuildMemberSafe(guild, userId);
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

module.exports = router;
