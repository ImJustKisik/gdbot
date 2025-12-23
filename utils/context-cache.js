const { Collection } = require('discord.js');

class ContextCache {
    constructor(limit = 20, maxAgeMs = 10 * 60 * 1000) {
        this.cache = new Collection(); // channelId -> Array of messages
        this.limit = limit;
        this.maxAgeMs = maxAgeMs;
    }

    add(channelId, message) {
        if (!message.content) return; // Don't cache empty messages (e.g. only attachments if we don't handle them)

        if (!this.cache.has(channelId)) {
            this.cache.set(channelId, []);
        }
        const channelCache = this.cache.get(channelId);
        
        channelCache.push({
            id: message.id,
            author: message.author.username,
            content: message.content,
            timestamp: message.createdTimestamp
        });

        // Drop messages older than maxAgeMs
        const cutoff = Date.now() - this.maxAgeMs;
        while (channelCache.length && channelCache[0].timestamp < cutoff) {
            channelCache.shift();
        }

        if (channelCache.length > this.limit) {
            channelCache.shift();
        }
    }

    get(channelId, beforeId = null, limit = 5) {
        if (!this.cache.has(channelId)) return [];
        let messages = this.cache.get(channelId);
        
        // If beforeId is provided, we want messages BEFORE that one.
        // Since we push messages as they come, the array is sorted by time.
        if (beforeId) {
            const index = messages.findIndex(m => m.id === beforeId);
            if (index !== -1) {
                // Take messages up to that index
                messages = messages.slice(0, index);
            }
        }
        
        // Return the last 'limit' messages
        return messages.slice(-limit);
    }
}

module.exports = new ContextCache();