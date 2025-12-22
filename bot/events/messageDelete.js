const { Events, AuditLogEvent } = require('discord.js');
const { logAction } = require('../../utils/helpers');

module.exports = {
    name: Events.MessageDelete,
    async execute(message) {
        if (!message.guild || message.author?.bot) return;

        // Try to fetch audit logs to see who deleted the message
        let executor = null;
        try {
            const fetchedLogs = await message.guild.fetchAuditLogs({
                limit: 1,
                type: AuditLogEvent.MessageDelete,
            });
            const deletionLog = fetchedLogs.entries.first();

            // Check if the log is relevant (created recently and targets the message author)
            // Note: Discord doesn't give us the exact message ID in audit logs, so this is a best guess
            if (deletionLog && deletionLog.target.id === message.author.id && deletionLog.createdTimestamp > (Date.now() - 5000)) {
                executor = deletionLog.executor;
            }
        } catch (e) {
            // Ignore audit log errors
        }

        const content = message.content || '[No Content / Image]';
        const attachments = message.attachments.size > 0 ? message.attachments.map(a => a.url).join('\n') : null;

        await logAction(
            message.guild,
            'Message Deleted',
            `Message sent by <@${message.author.id}> was deleted in <#${message.channel.id}>`,
            'Red',
            [
                { name: 'Author', value: `<@${message.author.id}>` },
                { name: 'Deleted By', value: executor ? `<@${executor.id}>` : 'Unknown (Self or Bot)' },
                { name: 'Content', value: content.substring(0, 1024) },
                ...(attachments ? [{ name: 'Attachments', value: attachments }] : [])
            ]
        );
    },
};
