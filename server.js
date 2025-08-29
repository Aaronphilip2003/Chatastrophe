// server.js
// Node server with: static hosting, WebSocket signaling, and audio chunk upload
// Run: node server.js
// Files saved under ./recordings/<sessionId>.webm

const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);

// --- Static + CORS ---
app.use(cors());
app.use(express.static(path.join(__dirname)));

// --- Ensure recordings dir exists ---
const recordingsDir = path.join(__dirname, 'recordings');
if (!fs.existsSync(recordingsDir)) fs.mkdirSync(recordingsDir, { recursive: true });

// --- Audio chunk upload route ---
// We accept raw binary (MediaRecorder chunks) and append to <sessionId>.webm
app.post(
  '/upload-audio',
  express.raw({ type: 'application/octet-stream', limit: '200mb' }),
  (req, res) => {
    const sessionId = req.query.sessionId;
    if (!sessionId) {
      return res.status(400).json({ error: 'Missing sessionId' });
    }
    const filePath = path.join(recordingsDir, `${sessionId}.webm`);
    fs.appendFile(filePath, req.body, (err) => {
      if (err) {
        console.error('Append error:', err);
        return res.status(500).json({ error: 'Write failed' });
      }
      res.json({ ok: true });
    });
  }
);

// --- WebSocket signaling (very simple) ---
const wss = new WebSocketServer({ server });

/**
 * In-memory room map:
 * rooms[callId] = { offerer: ws|null, answerer: ws|null }
 * We forward SDP offers/answers and ICE candidates within the same callId.
 */
const rooms = new Map();

function send(ws, msg) {
  if (ws && ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

wss.on('connection', (ws) => {
  let joinedCallId = null;
  let role = null;

  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }

    if (msg.type === 'create-call') {
      // Create a new callId
      const callId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      rooms.set(callId, { offerer: null, answerer: null });
      send(ws, { type: 'call-created', callId });
      return;
    }

    if (msg.type === 'join' && msg.callId && msg.role) {
      joinedCallId = msg.callId;
      role = msg.role; // 'offer' | 'answer'
      const room = rooms.get(joinedCallId) || { offerer: null, answerer: null };
      if (role === 'offer') room.offerer = ws;
      if (role === 'answer') room.answerer = ws;
      rooms.set(joinedCallId, room);
      // Let the peer know join ok
      send(ws, { type: 'joined', callId: joinedCallId, role });
      // Notify counterpart if present
      const other = role === 'offer' ? room.answerer : room.offerer;
      send(other, { type: 'peer-joined', role });
      return;
    }

    if (!joinedCallId) return; // ignore until joined
    const room = rooms.get(joinedCallId);
    if (!room) return;

    // Relay signaling inside the room
    if (msg.type === 'offer' || msg.type === 'answer' || msg.type === 'ice-candidate' || msg.type === 'hangup') {
      const target = (role === 'offer') ? room.answerer : room.offerer;
      send(target, msg);
      if (msg.type === 'hangup') {
        // Clean up room on hangup
        try { room.offerer?.close?.(); } catch {}
        try { room.answerer?.close?.(); } catch {}
        rooms.delete(joinedCallId);
      }
    }
  });

  ws.on('close', () => {
    if (!joinedCallId) return;
    const room = rooms.get(joinedCallId);
    if (!room) return;
    if (role === 'offer') room.offerer = null;
    if (role === 'answer') room.answerer = null;
    const other = role === 'offer' ? room.answerer : room.offerer;
    send(other, { type: 'peer-left' });
    if (!room.offerer && !room.answerer) rooms.delete(joinedCallId);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Open http://localhost:${PORT}/index.html in two tabs to test.`);
});
