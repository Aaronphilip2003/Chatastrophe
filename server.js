
// server.js
// Node WebSocket signaling server with MongoDB persistence + simple static client hosting
require('dotenv').config();
const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const { MongoClient, ObjectId } = require('mongodb');
const { customAlphabet } = require('nanoid');

const app = express();
app.use(cors());
app.use(express.json());

// Serve client
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 4070;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017';
const DB_NAME = process.env.DB_NAME || 'webrtc_demo';
const TTL_HOURS = Number(process.env.TTL_HOURS || 24);

const nanoid = customAlphabet('2346789BCDFGHJKMPQRTVWXY', 6); // human-friendly 6-char IDs

let db, calls;

// roomId -> Set<WebSocket>
const rooms = new Map();

function joinRoom(roomId, ws) {
  if (!rooms.has(roomId)) rooms.set(roomId, new Set());
  rooms.get(roomId).add(ws);
  ws._roomId = roomId;
}

function leaveRoom(ws) {
  const roomId = ws._roomId;
  if (roomId && rooms.has(roomId)) {
    rooms.get(roomId).delete(ws);
    if (rooms.get(roomId).size === 0) rooms.delete(roomId);
    ws._roomId = undefined;
  }
}

function broadcast(roomId, data, except) {
  const members = rooms.get(roomId);
  if (!members) return;
  for (const peer of members) {
    if (peer !== except && peer.readyState === 1) {
      peer.send(JSON.stringify(data));
    }
  }
}

async function ensureIndexes() {
  await calls.createIndex({ callId: 1 }, { unique: true });
  await calls.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
}

async function upsertCallState(callId, patch) {
  const expiresAt = new Date(Date.now() + TTL_HOURS * 3600 * 1000);
  await calls.updateOne(
    { callId },
    { $setOnInsert: { callId }, $set: { ...patch, updatedAt: new Date(), expiresAt } },
    { upsert: true }
  );
}

async function getCallState(callId) {
  return calls.findOne({ callId }, { projection: { _id: 0 } });
}

// WebSocket message handlers
const handlers = {
  async 'create-call'(ws) {
    const callId = nanoid();
    joinRoom(callId, ws);
    await upsertCallState(callId, {
      offer: null,
      answer: null,
      offerCandidates: [],
      answerCandidates: []
    });
    ws.send(JSON.stringify({ type: 'call-created', callId }));
  },

  async 'join-call'(ws, msg) {
    const { callId } = msg;
    const state = await getCallState(callId);
    if (!state) {
      ws.send(JSON.stringify({ type: 'error', message: 'Call not found' }));
      return;
    }
    joinRoom(callId, ws);
    ws.send(JSON.stringify({ type: 'joined', callId, state }));
  },

  async 'offer'(ws, msg) {
    const { callId, offer } = msg;
    await upsertCallState(callId, { offer });
    broadcast(callId, { type: 'offer', offer }, ws);
  },

  async 'answer'(ws, msg) {
    const { callId, answer } = msg;
    await upsertCallState(callId, { answer });
    broadcast(callId, { type: 'answer', answer }, ws);
  },

  async 'ice-candidate'(ws, msg) {
    const { callId, role, candidate } = msg;
    const field = role === 'offer' ? 'offerCandidates' : 'answerCandidates';
    await calls.updateOne(
      { callId },
      { $push: { [field]: candidate }, $set: { updatedAt: new Date() } }
    );
    broadcast(callId, { type: 'ice-candidate', candidate }, ws);
  },

  async 'hangup'(ws, msg) {
    const { callId } = msg;
    broadcast(callId, { type: 'hangup' }, ws);
    await calls.deleteOne({ callId });
  }
};

wss.on('connection', (ws) => {
  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data.toString());
      const fn = handlers[msg.type];
      if (!fn) {
        ws.send(JSON.stringify({ type: 'error', message: `Unknown type: ${msg.type}` }));
        return;
      }
      await fn(ws, msg);
    } catch (err) {
      console.error('WS error:', err);
      ws.send(JSON.stringify({ type: 'error', message: 'Bad request' }));
    }
  });

  ws.on('close', () => leaveRoom(ws));
  ws.on('error', () => leaveRoom(ws));
});

// Health endpoint
app.get('/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

(async () => {
  const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  db = client.db(DB_NAME);
  calls = db.collection('calls');
  await ensureIndexes();
  server.listen(PORT, () => {
    console.log(`Server on http://localhost:${PORT}`);
  });
})().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
