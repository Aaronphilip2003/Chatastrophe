import json
from pathlib import Path
from typing import Dict

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from starlette.websockets import WebSocketState

from .settings import settings
from .utils import ensure_dir, segment_path, merge_segments_to_webm_and_wav

app = FastAPI(title="Meet Clone Backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS if settings.CORS_ORIGINS != ["*"] else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------------
# In-memory room state
# ----------------------
class Room:
    def __init__(self):
        self.members: Dict[str, WebSocket] = {}

    def list_peers(self):
        return list(self.members.keys())

rooms: Dict[str, Room] = {}

def get_or_create_room(room_id: str) -> Room:
    if room_id not in rooms:
        rooms[room_id] = Room()
    return rooms[room_id]

# ----------------------
# WebSocket signaling
# ----------------------
@app.websocket("/ws")
async def ws_handler(ws: WebSocket):
    await ws.accept()
    room_id = None
    user_id = None
    try:
        while True:
            msg = await ws.receive_text()
            data = json.loads(msg)
            typ = data.get("type")

            if typ == "join":
                room_id = data["roomId"]
                user_id = data["userId"]
                room = get_or_create_room(room_id)
                room.members[user_id] = ws

                # send current peers
                await ws.send_json({
                    "type": "peers",
                    "peers": [uid for uid in room.members.keys() if uid != user_id]
                })

                # notify others
                for uid, peer_ws in list(room.members.items()):
                    if uid != user_id and peer_ws.client_state == WebSocketState.CONNECTED:
                        await peer_ws.send_json({"type": "peer-joined", "userId": user_id})

            elif typ == "signal":
                to_uid = data["to"]
                room = get_or_create_room(room_id)
                target = room.members.get(to_uid)
                if target and target.client_state == WebSocketState.CONNECTED:
                    await target.send_json({
                        "type": "signal",
                        "from": user_id,
                        "data": data["data"],
                    })

            elif typ == "leave":
                if room_id and user_id:
                    room = get_or_create_room(room_id)
                    room.members.pop(user_id, None)
                    for uid, peer_ws in list(room.members.items()):
                        if peer_ws.client_state == WebSocketState.CONNECTED:
                            await peer_ws.send_json({"type": "peer-left", "userId": user_id})
                break

    except WebSocketDisconnect:
        pass
    finally:
        if room_id and user_id:
            room = rooms.get(room_id)
            if room:
                room.members.pop(user_id, None)
                for uid, peer_ws in list(room.members.items()):
                    if peer_ws.client_state == WebSocketState.CONNECTED:
                        await peer_ws.send_json({"type": "peer-left", "userId": user_id})

# ----------------------
# Upload endpoints
# ----------------------
@app.post("/upload-audio")
async def upload_audio(
    meetingId: str = Form(...),
    userId: str = Form(...),
    seq: int = Form(...),
    chunk: UploadFile = File(...),
):
    dest = segment_path(meetingId, userId, seq)
    ensure_dir(dest.parent)

    max_bytes = settings.MAX_SEGMENT_SIZE_MB * 1024 * 1024
    size = 0
    with dest.open("wb") as f:
        while True:
            data = await chunk.read(1024 * 1024)
            if not data:
                break
            size += len(data)
            if size > max_bytes:
                dest.unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail="Chunk too large")
            f.write(data)
    return {"ok": True, "path": str(dest)}

@app.post("/finalize")
async def finalize_recording(meetingId: str = Form(...), userId: str = Form(...)):
    webm, wav = merge_segments_to_webm_and_wav(meetingId, userId)
    return {"ok": True, "webm": str(webm), "wav": str(wav)}

@app.get("/health")
async def health():
    return {"status": "ok"}
