### 🟦 Architecture

**1. Frontend (React + WebRTC APIs)**

- Captures video/audio from the user’s camera/mic using the browser’s `navigator.mediaDevices.getUserMedia()`.
- Shows local video.
- Sends an SDP offer (a session description with codecs, etc.) via WebSocket to the backend.
- Receives the remote user’s SDP answer and ICE candidates, attaches them to the `<video>` element.
- Handles joining/leaving rooms (just a unique room ID).

**2. Backend (Python, e.g. FastAPI + aiortc or just signaling)**

- Provides REST endpoints:
    - `/create-room` → returns a room ID
    - `/join-room/{room_id}` → join existing session
- Manages WebSocket connections for signaling:
    - Exchanges SDP offers/answers between peers.
    - Passes ICE candidates back and forth.
- If you go a step further:
    - Run aiortc as an SFU (Selective Forwarding Unit) if you want >2 participants efficiently (rather than pure peer-to-peer mesh).

**3. STUN/TURN Server (coturn)**

- STUN: Finds your public IP/port (for most NATs).
- TURN: Relays media if peer-to-peer is blocked (enterprise firewalls, symmetric NAT).
- This is an external component, not Python.

---

### ⚙️ Data Flow (two users joining a call)

1. User A opens room → frontend asks backend → backend creates room entry in DB (even in-memory dict for MVP).
2. User B joins same room → backend matches both in the signaling channel.
3. A sends SDP Offer via WebSocket → backend forwards to B.
4. B sends SDP Answer → backend forwards to A.
5. Both exchange ICE candidates (backend forwards them).
6. Direct P2P WebRTC connection is established → audio/video flows peer-to-peer (or via TURN).

---

### 🔧 What you need to implement

- **Frontend (React):**
    - A simple page with:
        - Local video preview
        - Remote video grid
        - A “create/join room” button
- **Backend (FastAPI + WebSocket):**
    - Room management (dict of rooms → participants)
    - Message relay (SDP + ICE forwarding)
- **Infra:**
    - Deploy coturn for NAT traversal