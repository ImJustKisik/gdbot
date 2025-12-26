const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new Database(dbPath);

try {
    console.log("Checking verification_states table...");
    db.exec(`
      CREATE TABLE IF NOT EXISTS verification_states (
        state TEXT PRIMARY KEY,
        user_id TEXT,
        expires_at INTEGER
      );
    `);
    
    console.log("Adding 'consumed' column to verification_states...");
    db.exec("ALTER TABLE verification_states ADD COLUMN consumed INTEGER DEFAULT 0");
    console.log("Migration successful!");
} catch (error) {
    if (error.message.includes("duplicate column name")) {
        console.log("Column 'consumed' already exists.");
    } else {
        console.error("Migration failed:", error);
    }
}
