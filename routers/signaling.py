from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict, List

router = APIRouter()

# Store active WebSocket connections per room
active_connections: Dict[str, List[WebSocket]] = {}

@router.websocket("/{room_id}")
async def signaling_endpoint(websocket: WebSocket, room_id: str):
    await websocket.accept()

    # Add client to room
    if room_id not in active_connections:
        active_connections[room_id] = []
    active_connections[room_id].append(websocket)

    try:
        while True:
            # Only accept JSON messages
            data = await websocket.receive_json()

            # Relay JSON to all other participants
            for conn in active_connections[room_id]:
                if conn is not websocket:
                    await conn.send_json(data)

    except WebSocketDisconnect:
        # Remove disconnected client
        active_connections[room_id].remove(websocket)
        if not active_connections[room_id]:
            del active_connections[room_id]
