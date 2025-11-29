const session = require('express-session');
const db = require('./db').db;

class SQLiteStore extends session.Store {
    constructor(options = {}) {
        super(options);
        this.table = options.table || 'sessions';
        
        // Cleanup expired sessions periodically (every 1 hour)
        setInterval(() => {
            try {
                db.prepare(`DELETE FROM ${this.table} WHERE expired < datetime('now')`).run();
            } catch (e) {
                console.error('Failed to cleanup sessions:', e);
            }
        }, 3600000).unref(); // unref so it doesn't block process exit
    }

    get(sid, callback) {
        try {
            const row = db.prepare(`SELECT sess FROM ${this.table} WHERE sid = ? AND expired > datetime('now')`).get(sid);
            if (row) {
                callback(null, JSON.parse(row.sess));
            } else {
                // If found but expired (and not yet cleaned), return null
                callback(null, null);
            }
        } catch (err) {
            callback(err);
        }
    }

    set(sid, sess, callback) {
        try {
            const maxAge = sess.cookie.maxAge || 86400000; // 1 day default
            const expired = new Date(Date.now() + maxAge).toISOString();
            
            db.prepare(`INSERT OR REPLACE INTO ${this.table} (sid, sess, expired) VALUES (?, ?, ?)`)
              .run(sid, JSON.stringify(sess), expired);
            if (callback) callback(null);
        } catch (err) {
            if (callback) callback(err);
        }
    }

    destroy(sid, callback) {
        try {
            db.prepare(`DELETE FROM ${this.table} WHERE sid = ?`).run(sid);
            if (callback) callback(null);
        } catch (err) {
            if (callback) callback(err);
        }
    }
    
    touch(sid, sess, callback) {
        try {
            const maxAge = sess.cookie.maxAge || 86400000;
            const expired = new Date(Date.now() + maxAge).toISOString();
            db.prepare(`UPDATE ${this.table} SET expired = ? WHERE sid = ?`).run(expired, sid);
            if (callback) callback(null);
        } catch (err) {
            if (callback) callback(err);
        }
    }
}

module.exports = SQLiteStore;
