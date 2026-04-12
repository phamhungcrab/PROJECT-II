from fastapi import APIRouter, Depends, HTTPException

from app.services.odl_client import (
    OpenDaylightClient,
    OpenDaylightResponseError,
    OpenDaylightUnavailable,
    get_odl_client,
)

router = APIRouter(prefix="/api/inventory", tags=["inventory"])


@router.get("/nodes")
def get_inventory_nodes(
    client: OpenDaylightClient = Depends(get_odl_client),
) -> dict[str, object]:
    try:
        return client.get_inventory_nodes()
    except OpenDaylightUnavailable as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except OpenDaylightResponseError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
