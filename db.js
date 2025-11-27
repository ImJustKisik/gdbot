const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'database.json');

// Initialize DB if not exists
if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify({ users: {} }, null, 2));
}

function readDB() {
    try {
        const data = fs.readFileSync(dbPath, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.error("Error reading DB:", err);
        return { users: {} };
    }
}

function writeDB(data) {
    try {
        fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error("Error writing DB:", err);
    }
}

module.exports = {
    getUser: (userId) => {
        const db = readDB();
        return db.users[userId] || { points: 0, warnings: [] };
    },
    saveUser: (userId, data) => {
        const db = readDB();
        db.users[userId] = data;
        writeDB(db);
    },
    getAllUsers: () => {
        return readDB().users;
    }
};
