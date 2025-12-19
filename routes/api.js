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

module.exports = router;
