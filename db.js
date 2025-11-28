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

  CREATE INDEX IF NOT EXISTS idx_warnings_user_id ON warnings(user_id);
`);

// --- Migrations ---

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
    
    const oldUsers = db.prepare("SELECT id, data FROM users").all();
    if (oldUsers.length === 0) return;

    const insertUser = db.prepare("INSERT OR IGNORE INTO users_v2 (id, points) VALUES (?, ?)");
    const insertWarning = db.prepare("INSERT INTO warnings (user_id, moderator, reason, points, date) VALUES (?, ?, ?, ?, ?)");
    const insertOAuth = db.prepare("INSERT OR REPLACE INTO user_oauth (user_id, access_token, refresh_token, guilds, verified_at) VALUES (?, ?, ?, ?, ?)");

    const transaction = db.transaction((users) => {
        for (const row of users) {
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
        transaction(oldUsers);
        console.log(`Successfully migrated ${oldUsers.length} users to normalized tables.`);
        // Rename legacy table to avoid confusion, but keep as backup
        db.exec("ALTER TABLE users RENAME TO users_legacy_blob");
    } catch (error) {
        console.error("Migration failed:", error);
    }
}

// Run migrations
migrateFromJson();
migrateToNormalized();

module.exports = {
    // --- User Methods ---
    
    // Get full user object (Composite) - For backward compatibility and full profile view
    getUser: (userId) => {
        const user = db.prepare('SELECT points FROM users_v2 WHERE id = ?').get(userId);
        const warnings = db.prepare('SELECT * FROM warnings WHERE user_id = ? ORDER BY date DESC').all(userId);
        const oauth = db.prepare('SELECT * FROM user_oauth WHERE user_id = ?').get(userId);

        return {
            id: userId,
            points: user ? user.points : 0,
            warnings: warnings || [],
            oauth: oauth ? {
                accessToken: oauth.access_token,
                refreshToken: oauth.refresh_token,
                guilds: JSON.parse(oauth.guilds || '[]'),
                verifiedAt: oauth.verified_at
            } : null
        };
    },

    // Optimized summary for lists (Dashboard)
    getUsersSummary: () => {
        const users = db.prepare('SELECT id, points FROM users_v2').all();
        const result = {};
        
        // We can fetch warnings in bulk or just return points for speed. 
        // For the dashboard list, we usually need points and maybe warning count.
        // Let's do a join to get warning counts if needed, but for now let's stick to what we had.
        // To match previous behavior, we need warnings array.
        
        // Optimization: Fetch all warnings in one go
        const allWarnings = db.prepare('SELECT user_id, reason, points, date, moderator FROM warnings').all();
        const warningsMap = {};
        
        for (const w of allWarnings) {
            if (!warningsMap[w.user_id]) warningsMap[w.user_id] = [];
            warningsMap[w.user_id].push(w);
        }

        for (const user of users) {
            result[user.id] = {
                points: user.points,
                warnings: warningsMap[user.id] || []
            };
        }
        
        return result;
    },

    // --- Write Methods (New) ---

    ensureUserExists: (userId) => {
        db.prepare('INSERT OR IGNORE INTO users_v2 (id, points) VALUES (?, 0)').run(userId);
    },

    addWarning: (userId, warning) => {
        const { reason, points, moderator, date } = warning;
        
        const transaction = db.transaction(() => {
            // Ensure user exists
            db.prepare('INSERT OR IGNORE INTO users_v2 (id, points) VALUES (?, 0)').run(userId);
            
            // Add warning
            db.prepare('INSERT INTO warnings (user_id, moderator, reason, points, date) VALUES (?, ?, ?, ?, ?)').run(
                userId, moderator, reason, points, date || new Date().toISOString()
            );
            
            // Update points
            db.prepare('UPDATE users_v2 SET points = points + ? WHERE id = ?').run(points, userId);
        });
        
        transaction();
    },

    clearPunishments: (userId) => {
        const transaction = db.transaction(() => {
            db.prepare('UPDATE users_v2 SET points = 0 WHERE id = ?').run(userId);
            db.prepare('DELETE FROM warnings WHERE user_id = ?').run(userId);
        });
        transaction();
    },

    updateOAuth: (userId, oauthData) => {
        const { accessToken, refreshToken, guilds, verifiedAt } = oauthData;
        
        const transaction = db.transaction(() => {
            db.prepare('INSERT OR IGNORE INTO users_v2 (id, points) VALUES (?, 0)').run(userId);
            db.prepare(`
                INSERT OR REPLACE INTO user_oauth (user_id, access_token, refresh_token, guilds, verified_at) 
                VALUES (?, ?, ?, ?, ?)
            `).run(userId, accessToken, refreshToken, JSON.stringify(guilds), verifiedAt);
        });
        transaction();
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
    
    // Deprecated but kept for safety if I missed something
    getAllUsers: () => {
        console.warn("Deprecated db.getAllUsers() called. Use getUsersSummary() instead.");
        return module.exports.getUsersSummary();
    }
};

