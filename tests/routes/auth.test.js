const request = require('supertest');
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const axios = require('axios');
const { PermissionsBitField } = require('discord.js');

// Mocks
jest.mock('axios');
jest.mock('../../db', () => ({
    updateOAuth: jest.fn()
}));
jest.mock('../../verification-state', () => ({
    consumeVerificationState: jest.fn()
}));
jest.mock('../../utils/config', () => ({
    CLIENT_ID: 'mock-client-id',
    CLIENT_SECRET: 'mock-client-secret',
    REDIRECT_URI: 'http://mock-redirect'
}));
jest.mock('../../utils/helpers', () => ({
    getGuild: jest.fn(),
    fetchGuildMemberSafe: jest.fn(),
    getConfiguredRole: jest.fn(),
    logAction: jest.fn()
}));

const db = require('../../db');
const verificationState = require('../../verification-state');
const helpers = require('../../utils/helpers');
const authRoutes = require('../../routes/auth');

describe('Auth Routes', () => {
    let app;

    beforeEach(() => {
        jest.clearAllMocks();
        app = express();
        app.use(bodyParser.json());
        app.use(session({
            secret: 'test-secret',
            resave: false,
            saveUninitialized: true
        }));
        app.use('/api/auth', authRoutes);
    });

    describe('GET /api/auth/login', () => {
        test('should redirect to Discord OAuth', async () => {
            const res = await request(app).get('/api/auth/login');
            expect(res.status).toBe(302);
            expect(res.header.location).toContain('discord.com/api/oauth2/authorize');
            expect(res.header.location).toContain('client_id=mock-client-id');
        });
    });

    describe('GET /api/auth/me', () => {
        test('should return unauthenticated by default', async () => {
            const res = await request(app).get('/api/auth/me');
            expect(res.status).toBe(200);
            expect(res.body.authenticated).toBe(false);
        });

        // Note: Testing authenticated state requires mocking session persistence or middleware,
        // which is tricky with supertest + express-session in isolation.
        // We can skip it or use a middleware to inject session.
    });

    describe('POST /api/auth/logout', () => {
        test('should destroy session', async () => {
            const res = await request(app).post('/api/auth/logout');
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });
    });

    describe('GET /api/auth/callback', () => {
        test('should handle missing code', async () => {
            const res = await request(app).get('/api/auth/callback');
            expect(res.status).toBe(400);
            expect(res.text).toContain('Missing code parameter');
        });

        test('should handle missing state', async () => {
            const res = await request(app).get('/api/auth/callback?code=123');
            expect(res.status).toBe(400);
            expect(res.text).toContain('Missing state parameter');
        });

        test('should handle Discord error', async () => {
            const res = await request(app).get('/api/auth/callback?error=access_denied&error_description=User+denied');
            expect(res.status).toBe(400);
            expect(res.text).toContain('Authorization Error');
        });

        test('should handle verification flow (success)', async () => {
            // Mock Axios Token Exchange
            axios.post.mockResolvedValue({
                data: { access_token: 'at', refresh_token: 'rt' }
            });

            // Mock Axios Guilds Fetch
            axios.get.mockResolvedValue({
                data: [{ id: 'g1' }]
            });

            // Mock Verification State
            verificationState.consumeVerificationState.mockReturnValue('user-id-123');

            // Mock Guild & Member
            const mockMember = {
                id: 'user-id-123',
                roles: {
                    add: jest.fn(),
                    remove: jest.fn()
                },
                send: jest.fn().mockResolvedValue(true)
            };
            helpers.getGuild.mockResolvedValue({ id: 'guild-id' });
            helpers.fetchGuildMemberSafe.mockResolvedValue(mockMember);
            helpers.getConfiguredRole.mockReturnValue({ id: 'role-id' });

            const res = await request(app).get('/api/auth/callback?code=valid-code&state=valid-state');

            expect(res.status).toBe(200);
            expect(res.text).toContain('Verification Successful');
            
            expect(db.updateOAuth).toHaveBeenCalledWith('user-id-123', expect.objectContaining({
                accessToken: 'at',
                refreshToken: 'rt'
            }));
            expect(mockMember.roles.add).toHaveBeenCalled();
            expect(mockMember.roles.remove).toHaveBeenCalled();
        });

        test('should handle verification flow (invalid state)', async () => {
            axios.post.mockResolvedValue({
                data: { access_token: 'at' }
            });
            verificationState.consumeVerificationState.mockReturnValue(null);

            const res = await request(app).get('/api/auth/callback?code=valid-code&state=invalid-state');

            expect(res.status).toBe(400);
            expect(res.text).toContain('Verification Failed');
        });

        test('should handle dashboard login flow (success)', async () => {
            // We need to inject session state to test dashboard login
            // We can do this by creating a custom app setup for this test
            const appWithSession = express();
            appWithSession.use(bodyParser.json());
            appWithSession.use(session({ secret: 'test', resave: false, saveUninitialized: true }));
            
            // Middleware to set session state
            appWithSession.use((req, res, next) => {
                req.session.oauthState = 'dashboard-state';
                next();
            });
            
            appWithSession.use('/api/auth', authRoutes);

            axios.post.mockResolvedValue({
                data: { access_token: 'at' }
            });

            axios.get.mockResolvedValue({
                data: { id: 'admin-id', username: 'Admin', avatar: 'av' }
            });

            const mockMember = {
                permissions: {
                    has: jest.fn().mockReturnValue(true) // Admin permissions
                }
            };

            helpers.getGuild.mockResolvedValue({
                members: {
                    fetch: jest.fn().mockResolvedValue(mockMember)
                }
            });

            const res = await request(appWithSession).get('/api/auth/callback?code=code&state=dashboard-state');

            expect(res.status).toBe(302); // Redirect to /
            expect(res.header.location).toBe('/');
        });
    });
});
