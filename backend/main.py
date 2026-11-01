"""The UnderCover backend."""

import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from backend import db
from backend.routes import router


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Open the database when the app starts and close it when it stops."""
    app.state.db = db.connect(os.getenv("UNDERCOVER_DB", "undercover.db"))
    yield
    app.state.db.close()


def create_app() -> FastAPI:
    """Create the UnderCover backend app."""
    app = FastAPI(title="UnderCover", lifespan=lifespan)
    app.include_router(router)
    return app


app = create_app()
