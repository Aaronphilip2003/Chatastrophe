# main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import signaling

app = FastAPI(title="Video Chat Backend", version="0.1.0")

# CORS - allow React frontend to talk to FastAPI
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # later, restrict to your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Healthcheck endpoint
@app.get("/health")
async def health_check():
    return {"status": "ok"}

# Include signaling (WebSocket) routes
app.include_router(signaling.router, prefix="/ws", tags=["signaling"])
