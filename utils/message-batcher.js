const { analyzeBatch } = require('./ai');
const { getAppSetting, logAction } = require('./helpers');
const db = require('../db');

class MessageBatcher {
    constructor() {
        this.queues = new Map(); // channelId -> { messages: [], timer: null }
        this.userAlertCooldowns = new Map(); // userId -> timestamp
        this.BATCH_SIZE = 5;
        this.DEBOUNCE_MS = 3000;
        this.ALERT_COOLDOWN_MS = 15000; // 15 seconds cooldown for alerts
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
        const aiBatchPrompt = getAppSetting('aiBatchPrompt'); // Use global setting
        // Use context from the first message as the "pre-batch" context
        const batchContext = messagesToProcess[0]?.context || [];

        const batchData = messagesToProcess.map(item => ({
            id: item.messageObj.id,
            author: item.messageObj.author.username,
            content: item.messageObj.content,
            // We can pass individual user settings if needed, but usually rules are global.
            // Detoxify check is per user, so we might need to run detoxify here or before batching.
            // Ideally, we run detoxify BEFORE adding to batch. If detoxify flags it, we might still want AI confirmation.
            // Or we pass detoxify scores to AI.
            detoxifyEnabled: item.userSettings.detoxifyEnabled,
            reputation: item.userSettings.reputation
        }));

        try {
            console.log(`[Batcher] sending batch of ${batchData.length} messages to AI...`);
            const results = await analyzeBatch(batchData, { 
                rules: aiRules, 
                prompt: aiBatchPrompt, 
                history: batchContext 
            });
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
        const userId = messages[0].author.id;
        
        // Use the last message for replying
        const lastMessage = messages[messages.length - 1];

        console.log(`[Batcher] Violation group for ${lastMessage.author.tag} (${messages.length} msgs):`, analysis);

        if (analysis.severity >= aiThreshold) {
            // React to all messages
            for (const msg of messages) {
                try { await msg.react('👀'); } catch (e) {}
            }

            // Check Cooldown for Reply
            const now = Date.now();
            const lastAlert = this.userAlertCooldowns.get(userId) || 0;
            
            if (now - lastAlert > this.ALERT_COOLDOWN_MS) {
                const replyContent = analysis.comment 
                    ? `⚠️ **Lusty Xeno Watch**\n> *"${analysis.comment}"*\n\n**Причина:** ${analysis.reason} (Уровень: ${analysis.severity}/100)`
                    : `⚠️ **AI Monitor Alert**\nReason: ${analysis.reason}\nSeverity: ${analysis.severity}/100`;

                // Reply ONLY to the last message
                try {
                    const reply = await lastMessage.reply({
                        content: replyContent,
                        allowedMentions: { repliedUser: true }
                    });
                    
                    // Update cooldown
                    this.userAlertCooldowns.set(userId, now);

                    // Auto-delete warning after 15 seconds to reduce clutter
                    setTimeout(() => {
                        reply.delete().catch(() => {});
                    }, 15000);

                } catch (e) {
                    console.error('Failed to reply to message:', e);
                }
            } else {
                console.log(`[Batcher] Skipping alert reply for ${lastMessage.author.tag} (cooldown active)`);
            }

            // Delete ALL messages if action is delete
            if (aiAction === 'delete') {
                for (const msg of messages) {
                    try { await msg.delete(); } catch (e) {}
                }
            }

            // Log to channel
            await logAction(
                lastMessage.guild,
                'AI Monitor Alert (Batch)',
                `AI detected a violation in <#${lastMessage.channel.id}>`,
                'Orange',
                [
                    { name: 'User', value: `<@${userId}>` },
                    { name: 'Reason', value: analysis.reason },
                    { name: 'Severity', value: `${analysis.severity}/100` },
                    { name: 'Messages Count', value: messages.length.toString() },
                    { name: 'Content Sample', value: lastMessage.content.substring(0, 1000) },
                    { name: 'Action Taken', value: aiAction === 'delete' ? 'Messages Deleted' : 'Warning Sent' }
                ]
            );
        }
    }

    // Deprecated: kept for reference or single message handling if needed
    async handleResult(message, analysis) {
        // ... implementation replaced by handleGroupViolation logic ...
    }
}

module.exports = new MessageBatcher();
