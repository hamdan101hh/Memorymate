"""MemoryMate API entrypoint."""
from dotenv import load_dotenv
from pathlib import Path
load_dotenv(Path(__file__).parent / ".env")

import os
import logging
from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

from db import ensure_indexes
import auth
import routes
import capture
import whatsapp
import notifications
import support
import gcal
import seed
import image_routes

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("memorymate")

app = FastAPI(title="MemoryMate API")

app.include_router(auth.router)
app.include_router(routes.router)
app.include_router(capture.router)
app.include_router(whatsapp.router)
app.include_router(notifications.router)
app.include_router(support.router)
app.include_router(gcal.router)
app.include_router(image_routes.router)


@app.get("/api/")
async def health():
    return {"status": "ok", "app": "MemoryMate"}


app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup():
    try:
        await ensure_indexes()
        await seed.seed()
        logger.info("Startup complete: indexes + seed done.")
    except Exception as e:
        logger.error(f"Startup error: {e}")
