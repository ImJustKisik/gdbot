const { Events } = require('discord.js');
const db = require('../../db');
const { analyzeText } = require('../../utils/ai');

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        if (message.author.bot) return;

        const user = db.getUser(message.author.id);
        
        // Check if user is under observation
        if (user && user.isMonitored) {
            try {
                const analysis = await analyzeText(message.content);
                
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
