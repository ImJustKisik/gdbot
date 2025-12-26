const express = require('express');
const db = require('../../db');
const { getGuild, fetchGuildMemberSafe } = require('../../utils/helpers');
const { requireAuth } = require('../../utils/middleware');

const router = express.Router();

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

router.get('/stats/ai/usage', requireAuth, (req, res) => {
    try {
        const days = parseInt(req.query.days, 10);
        const summary = db.getAiUsageSummary(Number.isFinite(days) ? days : 30);
        res.json(summary);
    } catch (error) {
        console.error('Failed to fetch AI usage stats:', error);
        res.status(500).json({ error: 'Failed to fetch AI usage stats' });
    }
});

router.get('/stats/invites', requireAuth, async (req, res) => {
    try {
        const stats = db.getInvitesStats();
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

module.exports = router;
