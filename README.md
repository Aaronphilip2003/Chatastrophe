
# WebRTC + MongoDB Signaling (Node.js)

A minimal, batteries-included starter that uses:
- **Node + Express** to serve the client
- **WebSockets** for signaling
- **MongoDB** to persist offers/answers/ICE with a TTL index (auto-cleanup)

## Quick Start

### Local (no Docker)

1. Start MongoDB locally (or use Atlas).
2. Clone this folder and install deps:
   ```bash
   npm install
   cp .env.example .env
   # edit .env if needed
   npm run dev
   ```
3. Open http://localhost:8080 in two tabs/devices:
   - Click **Start webcam** on both
   - In one tab, click **Create call** (copy ID)
   - In the other tab, paste ID and click **Answer**

### Docker (Mongo + App)

```bash
docker compose up --build
```
Then open http://localhost:8080

## Configuration

See `.env.example`:

- `PORT`: HTTP/WebSocket port (default 8080)
- `MONGO_URI`: e.g. `mongodb://127.0.0.1:27018` (or your Atlas URI)
- `DB_NAME`: Mongo database name
- `TTL_HOURS`: How long call docs should live

## Notes

- Rooms are held in-memory for broadcasting, while Mongo keeps persistent state so late joiners can catch up.
- A TTL index on `expiresAt` cleans old calls automatically.
- Keep Node 18+ for native fetch/WHATWG URL and good TLS defaults.
