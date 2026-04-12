from fastapi import APIRouter, Depends, HTTPException

from app.services.odl_client import (
    OpenDaylightClient,
    OpenDaylightNotFound,
    OpenDaylightResponseError,
    OpenDaylightUnavailable,
    get_odl_client,
)
from app.services.ovs_flow_service import OVSFlowService

router = APIRouter(prefix="/api/flows", tags=["flows"])


@router.get("/ovs")
def get_ovs_flows() -> dict[str, object]:
    try:
        service = OVSFlowService()
        return service.get_ovs_flows()
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/{node_id}")
def get_node_flows(
    node_id: str,
    client: OpenDaylightClient = Depends(get_odl_client),
) -> dict[str, object]:
    try:
        return client.get_node_flows(node_id)
    except OpenDaylightUnavailable as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except OpenDaylightNotFound as exc:
        raise HTTPException(status_code=404, detail=exc.detail) from exc
    except OpenDaylightResponseError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
