const express = require('express');
const { ChannelType } = require('discord.js');
const db = require('../../db');
const {
    getGuild,
    normalizeChannelSetting,
    normalizeRoleSetting,
    isTextBasedGuildChannel
} = require('../../utils/helpers');
const { DEFAULT_SETTINGS } = require('../../utils/config');
const { DEFAULT_PROMPT, DEFAULT_RULES } = require('../../utils/ai');
const { requireAuth } = require('../../utils/middleware');

const router = express.Router();

router.get('/settings', requireAuth, (req, res) => {
    const settings = db.getAllSettings();
    res.json({ ...DEFAULT_SETTINGS, ...settings });
});

router.get('/settings/bundle', requireAuth, async (req, res) => {
    try {
        const guild = await getGuild();
        const settings = db.getAllSettings();

        const mergedSettings = {
            ...DEFAULT_SETTINGS,
            ...settings,
            aiPrompt: settings.aiPrompt || DEFAULT_PROMPT,
            aiRules: settings.aiRules || DEFAULT_RULES
        };

        const presets = db.getPresets();
        const escalations = db.getEscalations();

        const roles = guild.roles.cache
            .filter((r) => r.name !== '@everyone')
            .map((r) => ({ value: r.id, label: r.name }))
            .sort((a, b) => a.label.localeCompare(b.label));

        const channels = guild.channels.cache
            .filter((channel) => isTextBasedGuildChannel(channel) || channel.type === ChannelType.GuildCategory)
            .map((channel) => {
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

        if (payload.aiEnabled !== undefined) normalized.aiEnabled = payload.aiEnabled;
        if (payload.aiPingUser !== undefined) normalized.aiPingUser = payload.aiPingUser;
        if (payload.aiThreshold !== undefined) normalized.aiThreshold = parseNumberSetting(payload.aiThreshold, 'AI Threshold', { min: 0, max: 100 });
        if (payload.aiAction !== undefined) normalized.aiAction = payload.aiAction;
        if (payload.aiPrompt !== undefined) normalized.aiPrompt = payload.aiPrompt;
        if (payload.aiBatchPrompt !== undefined) normalized.aiBatchPrompt = payload.aiBatchPrompt;
        if (payload.aiRules !== undefined) normalized.aiRules = payload.aiRules;

        if (payload.appealsEnabled !== undefined) normalized.appealsEnabled = payload.appealsEnabled;
        if (payload.appealsPrompt !== undefined) normalized.appealsPrompt = payload.appealsPrompt;
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

router.get('/roles', requireAuth, async (req, res) => {
    try {
        const guild = await getGuild();
        const roles = guild.roles.cache
            .filter((r) => r.name !== '@everyone')
            .map((r) => ({ value: r.id, label: r.name }))
            .sort((a, b) => a.label.localeCompare(b.label));
        res.json(roles);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch roles' });
    }
});

router.get('/channels', requireAuth, async (req, res) => {
    try {
        const scope = (req.query.scope || 'settings').toString();
        const guild = await getGuild();
        const channels = guild.channels.cache
            .filter((channel) => {
                if (scope === 'embed') {
                    return isTextBasedGuildChannel(channel);
                }
                return isTextBasedGuildChannel(channel) || channel.type === ChannelType.GuildCategory;
            })
            .map((channel) => {
                if (channel.type === ChannelType.GuildCategory && scope !== 'embed') {
                    return { value: channel.id, label: `[Category] ${channel.name}` };
                }
                return { value: channel.id, label: `#${channel.name}` };
            })
            .sort((a, b) => a.label.localeCompare(b.label));
        res.json(channels);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch channels' });
    }
});

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

module.exports = router;
