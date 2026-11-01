"""The UnderCover backend."""

import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from backend import db
from backend.routes import router


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Seed the database when the app starts. Each request opens its own connection."""
    app.state.db_path = os.getenv("UNDERCOVER_DB", "undercover.db")
    db.connect(app.state.db_path).close()
    yield


def create_app() -> FastAPI:
    """Create the UnderCover backend app."""
    app = FastAPI(title="UnderCover", lifespan=lifespan)
    app.include_router(router)
    return app


app = create_app()
