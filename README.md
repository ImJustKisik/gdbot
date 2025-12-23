# Discord Guardian Bot

Discord Guardian is a comprehensive Discord administration system featuring a web dashboard, QR code verification, and an automated warning/punishment system.

## Features

- **Web Dashboard**: React-based admin panel to view user stats and manage punishments.
- **QR Verification**: OAuth2-based verification system using QR codes sent via DM.
- **Automated Moderation**: 
  - Warn users with reasons.
  - Auto-mute after 20 penalty points.
  - View user server lists (if verified via OAuth).
- **AI Integration**: Google Gemini integration for text analysis (ready for expansion).
- **AI Usage & Monitor View**: Dashboard page with live AI usage metrics (requests, tokens, cost) plus controls for monitored users and channels.

## Tech Stack

- **Backend**: Node.js, Express, Discord.js v14
- **Frontend**: React, Vite, Tailwind CSS, Recharts, Lucide Icons
- **Database**: Local JSON file (simple and portable)

## Prerequisites

- Node.js (v18 or higher)
- A Discord Bot Token (with Privileged Intents enabled: Server Members, Message Content)
- Google Gemini API Key (optional)

## Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd discord-guardian
   ```

2. **Install Dependencies**
   ```bash
   # Install backend dependencies
   npm install

   # Install frontend dependencies
   cd client
   npm install
   cd ..
   ```

3. **Configuration**
   Create a `.env` file in the root directory:
   ```env
   DISCORD_BOT_TOKEN=your_bot_token
   GUILD_ID=your_server_id
   PORT=3001
   API_KEY=your_gemini_api_key
   CLIENT_ID=your_discord_client_id
   CLIENT_SECRET=your_discord_client_secret
   REDIRECT_URI=http://localhost:3001/api/auth/callback
   ```

## Running the Project

To run both the backend and frontend concurrently (development mode):

```bash
npm run dev
```

- **Dashboard**: http://localhost:5173
- **Backend API**: http://localhost:3001

### Health Check & Alerts

- `GET /health` — lightweight unauthenticated endpoint that checks Discord client readiness, member-cache freshness, and SQLite availability. It returns `200 OK` during the warm-up period, but once the client stays out of READY for ~2 minutes, the member cache remains empty for >5 minutes, or SQLite fails, the endpoint switches to `503` with detailed reasons.
- A background monitor polls the same metrics every minute and sends a “Health Monitor Alert” embed to the configured log channel (`logChannelId` or `modLogChannelId`) whenever the degradation persists. This surfaces intent issues, empty caches, or database outages without manual checks.

### AI Usage & Monitor page

- Новая вкладка “AI Usage” в React-дэшборде отображает статистику по таблице `ai_usage` (запросы/токены/стоимость, график за последние 30 дней, топ моделей и контекстов).
- На той же странице можно быстро просмотреть и отключать мониторинг конкретных пользователей и каналов, не вызывая Slash-команд. Данные отдаются из `/monitoring`, а изменения отправляются POST-запросами на `/monitoring/users/:id` и `/monitoring/channels/:id`.

## Deployment

To build for production:

1. Build the frontend:
   ```bash
   npm run build
   ```
2. Start the server:
   ```bash
   npm start
   ```

## License

MIT
