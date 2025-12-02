require('dotenv').config();
const crypto = require('crypto');

// Parse API Keys (support single API_KEY or comma-separated API_KEYS)
const rawKeys = process.env.API_KEYS || process.env.API_KEY || "";
const apiKeys = rawKeys.split(',').map(k => k.trim()).filter(k => k.length > 0);

// DEBUG: Check if API_KEY is loaded
console.log("---------------------------------------------------");
if (apiKeys.length > 0) {
    console.log(`DEBUG: ${apiKeys.length} API Key(s) loaded successfully.`);
} else {
    console.error('DEBUG: API_KEY or API_KEYS is MISSING in process.env. Please check your .env file.');
}
console.log("---------------------------------------------------");

const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';
let SESSION_SECRET = process.env.SESSION_SECRET;

if (!SESSION_SECRET) {
    if (NODE_ENV === 'production') {
        console.error('FATAL: SESSION_SECRET environment variable is required.');
        process.exit(1);
    } else {
        SESSION_SECRET = crypto.randomBytes(32).toString('hex');
        console.warn('SESSION_SECRET не задан. Сгенерирован временный секрет для локальной разработки.');
    }
}

module.exports = {
    PORT,
    GUILD_ID: process.env.GUILD_ID,
    GENAI_API_KEYS: apiKeys, // Export array of keys
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
