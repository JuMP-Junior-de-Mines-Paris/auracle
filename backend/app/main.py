from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.routers import rag, admin

app = FastAPI(title="JuMP Oracle API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["Content-Type", "Authorization", "Accept"],
)

app.include_router(rag.router, prefix="/rag", tags=["rag"])
app.include_router(admin.router, prefix="/admin", tags=["admin"])


@app.get("/healthz")
async def health():
    return {"status": "ok"}
