const { Events } = require('discord.js');
const axios = require('axios');
const db = require('../../db');
const { analyzeContent, DEFAULT_PROMPT, DEFAULT_RULES } = require('../../utils/ai');
const { getAppSetting } = require('../../utils/helpers');

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

            const aiThreshold = Number(getAppSetting('aiThreshold')) || 60;
            const aiAction = getAppSetting('aiAction') || 'log'; // log, warn, mute, delete
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

            console.log(`[Monitor] Analyzing content from ${message.author.tag}. Text: "${message.content}", Image: ${!!imageBuffer}`);
            
            try {
                const analysis = await analyzeContent(message.content, imageBuffer, mimeType, {
                    prompt: aiPrompt,
                    rules: aiRules
                });
                console.log(`[Monitor] AI Result:`, analysis);
                
                if (analysis && analysis.violation) {
                    // React to the message to show it's being processed/flagged
                    await message.react('👀');

                    if (analysis.severity >= aiThreshold) {
                        const replyContent = analysis.comment 
                            ? `⚠️ **Lusty Xeno Watch**\n> *"${analysis.comment}"*\n\n**Причина:** ${analysis.reason} (Уровень: ${analysis.severity}/100)`
                            : `⚠️ **AI Monitor Alert**\nReason: ${analysis.reason}\nSeverity: ${analysis.severity}/100`;

                        await message.reply({
                            content: replyContent,
                            allowedMentions: { repliedUser: true }
                        });

                        // TODO: Implement actions (delete, mute) based on aiAction
                        if (aiAction === 'delete') {
                            try {
                                await message.delete();
                            } catch (e) {
                                console.error('Failed to delete message:', e);
                            }
                        }
                    }
                }
            } catch (error) {
                console.error('Error in AI monitoring:', error);
            }
        }
    },
};
