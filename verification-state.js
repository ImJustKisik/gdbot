const crypto = require('crypto');
const db = require('./db');

const EXPIRATION_MS = 10 * 60 * 1000; // 10 minutes

function createVerificationState(userId) {
    const state = crypto.randomBytes(16).toString('hex');
    const expiresAt = Date.now() + EXPIRATION_MS;
    
    // Use DB instead of Map
    db.saveVerificationState(state, userId, expiresAt);
    
    // Cleanup old states occasionally (e.g. 10% chance)
    if (Math.random() < 0.1) {
        db.cleanupVerificationStates();
    }
    
    return state;
}

function consumeVerificationState(state) {
    const entry = db.getVerificationState(state);
    
    if (!entry) {
        return { userId: null, status: 'invalid' };
    }

    // Delete immediately to prevent reuse
    db.deleteVerificationState(state);

    if (entry.expires_at < Date.now()) {
        return { userId: entry.user_id, status: 'expired' };
    }
    return { userId: entry.user_id, status: 'valid' };
}

module.exports = {
    createVerificationState,
    consumeVerificationState,
};
