from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


class PolicyOrigin(str, Enum):
    SEEDED = "SEEDED"
    TEMPLATE = "TEMPLATE"


class PolicyExecutionStatus(str, Enum):
    SUPPORTED = "SUPPORTED"
    PREVIEW_ONLY = "PREVIEW_ONLY"


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
    origin: PolicyOrigin = PolicyOrigin.SEEDED
    template_type: str | None = None
    source_host: str | None = None
    destination_host: str | None = None
    protocol: str | None = None
    port: int | None = Field(default=None, ge=1, le=65535)
    direction: str | None = None
    action: str | None = None
    execution_status: PolicyExecutionStatus = PolicyExecutionStatus.SUPPORTED
    execution_reason: str | None = None


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
    execution_status: PolicyExecutionStatus = PolicyExecutionStatus.SUPPORTED
    execution_reason: str | None = None
    generated_policy_shape: PolicyRecord
    mapping_reference_policy_id: str | None = None
    expected_cookies: list[str] = Field(default_factory=list)
    expected_flow_labels: list[str] = Field(default_factory=list)
    supports_apply: bool = True
    supports_verify: bool = True
    supports_rollback: bool = True


class PolicyTemplateRequest(BaseModel):
    name: str = Field(min_length=3, max_length=96)
    template_type: str = Field(default="safe_host_traffic_block_v1", min_length=3, max_length=64)
    source_host: str = Field(min_length=1, max_length=32)
    destination_host: str = Field(min_length=1, max_length=32)
    protocol: str = Field(min_length=1, max_length=16)
    port: int | None = Field(default=None, ge=1, le=65535)
    direction: str = Field(min_length=1, max_length=16)
    action: str = Field(default="block", min_length=1, max_length=16)
    description: str | None = Field(default=None, max_length=240)


class PolicyTemplateCreateResponse(BaseModel):
    created: bool
    policy: PolicyRecord
    preview: PolicyPreview
