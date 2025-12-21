const Sentry = require('@sentry/node');
const { SENTRY_DSN } = require('./utils/config');

if (!SENTRY_DSN) {
    console.error('Error: SENTRY_DSN is not defined in .env file');
    process.exit(1);
}

console.log('Initializing Sentry with DSN:', SENTRY_DSN);

Sentry.init({
  dsn: SENTRY_DSN,
  tracesSampleRate: 1.0,
});

console.log('Sending test events to Sentry...');

// 1. Capture a simple message
const eventId = Sentry.captureMessage("Test Log: Sentry Integration Verified!");
console.log(`Message sent! Event ID: ${eventId}`);

// 2. Capture a test exception
try {
    throw new Error("Test Error: Sentry Verification");
} catch (e) {
    Sentry.captureException(e);
    console.log('Test error sent!');
}

console.log('Waiting for events to flush...');

// Flush events to ensure they are sent before the script exits
Sentry.close(2000).then(() => {
    console.log('Done! Check your Sentry dashboard (Issues tab).');
});
