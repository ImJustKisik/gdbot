const express = require('express');
const cors = require('cors');
const path = require('path');
const Sentry = require('@sentry/node');
const { nodeProfilingIntegration } = require('@sentry/profiling-node');
const session = require('express-session');
const SQLiteStore = require('./session-store');
const { PORT, SESSION_SECRET, REDIRECT_URI, SENTRY_DSN } = require('./utils/config');
const { startBot, client } = require('./bot'); // Imports from bot/index.js
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');

const app = express();

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

// --- Middleware ---
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

        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
            console.log(`Dashboard available at http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error('Failed to start application:', error);
        process.exit(1);
    }
}

init();
