const db = require('./db');

console.log("--- Diagnostic Start ---");

try {
    // 1. Check Users Count
    const users = db.db.prepare('SELECT count(*) as count FROM users_v2').get();
    console.log(`Total Users in DB: ${users.count}`);

    // 2. Check OAuth Data
    const oauth = db.db.prepare('SELECT count(*) as count FROM user_oauth').get();
    console.log(`Users with OAuth Data: ${oauth.count}`);

    // 3. Check Guild Stats directly
    const stats = db.getGuildStats();
    console.log("Guild Stats Result:", JSON.stringify(stats, null, 2));

    // 4. Check Raw OAuth Data (First 3 rows)
    const rawOAuth = db.db.prepare('SELECT user_id, guilds FROM user_oauth LIMIT 3').all();
    console.log("Sample OAuth Data:");
    rawOAuth.forEach(row => {
        const guildsStr = row.guilds ? (row.guilds.length > 50 ? row.guilds.substring(0, 50) + '...' : row.guilds) : 'null';
        console.log(`- User ${row.user_id}: Guilds length=${row.guilds ? row.guilds.length : 0}, Content=${guildsStr}`);
    });

} catch (e) {
    console.error("Error during check:", e);
}

console.log("--- Diagnostic End ---");
