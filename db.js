const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'database.sqlite');
const jsonPath = path.join(__dirname, 'database.json');

const db = new Database(dbPath);

// Create table
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    data TEXT
  )
`);

// Migration function
function migrateFromJson() {
    if (fs.existsSync(jsonPath)) {
        try {
            console.log('Found database.json, starting migration to SQLite...');
            const jsonData = fs.readFileSync(jsonPath, 'utf8');
            const parsed = JSON.parse(jsonData);
            
            if (parsed.users && Object.keys(parsed.users).length > 0) {
                const insert = db.prepare('INSERT OR REPLACE INTO users (id, data) VALUES (?, ?)');
                const transaction = db.transaction((users) => {
                    for (const [id, data] of Object.entries(users)) {
                        insert.run(id, JSON.stringify(data));
                    }
                });
                transaction(parsed.users);
                console.log(`Successfully migrated ${Object.keys(parsed.users).length} users to SQLite.`);
            }
            
            // Rename json file to backup to prevent re-migration
            fs.renameSync(jsonPath, jsonPath + '.bak');
            console.log('Renamed database.json to database.json.bak');
        } catch (err) {
            console.error('Migration failed:', err);
        }
    }
}

// Run migration on startup
migrateFromJson();

module.exports = {
    getUser: (userId) => {
        const row = db.prepare('SELECT data FROM users WHERE id = ?').get(userId);
        if (row) {
            return JSON.parse(row.data);
        }
        return { points: 0, warnings: [] };
    },
    saveUser: (userId, data) => {
        db.prepare('INSERT OR REPLACE INTO users (id, data) VALUES (?, ?)').run(userId, JSON.stringify(data));
    },
    getAllUsers: () => {
        const rows = db.prepare('SELECT id, data FROM users').all();
        const users = {};
        for (const row of rows) {
            users[row.id] = JSON.parse(row.data);
        }
        return users;
    }
};
