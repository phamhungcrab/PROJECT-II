from fastapi import APIRouter

from app.core.config import get_settings

router = APIRouter(tags=["health"])


@router.get("/api/health")
def get_health() -> dict[str, object]:
    settings = get_settings()
    return {
        "status": "ok",
        "service": settings.app_name,
        "version": settings.app_version,
        "controller": {
            "type": "opendaylight",
            "base_url": settings.normalized_odl_base_url,
            "topology_id": settings.odl_topology_id,
        },
    }
