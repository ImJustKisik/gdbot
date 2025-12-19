const request = require('supertest');
const express = require('express');
const bodyParser = require('body-parser');

// Mocks
jest.mock('../../db', () => ({
    getUsersSummary: jest.fn(),
    getUser: jest.fn(),
    addWarning: jest.fn(),
    clearPunishments: jest.fn(),
    getSetting: jest.fn(),
    setSetting: jest.fn(),
    getAllSettings: jest.fn(),
    getPresets: jest.fn(),
    getEscalations: jest.fn()
}));

jest.mock('../../utils/middleware', () => ({
    requireAuth: (req, res, next) => {
        req.session = { user: { id: 'admin' } }; // Simulate logged in user
        next();
    }
}));

jest.mock('../../utils/helpers', () => ({
    getGuild: jest.fn(),
    fetchGuildMemberSafe: jest.fn(),
    logAction: jest.fn(),
    normalizeChannelSetting: jest.fn(),
    normalizeRoleSetting: jest.fn(),
    isTextBasedGuildChannel: jest.fn(),
    getAppSetting: jest.fn(),
    generateVerificationMessage: jest.fn()
}));

jest.mock('../../utils/config', () => ({
    DEFAULT_SETTINGS: {
        autoMuteThreshold: 20,
        autoMuteDuration: 60
    }
}));

const db = require('../../db');
const helpers = require('../../utils/helpers');
const apiRoutes = require('../../routes/api');

describe('API Routes', () => {
    let app;

    beforeEach(() => {
        jest.clearAllMocks();
        app = express();
        app.use(bodyParser.json());
        app.use('/api', apiRoutes);
    });

    describe('GET /api/users', () => {
        test('should return merged user list', async () => {
            // Mock getUsersSummary to return an OBJECT keyed by ID, not an array
            // Based on api.js: const localUsers = db.getUsersSummary(targetIds);
            // And usage: const localUser = localUsers[member.id] || ...
            db.getUsersSummary.mockReturnValue({
                '1': { points: 10, warningsCount: 1 }
            });

            // Mock Discord Guild Members
            const mockMembers = new Map();
            mockMembers.set('1', { 
                id: '1', 
                user: { 
                    id: '1', 
                    username: 'User1', 
                    avatar: 'av1',
                    displayAvatarURL: jest.fn().mockReturnValue('http://avatar/1') // Mock displayAvatarURL
                },
                roles: { 
                    cache: { 
                        has: jest.fn(),
                        some: jest.fn()
                    } 
                }
            });
            mockMembers.set('2', { 
                id: '2', 
                user: { 
                    id: '2', 
                    username: 'User2', 
                    avatar: 'av2',
                    displayAvatarURL: jest.fn().mockReturnValue('http://avatar/2') // Mock displayAvatarURL
                },
                roles: { 
                    cache: { 
                        has: jest.fn(),
                        some: jest.fn()
                    } 
                }
            });

            helpers.getGuild.mockResolvedValue({
                members: {
                    cache: mockMembers,
                    fetch: jest.fn().mockResolvedValue(mockMembers)
                }
            });

            const res = await request(app).get('/api/users');
            
            expect(res.status).toBe(200);
            // The API returns { data: [...], total: 2, page: 1, totalPages: 1 }
            expect(res.body.data).toHaveLength(2);
            
            // User 1 should have DB data merged
            const user1 = res.body.data.find(u => u.id === '1');
            expect(user1.points).toBe(10);
            
            // User 2 should have default data
            const user2 = res.body.data.find(u => u.id === '2');
            expect(user2.points).toBe(0);
        });
    });

    describe('POST /api/warn', () => {
        test('should add warning and return updated user', async () => {
            const mockMember = {
                id: '1',
                user: { 
                    tag: 'User1#0000',
                    displayAvatarURL: jest.fn().mockReturnValue('url')
                },
                send: jest.fn().mockResolvedValue(true),
                timeout: jest.fn(),
                moderatable: true
            };

            helpers.fetchGuildMemberSafe.mockResolvedValue(mockMember);
            
            // Mock logAction to avoid undefined error if it's called
            helpers.logAction.mockResolvedValue(true);

            // Mock getUser to return warnings array for sorting
            db.getUser.mockReturnValue({ points: 5, warnings: [] });
            db.getEscalations.mockReturnValue([]); // Mock getEscalations
            helpers.getAppSetting.mockReturnValue(20); // Threshold

            const res = await request(app)
                .post('/api/warn')
                .send({ userId: '1', reason: 'Test', points: 5 });

            expect(res.status).toBe(200);
            expect(db.addWarning).toHaveBeenCalledWith('1', expect.objectContaining({
                reason: 'Test',
                points: 5
            }));
            expect(mockMember.send).toHaveBeenCalled();
        });

        test('should auto-mute if threshold exceeded', async () => {
            const mockMember = {
                id: '1',
                user: { 
                    tag: 'User1#0000',
                    displayAvatarURL: jest.fn().mockReturnValue('url')
                },
                send: jest.fn().mockResolvedValue(true),
                timeout: jest.fn().mockResolvedValue(true),
                moderatable: true
            };

            helpers.fetchGuildMemberSafe.mockResolvedValue(mockMember);
            helpers.logAction.mockResolvedValue(true);

            // User already has 18 points, adding 5 makes 23 > 20
            db.getUser.mockReturnValue({ points: 23, warnings: [] });
            db.getEscalations.mockReturnValue([]); // Mock getEscalations
            helpers.getAppSetting.mockImplementation((key) => {
                if (key === 'autoMuteThreshold') return 20;
                if (key === 'autoMuteDuration') return 60;
                return null;
            });

            const res = await request(app)
                .post('/api/warn')
                .send({ userId: '1', reason: 'Spam', points: 5 });

            expect(res.status).toBe(200);
            expect(mockMember.timeout).toHaveBeenCalled();
        });
    });

    describe('GET /api/settings', () => {
        test('should return settings', async () => {
            db.getAllSettings.mockReturnValue({
                logChannelId: '123'
            });

            const res = await request(app).get('/api/settings');
            
            expect(res.status).toBe(200);
            expect(res.body).toEqual(expect.objectContaining({ logChannelId: '123' }));
        });
    });

    describe('POST /api/settings', () => {
        test('should update settings', async () => {
            helpers.getGuild.mockResolvedValue({});
            helpers.normalizeChannelSetting.mockReturnValue('123');

            const res = await request(app)
                .post('/api/settings')
                .send({ logChannelId: '123' });

            expect(res.status).toBe(200);
            expect(db.setSetting).toHaveBeenCalledWith('logChannelId', '123');
        });
    });
});
