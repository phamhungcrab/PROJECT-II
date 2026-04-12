from fastapi import APIRouter, HTTPException

from app.models.policy_center import PolicyDesiredState
from app.services.ovs_flow_service import OVSFlowService
from app.services.policy_center_service import get_policy_center_service

router = APIRouter(prefix="/api/policies", tags=["policies"])


def _raise_not_found(exc: KeyError) -> None:
    detail = exc.args[0] if exc.args else "Policy was not found"
    raise HTTPException(status_code=404, detail=detail) from exc


def _raise_server_error(exc: RuntimeError) -> None:
    raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("")
def list_policies() -> dict[str, object]:
    try:
        service = get_policy_center_service()
        policies = service.list_policies()
        return {
            "count": len(policies),
            "policies": policies,
        }
    except RuntimeError as exc:
        _raise_server_error(exc)


@router.get("/summary")
def get_policy_summary() -> dict[str, object]:
    try:
        service = get_policy_center_service()
        return service.get_summary()
    except RuntimeError as exc:
        _raise_server_error(exc)


@router.get("/events")
def list_policy_events() -> dict[str, object]:
    try:
        service = get_policy_center_service()
        events = service.list_policy_events()
        return {
            "count": len(events),
            "events": events,
        }
    except RuntimeError as exc:
        _raise_server_error(exc)


@router.get("/drift")
def get_policy_drift_summary() -> dict[str, object]:
    try:
        service = get_policy_center_service()
        return service.get_drift_summary()
    except RuntimeError as exc:
        _raise_server_error(exc)


@router.post("/demo/base-forwarding")
def apply_demo_base_forwarding_policy() -> dict[str, object]:
    try:
        service = get_policy_center_service()
        service.apply_policy("baseline_forwarding")
        return {
            "applied": True,
            "mode": "ovs-direct",
            "flow_id": "base-normal",
        }
    except RuntimeError as exc:
        _raise_server_error(exc)


@router.delete("/demo/base-forwarding")
def remove_demo_base_forwarding_policy() -> dict[str, object]:
    try:
        ovs_service = OVSFlowService()
        ovs_service.remove_normal_flow()
        policy_service = get_policy_center_service()
        policy_service.record_policy_action(
            "baseline_forwarding",
            desired_state=PolicyDesiredState.DISABLED,
            action="demo-remove",
            message="Removed baseline forwarding flow via demo endpoint.",
        )
        return {
            "removed": True,
            "mode": "ovs-direct",
            "flow_id": "base-normal",
        }
    except RuntimeError as exc:
        _raise_server_error(exc)


@router.post("/demo/block-ping")
def apply_demo_block_ping_policy() -> dict[str, object]:
    try:
        service = get_policy_center_service()
        service.apply_policy("block_ping_h1_h2")
        return {
            "applied": True,
            "mode": "ovs-direct",
            "flow_ids": [
                "icmp-10.0.0.1-to-10.0.0.2",
                "icmp-10.0.0.2-to-10.0.0.1",
            ],
        }
    except RuntimeError as exc:
        _raise_server_error(exc)


@router.delete("/demo/block-ping")
def remove_demo_block_ping_policy() -> dict[str, object]:
    try:
        ovs_service = OVSFlowService()
        ovs_service.remove_block_ping_flows()
        policy_service = get_policy_center_service()
        policy_service.record_policy_action(
            "block_ping_h1_h2",
            desired_state=PolicyDesiredState.DISABLED,
            action="demo-remove",
            message="Removed ICMP blocking flows via demo endpoint.",
        )
        return {
            "removed": True,
            "mode": "ovs-direct",
        }
    except RuntimeError as exc:
        _raise_server_error(exc)


@router.post("/demo/block-http")
def apply_demo_block_http_policy() -> dict[str, object]:
    try:
        service = get_policy_center_service()
        service.apply_policy("block_http_h1_h2")
        return {
            "applied": True,
            "mode": "ovs-direct",
            "flow_ids": [
                "tcp-10.0.0.1-to-10.0.0.2-port-80",
                "tcp-10.0.0.2-to-10.0.0.1-port-80",
            ],
        }
    except RuntimeError as exc:
        _raise_server_error(exc)


