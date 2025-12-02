const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, 'database.sqlite'));

try {
    console.log("Checking 'escalations' table...");
    
    // Check if table exists
    const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='escalations'").get();
    if (!tableExists) {
        console.log("Table 'escalations' does not exist. Creating...");
        db.exec(`
          CREATE TABLE escalations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            threshold INTEGER,
            action TEXT,
            duration INTEGER
          );
        `);
        console.log("Table created.");
    } else {
        const info = db.prepare("PRAGMA table_info(escalations)").all();
        const hasName = info.some(c => c.name === 'name');
        
        if (!hasName) {
            console.log("Column 'name' missing. Adding...");
            db.exec("ALTER TABLE escalations ADD COLUMN name TEXT DEFAULT 'Rule'");
            console.log("Column added.");
        } else {
            console.log("Column 'name' already exists.");
        }
    }
} catch (e) {
    console.error("Error:", e);
}
