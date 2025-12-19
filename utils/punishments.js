const { EmbedBuilder } = require('discord.js');
const db = require('../db');
const { logAction } = require('./helpers');

/**
 * Processes a punishment for a user: adds warning, logs it, DMs user, and checks for auto-punishments.
 * @param {import('discord.js').Guild} guild - The Discord Guild
 * @param {import('discord.js').GuildMember} member - The target Guild Member
 * @param {number} pointsAdded - Points to add
 * @param {string} reason - Reason for warning
 * @param {import('discord.js').User|string} moderator - The moderator (User object or string tag)
 * @returns {Promise<{success: boolean, autoPunish: string|null}>}
 */
async function processPunishment(guild, member, pointsAdded, reason, moderator) {
    try {
        const moderatorTag = typeof moderator === 'string' ? moderator : moderator.tag;
        
        // 1. Add Warning to DB
        const warning = {
            reason,
            points: pointsAdded,
            date: new Date().toISOString(),
            moderator: moderatorTag
        };
        
        db.addWarning(member.id, warning);
        const user = db.getUser(member.id); // Get updated user with new total points

        // 2. Log the Warning
        await logAction(guild, 'User Warned', `User ${member} was warned by ${moderatorTag}`, 'Orange', [
            { name: 'Reason', value: reason },
            { name: 'Points', value: `+${pointsAdded} (Total: ${user.points})` }
        ]);

        // 3. DM the User
        try {
            const embed = new EmbedBuilder()
                .setTitle('You have been warned')
                .setColor('Orange')
                .addFields(
                    { name: 'Reason', value: reason },
                    { name: 'Points Added', value: pointsAdded.toString() },
                    { name: 'Total Points', value: user.points.toString() }
                );
            await member.send({ embeds: [embed] });
        } catch (e) {
            // Ignore DM failures
        }

        // 4. Check Escalations (Auto-Punish)
        const autoPunishResult = await checkEscalations(guild, member, user.points);
        
        return { success: true, autoPunish: autoPunishResult };

    } catch (error) {
        console.error('Error processing punishment:', error);
        return { success: false, error };
    }
}

/**
 * Checks and applies auto-punishments based on total points.
 * @param {import('discord.js').Guild} guild 
 * @param {import('discord.js').GuildMember} member 
 * @param {number} totalPoints 
 */
async function checkEscalations(guild, member, totalPoints) {
    const escalations = db.getEscalations();
    // Find the highest threshold rule that the user exceeds
    const activeRule = escalations
        .sort((a, b) => b.threshold - a.threshold)
        .find(rule => totalPoints >= rule.threshold);

    if (!activeRule) return null;

    // Check if bot can moderate
    if (!member.moderatable) return 'Failed: Bot lacks permissions';

    try {
        let actionDescription = '';
        
        if (activeRule.action === 'mute') {
            const duration = activeRule.duration || 60;
            // Check if already timed out to avoid spamming API? 
            // Discord API handles it, but we might want to avoid re-logging if active.
            // For now, just apply it.
            await member.timeout(duration * 60 * 1000, `Auto-punish: Reached ${activeRule.threshold} points`);
            actionDescription = `Muted for ${duration} minutes`;
        } else if (activeRule.action === 'kick') {
            await member.kick(`Auto-punish: Reached ${activeRule.threshold} points`);
            actionDescription = 'Kicked';
        } else if (activeRule.action === 'ban') {
            await member.ban({ reason: `Auto-punish: Reached ${activeRule.threshold} points` });
            actionDescription = 'Banned';
        }

        if (actionDescription) {
             await logAction(guild, 'Auto-Punishment Triggered', `User ${member} reached ${activeRule.threshold} points.`, 'Red', [
                { name: 'Action', value: actionDescription },
                { name: 'Rule', value: activeRule.name || 'Threshold Rule' }
            ]);
            
            // Notify user about the escalation
             try {
                await member.send(`**Auto-Punishment Triggered:** You have been ${actionDescription.toLowerCase()} for reaching ${totalPoints} points.`);
            } catch (e) {}
            
            return actionDescription;
        }

    } catch (error) {
        console.error(`Failed to execute auto-punishment for ${member.user.tag}:`, error);
        await logAction(guild, 'Auto-Punishment Failed', `Failed to apply ${activeRule.action} to ${member}. Check bot permissions.`, 'Red');
        return 'Failed: Error executing action';
    }
    return null;
}

module.exports = { processPunishment };
