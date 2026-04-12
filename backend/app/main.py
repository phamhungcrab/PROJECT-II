from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.flows import router as flows_router
from app.api.routes.health import router as health_router
from app.api.routes.inventory import router as inventory_router
from app.api.routes.policies import router as policies_router
from app.api.routes.topology import router as topology_router
from app.core.config import get_settings


def create_app() -> FastAPI:
    settings = get_settings()
    application = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://192.168.1.4:5173",
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    application.include_router(health_router)
    application.include_router(topology_router)
    application.include_router(inventory_router)
    application.include_router(flows_router)
    application.include_router(policies_router)
    return application


app = create_app()
