const { Events } = require('discord.js');
const axios = require('axios');
const db = require('../../db');
const { analyzeContent, DEFAULT_PROMPT, DEFAULT_RULES } = require('../../utils/ai');
const { getAppSetting } = require('../../utils/helpers');
const messageBatcher = require('../../utils/message-batcher');

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        if (message.author.bot) return;

        const user = db.getUser(message.author.id);
        
        // Check if user is under observation
        if (user && user.isMonitored) {
            // Check AI Settings
            const aiEnabled = getAppSetting('aiEnabled') !== 'false'; // Default true
            if (!aiEnabled) return;

            const aiPrompt = getAppSetting('aiPrompt') || DEFAULT_PROMPT;
            const aiRules = getAppSetting('aiRules') || DEFAULT_RULES;

            let imageBuffer = null;
            let mimeType = null;

            // Check for images
            const imageAttachment = message.attachments.find(a => a.contentType && a.contentType.startsWith('image/'));
            if (imageAttachment) {
                try {
                    console.log(`[Monitor] Downloading image: ${imageAttachment.url}`);
                    const response = await axios.get(imageAttachment.url, { responseType: 'arraybuffer' });
                    imageBuffer = Buffer.from(response.data);
                    mimeType = imageAttachment.contentType;
                } catch (e) {
                    console.error("Failed to download image", e);
                }
            }

            if (!message.content && !imageBuffer) return; // Nothing to analyze

            // Fetch recent messages for context
            let contextMessages = [];
            try {
                const messages = await message.channel.messages.fetch({ limit: 5, before: message.id });
                contextMessages = messages.map(m => ({
                    author: m.author.username,
                    content: m.content
                })).reverse();
            } catch (e) {
                console.warn("[Monitor] Failed to fetch context messages:", e.message);
            }

            // If image is present, process immediately (no batching for images yet)
            if (imageBuffer) {
                console.log(`[Monitor] Analyzing image from ${message.author.tag}`);
                try {
                    const analysis = await analyzeContent(message.content, imageBuffer, mimeType, {
                        prompt: aiPrompt,
                        rules: aiRules,
                        history: contextMessages,
                        useDetoxify: user.detoxify_enabled !== 0
                    });
                    
                    if (analysis && analysis.violation) {
                        // ... existing image handling logic ...
                        await message.react('👀');
                        const aiThreshold = Number(getAppSetting('aiThreshold')) || 60;
                        const aiAction = getAppSetting('aiAction') || 'log';

                        if (analysis.severity >= aiThreshold) {
                            const replyContent = analysis.comment 
                                ? `⚠️ **Lusty Xeno Watch**\n> *"${analysis.comment}"*\n\n**Причина:** ${analysis.reason} (Уровень: ${analysis.severity}/100)`
                                : `⚠️ **AI Monitor Alert**\nReason: ${analysis.reason}\nSeverity: ${analysis.severity}/100`;

                            await message.reply({
                                content: replyContent,
                                allowedMentions: { repliedUser: true }
                            });

                            if (aiAction === 'delete') {
                                await message.delete();
                            }
                        }
                    }
                } catch (error) {
                    console.error('Error in AI image monitoring:', error);
                }
            } else {
                // Text only -> Send to Batcher
                console.log(`[Monitor] Queuing text from ${message.author.tag} for batch analysis`);
                messageBatcher.add(message, contextMessages, {
                    detoxifyEnabled: user.detoxify_enabled !== 0,
                    aiRules: aiRules,
                    aiPrompt: aiPrompt
                });
            }
        }
    },
};
