from fastapi import APIRouter, HTTPException

from app.services.ovs_flow_service import OVSFlowService

router = APIRouter(prefix="/api/policies", tags=["policies"])


@router.post("/demo/base-forwarding")
def apply_demo_base_forwarding_policy() -> dict[str, object]:
    try:
        service = OVSFlowService()
        service.add_normal_flow()
        return {
            "applied": True,
            "mode": "ovs-direct",
            "flow_id": "base-normal",
        }
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.delete("/demo/base-forwarding")
def remove_demo_base_forwarding_policy() -> dict[str, object]:
    try:
        service = OVSFlowService()
        service.remove_normal_flow()
        return {
            "removed": True,
            "mode": "ovs-direct",
            "flow_id": "base-normal",
        }
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/demo/block-ping")
def apply_demo_block_ping_policy() -> dict[str, object]:
    try:
        service = OVSFlowService()
        service.add_block_ping_flows()
        return {
            "applied": True,
            "mode": "ovs-direct",
            "flow_ids": [
                "icmp-10.0.0.1-to-10.0.0.2",
                "icmp-10.0.0.2-to-10.0.0.1",
            ],
        }
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/demo/block-http")
def apply_demo_block_http_policy() -> dict[str, object]:
    try:
        service = OVSFlowService()
        service.add_block_http_flows()
        return {
            "applied": True,
            "mode": "ovs-direct",
            "flow_ids": [
                "tcp-10.0.0.1-to-10.0.0.2-port-80",
                "tcp-10.0.0.2-to-10.0.0.1-port-80",
            ],
        }
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.delete("/demo/block-http")
def remove_demo_block_http_policy() -> dict[str, object]:
    try:
        service = OVSFlowService()
        service.remove_block_http_flows()
        return {
            "removed": True,
            "mode": "ovs-direct",
        }
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/demo/isolate-h1")
def apply_demo_isolate_h1_policy() -> dict[str, object]:
    try:
        service = OVSFlowService()
        service.add_isolate_h1_flows()
        return {
            "applied": True,
            "mode": "ovs-direct",
            "flow_ids": [
                "ip-10.0.0.1-to-10.0.0.2-drop",
                "ip-10.0.0.2-to-10.0.0.1-drop",
            ],
        }
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.delete("/demo/isolate-h1")
def remove_demo_isolate_h1_policy() -> dict[str, object]:
    try:
        service = OVSFlowService()
        service.remove_isolate_h1_flows()
        return {
            "removed": True,
            "mode": "ovs-direct",
        }
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/demo/recover-baseline")
def recover_demo_baseline_policy() -> dict[str, object]:
    try:
        service = OVSFlowService()
        return service.recover_baseline()
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.delete("/demo/block-ping")
def remove_demo_block_ping_policy() -> dict[str, object]:
    try:
        service = OVSFlowService()
        service.remove_block_ping_flows()
        return {
            "removed": True,
            "mode": "ovs-direct",
        }
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/demo/block-ping/status")
def get_demo_block_ping_policy_status() -> dict[str, object]:
    try:
        service = OVSFlowService()
        return service.get_policy_status()
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
