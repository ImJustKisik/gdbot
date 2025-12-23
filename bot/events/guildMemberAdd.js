const { ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const { getConfiguredRole, sendVerificationDM, getAppSetting } = require('../../utils/helpers');
const { VERIFICATION_CHANNEL_NAME } = require('../../utils/config');
const db = require('../../db');

// Profile Guard Check
async function checkProfile(member) {
    try {
        const accountAge = Date.now() - member.user.createdTimestamp;
        const days = accountAge / (1000 * 60 * 60 * 24);
        
        if (days < 3) { // Flag accounts newer than 3 days
            console.log(`[Profile Guard] Suspicious user ${member.user.tag}: Account age ${days.toFixed(1)} days.`);
        }
    } catch (e) {
        console.error('Profile Guard Check Failed:', e);
    }
}

async function handleGuildMemberAdd(member) {
    console.log(`New member joined: ${member.user.tag} in guild: ${member.guild.name}`);

    // Run Profile Guard
    try {
        await checkProfile(member);
    } catch (e) {
        console.error('Profile Guard Error:', e);
    }

    // --- Invite Tracking ---
    try {
        const newInvites = await member.guild.invites.fetch();
        const oldInvites = member.client.invites;
        
        const invite = newInvites.find(i => i.uses > (oldInvites.get(i.code) || 0));
        
        if (invite) {
            console.log(`User ${member.user.tag} joined using invite ${invite.code} from ${invite.inviter?.tag}`);
            db.saveUserInvite(member.id, invite.inviter?.id, invite.code, invite.uses);
        } else {
            console.log(`User ${member.user.tag} joined, but no invite increment detected (possibly vanity URL or unknown).`);
            db.saveUserInvite(member.id, null, 'unknown', 0);
        }

        // Update cache
        member.client.invites = new Map(); // Reset and refill to be safe or just update
        newInvites.each(i => member.client.invites.set(i.code, i.uses));
        
    } catch (err) {
        console.error('Error tracking invite:', err);
    }

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
