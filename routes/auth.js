const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const { PermissionsBitField } = require('discord.js');
const db = require('../db');
const { consumeVerificationState } = require('../verification-state');
const { CLIENT_ID, CLIENT_SECRET, REDIRECT_URI } = require('../utils/config');
const { getGuild, fetchGuildMemberSafe, getConfiguredRole, logAction } = require('../utils/helpers');

const router = express.Router();

// Auth: Login URL
router.get('/login', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    req.session.oauthState = state;

    const oauthUrl = new URL('https://discord.com/api/oauth2/authorize');
    oauthUrl.searchParams.append('client_id', CLIENT_ID);
    oauthUrl.searchParams.append('redirect_uri', REDIRECT_URI);
    oauthUrl.searchParams.append('response_type', 'code');
    oauthUrl.searchParams.append('scope', 'identify guilds');
    oauthUrl.searchParams.append('state', state);
    res.redirect(oauthUrl.toString());
});

// Auth: Check Session
router.get('/me', (req, res) => {
    if (req.session.user) {
        res.json({ authenticated: true, user: req.session.user });
    } else {
        res.json({ authenticated: false });
    }
});

// Auth: Logout
router.post('/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// OAuth2 Callback
router.get('/callback', async (req, res) => {
    const { code, state, error, error_description } = req.query; // state is userId OR 'dashboard_login'
    
    console.log('OAuth Callback received.');
    console.log('Full URL:', req.originalUrl);
    console.log('Query Params:', req.query);

    if (error) {
        return res.status(400).send(`<h1>Authorization Error</h1><p>Discord returned an error: ${error}</p><p>${error_description}</p>`);
    }
    
    if (!code) {
         return res.status(400).send(`<h1>Invalid Request</h1><p>Missing code parameter.</p>`);
    }

    if (!state) {
        console.error('CRITICAL: State parameter missing from callback URL.');
        return res.status(400).send(`<h1>Verification Failed</h1><p>Missing state parameter.</p>`);
    }

    try {
        // Exchange code for token
        const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', new URLSearchParams({
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            grant_type: 'authorization_code',
            code,
            redirect_uri: REDIRECT_URI
        }), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        const { access_token, refresh_token } = tokenResponse.data;

        // --- DASHBOARD LOGIN FLOW ---
        // Check if state matches the session state (CSRF protection)
        if (req.session.oauthState && state === req.session.oauthState) {
            // Clear state after use
            delete req.session.oauthState;

            // Fetch User Info
            const userResponse = await axios.get('https://discord.com/api/users/@me', {
                headers: { Authorization: `Bearer ${access_token}` }
            });
            const discordUser = userResponse.data;

            // Check if user is in the guild and has permissions
            // We can fetch the guild member from our bot's cache
            const guild = await getGuild();
            let member = null;
            try {
                member = await guild.members.fetch(discordUser.id);
            } catch (e) {
                console.log('User not found in guild');
            }

            if (!member) {
                return res.status(403).send('<h1>Access Denied</h1><p>You are not a member of the target server.</p>');
            }

            // Check permissions (Administrator or Manage Guild or Moderate Members)
            const isAdmin = member.permissions.has(PermissionsBitField.Flags.Administrator) || 
                            member.permissions.has(PermissionsBitField.Flags.ManageGuild) ||
                            member.permissions.has(PermissionsBitField.Flags.ModerateMembers);

            if (!isAdmin) {
                return res.status(403).send('<h1>Access Denied</h1><p>You do not have moderation permissions on this server.</p>');
            }

            // Create Session
            req.session.user = {
                id: discordUser.id,
                username: discordUser.username,
                avatar: `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`,
                isAdmin: true
            };

            return res.redirect('/');
        } else if (req.session.oauthState) {
            // State exists in session but doesn't match URL state -> Potential CSRF or stale session
            console.warn('OAuth state mismatch. Session:', req.session.oauthState, 'Received:', state);
            return res.status(400).send('<h1>Authorization Failed</h1><p>Invalid state parameter. Please try again.</p>');
        }

        // --- VERIFICATION FLOW (Existing) ---
        const userId = consumeVerificationState(state);
        if (!userId) {
            console.error('Verification failed: invalid or expired state token');
            return res.status(400).send('<h1>Verification Failed</h1><p>Your verification link expired or is invalid. Please request a new QR code.</p>');
        }

        // Fetch User Guilds
        const guildsResponse = await axios.get('https://discord.com/api/users/@me/guilds', {
            headers: { Authorization: `Bearer ${access_token}` }
        });

        const guilds = guildsResponse.data;

        // Update DB
        db.updateOAuth(userId, {
            accessToken: access_token,
            refreshToken: refresh_token,
            guilds: guilds,
            verifiedAt: new Date().toISOString()
        });

        // Update Discord Roles
        const guild = await getGuild();
        const member = await fetchGuildMemberSafe(guild, userId);
        if (member) {
            const roleUnverified = getConfiguredRole(guild, 'roleUnverified');
            const roleVerified = getConfiguredRole(guild, 'roleVerified');

            if (roleUnverified) await member.roles.remove(roleUnverified);
            if (roleVerified) await member.roles.add(roleVerified);
            
            await logAction(guild, 'User Verified', `User <@${userId}> verified successfully via QR/OAuth.`, 'Green');

            try {
                await member.send("Verification successful! You now have access to the server.");
            } catch (e) {}
        } else {
            console.warn(`Verified user ${userId} is no longer in the guild.`);
        }

        res.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Verification Successful</title>
    <style>
        body {
            background-color: #2b2d31;
            color: #f2f3f5;
            font-family: 'gg sans', 'Helvetica Neue', Helvetica, Arial, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
        }
        .container {
            text-align: center;
            background: #313338;
            padding: 40px;
            border-radius: 8px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.2);
            max-width: 400px;
            width: 90%;
        }
        .success-animation { margin: 20px auto; }
        .checkmark {
            width: 80px;
            height: 80px;
            border-radius: 50%;
            display: block;
            stroke-width: 4;
            stroke: #23a559;
            stroke-miterlimit: 10;
            box-shadow: inset 0px 0px 0px #23a559;
            animation: fill .4s ease-in-out .4s forwards, scale .3s ease-in-out .9s both;
            position: relative;
            top: 5px;
            right: 5px;
            margin: 0 auto;
        }
        .checkmark__circle {
            stroke-dasharray: 166;
            stroke-dashoffset: 166;
            stroke-width: 4;
            stroke-miterlimit: 10;
            stroke: #23a559;
            fill: #313338;
            animation: stroke .6s cubic-bezier(0.65, 0, 0.45, 1) forwards;
        }
        .checkmark__check {
            transform-origin: 50% 50%;
            stroke-dasharray: 48;
            stroke-dashoffset: 48;
            animation: stroke .3s cubic-bezier(0.65, 0, 0.45, 1) .8s forwards;
        }
        @keyframes stroke { 100% { stroke-dashoffset: 0; } }
        @keyframes scale { 0%, 100% { transform: none; } 50% { transform: scale3d(1.1, 1.1, 1); } }
        @keyframes fill { 100% { box-shadow: inset 0px 0px 0px 50px #23a559; } }
        
        h1 { color: #fff; margin-top: 20px; font-size: 24px; }
        p { color: #b5bac1; margin: 15px 0 25px; line-height: 1.5; }
        .btn {
            background-color: #5865F2;
            color: white;
            padding: 12px 24px;
            border-radius: 4px;
            text-decoration: none;
            font-weight: 500;
            transition: background-color 0.2s;
            display: inline-block;
        }
        .btn:hover { background-color: #4752C4; }
    </style>
</head>
<body>
    <div class="container">
        <div class="success-animation">
            <svg class="checkmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">
                <circle class="checkmark__circle" cx="26" cy="26" r="25" fill="none" />
                <path class="checkmark__check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8" />
            </svg>
        </div>
        <h1>Verification Successful!</h1>
        <p>You're all set! Redirecting you to the server in a few seconds...</p>
        <a href="https://discord.com/channels/${guild.id}" class="btn">Open Discord Now</a>
    </div>
    <script>
        setTimeout(() => {
            window.location.href = 'https://discord.com/channels/${guild.id}';
        }, 3000);
    </script>
</body>
</html>`);

    } catch (error) {
        console.error('OAuth Error:', error.response?.data || error.message);
        res.status(500).send('Verification failed. Please try again.');
    }
});

module.exports = router;
