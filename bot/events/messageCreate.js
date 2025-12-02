const { Events } = require('discord.js');
const db = require('../../db');
const { analyzeText } = require('../../utils/ai');

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        if (message.author.bot) return;

        const user = db.getUser(message.author.id);
        
        // DEBUG LOGGING - Force enable to see if event fires
        console.log(`[Monitor Debug] Msg from ${message.author.tag}. Monitored: ${user?.isMonitored}`);

        // Check if user is under observation
        if (user && user.isMonitored) {
            console.log(`[Monitor] Analyzing message from ${message.author.tag}: "${message.content}"`);
            try {
                const analysis = await analyzeText(message.content);
                console.log(`[Monitor] AI Result:`, analysis);
                
                if (analysis && analysis.violation) {
                    // React to the message to show it's being processed/flagged
                    await message.react('👀');

                    if (analysis.severity >= 5) {
                        await message.reply({
                            content: `⚠️ **AI Monitor Alert**\nReason: ${analysis.reason}\nSeverity: ${analysis.severity}/10`,
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
