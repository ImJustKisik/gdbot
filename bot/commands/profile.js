const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage, registerFont } = require('canvas');
const db = require('../../db');
const { getAppSetting } = require('../../utils/helpers');
const path = require('path');

// Helper to wrap text
function wrapText(ctx, text, maxWidth) {
    const words = text.split(' ');
    let lines = [];
    let currentLine = words[0];

    for (let i = 1; i < words.length; i++) {
        const word = words[i];
        const width = ctx.measureText(currentLine + " " + word).width;
        if (width < maxWidth) {
            currentLine += " " + word;
        } else {
            lines.push(currentLine);
            currentLine = word;
        }
    }
    lines.push(currentLine);
    return lines;
}

// Helper to draw rounded rectangle
function roundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('profile')
        .setDescription('View user profile card')
        .addUserOption(option => option.setName('user').setDescription('The user to view')),

    async execute(interaction) {
        await interaction.deferReply();

        const targetUser = interaction.options.getUser('user') || interaction.user;
        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
        const user = db.getUser(targetUser.id);
        
        // Settings
        const maxPoints = Number(getAppSetting('autoMuteThreshold')) || 20;
        const currentPoints = user.points || 0;
        const progress = Math.min(1, Math.max(0, currentPoints / maxPoints));
        
        // Canvas Setup
        const width = 800;
        const height = 450;
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        // --- Background ---
        // Dark gradient background
        const gradient = ctx.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, '#1a1c20');
        gradient.addColorStop(1, '#0f1012');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);

        // Decorative circles
        ctx.globalAlpha = 0.05;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(width - 50, 50, 150, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(100, height + 50, 200, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;

        // --- User Info Section (Top Left) ---
        // Avatar
        try {
            const avatarURL = targetUser.displayAvatarURL({ extension: 'png', size: 256 });
            const avatar = await loadImage(avatarURL);
            
            ctx.save();
            ctx.beginPath();
            ctx.arc(100, 100, 60, 0, Math.PI * 2);
            ctx.closePath();
            ctx.clip();
            ctx.drawImage(avatar, 40, 40, 120, 120);
            ctx.restore();

            // Avatar Border
            ctx.beginPath();
            ctx.arc(100, 100, 60, 0, Math.PI * 2);
            ctx.lineWidth = 4;
            ctx.strokeStyle = '#3b82f6'; // Blue-500
            ctx.stroke();
        } catch (e) {
            console.error("Failed to load avatar", e);
        }

        // Username & Status
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 32px Sans';
        ctx.fillText(targetUser.username, 180, 90);

        // Status Badge
        const isMuted = targetMember && targetMember.communicationDisabledUntilTimestamp > Date.now();
        const statusText = isMuted ? 'MUTED' : 'ACTIVE';
        const statusColor = isMuted ? '#ef4444' : '#22c55e'; // Red or Green

        roundedRect(ctx, 180, 110, 100, 30, 15);
        ctx.fillStyle = statusColor;
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px Sans';
        ctx.textAlign = 'center';
        ctx.fillText(statusText, 230, 131);
        ctx.textAlign = 'left'; // Reset

        // --- Stats Grid (Top Right) ---
        const statsX = 500;
        const statsY = 60;
        
        // Warnings Count
        ctx.fillStyle = '#374151'; // Gray-700
        roundedRect(ctx, statsX, statsY, 120, 80, 10);
        ctx.fill();
        
        ctx.fillStyle = '#9ca3af'; // Gray-400
        ctx.font = '14px Sans';
        ctx.fillText('WARNINGS', statsX + 25, statsY + 25);
        
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 36px Sans';
        ctx.fillText((user.warnings?.length || 0).toString(), statsX + 25, statsY + 65);

        // Points Count
        ctx.fillStyle = '#374151';
        roundedRect(ctx, statsX + 140, statsY, 120, 80, 10);
        ctx.fill();

        ctx.fillStyle = '#9ca3af';
        ctx.font = '14px Sans';
        ctx.fillText('POINTS', statsX + 165, statsY + 25);

        ctx.fillStyle = currentPoints >= maxPoints ? '#ef4444' : '#ffffff';
        ctx.font = 'bold 36px Sans';
        ctx.fillText(currentPoints.toString(), statsX + 165, statsY + 65);


        // --- Progress Bar Section (Middle) ---
        const barY = 200;
        const barWidth = 700;
        const barHeight = 24;
        const barX = 50;

        // Label
        ctx.fillStyle = '#d1d5db'; // Gray-300
        ctx.font = '16px Sans';
        ctx.fillText(`Punishment Threshold (${currentPoints}/${maxPoints})`, barX, barY - 10);

        // Background Bar
        ctx.fillStyle = '#374151';
        roundedRect(ctx, barX, barY, barWidth, barHeight, 12);
        ctx.fill();

        // Fill Bar
        if (progress > 0) {
            // Gradient for bar
            const barGradient = ctx.createLinearGradient(barX, 0, barX + barWidth, 0);
            barGradient.addColorStop(0, '#3b82f6'); // Blue
            barGradient.addColorStop(0.6, '#8b5cf6'); // Purple
            barGradient.addColorStop(1, '#ef4444'); // Red

            ctx.fillStyle = barGradient;
            // Calculate width but ensure min width for visibility if > 0
            const fillWidth = Math.max(20, barWidth * progress);
            roundedRect(ctx, barX, barY, fillWidth, barHeight, 12);
            ctx.fill();
        }

        // --- Recent History (Bottom) ---
        const historyY = 270;
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 20px Sans';
        ctx.fillText('Recent Violations', 50, historyY);

        const warnings = (user.warnings || []).slice(-3).reverse(); // Last 3, newest first

        if (warnings.length === 0) {
            ctx.fillStyle = '#6b7280'; // Gray-500
            ctx.font = 'italic 18px Sans';
            ctx.fillText('No recent violations recorded. Good job!', 50, historyY + 40);
        } else {
            let currentY = historyY + 40;
            
            warnings.forEach((w, i) => {
                // Row Background
                ctx.fillStyle = i % 2 === 0 ? 'rgba(255, 255, 255, 0.03)' : 'transparent';
                ctx.fillRect(50, currentY - 25, 700, 40);

                // Date
                ctx.fillStyle = '#9ca3af'; // Gray-400
                ctx.font = '14px Sans';
                const dateStr = new Date(w.date).toLocaleDateString();
                ctx.fillText(dateStr, 60, currentY);

                // Points Badge
                ctx.fillStyle = 'rgba(239, 68, 68, 0.2)'; // Red-500 with opacity
                roundedRect(ctx, 150, currentY - 18, 40, 24, 6);
                ctx.fill();
                
                ctx.fillStyle = '#fca5a5'; // Red-300
                ctx.font = 'bold 12px Sans';
                ctx.fillText(`+${w.points}`, 160, currentY - 2);

                // Reason
                ctx.fillStyle = '#e5e7eb'; // Gray-200
                ctx.font = '16px Sans';
                const reasonText = w.reason.length > 60 ? w.reason.substring(0, 57) + '...' : w.reason;
                ctx.fillText(reasonText, 210, currentY);

                currentY += 45;
            });
        }

        // Footer
        ctx.fillStyle = '#4b5563'; // Gray-600
        ctx.font = '12px Sans';
        ctx.textAlign = 'center';
        ctx.fillText('Generated by Discord Guardian • ' + new Date().toLocaleTimeString(), width / 2, height - 20);

        const attachment = new AttachmentBuilder(canvas.toBuffer(), { name: 'profile-card.png' });
        await interaction.editReply({ files: [attachment] });
    }
};
