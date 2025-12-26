const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const { PermissionsBitField } = require('discord.js');
const db = require('../db');
const { consumeVerificationState } = require('../verification-state');
const { CLIENT_ID, CLIENT_SECRET, REDIRECT_URI, SESSION_SECRET } = require('../utils/config');
const { getGuild, fetchGuildMemberSafe, getConfiguredRole, logAction, sendVerificationDM } = require('../utils/helpers');

const router = express.Router();

const renderErrorPage = (message, showResend = false, userId = null) => {
    let signature = '';
    if (showResend && userId) {
        signature = crypto.createHmac('sha256', SESSION_SECRET).update(userId).digest('hex');
    }

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Verification Failed</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body { background-color: #0f172a; color: #e2e8f0; font-family: sans-serif; }
        .glass { background: rgba(255, 255, 255, 0.05); backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.1); }
    </style>
</head>
<body class="h-screen flex items-center justify-center p-4">
    <div class="glass rounded-2xl p-8 max-w-md w-full text-center shadow-2xl">
        <div class="mb-6 flex justify-center">
            <div class="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center text-red-500">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            </div>
        </div>
        <h1 class="text-2xl font-bold mb-2 text-white">Verification Failed</h1>
        <p class="text-gray-400 mb-8">${message}</p>
        
        ${showResend ? `
        <form action="/api/auth/resend" method="POST">
            <input type="hidden" name="userId" value="${userId}">
            <input type="hidden" name="signature" value="${signature}">
            <button type="submit" class="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold transition-colors shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>
                Resend Verification Link
            </button>
        </form>
        ` : ''}
        
        <div class="mt-6">
            <a href="/" class="text-sm text-gray-500 hover:text-gray-300 transition-colors">Return to Home</a>
        </div>
    </div>
</body>
</html>
    `;
};

const renderSuccessPage = (message) => {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Success</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body { background-color: #0f172a; color: #e2e8f0; font-family: sans-serif; }
        .glass { background: rgba(255, 255, 255, 0.05); backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.1); }
    </style>
</head>
<body class="h-screen flex items-center justify-center p-4">
    <div class="glass rounded-2xl p-8 max-w-md w-full text-center shadow-2xl">
        <div class="mb-6 flex justify-center">
            <div class="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-500">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            </div>
        </div>
        <h1 class="text-2xl font-bold mb-2 text-white">Success</h1>
        <p class="text-gray-400 mb-8">${message}</p>
    </div>
</body>
</html>
    `;
};

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
                username: member.displayName || discordUser.username,
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
        const { userId, status } = consumeVerificationState(state);
        
        if (status !== 'valid') {
            console.error(`Verification failed: ${status} state token`);
            if (status === 'expired' && userId) {
                return res.status(400).send(renderErrorPage('Your verification link has expired.', true, userId));
            }
            return res.status(400).send(renderErrorPage('Your verification link is invalid or has already been used. Please request a new QR code.'));
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
        
        if (error.response?.data?.error === 'invalid_grant') {
            return res.status(400).send(`
                <html>
                <body style="background-color: #2b2d31; color: #f2f3f5; font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh;">
                    <div style="text-align: center; background: #313338; padding: 40px; border-radius: 8px;">
                        <h1 style="color: #fa777c;">Link Expired</h1>
                        <p>This verification link has already been used or is expired.</p>
                        <p>Please run <code>/verify</code> in Discord again to get a new link.</p>
                    </div>
                </body>
                </html>
            `);
        }

        res.status(500).send('Verification failed. Please try again.');
    }
});

router.post('/resend', async (req, res) => {
    const { userId, signature } = req.body;
    
    if (!userId || !signature) {
        return res.status(400).send(renderErrorPage('Invalid request.'));
    }

    // Verify signature
    const expectedSignature = crypto.createHmac('sha256', SESSION_SECRET).update(userId).digest('hex');
    if (signature !== expectedSignature) {
        return res.status(403).send(renderErrorPage('Invalid signature.'));
    }

    try {
        const guild = await getGuild();
        const member = await fetchGuildMemberSafe(guild, userId);
        
        if (!member) {
            return res.status(404).send(renderErrorPage('User not found on the server.'));
        }

        const sent = await sendVerificationDM(member);
        if (sent) {
            return res.send(renderSuccessPage('A new verification link has been sent to your Direct Messages.'));
        } else {
            return res.status(500).send(renderErrorPage('Failed to send DM. Please check your privacy settings.'));
        }
    } catch (error) {
        console.error('Resend failed:', error);
        return res.status(500).send(renderErrorPage('An error occurred while processing your request.'));
    }
});

module.exports = router;
