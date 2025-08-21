# rooms.py
import uuid

class RoomManager:
    def __init__(self):
        # { room_id: {"participants": set()} }
        self.rooms = {}

    def create_room(self) -> str:
        room_id = str(uuid.uuid4())
        self.rooms[room_id] = {"participants": set()}
        return room_id

    def join_room(self, room_id: str, participant: str) -> bool:
        if room_id not in self.rooms:
            return False
        self.rooms[room_id]["participants"].add(participant)
        return True

    def get_participants(self, room_id: str):
        if room_id not in self.rooms:
            return None
        return list(self.rooms[room_id]["participants"])

    def delete_room(self, room_id: str):
        if room_id in self.rooms:
            del self.rooms[room_id]
