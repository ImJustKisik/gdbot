const { Events } = require('discord.js');
const { logAction } = require('../../utils/helpers');

module.exports = {
    name: Events.MessageUpdate,
    async execute(oldMessage, newMessage) {
        if (!oldMessage.guild || oldMessage.author?.bot) return;
        if (oldMessage.content === newMessage.content) return; // Ignore embed updates

        await logAction(
            newMessage.guild,
            'Message Edited',
            `Message edited by <@${newMessage.author.id}> in <#${newMessage.channel.id}>`,
            'Blue',
            [
                { name: 'Author', value: `<@${newMessage.author.id}>` },
                { name: 'Before', value: oldMessage.content ? oldMessage.content.substring(0, 1024) : '[No Content]' },
                { name: 'After', value: newMessage.content ? newMessage.content.substring(0, 1024) : '[No Content]' },
                { name: 'Jump to Message', value: `[Click Here](${newMessage.url})` }
            ]
        );
    },
};
