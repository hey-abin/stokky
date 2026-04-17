# stokky

`stokky` is a Next.js random chat application inspired by Omegle, built with:

- `Next.js` App Router in JavaScript
- `Tailwind CSS` for a responsive interface
- `Socket.IO` for queueing, realtime messaging, and WebRTC signaling
- `WebRTC` for 1-to-1 video and audio
- `MongoDB` with `Mongoose` for room and message persistence

## Features

- Responsive landing page and chat interface
- Text chat, video chat, and combined mode
- Keyword-based matchmaking
- Shared-interest badges in each room
- Mongo-backed room/message history endpoint
- Queue status indicator for live traffic

## Run locally

1. Install dependencies:

```bash
npm install
```

2. Copy envs:

```bash
cp .env.example .env.local
```

3. Update `MONGODB_URI` in `.env.local`

4. Start the app:

```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000)

## Notes for production

- If MongoDB is not running locally, `stokky` falls back to in-memory room storage so the app is still usable for demo and UI testing. Start a real Mongo instance to enable durable room/message persistence.
- Add a real `TURN` server so video calls work reliably across strict NATs and mobile networks.
- For very high concurrency and multi-instance deployment, move the matchmaking queue from in-memory storage to Redis and add the Socket.IO Redis adapter.
- Add moderation, rate limiting, reporting, and abuse prevention before public launch.
