const { Events } = require('discord.js');
const axios = require('axios');
const db = require('../../db');
const { analyzeContent } = require('../../utils/ai');

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        if (message.author.bot) return;

        const user = db.getUser(message.author.id);
        
        // DEBUG LOGGING - Force enable to see if event fires
        console.log(`[Monitor Debug] Msg from ${message.author.tag}. Monitored: ${user?.isMonitored}`);

        // Check if user is under observation
        if (user && user.isMonitored) {
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
                const analysis = await analyzeContent(message.content, imageBuffer, mimeType);
                console.log(`[Monitor] AI Result:`, analysis);
                
                if (analysis && analysis.violation) {
                    // React to the message to show it's being processed/flagged
                    await message.react('👀');

                    if (analysis.severity >= 60) {
                        const replyContent = analysis.comment 
                            ? `⚠️ **Lusty Xeno Watch**\n> *"${analysis.comment}"*\n\n**Причина:** ${analysis.reason} (Уровень: ${analysis.severity}/100)`
                            : `⚠️ **AI Monitor Alert**\nReason: ${analysis.reason}\nSeverity: ${analysis.severity}/100`;

                        await message.reply({
                            content: replyContent,
                            allowedMentions: { repliedUser: true }
                        });
                    }
                }
            } catch (error) {
                console.error('Error in AI monitoring:', error);
            }
        }
    },
};
