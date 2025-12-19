const request = require('supertest');
const express = require('express');
const bodyParser = require('body-parser');

// Настоящий db (in-memory)
jest.resetModules();
jest.mock('better-sqlite3', () => {
  return jest.fn().mockImplementation(() => {
    const tables = { users_v2: [], warnings: [], user_oauth: [] };
    const api = {
      exec: jest.fn((sql)=>{
        if (/delete from warnings/i.test(sql)) tables.warnings=[];
        if (/delete from users_v2/i.test(sql)) tables.users_v2=[];
        if (/delete from user_oauth/i.test(sql)) tables.user_oauth=[];
      }),
      transaction: (fn)=> (...args)=>fn(...args),
      prepare: (sql)=>{
        const lower = sql.toLowerCase();
        return {
          run: (...args)=>{
            if (lower.startsWith('insert or ignore into users_v2')) {
              const [id]=args; if(!tables.users_v2.find(u=>u.id===id)) tables.users_v2.push({id,points:0,is_monitored:0});
            }
            if (lower.startsWith('insert into warnings')) {
              const [user_id, moderator, reason, points, date]=args; tables.warnings.push({user_id,moderator,reason,points,date});
            }
            if (lower.startsWith('update users_v2 set points = points +')) {
              const [p,id]=args; const u=tables.users_v2.find(u=>u.id===id); if(u) u.points+=p;
            }
            if (lower.startsWith('delete from warnings')) {
              const [id]=args; tables.warnings = tables.warnings.filter(w=>w.user_id!==id);
            }
            if (lower.includes('into user_oauth')) {
              const [user_id, access_token, refresh_token, guilds, verified_at]=args;
              const rec={user_id,access_token,refresh_token,guilds: typeof guilds==='string'?guilds:JSON.stringify(guilds),verified_at};
              const ex=tables.user_oauth.find(u=>u.user_id===user_id);
              if(ex) Object.assign(ex,rec); else tables.user_oauth.push(rec);
            }
            return {changes:1};
          },
          get: (...args)=>{
            if (lower.includes('from users_v2') && lower.includes('where id')) return tables.users_v2.find(u=>u.id===args[0]);
            if (lower.startsWith('select * from user_oauth')) return tables.user_oauth.find(u=>u.user_id===args[0]);
            return undefined;
          },
          all: (...args)=>{
            if (lower.startsWith('select * from warnings')) return tables.warnings.filter(w=>w.user_id===args[0]);
            if (lower.includes('from users_v2') && lower.includes('join warnings')) {
              const ids = args;
              return tables.users_v2
                .filter(u=>ids.includes(u.id))
                .map(u=>({
                  id: u.id,
                  points: u.points,
                  is_monitored: u.is_monitored,
                  warningsCount: tables.warnings.filter(w=>w.user_id===u.id).length
                }));
            }
            if (lower.startsWith('pragma table_info')) return [];
            return [];
          }
        };
      }
    };
    return api;
  });
});

// Отключаем реальную проверку сессии
jest.mock('../../utils/middleware', () => ({
  requireAuth: (req, _res, next) => { req.session = { user: { username: 'tester' } }; next(); }
}));

// Теперь грузим реальные модули
const db = require('../../db');
const apiRoutes = require('../../routes/api');

// Минимальный мок helpers.getGuild
jest.mock('../../utils/helpers', () => {
  return {
    __esModule: true,
    getGuild: jest.fn(),
    fetchGuildMemberSafe: jest.fn(),
    logAction: jest.fn(),
    normalizeChannelSetting: jest.fn(),
    normalizeRoleSetting: jest.fn(),
    isTextBasedGuildChannel: jest.fn(),
    getAppSetting: jest.fn(),
    generateVerificationMessage: jest.fn(),
    getConfiguredRole: jest.fn(),
  };
});
const helpers = require('../../utils/helpers');

// Настройка приложения
function createApp() {
  const app = express();
  app.use(bodyParser.json());
  app.use('/api', apiRoutes);
  return app;
}

describe('/api/users integration merge', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = createApp();
    // очистка таблиц
    db.db.exec(`
      DELETE FROM warnings;
      DELETE FROM user_oauth;
      DELETE FROM users_v2;
    `);
  });

  test('merges Discord members with DB points and paginates', async () => {
    // DB: только один пользователь с points=7
    db.ensureUserExists('u1');
    db.addWarning('u1', { reason: 'r', points: 7, moderator: 'm' });

    // Discord members (2 шт)
    const mockMembersMap = new Map();
    const m1 = {
      id: 'u1',
      user: { username: 'Alpha', displayAvatarURL: () => 'url1' },
      roles: { cache: { some: () => false } },
      communicationDisabledUntilTimestamp: 0,
    };
    const m2 = {
      id: 'u2',
      user: { username: 'Beta', displayAvatarURL: () => 'url2' },
      roles: { cache: { some: () => false } },
      communicationDisabledUntilTimestamp: 0,
    };
    mockMembersMap.set('u1', m1);
    mockMembersMap.set('u2', m2);

    helpers.getGuild.mockResolvedValue({
      members: {
        cache: mockMembersMap,
        fetch: jest.fn().mockResolvedValue(mockMembersMap),
      },
    });

    const res = await request(app).get('/api/users');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);

    const u1 = res.body.data.find(u => u.id === 'u1');
    const u2 = res.body.data.find(u => u.id === 'u2');
    expect(u1.points).toBe(7);
    expect(u2.points).toBe(0);
  });
});
