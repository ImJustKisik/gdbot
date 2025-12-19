const request = require('supertest');
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const axios = require('axios');
const { PermissionsBitField } = require('discord.js');

// Подменяем better-sqlite3 на простой JS-стаб, чтобы не требовать нативные биндинги
jest.mock('better-sqlite3', () => {
  return jest.fn().mockImplementation(() => {
    return {
      exec: jest.fn(),
      prepare: () => ({ run: jest.fn(), get: jest.fn(), all: jest.fn().mockReturnValue([]) }),
      transaction: (fn) => (...args) => fn(...args)
    };
  });
});

jest.mock('axios');
jest.mock('../../verification-state', () => ({
  consumeVerificationState: jest.fn()
}));
jest.mock('../../utils/config', () => ({
  CLIENT_ID: 'cid', CLIENT_SECRET: 'cs', REDIRECT_URI: 'http://mock'
}));
jest.mock('../../utils/helpers', () => ({
  getGuild: jest.fn(),
  fetchGuildMemberSafe: jest.fn(),
  getConfiguredRole: jest.fn(),
  logAction: jest.fn()
}));

const helpers = require('../../utils/helpers');
const verificationState = require('../../verification-state');
const authRoutes = require('../../routes/auth');

describe('Auth dashboard negative perms', () => {
  test('denies dashboard login without permissions', async () => {
    const app = express();
    app.use(bodyParser.json());
    app.use(session({ secret: 'test', resave: false, saveUninitialized: true }));
    app.use((req, res, next) => { req.session.oauthState = 's'; next(); });
    app.use('/api/auth', authRoutes);

    axios.post.mockResolvedValue({ data: { access_token: 'at' } });
    axios.get.mockResolvedValue({ data: { id: 'u1', username: 'User', avatar: 'av' } });

    helpers.getGuild.mockResolvedValue({
      members: {
        fetch: jest.fn().mockResolvedValue({
          permissions: { has: jest.fn().mockReturnValue(false) }
        })
      }
    });

    const res = await request(app).get('/api/auth/callback?code=123&state=s');
    expect(res.status).toBe(403);
    expect(res.text).toContain('Access Denied');
  });
});
