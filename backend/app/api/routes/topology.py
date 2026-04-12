from fastapi import APIRouter, Depends, HTTPException

from app.services.odl_client import (
    OpenDaylightClient,
    OpenDaylightNotFound,
    OpenDaylightResponseError,
    OpenDaylightUnavailable,
    get_odl_client,
)

router = APIRouter(prefix="/api/topology", tags=["topology"])


@router.get("/raw")
def get_topology_raw(
    client: OpenDaylightClient = Depends(get_odl_client),
) -> dict[str, object]:
    try:
        return client.get_topology_raw()
    except OpenDaylightUnavailable as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except OpenDaylightNotFound as exc:
        raise HTTPException(status_code=404, detail=exc.detail) from exc
    except OpenDaylightResponseError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@router.get("/summary")
def get_topology_summary(
    client: OpenDaylightClient = Depends(get_odl_client),
) -> dict[str, object]:
    try:
        return client.get_topology_summary()
    except OpenDaylightUnavailable as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except OpenDaylightNotFound as exc:
        raise HTTPException(status_code=404, detail=exc.detail) from exc
    except OpenDaylightResponseError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
