from pydantic import BaseModel
from typing import List
import os

class Settings(BaseModel):
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))
    RECORDINGS_DIR: str = os.getenv("RECORDINGS_DIR", "/app/recordings")
    MAX_SEGMENT_SIZE_MB: int = int(os.getenv("MAX_SEGMENT_SIZE_MB", "20"))
    CORS_ORIGINS: List[str] = [o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()]

settings = Settings()
