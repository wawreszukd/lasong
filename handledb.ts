import { DB } from "https://deno.land/x/sqlite/mod.ts";

const db = new DB('user_stars.sqlite');

export function initializeDatabase() {
    db.execute(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            stars_given_today INTEGER DEFAULT 0,
            stars_received_total INTEGER DEFAULT 0,
            last_updated TEXT
        );
    `);
    console.log("Database initialized successfully.");
}
export function howMuchLeft(username: string, event: any) {

    let stars_available = 3;
    if (event.badges?.some((b: any) => b.set_id === "subscriber")) stars_available += 2;
    if (event.badges?.some((b: any) => b.set_id === "moderator")) stars_available += 1;
    if (["s_t_o_p_y_2", "laczeek"].includes(username.toLowerCase())) {
        stars_available = Number.MAX_SAFE_INTEGER;
    }

    db.query('INSERT OR IGNORE INTO users (username) VALUES (?)', [username]);
    const user = db.queryEntries<{ stars_given_today: number }>('SELECT stars_given_today FROM users WHERE username = ?', [username])[0];
    const stars_given_today = user ? user.stars_given_today : 0;

    const remaining_stars = stars_available - stars_given_today;

    return remaining_stars;
}
export function giveStar(giverUsername: string, receiverUsername: string, event: any) {
    if (giverUsername.toLowerCase() === receiverUsername.toLowerCase()) {
        return { success: false, message: "Nie możesz dać gwiazdki samemu sobie." };
    }

    let stars_available = 3;

    if (event.badges?.some((b: any) => b.set_id === "subscriber")) stars_available += 2;
    if (event.badges?.some((b: any) => b.set_id === "moderator")) stars_available += 1;
    if (["s_t_o_p_y_2", "laczeek"].includes(giverUsername.toLowerCase())) {
        stars_available = Number.MAX_SAFE_INTEGER;
    }

    try {
        db.query("BEGIN TRANSACTION");

        db.query('INSERT OR IGNORE INTO users (username) VALUES (?)', [giverUsername]);

        const giver = db.queryEntries<{ stars_given_today: number }>('SELECT stars_given_today FROM users WHERE username = ?', [giverUsername])[0];

        if (giver && giver.stars_given_today >= stars_available) {
            db.query("ROLLBACK");
            throw new Error(`@${giverUsername} gostku wszystko ma swoje limity.........`);
        }

        db.query(`
            UPDATE users 
            SET 
                stars_given_today = stars_given_today + 1,
                last_updated = CURRENT_TIMESTAMP 
            WHERE 
                username = ?
        `, [giverUsername]);

        db.query(`
            INSERT INTO users (username, stars_received_total, last_updated)
            VALUES (?, 1, CURRENT_TIMESTAMP)
            ON CONFLICT(username) DO UPDATE SET
                stars_received_total = stars_received_total + 1,
                last_updated = CURRENT_TIMESTAMP;
        `, [receiverUsername]);

        db.query("COMMIT");
        return { success: true };
        } catch (error) {
            try {
                db.query("ROLLBACK");
            } catch (rollbackError) {
                console.warn("Rollback failed (probably not active):", rollbackError.message);
            }
            return { success: false, message: error.message || String(error) };
        }
}

export function getUserStats(username: string) {
    const users = db.queryEntries<{ username: string, stars_received_total: number }>(
        'SELECT username, stars_received_total FROM users WHERE username = ?', [username]
    );
    return users[0] || null;
}

export function resetDailyGivenStars() {
    console.log("Resetting daily given stars...");
    db.query('UPDATE users SET stars_given_today = 0 WHERE stars_given_today > 0');
    console.log(`Reset stars for ${db.changes} users.`);
}

export function getTopStars(topLimit = 3) {
    const actualLimit = Math.max(1, Math.min(parseInt(String(topLimit), 10) || 3, 5));

    const topUsers = db.queryEntries<{ username: string, stars_received_total: number }>(`
        SELECT username, stars_received_total 
        FROM users 
        WHERE stars_received_total > 0
        ORDER BY stars_received_total DESC 
        LIMIT ?
    `, [actualLimit]);

    if (topUsers.length === 0) {
        return "Brak użytkowników z gwiazdkami.";
    }

    return topUsers.map((user, index) => 
        `${index + 1}. ${user.username} (${user.stars_received_total})`
    ).join(' | ');
}

globalThis.addEventListener("unload", () => {
    db.close();
});