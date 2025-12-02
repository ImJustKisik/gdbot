require('dotenv').config();
const crypto = require('crypto');

const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';
let SESSION_SECRET = process.env.SESSION_SECRET;

if (!SESSION_SECRET) {
    SESSION_SECRET = crypto.randomBytes(32).toString('hex');
    if (NODE_ENV === 'production') {
        console.warn('WARNING: SESSION_SECRET environment variable is not set. Using a generated temporary secret. Sessions will be invalidated on restart.');
    } else {
        console.warn('SESSION_SECRET не задан. Сгенерирован временный секрет для локальной разработки.');
    }
}

module.exports = {
    PORT,
    GUILD_ID: process.env.GUILD_ID,
    GENAI_API_KEY: process.env.API_KEY,
    CLIENT_ID: process.env.CLIENT_ID,
    CLIENT_SECRET: process.env.CLIENT_SECRET,
    REDIRECT_URI: process.env.REDIRECT_URI || `http://localhost:${PORT}/api/auth/callback`,
    NODE_ENV,
    SESSION_SECRET,
    DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN,
    VERIFICATION_CHANNEL_NAME: "verification",
    DEFAULT_SETTINGS: {
        logChannelId: "",
        verificationChannelId: "",
        autoMuteThreshold: 20,
        autoMuteDuration: 60, // minutes
        roleUnverified: "Unverified",
        roleVerified: "Verified"
    }
};
