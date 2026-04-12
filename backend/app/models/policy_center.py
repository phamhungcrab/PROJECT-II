from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


class PolicyDesiredState(str, Enum):
    ENABLED = "ENABLED"
    DISABLED = "DISABLED"


class PolicyLiveState(str, Enum):
    ENFORCED = "ENFORCED"
    NOT_ENFORCED = "NOT_ENFORCED"
    PARTIAL = "PARTIAL"
    UNKNOWN = "UNKNOWN"


class PolicyCompliance(str, Enum):
    COMPLIANT = "COMPLIANT"
    PARTIAL = "PARTIAL"
    DRIFT = "DRIFT"
    UNKNOWN = "UNKNOWN"


class PolicyRecord(BaseModel):
    id: str
    name: str
    type: str
    description: str
    target: str
    scope: str
    priority: int
    enabled: bool
    desired_state: PolicyDesiredState
    live_state: PolicyLiveState
    compliance: PolicyCompliance
    created_at: str
    updated_at: str
    last_applied_at: str | None = None
    last_verified_at: str | None = None
    version: int = Field(default=1, ge=1)


class PolicyEventRecord(BaseModel):
    id: str
    policy_id: str
    policy_name: str
    action: str
    result: str
    timestamp: str
    desired_state: PolicyDesiredState
    live_state: PolicyLiveState
    compliance: PolicyCompliance
    message: str


class PolicyEvidenceRecord(BaseModel):
    policy_id: str
    timestamp: str
    action: str
    compliance: PolicyCompliance
    live_state: PolicyLiveState
    relevant_flows: list[dict[str, object]]
    flow_count: int
    summary: str


class PolicyPreview(BaseModel):
    policy: PolicyRecord
    mapped_enforcement_action: str
    affected_target: str
    expected_impact: str
    notes: list[str]
    risk: str
