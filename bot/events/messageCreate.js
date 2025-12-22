const { Events } = require('discord.js');
const axios = require('axios');
const db = require('../../db');
const { analyzeContent, DEFAULT_PROMPT, DEFAULT_RULES } = require('../../utils/ai');
const { getAppSetting, logAction } = require('../../utils/helpers');
const messageBatcher = require('../../utils/message-batcher');
const contextCache = require('../../utils/context-cache');

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        if (message.author.bot) return;

        // Update Context Cache immediately
        contextCache.add(message.channel.id, message);

        const user = db.getUser(message.author.id);
        const channelMonitored = db.isChannelMonitored(message.channel.id);
        
        // Check if user OR channel is under observation
        if ((user && user.isMonitored) || channelMonitored) {
            // Check AI Settings
            const aiEnabled = getAppSetting('aiEnabled') !== 'false'; // Default true
            if (!aiEnabled) return;

            const aiPrompt = getAppSetting('aiPrompt') || DEFAULT_PROMPT;
            const aiRules = getAppSetting('aiRules') || DEFAULT_RULES;

            // Determine detoxify setting (User setting overrides channel setting if both present? Or OR logic? Let's use OR logic for safety, or prefer user setting if specific)
            // Actually, if channel is monitored, we should probably use channel settings or default.
            // Let's say: if user is monitored, use user.detoxify_enabled. If not, but channel is, use channel.detoxify_enabled.
            let useDetoxify = true;
            if (user && user.isMonitored) {
                useDetoxify = user.detoxify_enabled !== 0;
            } else if (channelMonitored) {
                useDetoxify = channelMonitored.detoxify_enabled !== 0;
            }

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

            // Get recent messages from Cache
            const contextMessages = contextCache.get(message.channel.id, message.id, 5);

            // Prepare Reputation Info
            const reputation = {
                points: user.points || 0,
                warningsCount: Array.isArray(user.warnings) ? user.warnings.length : 0
            };

            // If image is present, process immediately (no batching for images yet)
            if (imageBuffer) {
                console.log(`[Monitor] Analyzing image from ${message.author.tag}`);
                try {
                    const analysis = await analyzeContent(message.content, imageBuffer, mimeType, {
                        prompt: aiPrompt,
                        rules: aiRules,
                        history: contextMessages,
                        useDetoxify: useDetoxify,
                        reputation: reputation
                    });
                    
                    console.log(`[Monitor] Image analysis result for ${message.author.tag}:`, JSON.stringify(analysis));

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

                            await logAction(
                                message.guild,
                                'AI Monitor Alert',
                                `AI detected a violation in <#${message.channel.id}>`,
                                'Orange',
                                [
                                    { name: 'User', value: `<@${message.author.id}>` },
                                    { name: 'Reason', value: analysis.reason },
                                    { name: 'Severity', value: `${analysis.severity}/100` },
                                    { name: 'Content', value: message.content || '[Image]' },
                                    { name: 'Action Taken', value: aiAction === 'delete' ? 'Message Deleted' : 'Warning Sent' }
                                ]
                            );
                        }
                    }
                } catch (error) {
                    console.error('Error in AI image monitoring:', error);
                }
            } else {
                // Text only -> Send to Batcher
                console.log(`[Monitor] Queuing text from ${message.author.tag} for batch analysis`);
                messageBatcher.add(message, contextMessages, {
                    detoxifyEnabled: useDetoxify,
                    aiRules: aiRules,
                    aiPrompt: aiPrompt,
                    reputation: reputation
                });
            }
        }
    },
};
