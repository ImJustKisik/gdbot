const Database = require('better-sqlite3');

// --- In-Memory Mock Database Implementation ---
// Since better-sqlite3 native bindings are missing/broken, we simulate a simple DB in JS.
const mockData = {
    users_v2: [],
    warnings: [],
    user_oauth: [],
    settings: [],
    presets: [],
    escalations: []
};

const mockDb = {
    prepare: jest.fn((sql) => {
        const sqlLower = sql.toLowerCase().trim();
        
        return {
            run: jest.fn((...args) => {
                // Simple parsing for INSERT/UPDATE/DELETE used in db.js
                if (sqlLower.includes('insert') && sqlLower.includes('into users_v2')) {
                    // INSERT OR IGNORE INTO users_v2 (id, points) VALUES (?, 0)
                    const id = args[0];
                    if (!mockData.users_v2.find(u => u.id === id)) {
                        mockData.users_v2.push({ id, points: 0 });
                    }
                    return { changes: 1, lastInsertRowid: 0 };
                }
                
                if (sqlLower.startsWith('update users_v2 set points = points +')) {
                    // UPDATE users_v2 SET points = points + ? WHERE id = ?
                    const [points, id] = args;
                    const user = mockData.users_v2.find(u => u.id === id);
                    if (user) user.points += points;
                    return { changes: 1 };
                }

                if (sqlLower.startsWith('update users_v2 set points = 0')) {
                    const [id] = args;
                    const user = mockData.users_v2.find(u => u.id === id);
                    if (user) user.points = 0;
                    return { changes: 1 };
                }

                if (sqlLower.startsWith('insert into warnings')) {
                    // INSERT INTO warnings ... VALUES (?, ?, ?, ?, ?)
                    const [user_id, moderator, reason, points, date] = args;
                    mockData.warnings.push({ user_id, moderator, reason, points, date });
                    return { changes: 1 };
                }

                if (sqlLower.startsWith('delete from warnings')) {
                    const [user_id] = args;
                    mockData.warnings = mockData.warnings.filter(w => w.user_id !== user_id);
                    return { changes: 1 };
                }

                if (sqlLower.startsWith('insert or replace into settings')) {
                    const [key, value] = args;
                    const idx = mockData.settings.findIndex(s => s.key === key);
                    if (idx >= 0) mockData.settings[idx] = { key, value };
                    else mockData.settings.push({ key, value });
                    return { changes: 1 };
                }

                if (sqlLower.startsWith('insert into escalations')) {
                    const [name, threshold, action, duration] = args;
                    const id = mockData.escalations.length + 1;
                    mockData.escalations.push({ id, name, threshold, action, duration });
                    return { changes: 1, lastInsertRowid: id };
                }

                if (sqlLower.startsWith('delete from escalations')) {
                    const [id] = args;
                    mockData.escalations = mockData.escalations.filter(e => e.id !== id);
                    return { changes: 1 };
                }
                
                if (sqlLower.includes('into user_oauth')) {
                     const [user_id, access_token, refresh_token, guilds, verified_at] = args;
                     const idx = mockData.user_oauth.findIndex(u => u.user_id === user_id);
                     const record = { user_id, access_token, refresh_token, guilds, verified_at };
                     if (idx >= 0) mockData.user_oauth[idx] = record;
                     else mockData.user_oauth.push(record);
                     return { changes: 1 };
                }

                return { changes: 0, lastInsertRowid: 0 };
            }),
            
            get: jest.fn((...args) => {
                if (sqlLower.startsWith('select * from users_v2 where id')) {
                    const [id] = args;
                    return mockData.users_v2.find(u => u.id === id);
                }
                if (sqlLower.startsWith('select value from settings')) {
                    const [key] = args;
                    return mockData.settings.find(s => s.key === key);
                }
                if (sqlLower.startsWith('select * from user_oauth')) {
                    const [id] = args;
                    return mockData.user_oauth.find(u => u.user_id === id);
                }
                return undefined;
            }),
            
            all: jest.fn((...args) => {
                if (sqlLower.startsWith('select * from warnings')) {
                    const [id] = args;
                    return mockData.warnings.filter(w => w.user_id === id);
                }
                if (sqlLower.startsWith('select * from escalations')) {
                    return [...mockData.escalations];
                }
                return [];
            })
        };
    }),
    exec: jest.fn(),
    transaction: jest.fn((fn) => {
        return (...args) => fn(...args);
    })
};

jest.mock('better-sqlite3', () => {
    return jest.fn().mockImplementation(() => mockDb);
});

// Require db AFTER mocking
const dbModule = require('../db');

describe('Database Module (Mocked)', () => {
    beforeEach(() => {
        // Reset mock data
        mockData.users_v2 = [];
        mockData.warnings = [];
        mockData.user_oauth = [];
        mockData.settings = [];
        mockData.presets = [];
        mockData.escalations = [];
        jest.clearAllMocks();
    });

    describe('User Management', () => {
        test('ensureUserExists should create a user', () => {
            const userId = 'user123';
            dbModule.ensureUserExists(userId);
            
            // Verify via internal mock data since getUser uses a complex query we might not have fully mocked
            const user = mockData.users_v2.find(u => u.id === userId);
            expect(user).toBeDefined();
            expect(user.points).toBe(0);
        });

        test('addWarning should add warning and increase points', () => {
            const userId = 'userWarn';
            const warning = {
                reason: 'Spam',
                points: 10,
                moderator: 'mod1',
                date: new Date().toISOString()
            };

            // Pre-create user
            mockData.users_v2.push({ id: userId, points: 0 });

            dbModule.addWarning(userId, warning);

            const user = mockData.users_v2.find(u => u.id === userId);
            expect(user.points).toBe(10);
            
            const warnings = mockData.warnings.filter(w => w.user_id === userId);
            expect(warnings).toHaveLength(1);
            expect(warnings[0].reason).toBe('Spam');
        });
    });

    describe('Settings', () => {
        test('should save and retrieve settings', () => {
            dbModule.setSetting('testKey', { foo: 'bar' });
            const val = dbModule.getSetting('testKey');
            expect(val).toEqual({ foo: 'bar' });
        });
    });

    describe('Escalations', () => {
        test('should add and retrieve escalations', () => {
            dbModule.addEscalation('Mute Rule', 20, 'mute', 60);
            const list = dbModule.getEscalations();
            
            expect(list).toHaveLength(1);
            expect(list[0].name).toBe('Mute Rule');
        });
    });
});
