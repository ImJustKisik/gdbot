const express = require('express');
const { EmbedBuilder } = require('discord.js');
const db = require('../../db');
const {
    getGuild,
    fetchGuildMemberSafe,
    logAction,
    getAppSetting
} = require('../../utils/helpers');
const { DEFAULT_SETTINGS } = require('../../utils/config');
const { requireAuth } = require('../../utils/middleware');

const router = express.Router();

router.post('/warn', requireAuth, async (req, res) => {
    const { userId, reason, points, anonymous } = req.body;
    if (!userId || !reason || !points) return res.status(400).json({ error: 'Missing fields' });

    try {
        const guild = await getGuild();
        const member = await fetchGuildMemberSafe(guild, userId);

        if (!member) return res.status(404).json({ error: 'User not found in guild' });

        const moderatorName = anonymous ? 'Dashboard' : req.session.user?.username || 'Dashboard Admin';

        db.addWarning(userId, {
            reason,
            points: parseInt(points, 10),
            moderator: moderatorName,
            date: new Date().toISOString()
        });

        const user = db.getUser(userId);
        const autoMuteThreshold = getAppSetting('autoMuteThreshold') || DEFAULT_SETTINGS.autoMuteThreshold;
        if (user.points >= autoMuteThreshold && member.moderatable) {
            const duration = getAppSetting('autoMuteDuration') || DEFAULT_SETTINGS.autoMuteDuration;
            await member.timeout(duration * 60 * 1000, 'Auto-mute: Exceeded points threshold');
            await logAction(guild, 'Auto-Mute', `User <@${userId}> muted for ${duration}m (Points: ${user.points})`, 'Red');
        }

        await logAction(guild, 'Warn (Dashboard)', `User <@${userId}> warned by ${moderatorName}. Reason: ${reason}`, 'Orange');

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

        const moderatorName = anonymous ? 'Dashboard' : req.session.user?.username || 'Dashboard Admin';
        await logAction(guild, 'Clear (Dashboard)', `User <@${userId}> points cleared by ${moderatorName}`, 'Green');

        res.json({ success: true });
    } catch (error) {
        console.error('Clear error:', error);
        res.status(500).json({ error: 'Failed to clear user' });
    }
});

module.exports = router;
