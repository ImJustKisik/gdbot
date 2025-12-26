const express = require('express');
const router = express.Router();
const client = require('../../bot/client');
const { GUILD_ID } = require('../../utils/config');
const { requireAuth } = require('../../utils/middleware');
const { ChannelType } = require('discord.js');

// Get Guild Info & Channels
router.get('/discord/guild', requireAuth, async (req, res) => {
    try {
        const guild = client.guilds.cache.get(GUILD_ID);
        if (!guild) return res.status(404).json({ error: 'Guild not found' });

        // Fetch channels if not in cache (though they should be)
        if (guild.channels.cache.size === 0) {
            await guild.channels.fetch();
        }

        const channels = guild.channels.cache
            .map(c => ({
                id: c.id,
                name: c.name,
                type: c.type,
                parentId: c.parentId,
                position: c.position
            }))
            .sort((a, b) => a.position - b.position);

        res.json({
            id: guild.id,
            name: guild.name,
            icon: guild.iconURL(),
            memberCount: guild.memberCount,
            channels
        });
    } catch (error) {
        console.error('Error fetching guild info:', error);
        res.status(500).json({ error: 'Failed to fetch guild info' });
    }
});

// Get Messages
router.get('/discord/channels/:channelId/messages', requireAuth, async (req, res) => {
    try {
        const { channelId } = req.params;
        const limit = parseInt(req.query.limit) || 50;
        const before = req.query.before;
        
        const channel = client.channels.cache.get(channelId);
        if (!channel) return res.status(404).json({ error: 'Channel not found' });
        
        // Check if channel is text-based
        if (!channel.isTextBased()) return res.status(400).json({ error: 'Not a text channel' });

        const options = { limit };
        if (before) options.before = before;

        const messages = await channel.messages.fetch(options);
        
        const formattedMessages = messages.map(m => ({
            id: m.id,
            content: m.content,
            author: {
                id: m.author.id,
                username: m.author.username,
                avatar: m.author.displayAvatarURL(),
                bot: m.author.bot,
                color: m.member?.displayHexColor || '#ffffff'
            },
            timestamp: m.createdTimestamp,
            embeds: m.embeds,
            attachments: m.attachments.map(a => ({
                url: a.url,
                name: a.name,
                contentType: a.contentType
            })),
            reactions: m.reactions.cache.map(r => ({
                emoji: r.emoji.name,
                count: r.count
            }))
        }));

        // Return reversed (oldest first) for chat UI, unless pagination is involved
        // Usually chat UIs want oldest at top, newest at bottom. 
        // Discord API returns newest first.
        res.json(Array.from(formattedMessages).reverse()); 
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

module.exports = router;
