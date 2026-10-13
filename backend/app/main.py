from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.routers import rag, admin, ce, ai_keys

app = FastAPI(title="JuMP Oracle API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["Content-Type", "Authorization", "Accept"],
)

# Vercel forwards /api/* to this service with the prefix intact, so every
# route lives under /api.
api = APIRouter(prefix="/api")
api.include_router(rag.router, prefix="/rag", tags=["rag"])
api.include_router(admin.router, prefix="/admin", tags=["admin"])
api.include_router(ce.router, prefix="/ce", tags=["ce"])
api.include_router(ai_keys.router, prefix="/ai-key", tags=["ai"])


@api.get("/healthz")
async def health():
    return {"status": "ok"}


app.include_router(api)
