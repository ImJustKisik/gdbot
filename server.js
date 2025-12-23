const Sentry = require('@sentry/node');
const { nodeProfilingIntegration } = require('@sentry/profiling-node');
const { PORT, SESSION_SECRET, REDIRECT_URI, SENTRY_DSN, SSL_KEY_PATH, SSL_CERT_PATH, GUILD_ID } = require('./utils/config');

Sentry.init({
  dsn: SENTRY_DSN,
  integrations: [
    nodeProfilingIntegration(),
  ],
  // Tracing
  tracesSampleRate: 1.0, //  Capture 100% of the transactions
  // Set sampling rate for profiling - this is relative to tracesSampleRate
  profilesSampleRate: 1.0,
});

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const https = require('https');
const session = require('express-session');
const SQLiteStore = require('./session-store');
const { startBot, client } = require('./bot'); // Imports from bot/index.js
const database = require('./db');
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');
const { getGuild, logAction } = require('./utils/helpers');

const app = express();

const HEALTH_INTERVAL_MS = 60 * 1000;
const MEMBER_CACHE_STALE_MS = 5 * 60 * 1000;
const BOT_READY_GRACE_MS = 2 * 60 * 1000;
const HEALTH_ALERT_COOLDOWN_MS = 10 * 60 * 1000;

const healthTracker = {
    lastReadyAt: Date.now(),
    lastMemberCacheOkAt: Date.now(),
    lastDbOkAt: Date.now()
};

let lastHealthAlertAt = 0;
let healthMonitorHandle = null;

// --- Middleware ---
// The request handler must be the first middleware on the app
Sentry.setupExpressErrorHandler(app);

app.set('trust proxy', 1); // Trust Nginx proxy (required for secure cookies behind proxy)
app.use(cors());
app.use(express.json());

// Session Configuration
app.use(session({
    store: new SQLiteStore(),
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: REDIRECT_URI.startsWith('https'), // Only use secure cookies if using HTTPS
        maxAge: 1000 * 60 * 60 * 24 * 7 // 1 week
    }
}));

// --- Routes ---
app.get('/health', async (req, res) => {
    try {
        const status = await collectHealthStatus();
        const issues = getDegradationReasons(status);
        const ok = issues.length === 0;
        if (!ok) {
            status.issues = issues;
        }
        res.status(ok ? 200 : 503).json({ ok, issues, status });
    } catch (error) {
        console.error('Health endpoint failed:', error);
        res.status(500).json({ ok: false, error: 'Health probe failed' });
    }
});

app.use('/api/auth', authRoutes);
app.use('/api', apiRoutes);

// --- Static Files (Frontend) ---
// Serve static files from the React app build directory
app.use(express.static(path.join(__dirname, 'client/dist')));

// Handle React routing, return all requests to React app
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'client/dist', 'index.html'));
});

// --- Start Server ---
// We start the Express server only after the Discord bot has successfully logged in
// to ensure that the `client` instance is ready for API requests.
async function init() {
    try {
        console.log('Starting Discord Bot...');
        await startBot();
        
        // Wait for the client to be fully ready before accepting requests
        if (!client.isReady()) {
            console.log('Waiting for client to be ready...');
            await new Promise(resolve => client.once('clientReady', resolve));
        }

        const onServerReady = () => {
            console.log('Health monitor starting...');
            startHealthMonitor();
        };

        if (SSL_KEY_PATH && SSL_CERT_PATH) {
            try {
                const httpsOptions = {
                    key: fs.readFileSync(SSL_KEY_PATH),
                    cert: fs.readFileSync(SSL_CERT_PATH)
                };
                https.createServer(httpsOptions, app).listen(PORT, () => {
                    console.log(`HTTPS Server running on port ${PORT}`);
                    console.log(`Dashboard available at https://localhost:${PORT}`);
                    onServerReady();
                });
            } catch (error) {
                console.error('Failed to start HTTPS server:', error);
                console.error('Please check your SSL_KEY_PATH and SSL_CERT_PATH environment variables.');
                process.exit(1);
            }
        } else {
            app.listen(PORT, () => {
                console.log(`Server running on port ${PORT}`);
                console.log(`Dashboard available at http://localhost:${PORT}`);
                onServerReady();
            });
        }
    } catch (error) {
        console.error('Failed to start application:', error);
        process.exit(1);
    }
}

