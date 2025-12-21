const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'database.sqlite');
const jsonPath = path.join(__dirname, 'database.json');

const db = new Database(dbPath);

// --- Schema Definition ---
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
  CREATE TABLE IF NOT EXISTS presets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    points INTEGER
  );
  
  -- Normalized Tables
  CREATE TABLE IF NOT EXISTS users_v2 (
    id TEXT PRIMARY KEY,
    points INTEGER DEFAULT 0
  );
  
  CREATE TABLE IF NOT EXISTS warnings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    moderator TEXT,
    reason TEXT,
    points INTEGER,
    date TEXT,
    FOREIGN KEY(user_id) REFERENCES users_v2(id) ON DELETE CASCADE
  );
  
  CREATE TABLE IF NOT EXISTS user_oauth (
    user_id TEXT PRIMARY KEY,
    access_token TEXT,
    refresh_token TEXT,
    guilds TEXT, -- Stored as JSON string
    verified_at TEXT,
    FOREIGN KEY(user_id) REFERENCES users_v2(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS user_invites (
    user_id TEXT PRIMARY KEY,
    inviter_id TEXT,
    code TEXT,
    uses INTEGER,
    joined_at TEXT,
    FOREIGN KEY(user_id) REFERENCES users_v2(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS invite_aliases (
    code TEXT PRIMARY KEY,
    alias TEXT,
    created_at TEXT
  );

  CREATE TABLE IF NOT EXISTS escalations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    threshold INTEGER,
    action TEXT, -- 'mute', 'kick', 'ban'
    duration INTEGER -- minutes (only for mute)
  );

  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT, -- 'warn', 'mute', 'ban', 'kick', 'verify', 'system'
    title TEXT,
    description TEXT,
    color TEXT,
    fields TEXT, -- JSON string
    image_url TEXT,
    timestamp TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_warnings_user_id ON warnings(user_id);
  CREATE INDEX IF NOT EXISTS idx_users_points ON users_v2(points DESC);
  CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp DESC);

  CREATE TABLE IF NOT EXISTS appeals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    type TEXT, -- 'warn' or 'mute'
    punishment_id TEXT, -- warning ID or timestamp for mute
    reason TEXT, -- original punishment reason
    appeal_text TEXT,
    ai_summary TEXT,
    status TEXT DEFAULT 'pending', -- pending, approved, rejected
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

// --- Migrations ---

// 0. Add 'name' column to escalations if missing
try {
    const tableInfo = db.prepare("PRAGMA table_info(escalations)").all();
    const hasName = tableInfo.some(col => col.name === 'name');
    if (!hasName && tableInfo.length > 0) {
        console.log("Migrating escalations table: Adding 'name' column...");
        db.exec("ALTER TABLE escalations ADD COLUMN name TEXT DEFAULT 'Rule'");
    }
} catch (e) {
    console.error("Migration check failed:", e);
}

// 0.1 Add 'is_monitored' column to users_v2 if missing
try {
    const tableInfo = db.prepare("PRAGMA table_info(users_v2)").all();
    const hasCol = tableInfo.some(col => col.name === 'is_monitored');
    if (!hasCol && tableInfo.length > 0) {
        console.log("Migrating users_v2 table: Adding 'is_monitored' column...");
        db.exec("ALTER TABLE users_v2 ADD COLUMN is_monitored INTEGER DEFAULT 0");
    }
} catch (e) {
    console.error("Migration check failed:", e);
}

// 0.2 Add 'evidence' column to warnings if missing
try {
    const tableInfo = db.prepare("PRAGMA table_info(warnings)").all();
    const hasEvidence = tableInfo.some(col => col.name === 'evidence');
    if (!hasEvidence && tableInfo.length > 0) {
        console.log("Migrating warnings table: Adding 'evidence' column...");
        db.exec("ALTER TABLE warnings ADD COLUMN evidence TEXT");
    }
} catch (e) {
    console.error("Migration check failed (warnings):", e);
}

// 1. JSON to SQLite Blob (Legacy)
function migrateFromJson() {
    if (fs.existsSync(jsonPath)) {
        try {
            console.log('Found database.json, starting migration to SQLite...');
            const jsonData = fs.readFileSync(jsonPath, 'utf8');
            const parsed = JSON.parse(jsonData);
            
            // Create legacy table if needed for migration
            db.exec(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, data TEXT)`);
            
            if (parsed.users && Object.keys(parsed.users).length > 0) {
                const insert = db.prepare('INSERT OR REPLACE INTO users (id, data) VALUES (?, ?)');
                const transaction = db.transaction((users) => {
                    for (const [id, data] of Object.entries(users)) {
                        insert.run(id, JSON.stringify(data));
                    }
                });
                transaction(parsed.users);
                console.log(`Successfully migrated ${Object.keys(parsed.users).length} users to SQLite Blob.`);
            }
            
            fs.renameSync(jsonPath, jsonPath + '.bak');
            console.log('Renamed database.json to database.json.bak');
        } catch (err) {
            console.error('Migration from JSON failed:', err);
        }
    }
}

// 2. SQLite Blob to Normalized Tables
function migrateToNormalized() {
    // Check if legacy table exists
    const legacyTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();
    if (!legacyTable) return;

    // Check if we already migrated (users_v2 has data)
    const newCount = db.prepare("SELECT count(*) as count FROM users_v2").get().count;
    if (newCount > 0) return;

    console.log("Starting migration from Blob to Normalized Schema...");
    
    const oldUsersStmt = db.prepare("SELECT id, data FROM users");
    // Check if empty (optional, but iterate handles empty too)
    // if (oldUsers.length === 0) return; // Removed check for simplicity or use count

    const insertUser = db.prepare("INSERT OR IGNORE INTO users_v2 (id, points) VALUES (?, ?)");
    const insertWarning = db.prepare("INSERT INTO warnings (user_id, moderator, reason, points, date) VALUES (?, ?, ?, ?, ?)");
    const insertOAuth = db.prepare("INSERT OR REPLACE INTO user_oauth (user_id, access_token, refresh_token, guilds, verified_at) VALUES (?, ?, ?, ?, ?)");

    const transaction = db.transaction(() => {
        for (const row of oldUsersStmt.iterate()) {
            try {
                const data = JSON.parse(row.data);
                
                // 1. User & Points
                insertUser.run(row.id, data.points || 0);

                // 2. Warnings
                if (Array.isArray(data.warnings)) {
                    for (const w of data.warnings) {
                        insertWarning.run(
                            row.id, 
                            w.moderator || 'System', 
                            w.reason || 'No reason', 
                            w.points || 0, 
                            w.date || new Date().toISOString()
                        );
                    }
                }

                // 3. OAuth
                if (data.oauth) {
                    insertOAuth.run(
                        row.id, 
                        data.oauth.accessToken || null, 
                        data.oauth.refreshToken || null, 
                        JSON.stringify(data.oauth.guilds || []), 
                        data.oauth.verifiedAt || null
                    );
                }
            } catch (e) {
                console.error(`Failed to migrate user ${row.id}:`, e);
            }
        }
    });

    try {
        transaction();
        console.log(`Successfully migrated users to normalized tables.`);
        // Rename legacy table to avoid confusion, but keep as backup
        db.exec("ALTER TABLE users RENAME TO users_legacy_blob");
    } catch (error) {
        console.error("Migration failed:", error);
    }
}

// Run migrations
migrateFromJson();
migrateToNormalized();

// Create sessions table
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    sess TEXT,
    expired DATETIME
  );
`);

module.exports = {
    // Expose raw db instance for session store
    db: db,

    // --- User Methods ---
    
    // Get full user object (Composite) - For backward compatibility and full profile view
    getUser: (userId) => {
        const user = db.prepare('SELECT points, is_monitored FROM users_v2 WHERE id = ?').get(userId);
        const warnings = db.prepare('SELECT * FROM warnings WHERE user_id = ? ORDER BY date DESC').all(userId);
        const oauth = db.prepare('SELECT * FROM user_oauth WHERE user_id = ?').get(userId);
        const invite = db.prepare('SELECT * FROM user_invites WHERE user_id = ?').get(userId);

        return {
            id: userId,
            points: user ? user.points : 0,
            isMonitored: user ? !!user.is_monitored : false,
            warnings: warnings || [],
            oauth: oauth ? {
                accessToken: oauth.access_token,
                refreshToken: oauth.refresh_token,
                guilds: JSON.parse(oauth.guilds || '[]'),
                verifiedAt: oauth.verified_at
            } : null,
            invite: invite ? {
                inviterId: invite.inviter_id,
                code: invite.code,
                uses: invite.uses,
                joinedAt: invite.joined_at
            } : null
        };
    },

    setMonitored: (userId, isMonitored) => {
        const val = isMonitored ? 1 : 0;
        db.prepare(`
            INSERT INTO users_v2 (id, points, is_monitored) VALUES (?, 0, ?)
            ON CONFLICT(id) DO UPDATE SET is_monitored=excluded.is_monitored
        `).run(userId, val);
    },

    // Optimized summary for lists (Dashboard) - Fetches only requested users
    getUsersSummary: (userIds = []) => {
        if (!userIds || userIds.length === 0) return {};

        const placeholders = userIds.map(() => '?').join(',');
        
        // Optimized query: Filter users first, then join warnings
        const rows = db.prepare(`
            SELECT u.id, u.points, u.is_monitored, COUNT(w.id) AS warningsCount
            FROM users_v2 u
            LEFT JOIN warnings w ON w.user_id = u.id
            WHERE u.id IN (${placeholders})
            GROUP BY u.id
        `).all(...userIds);

        const result = {};
        for (const row of rows) {
            result[row.id] = {
                points: row.points,
                isMonitored: !!row.is_monitored,
                warningsCount: row.warningsCount
            };
        }

        return result;
    },

    // --- Analytics Methods ---

    getGuildStats: () => {
        // Cache check
        if (module.exports._guildStatsCache && Date.now() - module.exports._lastGuildStatsUpdate < 60000) {
            return module.exports._guildStatsCache;
        }

        // Fetch all stored guild lists
        const rows = db.prepare('SELECT guilds FROM user_oauth').all();
        const stats = {}; // guildId -> { name, icon, count }

        for (const row of rows) {
            if (!row.guilds) continue;
            try {
                const guilds = JSON.parse(row.guilds);
                for (const guild of guilds) {
                    if (!stats[guild.id]) {
                        stats[guild.id] = { 
                            id: guild.id,
                            name: guild.name, 
                            icon: guild.icon, 
                            count: 0 
                        };
                    }
                    stats[guild.id].count++;
                }
            } catch (e) {
                // Ignore parse errors
            }
        }

        // Convert to array and sort by count descending
        const result = Object.values(stats)
            .sort((a, b) => b.count - a.count)
            .slice(0, 10); // Top 10
            
        module.exports._guildStatsCache = result;
        module.exports._lastGuildStatsUpdate = Date.now();
        
        return result;
    },

    getWarningStats: () => {
        // Group warnings by date (YYYY-MM-DD)
        // SQLite's substr(date, 1, 10) extracts YYYY-MM-DD from ISO string
        const rows = db.prepare(`
            SELECT substr(date, 1, 10) as day, count(*) as count 
            FROM warnings 
            GROUP BY day 
            ORDER BY day ASC 
            LIMIT 30
        `).all();
        return rows;
    },

    // --- Write Methods (New) ---

    ensureUserExists: (userId) => {
        db.prepare('INSERT OR IGNORE INTO users_v2 (id, points) VALUES (?, 0)').run(userId);
    },

    addWarning: (userId, warning) => {
        const stmt = db.prepare('INSERT INTO warnings (user_id, moderator, reason, points, date) VALUES (?, ?, ?, ?, ?)');
        const info = stmt.run(userId, warning.moderator, warning.reason, warning.points, warning.date);
        
        // Update user points
        const user = db.prepare('SELECT * FROM users_v2 WHERE id = ?').get(userId);
        const currentPoints = user ? user.points : 0;
        
        const upsert = db.prepare(`
            INSERT INTO users_v2 (id, points) VALUES (?, ?)
            ON CONFLICT(id) DO UPDATE SET points = points + ?
        `);
        upsert.run(userId, warning.points, warning.points);

        return info.lastInsertRowid;
    },

    getWarning: (id) => {
        return db.prepare('SELECT * FROM warnings WHERE id = ?').get(id);
    },

    getWarnings: (userId) => {
        return db.prepare('SELECT * FROM warnings WHERE user_id = ? ORDER BY date DESC').all(userId);
    },

    clearPunishments: (userId) => {
        db.prepare('DELETE FROM warnings WHERE user_id = ?').run(userId);
        db.prepare('UPDATE users_v2 SET points = 0 WHERE id = ?').run(userId);
    },

    createAppeal: (appeal) => {
        const stmt = db.prepare(`
            INSERT INTO appeals (user_id, type, punishment_id, reason, appeal_text, ai_summary, status)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        return stmt.run(
            appeal.user_id, 
            appeal.type, 
            appeal.punishment_id, 
            appeal.reason, 
            appeal.appeal_text, 
            appeal.ai_summary, 
            appeal.status || 'pending'
        );
    },

    getAppeal: (id) => {
        return db.prepare('SELECT * FROM appeals WHERE id = ?').get(id);
    },

    updateAppealStatus: (id, status) => {
        return db.prepare('UPDATE appeals SET status = ? WHERE id = ?').run(status, id);
    },

    // --- Settings & Presets (Unchanged) ---
    getSetting: (key) => {
        const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
        return row ? JSON.parse(row.value) : null;
    },
    setSetting: (key, value) => {
        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, JSON.stringify(value));
    },
    getAllSettings: () => {
        const rows = db.prepare('SELECT key, value FROM settings').all();
        const settings = {};
        for (const row of rows) {
            settings[row.key] = JSON.parse(row.value);
        }
        return settings;
    },
    getPresets: () => {
        return db.prepare('SELECT * FROM presets').all();
    },
    addPreset: (name, points) => {
        return db.prepare('INSERT INTO presets (name, points) VALUES (?, ?)').run(name, points);
    },
    deletePreset: (id) => {
        db.prepare('DELETE FROM presets WHERE id = ?').run(id);
    },

    // --- Escalations ---
    getEscalations: () => {
        return db.prepare('SELECT * FROM escalations ORDER BY threshold ASC').all();
    },
    addEscalation: (name, threshold, action, duration) => {
        return db.prepare('INSERT INTO escalations (name, threshold, action, duration) VALUES (?, ?, ?, ?)').run(name || 'Rule', threshold, action, duration);
    },
    deleteEscalation: (id) => {
        const stmt = db.prepare('DELETE FROM escalations WHERE id = ?');
        stmt.run(id);
    },

    addLog: (type, title, description, color, fields = [], imageUrl = null) => {
        const stmt = db.prepare(`
            INSERT INTO logs (type, title, description, color, fields, image_url)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        stmt.run(type, title, description, color, JSON.stringify(fields), imageUrl);
    },

    getLogs: (limit = 100, offset = 0, type = null) => {
        let query = 'SELECT * FROM logs';
        const params = [];
        
        if (type) {
            query += ' WHERE type = ?';
            params.push(type);
        }
        
        query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);
        
        const stmt = db.prepare(query);
        const logs = stmt.all(...params);
        
        return logs.map(log => ({
            ...log,
            fields: JSON.parse(log.fields || '[]')
        }));
    },

    // --- Invites ---
    saveUserInvite: (userId, inviterId, code, uses) => {
        // Ensure user exists in users_v2
        db.prepare('INSERT OR IGNORE INTO users_v2 (id) VALUES (?)').run(userId);
        
        const stmt = db.prepare(`
            INSERT OR REPLACE INTO user_invites (user_id, inviter_id, code, uses, joined_at)
            VALUES (?, ?, ?, ?, datetime('now'))
        `);
        stmt.run(userId, inviterId, code, uses);
    },

    getTopInviters: (limit = 10) => {
        const stmt = db.prepare(`
            SELECT inviter_id, count(*) as count 
            FROM user_invites 
            WHERE inviter_id IS NOT NULL 
            GROUP BY inviter_id 
            ORDER BY count DESC 
            LIMIT ?
        `);
        return stmt.all(limit);
    },

    getInvitesStats: () => {
        const totalInvites = db.prepare('SELECT count(*) as count FROM user_invites').get().count;
        const topInviters = db.prepare(`
            SELECT inviter_id, count(*) as count 
            FROM user_invites 
            WHERE inviter_id IS NOT NULL 
            GROUP BY inviter_id 
            ORDER BY count DESC 
            LIMIT 5
        `).all();
        
        return { totalInvites, topInviters };
    },

    // --- Invite Aliases ---
    setInviteAlias: (code, alias) => {
        return db.prepare(`
            INSERT OR REPLACE INTO invite_aliases (code, alias, created_at)
            VALUES (?, ?, datetime('now'))
        `).run(code, alias);
    },

    getInviteAlias: (code) => {
        return db.prepare('SELECT alias FROM invite_aliases WHERE code = ?').get(code);
    },

    getInviteJoins: (code) => {
        return db.prepare(`
            SELECT u.id, u.points, ui.joined_at
            FROM user_invites ui
            JOIN users_v2 u ON u.id = ui.user_id
            WHERE ui.code = ?
            ORDER BY ui.joined_at DESC
        `).all(code);
    },

    getAllInviteAliases: () => {
        const rows = db.prepare('SELECT code, alias FROM invite_aliases').all();
        const aliases = {};
        for (const row of rows) {
            aliases[row.code] = row.alias;
        }
        return aliases;
    },

    // Deprecated but kept for safety if I missed something
    getAllUsers: () => {
        console.warn("Deprecated db.getAllUsers() called. Use getUsersSummary() instead.");
        return module.exports.getUsersSummary();
    }
};

