# Discord Guardian Bot - AI Coding Instructions

**Language Requirement**: All responses and explanations must be in **Russian**.

## Architecture Overview

This is a **monolithic fullstack application** with three distinct layers that share state through a local SQLite database:

1. **Discord Bot** (`server.js`) - Discord.js v14 client handling events, OAuth callbacks, and member management
2. **REST API** (`server.js`) - Express server providing `/api/*` endpoints for the dashboard
3. **React Dashboard** (`client/`) - Vite + TypeScript + Tailwind admin panel

**Critical**: Both Discord bot and API run in the **same Node.js process** (`server.js`). The bot MUST be ready before Express starts listening (see `client.once('ready')` event).

## Data Flow Patterns

### User State Synchronization
- **Source of truth**: Discord Guild members cache (`guild.members.cache`)
- **Persistent data**: `database.sqlite` stores custom fields (points, warnings, OAuth tokens) in normalized tables (`users_v2`, `warnings`, `user_oauth`)
- **Merge pattern**: `GET /api/users` combines Discord member data with local DB records on-the-fly
- **Cache strategy**: Members are fetched once at startup to avoid Opcode 8 rate limit errors

```javascript
// Pattern used in server.js
const localUser = db.getUser(member.id) || { points: 0, warnings: [] };
return { ...member.user, ...localUser }; // Discord data + custom fields
```

### OAuth Verification Flow
1. New member joins → Bot sends QR code via DM with `state=userId`
2. User scans → Redirected to Discord OAuth → Returns to `/api/auth/callback?code=X&state=userId`
3. Backend exchanges code for token → Fetches user's guild list → Saves to `database.sqlite`
4. **Critical bug**: If Discord drops the `state` parameter, verification fails (see FIXME in callback handler)

**State parameter is essential** - it links the OAuth response back to the Discord member who initiated verification.

## Development Workflow

### Starting the Application
```powershell
# Development (runs both backend + frontend)
npm run dev

# Production build
npm run build  # Builds React app to client/dist
npm start      # Serves static build from Express
```

**Frontend port**: 5173 (Vite dev server)  
**Backend port**: 3001 (Express + Discord bot)  
**Production**: Express serves React build from `client/dist` and handles routing via `app.get('*')` catch-all

### Environment Variables Required
See `.env` (not committed):
- `DISCORD_BOT_TOKEN` - Bot credentials
- `GUILD_ID` - Target Discord server
- `CLIENT_ID`, `CLIENT_SECRET` - OAuth2 app credentials
- `REDIRECT_URI` - OAuth callback URL (must match Discord app settings exactly)
- `API_KEY` - Google Gemini (optional, for AI text analysis)

## Project-Specific Conventions

### Role Management
Two hardcoded role names in `server.js`:
- `"Unverified"` - Assigned on member join
- `"Verified"` - Assigned after OAuth completion

**Important**: These roles MUST exist in Discord. The bot logs warnings but doesn't create them automatically.

### Punishment System
- **Points-based**: Each warning adds 1-20 points
- **Auto-mute threshold**: >20 points → 1 hour timeout
- **Implemented in**: `POST /api/warn` endpoint
- **Clearing**: `POST /api/clear` resets points to 0 and removes timeout

```javascript
// Auto-mute pattern in server.js
if (user.points > 20 && member.moderatable) {
    await member.timeout(60 * 60 * 1000, 'Auto-mute: Exceeded 20 points');
}
```

### Database Operations
Use `db.js` module - it handles SQLite operations with `better-sqlite3`:
```javascript
const user = db.getUser(userId);  // Returns composite object from multiple tables
db.addWarning(userId, { reason: "Spam", points: 5 }); // Transactional write
```

**Never** manipulate `database.sqlite` directly. Always use `db.js` methods.

## Common Pitfalls

1. **Member Cache Empty**: If `guild.members.cache.size === 0`, the `/api/users` endpoint returns empty. Ensure `await guild.members.fetch()` runs at startup.

2. **OAuth State Loss**: Discord sometimes drops the `state` parameter. Current code logs "CRITICAL" error but can't recover. Consider implementing a session store or fallback mechanism.

3. **DM Failures**: `member.send()` throws if user has DMs disabled. Always wrap in try/catch and provide fallback (e.g., post in `#verification` channel).

4. **Permission Checks**: Before calling `member.timeout()` or `member.roles.add()`, verify `member.moderatable` and role existence. Failures are silent in production.

5. **Frontend API Calls**: All use relative paths (`/api/users`). In development, Vite proxies to `localhost:3001`. Ensure `vite.config.js` has correct proxy settings.

## Key Files Reference

- `server.js` - Monolithic backend (400+ lines, handles everything)
- `db.js` - SQLite wrapper (schema definitions, migrations, read/write operations)
- `client/src/App.tsx` - Main dashboard with view router (dashboard/verification)
- `client/src/components/UsersList.tsx` - Member table with warn/clear/view-guilds actions
- `database.sqlite` - SQLite database file (normalized tables: users_v2, warnings, user_oauth)
- `database.json` - Legacy data file (kept for backup/migration)

## TypeScript Types

Shared interface between frontend and backend (no actual sharing, duplicated):
```typescript
// client/src/types.ts
interface User {
    id: string;
    username: string;
    avatar: string;
    points: number;
    warnings: Warning[];
    status: 'Verified' | 'Muted';
}
```

Backend constructs this shape in `GET /api/users` by merging Discord member data with DB records.

## Testing Strategy

**No automated tests exist**. Manual testing flow:
1. Join Discord server with test account
2. Verify QR code flow works (check DMs)
3. Access dashboard at `http://localhost:5173`
4. Test warn/clear actions
5. Verify auto-mute triggers at 20+ points

## Future Enhancements (from codebase comments)

- Google Gemini AI integration exists but isn't wired to moderation (`analyzeText` function defined but unused)
- `index.js` contains old slash command implementation - seems abandoned in favor of web dashboard
- **Database Migrations**: Implemented in `db.js` (JSON -> SQLite, Schema updates). Future schema changes should be added to the migration logic.