@router.delete("/demo/block-http")
def remove_demo_block_http_policy() -> dict[str, object]:
    try:
        ovs_service = OVSFlowService()
        ovs_service.remove_block_http_flows()
        policy_service = get_policy_center_service()
        policy_service.record_policy_action(
            "block_http_h1_h2",
            desired_state=PolicyDesiredState.DISABLED,
            action="demo-remove",
            message="Removed HTTP blocking flows via demo endpoint.",
        )
        return {
            "removed": True,
            "mode": "ovs-direct",
        }
    except RuntimeError as exc:
        _raise_server_error(exc)


@router.post("/demo/isolate-h1")
def apply_demo_isolate_h1_policy() -> dict[str, object]:
    try:
        service = get_policy_center_service()
        service.apply_policy("isolate_h1")
        return {
            "applied": True,
            "mode": "ovs-direct",
            "flow_ids": [
                "ip-10.0.0.1-to-10.0.0.2-drop",
                "ip-10.0.0.2-to-10.0.0.1-drop",
            ],
        }
    except RuntimeError as exc:
        _raise_server_error(exc)


@router.delete("/demo/isolate-h1")
def remove_demo_isolate_h1_policy() -> dict[str, object]:
    try:
        ovs_service = OVSFlowService()
        ovs_service.remove_isolate_h1_flows()
        policy_service = get_policy_center_service()
        policy_service.record_policy_action(
            "isolate_h1",
            desired_state=PolicyDesiredState.DISABLED,
            action="demo-remove",
            message="Removed host isolation flows via demo endpoint.",
        )
        return {
            "removed": True,
            "mode": "ovs-direct",
        }
    except RuntimeError as exc:
        _raise_server_error(exc)


@router.post("/demo/recover-baseline")
def recover_demo_baseline_policy() -> dict[str, object]:
    try:
        service = get_policy_center_service()
        return service.recover_to_baseline()
    except RuntimeError as exc:
        _raise_server_error(exc)


@router.get("/demo/block-ping/status")
def get_demo_block_ping_policy_status() -> dict[str, object]:
    try:
        service = OVSFlowService()
        return service.get_policy_status()
    except RuntimeError as exc:
        _raise_server_error(exc)


@router.get("/{policy_id}/evidence")
def get_policy_evidence(policy_id: str) -> dict[str, object]:
    try:
        service = get_policy_center_service()
        evidence = service.list_policy_evidence(policy_id)
        return {
            "policy_id": policy_id,
            "count": len(evidence),
            "evidence": evidence,
        }
    except KeyError as exc:
        _raise_not_found(exc)
    except RuntimeError as exc:
        _raise_server_error(exc)


@router.get("/{policy_id}/verifications")
def get_policy_verifications(policy_id: str) -> dict[str, object]:
    try:
        service = get_policy_center_service()
        verifications = service.list_policy_verifications(policy_id)
        return {
            "policy_id": policy_id,
            "count": len(verifications),
            "verifications": verifications,
        }
    except KeyError as exc:
        _raise_not_found(exc)
    except RuntimeError as exc:
        _raise_server_error(exc)


@router.get("/{policy_id}")
def get_policy(policy_id: str) -> object:
    try:
        service = get_policy_center_service()
        return service.get_policy(policy_id)
    except KeyError as exc:
        _raise_not_found(exc)
    except RuntimeError as exc:
        _raise_server_error(exc)


@router.post("/{policy_id}/preview")
def preview_policy(policy_id: str) -> object:
    try:
        service = get_policy_center_service()
        return service.preview_policy(policy_id)
    except KeyError as exc:
        _raise_not_found(exc)
    except RuntimeError as exc:
        _raise_server_error(exc)


@router.post("/{policy_id}/apply")
def apply_policy(policy_id: str) -> dict[str, object]:
    try:
        service = get_policy_center_service()
        return service.apply_policy(policy_id)
    except KeyError as exc:
        _raise_not_found(exc)
    except RuntimeError as exc:
        _raise_server_error(exc)


@router.post("/{policy_id}/rollback")
def rollback_policy(policy_id: str) -> dict[str, object]:
    try:
        service = get_policy_center_service()
        return service.rollback_policy(policy_id)
    except KeyError as exc:
        _raise_not_found(exc)
    except RuntimeError as exc:
        _raise_server_error(exc)


@router.post("/{policy_id}/verify")
def verify_policy(policy_id: str) -> dict[str, object]:
    try:
        service = get_policy_center_service()
        return service.verify_policy(policy_id)
    except KeyError as exc:
        _raise_not_found(exc)
    except RuntimeError as exc:
        _raise_server_error(exc)
