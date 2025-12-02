const { ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const { getConfiguredRole, sendVerificationDM, getAppSetting } = require('../../utils/helpers');
const { GUILD_ID, VERIFICATION_CHANNEL_NAME } = require('../../utils/config');

async function handleGuildMemberAdd(member) {
    if (member.guild.id !== GUILD_ID) return;

    console.log(`New member joined: ${member.user.tag}`);

    // Add Unverified Role
    const roleUnverified = getConfiguredRole(member.guild, 'roleUnverified');
    if (roleUnverified) {
        await member.roles.add(roleUnverified);
    } else {
        console.warn('Role for roleUnverified not found.');
    }

    // Send DM
    const sent = await sendVerificationDM(member);

    if (!sent) {
        // Send to channel if DM failed
        const channelId = getAppSetting('verificationChannelId');
        let channel = null;
        if (channelId) channel = member.guild.channels.cache.get(channelId);
        if (!channel) channel = member.guild.channels.cache.find(c => c.name === VERIFICATION_CHANNEL_NAME) || member.guild.systemChannel;
        
        if (channel) {
            const retryButton = new ButtonBuilder()
                .setCustomId('verify_retry')
                .setLabel('Resend Verification Code')
                .setStyle(ButtonStyle.Primary);

            const row = new ActionRowBuilder().addComponents(retryButton);

            await channel.send({
                content: `${member}, I couldn't send you a DM. Please open your DMs and click the button below to verify.`,
                components: [row]
            });
        }
    }
}

module.exports = handleGuildMemberAdd;
