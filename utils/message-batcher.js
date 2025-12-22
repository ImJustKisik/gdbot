const { analyzeBatch } = require('./ai');
const { getAppSetting } = require('./helpers');
const db = require('../db');

class MessageBatcher {
    constructor() {
        this.queues = new Map(); // channelId -> { messages: [], timer: null }
        this.BATCH_SIZE = 5;
        this.DEBOUNCE_MS = 3000;
    }

    add(message, contextMessages, userSettings) {
        const channelId = message.channel.id;

        if (!this.queues.has(channelId)) {
            this.queues.set(channelId, { messages: [], timer: null });
        }

        const queue = this.queues.get(channelId);

        // Add message to queue
        queue.messages.push({
            messageObj: message, // Discord.js Message object
            context: contextMessages,
            userSettings: userSettings,
            timestamp: Date.now()
        });

        // Clear existing timer
        if (queue.timer) {
            clearTimeout(queue.timer);
        }

        // Check if batch is full
        if (queue.messages.length >= this.BATCH_SIZE) {
            this.processBatch(channelId);
        } else {
            // Set new timer
            queue.timer = setTimeout(() => {
                this.processBatch(channelId);
            }, this.DEBOUNCE_MS);
        }
    }

    async processBatch(channelId) {
        const queue = this.queues.get(channelId);
        if (!queue || queue.messages.length === 0) return;

        const messagesToProcess = [...queue.messages];
        // Reset queue immediately
        queue.messages = [];
        queue.timer = null;

        console.log(`[Batcher] Processing ${messagesToProcess.length} messages for channel ${channelId}`);

        // Prepare data for AI
        // We only batch text messages. Images should probably be handled separately or mixed in carefully.
        // For simplicity, let's filter out messages with images for separate processing or handle them here if analyzeBatch supports it.
        // Current analyzeBatch (to be implemented) will handle text.

        // Extract rules from the first message (assuming global rules for the batch)
        const aiRules = messagesToProcess[0]?.userSettings?.aiRules;
        const aiPrompt = messagesToProcess[0]?.userSettings?.aiPrompt;

        const batchData = messagesToProcess.map(item => ({
            id: item.messageObj.id,
            author: item.messageObj.author.username,
            content: item.messageObj.content,
            // We can pass individual user settings if needed, but usually rules are global.
            // Detoxify check is per user, so we might need to run detoxify here or before batching.
            // Ideally, we run detoxify BEFORE adding to batch. If detoxify flags it, we might still want AI confirmation.
            // Or we pass detoxify scores to AI.
            detoxifyEnabled: item.userSettings.detoxifyEnabled
        }));

        try {
            console.log(`[Batcher] sending batch of ${batchData.length} messages to AI...`);
            const results = await analyzeBatch(batchData, { rules: aiRules, prompt: aiPrompt });
            console.log(`[Batcher] AI Response keys:`, Object.keys(results));
            
            // Group violations by user
            const userViolations = new Map(); // userId -> { messages: [], highestSeverity: 0, bestAnalysis: null }

            for (const item of messagesToProcess) {
                const result = results[item.messageObj.id];
                if (result && result.violation) {
                    const userId = item.messageObj.author.id;
                    if (!userViolations.has(userId)) {
                        userViolations.set(userId, { 
                            messages: [], 
                            highestSeverity: 0, 
                            bestAnalysis: null 
                        });
                    }
                    
                    const userData = userViolations.get(userId);
                    userData.messages.push(item.messageObj);
                    
                    // Keep the analysis with the highest severity
                    if (result.severity >= userData.highestSeverity) {
                        userData.highestSeverity = result.severity;
                        userData.bestAnalysis = result;
                    }
                }
            }

            // Handle violations per user
            for (const [userId, data] of userViolations) {
                await this.handleGroupViolation(data.messages, data.bestAnalysis);
            }

        } catch (error) {
            console.error(`[Batcher] Error processing batch for channel ${channelId}:`, error);
        }
    }

    async handleGroupViolation(messages, analysis) {
        if (!messages.length || !analysis) return;

        const aiThreshold = Number(getAppSetting('aiThreshold')) || 60;
        const aiAction = getAppSetting('aiAction') || 'log';
        
        // Use the last message for replying
        const lastMessage = messages[messages.length - 1];

        console.log(`[Batcher] Violation group for ${lastMessage.author.tag} (${messages.length} msgs):`, analysis);

        if (analysis.severity >= aiThreshold) {
            // React to all messages
            for (const msg of messages) {
                try { await msg.react('👀'); } catch (e) {}
            }

            const replyContent = analysis.comment 
                ? `⚠️ **Lusty Xeno Watch**\n> *"${analysis.comment}"*\n\n**Причина:** ${analysis.reason} (Уровень: ${analysis.severity}/100)`
                : `⚠️ **AI Monitor Alert**\nReason: ${analysis.reason}\nSeverity: ${analysis.severity}/100`;

            // Reply ONLY to the last message
            try {
                await lastMessage.reply({
                    content: replyContent,
                    allowedMentions: { repliedUser: true }
                });
            } catch (e) {
                console.error('Failed to reply to message:', e);
            }

            // Delete ALL messages if action is delete
            if (aiAction === 'delete') {
                for (const msg of messages) {
                    try { await msg.delete(); } catch (e) {}
                }
            }
        }
    }

    // Deprecated: kept for reference or single message handling if needed
    async handleResult(message, analysis) {
        // ... implementation replaced by handleGroupViolation logic ...
    }
}

module.exports = new MessageBatcher();
