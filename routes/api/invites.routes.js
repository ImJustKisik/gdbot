const express = require('express');
const db = require('../../db');
const { getGuild, fetchGuildMemberSafe } = require('../../utils/helpers');
const { requireAuth } = require('../../utils/middleware');

const router = express.Router();

router.get('/invites', requireAuth, async (req, res) => {
    try {
        const guild = await getGuild();
        if (!guild) return res.status(500).json({ error: 'Guild not found' });

        const invites = await guild.invites.fetch();
        const aliases = db.getAllInviteAliases();
        const result = [];

        invites.forEach((invite) => {
            result.push({
                code: invite.code,
                uses: invite.uses,
                inviter: invite.inviter
                    ? {
                          id: invite.inviter.id,
                          username: invite.inviter.username,
                          avatar: invite.inviter.displayAvatarURL()
                      }
                    : null,
                alias: aliases[invite.code] || null,
                url: invite.url
            });
        });

        result.sort((a, b) => b.uses - a.uses);
        res.json(result);
    } catch (error) {
        console.error('Error fetching invites:', error);
        res.status(500).json({ error: 'Failed to fetch invites' });
    }
});

router.post('/invites/:code/alias', requireAuth, (req, res) => {
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

router.get('/invites/:code/joins', requireAuth, async (req, res) => {
    try {
        const { code } = req.params;
        const joins = db.getInviteJoins(code);
        const guild = await getGuild();

        const enrichedJoins = await Promise.all(
            joins.map(async (join) => {
                const member = await fetchGuildMemberSafe(guild, join.id);
                return {
                    id: join.id,
                    username: member ? member.user.username : 'Unknown User',
                    avatar: member ? member.user.displayAvatarURL() : null,
                    joinedAt: join.joined_at,
                    points: join.points
                };
            })
        );

        res.json(enrichedJoins);
    } catch (error) {
        console.error('Error fetching invite joins:', error);
        res.status(500).json({ error: 'Failed to fetch invite joins' });
    }
});

module.exports = router;
