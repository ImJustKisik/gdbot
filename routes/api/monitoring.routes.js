const express = require('express');
const db = require('../../db');
const {
    getGuild,
    fetchGuildMemberSafe,
    logAction,
    getAppSetting
} = require('../../utils/helpers');
const { requireAuth } = require('../../utils/middleware');

const router = express.Router();

router.get('/monitoring', requireAuth, async (req, res) => {
    try {
        const guild = await getGuild();
        const monitoredUsers = db.getMonitoredUsers();
        const monitoredChannels = db.getMonitoredChannels();

        const userEntries = await Promise.all(
            monitoredUsers.map(async (entry) => {
                let member = null;
                if (guild) {
                    member = guild.members.cache.get(entry.id) || (await fetchGuildMemberSafe(guild, entry.id).catch(() => null));
                }

                return {
                    id: entry.id,
                    username: member?.user?.username || 'Unknown User',
                    avatar: member?.user?.displayAvatarURL() || null,
                    detoxifyEnabled: entry.detoxifyEnabled,
                    aiPingEnabled: entry.aiPingEnabled
                };
            })
        );

        const channelEntries = monitoredChannels.map((channel) => {
            const discordChannel = guild?.channels?.cache?.get(channel.channel_id) || null;
            return {
                id: channel.channel_id,
                name: discordChannel?.name || `#${channel.channel_id}`,
                detoxifyEnabled: channel.detoxify_enabled !== 0,
                aiPingEnabled: channel.ai_ping_enabled !== 0
            };
        });

        const quickSettings = {
            aiEnabled: getAppSetting('aiEnabled') !== false,
            aiAction: getAppSetting('aiAction') || 'log',
            aiThreshold: Number(getAppSetting('aiThreshold') || 60)
        };

        res.json({ users: userEntries, channels: channelEntries, settings: quickSettings });
    } catch (error) {
        console.error('Failed to fetch monitoring data:', error);
        res.status(500).json({ error: 'Failed to fetch monitoring data' });
    }
});

router.post('/monitoring/users/:id', requireAuth, async (req, res) => {
    const { id } = req.params;
    const { isMonitored, detoxifyEnabled, aiPingEnabled } = req.body || {};

    if (typeof isMonitored !== 'boolean') {
        return res.status(400).json({ error: 'isMonitored must be provided as boolean' });
    }

    try {
        db.setMonitored(id, isMonitored, typeof aiPingEnabled === 'boolean' ? aiPingEnabled : true);
        if (typeof detoxifyEnabled === 'boolean') {
            db.setDetoxifyEnabled(id, detoxifyEnabled);
        }

        const guild = await getGuild();
        if (guild) {
            await logAction(
                guild,
                'AI Monitor Update',
                `${isMonitored ? 'Enabled' : 'Disabled'} monitoring for <@${id}> via dashboard`,
                isMonitored ? 'Blue' : 'Orange'
            );
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Failed to update monitored user:', error);
        res.status(500).json({ error: 'Failed to update monitored user' });
    }
});

router.post('/monitoring/channels/:id', requireAuth, async (req, res) => {
    const { id } = req.params;
    const { enabled, detoxifyEnabled, aiPingEnabled } = req.body || {};

    if (typeof enabled !== 'boolean') {
        return res.status(400).json({ error: 'enabled must be provided as boolean' });
    }

    try {
        db.setChannelMonitored(
            id,
            enabled,
            typeof detoxifyEnabled === 'boolean' ? detoxifyEnabled : true,
            typeof aiPingEnabled === 'boolean' ? aiPingEnabled : true
        );

        const guild = await getGuild();
        if (guild) {
            const channelName = guild.channels.cache.get(id)?.name || id;
            await logAction(
                guild,
                'AI Channel Monitor Update',
                `${enabled ? 'Enabled' : 'Disabled'} monitoring for #${channelName}`,
                enabled ? 'Blue' : 'Orange'
            );
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Failed to update monitored channel:', error);
        res.status(500).json({ error: 'Failed to update monitored channel' });
    }
});

module.exports = router;
