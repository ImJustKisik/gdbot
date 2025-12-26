const express = require('express');
const db = require('../../db');
const { getGuild, getAppSetting } = require('../../utils/helpers');
const { requireAuth } = require('../../utils/middleware');

const router = express.Router();

router.get('/user/:id/guilds', requireAuth, (req, res) => {
    const { id } = req.params;
    const user = db.getUser(id);
    if (!user || !user.oauth || !user.oauth.guilds) {
        return res.json([]);
    }
    res.json(user.oauth.guilds);
});

router.get('/users', requireAuth, async (req, res) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 50;
        const startIndex = (page - 1) * limit;

        const guild = await getGuild();
        if (!guild) return res.status(500).json({ error: 'Guild not found' });

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

        const allMembers = Array.from(members.values()).sort((a, b) =>
            a.user.username.localeCompare(b.user.username)
        );

        const paginatedMembers = allMembers.slice(startIndex, startIndex + limit);
        const targetIds = paginatedMembers.map((m) => m.id);
        const localUsers = db.getUsersSummary(targetIds);

        const responseData = paginatedMembers.map((member) => {
            const localUser = localUsers[member.id] || { points: 0, warningsCount: 0 };

            let status = 'Unverified';
            const roleVerifiedName = getAppSetting('roleVerified') || 'Verified';
            const roleUnverifiedName = getAppSetting('roleUnverified') || 'Unverified';

            const hasVerifiedRole = member.roles.cache.some((r) => r.name === roleVerifiedName || r.id === roleVerifiedName);
            const hasUnverifiedRole = member.roles.cache.some((r) => r.name === roleUnverifiedName || r.id === roleUnverifiedName);
            const isMuted =
                member.roles.cache.some((role) => role.name === 'Muted') ||
                member.communicationDisabledUntilTimestamp > Date.now();

            if (isMuted) {
                status = 'Muted';
            } else if (hasVerifiedRole) {
                status = localUser.hasOAuth ? 'Verified' : 'VerifiedManual';
            } else if (!hasUnverifiedRole && localUser.hasOAuth) {
                status = 'Verified';
            }

            return {
                id: member.id,
                username: member.user.username,
                avatar: member.user.displayAvatarURL(),
                points: localUser.points || 0,
                isMonitored: localUser.isMonitored || false,
                warningsCount: localUser.warningsCount || 0,
                warnings: [],
                status
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

module.exports = router;
