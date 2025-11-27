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
