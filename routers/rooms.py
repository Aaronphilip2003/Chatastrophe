# routers/rooms.py
from fastapi import APIRouter, HTTPException
from rooms import RoomManager

router = APIRouter()
room_manager = RoomManager()

@router.post("/rooms/")
def create_room():
    room_id = room_manager.create_room()
    return {"room_id": room_id}

@router.post("/rooms/{room_id}/join")
def join_room(room_id: str, participant: str):
    success = room_manager.join_room(room_id, participant)
    if not success:
        raise HTTPException(status_code=404, detail="Room not found")
    return {"room_id": room_id, "participant": participant}

@router.get("/rooms/{room_id}")
def get_participants(room_id: str):
    participants = room_manager.get_participants(room_id)
    if participants is None:
        raise HTTPException(status_code=404, detail="Room not found")
    return {"room_id": room_id, "participants": participants}