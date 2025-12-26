const express = require('express');
const { EmbedBuilder } = require('discord.js');
const { getGuild, isTextBasedGuildChannel } = require('../../utils/helpers');
const { requireAuth } = require('../../utils/middleware');

const router = express.Router();

router.get('/embeds/channels', requireAuth, async (req, res) => {
    try {
        const guild = await getGuild();
        if (!guild) return res.status(500).json({ error: 'Guild not found' });

        if (guild.channels.cache.size === 0) {
            try {
                await guild.channels.fetch();
            } catch (e) {
                console.error('Failed to fetch channels:', e);
            }
        }

        const channels = guild.channels.cache
            .filter((channel) => isTextBasedGuildChannel(channel))
            .map((channel) => ({ value: channel.id, label: `#${channel.name}` }))
            .sort((a, b) => a.label.localeCompare(b.label));

        res.json(channels);
    } catch (error) {
        console.error('Error fetching embed channels:', error);
        res.status(500).json({ error: 'Failed to fetch channels' });
    }
});

router.post('/embeds/send', requireAuth, async (req, res) => {
    try {
        const { channelId, content, embed } = req.body;
        const guild = await getGuild();
        if (!guild) return res.status(500).json({ error: 'Guild not found' });

        const channel = guild.channels.cache.get(channelId);
        if (!channel) return res.status(404).json({ error: 'Channel not found' });

        const messagePayload = {};
        if (content) messagePayload.content = content;

        if (embed && (embed.title || embed.description || embed.fields?.length > 0 || embed.image)) {
            const embedBuilder = new EmbedBuilder();
            if (embed.title) embedBuilder.setTitle(embed.title);
            if (embed.description) embedBuilder.setDescription(embed.description);
            if (embed.color) embedBuilder.setColor(embed.color);
            if (embed.url) embedBuilder.setURL(embed.url);
            if (embed.image) embedBuilder.setImage(embed.image);
            if (embed.thumbnail) embedBuilder.setThumbnail(embed.thumbnail);
            if (embed.footer?.text) embedBuilder.setFooter({ text: embed.footer.text, iconURL: embed.footer.icon_url });
            if (embed.author?.name) embedBuilder.setAuthor({ name: embed.author.name, iconURL: embed.author.icon_url, url: embed.author.url });

            if (embed.fields && Array.isArray(embed.fields)) {
                embed.fields.forEach((f) => {
                    if (f.name && f.value) embedBuilder.addFields({ name: f.name, value: f.value, inline: !!f.inline });
                });
            }
            messagePayload.embeds = [embedBuilder];
        }

        await channel.send(messagePayload);
        res.json({ success: true });
    } catch (error) {
        console.error('Error sending embed:', error);
        res.status(500).json({ error: 'Failed to send embed: ' + error.message });
    }
});

router.get('/embeds/fetch', requireAuth, async (req, res) => {
    try {
        const { channelId, messageId } = req.query;
        if (!channelId || !messageId) return res.status(400).json({ error: 'Missing channelId or messageId' });

        const guild = await getGuild();
        if (!guild) return res.status(500).json({ error: 'Guild not found' });

        const channel = guild.channels.cache.get(channelId);
        if (!channel) return res.status(404).json({ error: 'Channel not found' });

        try {
            const message = await channel.messages.fetch(messageId);
            res.json(message);
        } catch (e) {
            return res.status(404).json({ error: 'Message not found' });
        }
    } catch (error) {
        console.error('Error fetching message:', error);
        res.status(500).json({ error: 'Failed to fetch message' });
    }
});

router.post('/embeds/edit', requireAuth, async (req, res) => {
    try {
        const { channelId, messageId, content, embed } = req.body;
        const guild = await getGuild();
        if (!guild) return res.status(500).json({ error: 'Guild not found' });

        const channel = guild.channels.cache.get(channelId);
        if (!channel) return res.status(404).json({ error: 'Channel not found' });

        let message;
        try {
            message = await channel.messages.fetch(messageId);
        } catch (e) {
            return res.status(404).json({ error: 'Message not found' });
        }

        if (message.author.id !== guild.client.user.id) {
            return res.status(403).json({ error: 'Cannot edit messages sent by other users' });
        }

        const messagePayload = {};
        messagePayload.content = content || null;

        if (embed && (embed.title || embed.description || embed.fields?.length > 0 || embed.image)) {
            const embedBuilder = new EmbedBuilder();
            if (embed.title) embedBuilder.setTitle(embed.title);
            if (embed.description) embedBuilder.setDescription(embed.description);
            if (embed.color) embedBuilder.setColor(embed.color);
            if (embed.url) embedBuilder.setURL(embed.url);
            if (embed.image) embedBuilder.setImage(embed.image);
            if (embed.thumbnail) embedBuilder.setThumbnail(embed.thumbnail);
            if (embed.footer?.text) embedBuilder.setFooter({ text: embed.footer.text, iconURL: embed.footer.icon_url });
            if (embed.author?.name) embedBuilder.setAuthor({ name: embed.author.name, iconURL: embed.author.icon_url, url: embed.author.url });

            if (embed.fields && Array.isArray(embed.fields)) {
                embed.fields.forEach((f) => {
                    if (f.name && f.value) embedBuilder.addFields({ name: f.name, value: f.value, inline: !!f.inline });
                });
            }
            messagePayload.embeds = [embedBuilder];
        } else {
            messagePayload.embeds = [];
        }

        await message.edit(messagePayload);
        res.json({ success: true });
    } catch (error) {
        console.error('Error editing embed:', error);
        res.status(500).json({ error: 'Failed to edit embed: ' + error.message });
    }
});

module.exports = router;
