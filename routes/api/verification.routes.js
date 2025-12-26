const express = require('express');
const { getGuild, fetchGuildMemberSafe, sendVerificationDM } = require('../../utils/helpers');
const { requireAuth } = require('../../utils/middleware');

const router = express.Router();

router.post('/verify/send-dm', requireAuth, async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'Missing userId' });

    try {
        const guild = await getGuild();
        const member = await fetchGuildMemberSafe(guild, userId);

        if (!member) return res.status(404).json({ error: 'User not found in guild' });

        const sent = await sendVerificationDM(member);
        if (sent) {
            res.json({ success: true });
        } else {
            res.status(500).json({ error: 'Failed to send DM (User might have DMs disabled)' });
        }
    } catch (error) {
        console.error('Error sending verification DM:', error);
        res.status(500).json({ error: 'Failed to send verification DM' });
    }
});

module.exports = router;
