const crypto = require('crypto');

const EXPIRATION_MS = 10 * 60 * 1000; // 10 minutes
const states = new Map();

function createVerificationState(userId) {
    const state = crypto.randomBytes(16).toString('hex');
    const expiresAt = Date.now() + EXPIRATION_MS;
    states.set(state, { userId, expiresAt });
    cleanupExpired();
    return state;
}

function consumeVerificationState(state) {
    const entry = states.get(state);
    if (!entry) {
        return null;
    }

    states.delete(state);
    if (entry.expiresAt < Date.now()) {
        return null;
    }
    return entry.userId;
}

function cleanupExpired() {
    const now = Date.now();
    for (const [state, entry] of states.entries()) {
        if (entry.expiresAt < now) {
            states.delete(state);
        }
    }
}

module.exports = {
    createVerificationState,
    consumeVerificationState,
};