init();

async function collectHealthStatus() {
    const now = Date.now();
    const status = {
        timestamp: new Date(now).toISOString(),
        uptimeSeconds: Math.round(process.uptime()),
        bot: {
            ready: typeof client.isReady === 'function' ? client.isReady() : false,
            ping: Number.isFinite(client.ws?.ping) ? Math.round(client.ws.ping) : null,
            secondsSinceReady: 0
        },
        guild: {
            id: GUILD_ID,
            cachedMembers: 0,
            invitesCached: typeof client.invites?.size === 'number' ? client.invites.size : null,
            cacheSecondsSinceRefresh: 0,
            cacheStale: false
        },
        database: {
            ok: true,
            latencyMs: null
        }
    };

    if (status.bot.ready) {
        healthTracker.lastReadyAt = now;
        status.bot.secondsSinceReady = 0;
    } else {
        status.bot.secondsSinceReady = Math.round((now - healthTracker.lastReadyAt) / 1000);
    }

    try {
        const guild = client.guilds.cache.get(GUILD_ID);
        if (guild) {
            status.guild.cachedMembers = guild.members.cache.size;
            if (guild.members.cache.size > 0) {
                healthTracker.lastMemberCacheOkAt = now;
                status.guild.cacheSecondsSinceRefresh = 0;
            } else {
                status.guild.cacheSecondsSinceRefresh = Math.round((now - healthTracker.lastMemberCacheOkAt) / 1000);
            }
        } else {
            status.guild.cacheSecondsSinceRefresh = Math.round((now - healthTracker.lastMemberCacheOkAt) / 1000);
        }
    } catch (error) {
        status.guild.error = error.message;
        status.guild.cacheSecondsSinceRefresh = Math.round((now - healthTracker.lastMemberCacheOkAt) / 1000);
    }

    status.guild.cacheStale = (status.guild.cacheSecondsSinceRefresh * 1000) > MEMBER_CACHE_STALE_MS;

    try {
        const start = Date.now();
        database.db.prepare('SELECT 1').get();
        status.database.latencyMs = Date.now() - start;
        healthTracker.lastDbOkAt = now;
    } catch (error) {
        status.database.ok = false;
        status.database.error = error.message;
    }

    return status;
}

function getDegradationReasons(status) {
    const reasons = [];
    const now = Date.now();

    if (!status.bot.ready && (now - healthTracker.lastReadyAt) > BOT_READY_GRACE_MS) {
        reasons.push('Discord client потерял READY-состояние.');
    }

    if (status.guild.cacheStale) {
        reasons.push(`Кэш участников пуст или устарел ${status.guild.cacheSecondsSinceRefresh} секунд.`);
    }

    if (!status.database.ok) {
        reasons.push('Проверка подключения к SQLite завершилась ошибкой.');
    }

    return reasons;
}

function startHealthMonitor() {
    if (healthMonitorHandle) return;

    const tick = async () => {
        try {
            const status = await collectHealthStatus();
            const reasons = getDegradationReasons(status);
            if (!reasons.length) {
                return;
            }

            if (Date.now() - lastHealthAlertAt < HEALTH_ALERT_COOLDOWN_MS) {
                return;
            }

            lastHealthAlertAt = Date.now();

            try {
                const guild = await getGuild();
                if (!guild) return;

                await logAction(
                    guild,
                    'Health Monitor Alert',
                    reasons.map((reason, idx) => `${idx + 1}. ${reason}`).join('\n'),
                    'Red',
                    [
                        { name: 'Client Ready', value: status.bot.ready ? 'Да' : `Нет (${status.bot.secondsSinceReady}с)`, inline: true },
                        { name: 'Cached Members', value: status.guild.cachedMembers.toString(), inline: true },
                        { name: 'DB', value: status.database.ok ? `OK (${status.database.latencyMs}мс)` : 'Ошибка', inline: true }
                    ]
                );
            } catch (guildError) {
                console.error('Failed to send health alert:', guildError);
            }
        } catch (error) {
            console.error('Health monitor tick failed:', error);
        }
    };

    healthMonitorHandle = setInterval(tick, HEALTH_INTERVAL_MS);
    if (typeof healthMonitorHandle.unref === 'function') {
        healthMonitorHandle.unref();
    }

    // Run first check immediately to capture startup issues (с учётом grace периодов)
    tick();
}
