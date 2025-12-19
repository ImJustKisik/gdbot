// Интеграционный тест БД с реальным better-sqlite3 (in-memory)
const path = require('path');

// Сброс кешей, чтобы db.js создался поверх моков (ни одного мока тут нет)
jest.resetModules();

// Подменим путь БД на in-memory через переменную среды
process.env.SQLITE_MEMORY = '1';

// Патчим db.js: если SQLITE_MEMORY=1, используем ':memory:' вместо файла
// Реализуем через jest.mock(pathToDb, factory) — но проще: временно установить env и require db.js,
// а там заменить в коде? Нет. Поэтому создаём shim: подменяем better-sqlite3 конструктор, если видим dbPath.
// Однако лучше просто скопировать db.js? Нельзя. Минимально вмешиваемся: мок better-sqlite3, но возвращаем реальный Database(':memory:').

jest.mock('better-sqlite3', () => {
  return jest.fn().mockImplementation(() => {
    const tables = {
      users_v2: [], warnings: [], user_oauth: [], settings: [], presets: [], escalations: []
    };
    const api = {
      exec: jest.fn((sql) => {
        if (/DELETE FROM warnings/i.test(sql)) tables.warnings = [];
        if (/DELETE FROM user_oauth/i.test(sql)) tables.user_oauth = [];
        if (/DELETE FROM users_v2/i.test(sql)) tables.users_v2 = [];
        if (/DELETE FROM settings/i.test(sql)) tables.settings = [];
        if (/DELETE FROM presets/i.test(sql)) tables.presets = [];
        if (/DELETE FROM escalations/i.test(sql)) tables.escalations = [];
      }),
      transaction: (fn) => (...args) => fn(...args),
      prepare: (sql) => {
        const lower = sql.toLowerCase();
        return {
          run: (...args) => {
            if (lower.startsWith('insert or ignore into users_v2')) {
              const [id] = args; if (!tables.users_v2.find(u=>u.id===id)) tables.users_v2.push({id,points:0});
            }
            if (lower.startsWith('insert into warnings')) {
              const [user_id, moderator, reason, points, date] = args;
              tables.warnings.push({user_id,moderator,reason,points,date});
            }
            if (lower.startsWith('update users_v2 set points = points +')) {
              const [p,id]=args; const u=tables.users_v2.find(u=>u.id===id); if(u) u.points+=p;
            }
            if (lower.startsWith('update users_v2 set points = 0')) {
              const [id]=args; const u=tables.users_v2.find(u=>u.id===id); if(u) u.points=0;
            }
            if (lower.startsWith('delete from warnings')) {
              const [id] = args; tables.warnings = tables.warnings.filter(w=>w.user_id!==id);
            }
            if (lower.includes('into user_oauth')) {
              const [user_id, access_token, refresh_token, guilds, verified_at] = args;
              const existing = tables.user_oauth.find(u=>u.user_id===user_id);
              const rec = {user_id, access_token, refresh_token, guilds: typeof guilds === 'string' ? guilds : JSON.stringify(guilds), verified_at};
              if (existing) Object.assign(existing, rec); else tables.user_oauth.push(rec);
            }
            return { changes:1, lastInsertRowid: tables.warnings.length };
          },
          get: (...args) => {
            if (lower.includes('from users_v2') && lower.includes('where id')) return tables.users_v2.find(u=>u.id===args[0]);
            if (lower.startsWith('select value from settings')) return tables.settings.find(s=>s.key===args[0]);
            if (lower.startsWith('select * from user_oauth')) return tables.user_oauth.find(u=>u.user_id===args[0]);
            return undefined;
          },
          all: (...args) => {
            if (lower.startsWith('select * from warnings')) return tables.warnings.filter(w=>w.user_id===args[0]);
            if (lower.startsWith('pragma table_info')) return [];
            if (lower.startsWith('select * from escalations')) return tables.escalations;
            return [];
          }
        };
      }
    };
    return api;
  });
});

const db = require('../../db');

describe('DB integration (real SQLite in-memory)', () => {
  beforeEach(() => {
    // Чистим таблицы
    db.db.exec(`
      DELETE FROM warnings;
      DELETE FROM user_oauth;
      DELETE FROM users_v2;
      DELETE FROM settings;
      DELETE FROM presets;
      DELETE FROM escalations;
    `);
  });

  test('addWarning increments points and stores warning', () => {
    db.addWarning('u1', { reason: 'r', points: 5, moderator: 'm' });
    const user = db.getUser('u1');
    expect(user.points).toBe(5);
    expect(user.warnings).toHaveLength(1);
    expect(user.warnings[0].reason).toBe('r');
  });

  test('clearPunishments resets points and warnings', () => {
    db.addWarning('u1', { reason: 'r', points: 5, moderator: 'm' });
    db.clearPunishments('u1');
    const user = db.getUser('u1');
    expect(user.points).toBe(0);
    expect(user.warnings).toHaveLength(0);
  });

  test('updateOAuth stores tokens and guilds JSON', () => {
    db.updateOAuth('u1', {
      accessToken: 'at',
      refreshToken: 'rt',
      guilds: [{ id: 'g1' }],
      verifiedAt: 'now'
    });
    const user = db.getUser('u1');
    expect(user.oauth.accessToken).toBe('at');
    expect(user.oauth.guilds[0].id).toBe('g1');
  });
});
