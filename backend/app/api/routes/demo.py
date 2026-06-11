from fastapi import APIRouter, HTTPException

from app.services.policy_center_service import get_policy_center_service

router = APIRouter(prefix="/api/demo", tags=["demo"])


@router.post("/reset-clean-state")
def reset_demo_clean_state() -> dict[str, object]:
    try:
        service = get_policy_center_service()
        return service.reset_demo_clean_state()
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
