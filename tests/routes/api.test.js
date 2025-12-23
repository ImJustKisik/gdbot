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
    getEscalations: jest.fn(),
    getAiUsageSummary: jest.fn(),
    getMonitoredUsers: jest.fn(),
    getMonitoredChannels: jest.fn(),
    setMonitored: jest.fn(),
    setDetoxifyEnabled: jest.fn(),
    setChannelMonitored: jest.fn()
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

jest.mock('../../utils/ai', () => ({
    DEFAULT_PROMPT: 'prompt',
    DEFAULT_RULES: 'rules'
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
        // Debug: ensure new routes registered
        const registeredRoutes = apiRoutes.stack
            .filter((layer) => layer.route)
            .map((layer) => layer.route.path);
        console.log('Registered API routes:', registeredRoutes);
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

    describe('GET /api/stats/ai/usage', () => {
        test('returns AI usage summary', async () => {
            const mockSummary = {
                rangeDays: 30,
                totals: { requests: 5, promptTokens: 1000, completionTokens: 500, cost: 0.02 },
                byModel: [],
                byContext: [],
                daily: []
            };

            db.getAiUsageSummary.mockReturnValue(mockSummary);

            const res = await request(app).get('/api/stats/ai/usage');

            expect(res.status).toBe(200);
            expect(res.body).toEqual(mockSummary);
            expect(db.getAiUsageSummary).toHaveBeenCalledWith(30);
        });
    });

    describe('Monitoring endpoints', () => {
        beforeEach(() => {
            helpers.getGuild.mockResolvedValue({
                members: {
                    cache: new Map([
                        ['1', { user: { username: 'Member1', displayAvatarURL: () => 'avatar-url' } }]
                    ])
                },
                channels: {
                    cache: new Map([
                        ['10', { name: 'general' }]
                    ])
                }
            });
        });

        test('GET /api/monitoring returns users and channels', async () => {
            db.getMonitoredUsers.mockReturnValue([{ id: '1', detoxifyEnabled: true, aiPingEnabled: true }]);
            db.getMonitoredChannels.mockReturnValue([{ channel_id: '10', detoxify_enabled: 1, ai_ping_enabled: 0 }]);
            helpers.fetchGuildMemberSafe.mockResolvedValue({ user: { username: 'Member1', displayAvatarURL: () => 'avatar-url' } });
            helpers.getAppSetting.mockImplementation((key) => {
                if (key === 'aiEnabled') return true;
                if (key === 'aiAction') return 'log';
                if (key === 'aiThreshold') return 60;
                return null;
            });

            const res = await request(app).get('/api/monitoring');

            expect(res.status).toBe(200);
            expect(res.body.users).toHaveLength(1);
            expect(res.body.channels).toHaveLength(1);
            expect(res.body.settings).toEqual(expect.objectContaining({ aiEnabled: true }));
        });

        test('POST /api/monitoring/users/:id updates user monitoring', async () => {
            helpers.getGuild.mockResolvedValue({
                members: { cache: new Map() },
                channels: { cache: new Map() }
            });
            helpers.logAction.mockResolvedValue(true);

            const res = await request(app)
                .post('/api/monitoring/users/1')
                .send({ isMonitored: true, detoxifyEnabled: false, aiPingEnabled: true });

            expect(res.status).toBe(200);
            expect(db.setMonitored).toHaveBeenCalledWith('1', true, true);
            expect(db.setDetoxifyEnabled).toHaveBeenCalledWith('1', false);
        });

        test('POST /api/monitoring/channels/:id updates channel monitoring', async () => {
            helpers.getGuild.mockResolvedValue({
                members: { cache: new Map() },
                channels: { cache: new Map([['10', { name: 'general' }]]) }
            });
            helpers.logAction.mockResolvedValue(true);

            const res = await request(app)
                .post('/api/monitoring/channels/10')
                .send({ enabled: true, detoxifyEnabled: false, aiPingEnabled: false });

            expect(res.status).toBe(200);
            expect(db.setChannelMonitored).toHaveBeenCalledWith('10', true, false, false);
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
