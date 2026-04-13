from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from threading import Lock
from uuid import uuid4

from pydantic import BaseModel

from app.models.policy_center import (
    PolicyCompliance,
    PolicyDesiredState,
    PolicyEvidenceRecord,
    PolicyExecutionStatus,
    PolicyEventRecord,
    PolicyLiveState,
    PolicyOrigin,
    PolicyPreview,
    PolicyTemplateCreateResponse,
    PolicyTemplateRequest,
    PolicyRecord,
)
from app.services.ovs_flow_service import OVSFlowService


POLICY_DEFINITIONS: dict[str, dict[str, object]] = {
    "baseline_forwarding": {
        "name": "Baseline Forwarding",
        "type": "forwarding",
        "description": "Restore the baseline switching path on bridge s1.",
        "target": "bridge:s1",
        "scope": "fabric",
        "priority": 10,
        "apply_method": "add_normal_flow",
        "rollback_strategy": "remove_normal_flow",
        "mapped_enforcement_action": "Install NORMAL forwarding flow on bridge s1",
        "expected_impact": "Connectivity is restored through the default switching path.",
        "notes": [
            "Reuses the existing OVS NORMAL flow helper.",
            "This is the preferred safe-state for the demo lab.",
        ],
        "risk": "Low risk. Restores the baseline forwarding path.",
        "cookie_flags": ("base_normal",),
        "expected_cookies": (OVSFlowService.NORMAL_COOKIE,),
        "seed_enabled": True,
    },
    "block_ping_h1_h2": {
        "name": "Block Ping h1-h2",
        "type": "traffic-control",
        "description": "Block ICMP traffic between h1 and h2.",
        "target": "10.0.0.1 <-> 10.0.0.2",
        "scope": "icmp",
        "priority": 100,
        "apply_method": "add_block_ping_flows",
        "rollback_strategy": "recover_baseline",
        "mapped_enforcement_action": "Install ICMP drop flows for both host directions",
        "expected_impact": "ICMP echo traffic between h1 and h2 is denied.",
        "notes": [
            "Uses the existing OVS-direct ping blocking flow set.",
            "Rollback intentionally prefers baseline recovery to clear partial state safely.",
        ],
        "risk": "Medium risk. Ping-based reachability checks will fail while active.",
        "cookie_flags": ("block_ping_1", "block_ping_2"),
        "expected_cookies": (
            OVSFlowService.BLOCK_PING_COOKIE_1,
            OVSFlowService.BLOCK_PING_COOKIE_2,
        ),
        "seed_enabled": False,
    },
    "block_http_h1_h2": {
        "name": "Block HTTP h1-h2",
        "type": "traffic-control",
        "description": "Block TCP/80 traffic between h1 and h2.",
        "target": "10.0.0.1 <-> 10.0.0.2",
        "scope": "tcp/80",
        "priority": 110,
        "apply_method": "add_block_http_flows",
        "rollback_strategy": "recover_baseline",
        "mapped_enforcement_action": "Install TCP/80 drop flows for both host directions",
        "expected_impact": "HTTP traffic over TCP/80 between h1 and h2 is denied.",
        "notes": [
            "Uses the existing OVS-direct HTTP blocking flow set.",
            "Rollback intentionally prefers baseline recovery to avoid stale policy flows.",
        ],
        "risk": "Medium risk. Application checks over TCP/80 will fail while active.",
        "cookie_flags": ("block_http_1", "block_http_2"),
        "expected_cookies": (
            OVSFlowService.BLOCK_HTTP_COOKIE_1,
            OVSFlowService.BLOCK_HTTP_COOKIE_2,
        ),
        "seed_enabled": False,
    },
    "isolate_h1": {
        "name": "Isolate h1",
        "type": "segmentation",
        "description": "Isolate h1 from h2 at IPv4 level.",
        "target": "10.0.0.1 <-> 10.0.0.2",
        "scope": "ipv4",
        "priority": 120,
        "apply_method": "add_isolate_h1_flows",
        "rollback_strategy": "recover_baseline",
        "mapped_enforcement_action": "Install IPv4 drop flows for both host directions",
        "expected_impact": "IPv4 traffic between h1 and h2 is blocked in both directions.",
        "notes": [
            "Uses the existing OVS-direct host isolation flow set.",
            "Rollback intentionally prefers baseline recovery to restore a clean switch state.",
        ],
        "risk": "High impact for the host pair. Host-to-host IPv4 traffic is denied.",
        "cookie_flags": ("isolate_h1_1", "isolate_h1_2"),
        "expected_cookies": (
            OVSFlowService.ISOLATE_H1_COOKIE_1,
            OVSFlowService.ISOLATE_H1_COOKIE_2,
        ),
        "seed_enabled": False,
    },
}

POLICY_FLOW_LABELS: dict[str, tuple[str, ...]] = {
    "baseline_forwarding": ("Base Forwarding",),
    "block_ping_h1_h2": ("Block Ping A->B", "Block Ping B->A"),
    "block_http_h1_h2": ("Block HTTP A->B", "Block HTTP B->A"),
    "isolate_h1": ("Isolate H1 A->B", "Isolate H1 B->A"),
}

DEMO_HOSTS: dict[str, dict[str, str]] = {
    "h1": {"label": "H1", "ip": "10.0.0.1"},
    "h2": {"label": "H2", "ip": "10.0.0.2"},
}


def _model_to_dict(model: BaseModel) -> dict[str, object]:
    if hasattr(model, "model_dump"):
        return model.model_dump(mode="json")
    return model.dict()


class PolicyCenterService:
    MAX_EVENTS = 200
    MAX_EVIDENCE = 500

    def __init__(
        self,
        store_path: Path | None = None,
        ovs_service: OVSFlowService | None = None,
    ) -> None:
        self._store_path = store_path or (
            Path(__file__).resolve().parents[2] / "data" / "policy_center.json"
        )
        self._ovs_service = ovs_service or OVSFlowService()
        self._lock = Lock()
        self._ensure_store()

    def list_policies(self) -> list[PolicyRecord]:
        with self._lock:
            store = self._load_store_unlocked()
            policies = self._policies_from_store(store)
            return self._refresh_policies_from_live(policies, strict=False)

    def get_policy(self, policy_id: str) -> PolicyRecord:
        for policy in self.list_policies():
            if policy.id == policy_id:
                return policy
        raise KeyError(f"Policy '{policy_id}' was not found")

    def preview_policy(self, policy_id: str) -> PolicyPreview:
        policy = self.get_policy(policy_id)
        definition = self._definition_for_policy(policy)
        return self._build_preview(policy, definition)

    def preview_template(self, template: PolicyTemplateRequest) -> PolicyPreview:
        normalized = self._normalize_template_request(template)
        policy = self._build_template_policy(
            normalized,
            policy_id=self._build_template_id(str(normalized["name"])),
            timestamp=self._now_iso(),
        )
        policy = self._refresh_policies_from_live([policy], strict=False)[0]
        definition = self._definition_for_policy(policy)
        return self._build_preview(policy, definition)

    def create_policy_from_template(
        self,
        template: PolicyTemplateRequest,
    ) -> PolicyTemplateCreateResponse:
        normalized = self._normalize_template_request(template)

        with self._lock:
            store = self._load_store_unlocked()
            policies = self._policies_from_store(store)
            timestamp = self._now_iso()
            policy_id = self._ensure_unique_policy_id(
                self._build_template_id(str(normalized["name"])),
                {policy.id for policy in policies},
            )
            policy = self._build_template_policy(
                normalized,
                policy_id=policy_id,
                timestamp=timestamp,
            )
            policies.append(policy)
            policies = self._refresh_policies_from_live(policies, strict=False)

            updated_policy = self._find_policy(policies, policy_id)
            definition = self._definition_for_policy(updated_policy)
            preview = self._build_preview(updated_policy, definition)
            events = self._events_from_store(store)
            events.append(
                self._build_event(
                    policy=updated_policy,
                    action="create",
                    result="success",
                    timestamp=timestamp,
                    message=(
                        "Created template policy object. "
                        + (
                            "Live execution is available through the current seeded mapping."
                            if definition["execution_status"]
                            == PolicyExecutionStatus.SUPPORTED
                            else "Policy remains preview-only because no live execution mapping is available."
                        )
                    ),
                )
            )
            evidence = self._evidence_from_store(store)
            evidence.append(
                self._build_evidence_snapshot(
                    policy=updated_policy,
                    action="create",
                    timestamp=timestamp,
                )
            )
            self._save_store_unlocked(
                policies,
                events,
                evidence,
            )

            return PolicyTemplateCreateResponse(
                created=True,
                policy=updated_policy,
                preview=preview,
            )

    def apply_policy(self, policy_id: str) -> dict[str, object]:
        with self._lock:
            store = self._load_store_unlocked()
            policies = self._policies_from_store(store)
            policy = self._find_policy(policies, policy_id)
            definition = self._definition_for_policy(policy)
            self._ensure_policy_supports_live_execution(policy, definition, action="apply")

            getattr(self._ovs_service, str(definition["apply_method"]))()

            timestamp = self._now_iso()
            policies = [
                self._copy_policy(
                    current_policy,
                    enabled=True,
                    desired_state=PolicyDesiredState.ENABLED,
                    updated_at=timestamp,
                    last_applied_at=timestamp,
                    version=current_policy.version + 1,
                )
                if current_policy.id == policy_id
                else current_policy
                for current_policy in policies
            ]
            policies = self._refresh_policies_from_live(
                policies,
                strict=True,
                verified_at=timestamp,
            )
            updated_policy = self._find_policy(policies, policy_id)
            event = self._build_event(
                policy=updated_policy,
                action="apply",
                result=self._event_result(updated_policy),
                timestamp=timestamp,
                message=f"Applied policy via {definition['mapped_enforcement_action']}.",
            )
            events = self._events_from_store(store)
            events.append(event)
            evidence = self._evidence_from_store(store)
            evidence.append(
                self._build_evidence_snapshot(
                    policy=updated_policy,
                    action="apply",
                    timestamp=timestamp,
                )
            )
            self._save_store_unlocked(policies, events, evidence)

            return {
                "applied": True,
                "policy": updated_policy,
                "event": event,
            }

    def record_policy_action(
        self,
        policy_id: str,
        *,
        desired_state: PolicyDesiredState,
        action: str,
        message: str,
    ) -> PolicyRecord:
        with self._lock:
            store = self._load_store_unlocked()
            policies = self._policies_from_store(store)
            self._find_policy(policies, policy_id)

            timestamp = self._now_iso()
            policies = [
                self._copy_policy(
                    current_policy,
                    enabled=desired_state == PolicyDesiredState.ENABLED,
                    desired_state=desired_state,
                    updated_at=timestamp,
                    last_applied_at=timestamp,
                    version=current_policy.version + 1,
                )
                if current_policy.id == policy_id
                else current_policy
                for current_policy in policies
            ]
            policies = self._refresh_policies_from_live(
                policies,
                strict=True,
                verified_at=timestamp,
            )
            updated_policy = self._find_policy(policies, policy_id)
            event = self._build_event(
                policy=updated_policy,
                action=action,
                result=self._event_result(updated_policy),
                timestamp=timestamp,
                message=message,
            )
            events = self._events_from_store(store)
            events.append(event)
            evidence = self._evidence_from_store(store)
            evidence.append(
                self._build_evidence_snapshot(
                    policy=updated_policy,
                    action=action,
                    timestamp=timestamp,
                )
            )
            self._save_store_unlocked(policies, events, evidence)
            return updated_policy

    def rollback_policy(self, policy_id: str) -> dict[str, object]:
        with self._lock:
            store = self._load_store_unlocked()
            policies = self._policies_from_store(store)
            policy = self._find_policy(policies, policy_id)
            definition = self._definition_for_policy(policy)
            self._ensure_policy_supports_live_execution(
                policy,
                definition,
                action="rollback",
            )

            rollback_strategy = str(definition["rollback_strategy"])
            if rollback_strategy == "recover_baseline":
                self._ovs_service.recover_baseline()
            else:
                getattr(self._ovs_service, rollback_strategy)()

            timestamp = self._now_iso()
            policies = [
                self._copy_policy(
                    current_policy,
                    enabled=False,
                    desired_state=PolicyDesiredState.DISABLED,
                    updated_at=timestamp,
                    last_applied_at=timestamp,
                    version=current_policy.version + 1,
                )
                if current_policy.id == policy_id
                else current_policy
                for current_policy in policies
            ]
            policies = self._refresh_policies_from_live(
                policies,
                strict=True,
                verified_at=timestamp,
            )
            updated_policy = self._find_policy(policies, policy_id)
            event = self._build_event(
                policy=updated_policy,
                action="rollback",
                result=self._event_result(updated_policy),
                timestamp=timestamp,
                message=self._rollback_message(rollback_strategy),
            )
            events = self._events_from_store(store)
            events.append(event)
            evidence = self._evidence_from_store(store)
            evidence.append(
                self._build_evidence_snapshot(
                    policy=updated_policy,
                    action="rollback",
                    timestamp=timestamp,
                )
            )
            self._save_store_unlocked(policies, events, evidence)

            return {
                "rolled_back": True,
                "policy": updated_policy,
                "event": event,
            }

    def verify_policy(self, policy_id: str) -> dict[str, object]:
        with self._lock:
            store = self._load_store_unlocked()
            policies = self._policies_from_store(store)
            policy = self._find_policy(policies, policy_id)
            definition = self._definition_for_policy(policy)
            self._ensure_policy_supports_live_execution(policy, definition, action="verify")

            timestamp = self._now_iso()
            policies = self._refresh_policies_from_live(
                policies,
                strict=True,
                verified_at=timestamp,
            )
            updated_policy = self._find_policy(policies, policy_id)
            event = self._build_event(
                policy=updated_policy,
                action="verify",
                result=self._event_result(updated_policy),
                timestamp=timestamp,
                message=(
                    "Verified policy against live OVS flow/status evidence. "
                    f"Compliance is {self._enum_value(updated_policy.compliance)}."
                ),
            )
            events = self._events_from_store(store)
            events.append(event)
            evidence = self._evidence_from_store(store)
            evidence.append(
                self._build_evidence_snapshot(
                    policy=updated_policy,
                    action="verify",
                    timestamp=timestamp,
                )
            )
            self._save_store_unlocked(policies, events, evidence)

            return {
                "verified": True,
                "policy": updated_policy,
                "event": event,
            }

    def get_summary(self) -> dict[str, object]:
        policies = self.list_policies()
        return {
            "total_policies": len(policies),
            "enabled_policies": sum(1 for policy in policies if policy.enabled),
            "live_enforced_policies": sum(
                1 for policy in policies if policy.live_state == PolicyLiveState.ENFORCED
            ),
            "compliant_policies": sum(
                1 for policy in policies if policy.compliance == PolicyCompliance.COMPLIANT
            ),
            "partial_policies": sum(
                1 for policy in policies if policy.compliance == PolicyCompliance.PARTIAL
            ),
            "drift_policies": sum(
                1 for policy in policies if policy.compliance == PolicyCompliance.DRIFT
            ),
            "unknown_policies": sum(
                1 for policy in policies if policy.compliance == PolicyCompliance.UNKNOWN
            ),
            "policies": policies,
        }

    def list_policy_events(self) -> list[PolicyEventRecord]:
        with self._lock:
            store = self._load_store_unlocked()
            return list(reversed(self._events_from_store(store)))

    def list_policy_evidence(self, policy_id: str) -> list[PolicyEvidenceRecord]:
        self.get_policy(policy_id)
        with self._lock:
            store = self._load_store_unlocked()
            evidence = self._evidence_from_store(store)
            return [
                snapshot
                for snapshot in reversed(evidence)
                if snapshot.policy_id == policy_id
            ]

    def list_policy_verifications(self, policy_id: str) -> list[PolicyEvidenceRecord]:
        return [
            snapshot
            for snapshot in self.list_policy_evidence(policy_id)
            if snapshot.action == "verify"
        ]

    def get_drift_summary(self) -> dict[str, object]:
        policies = self.list_policies()
        drifted_policies = [
            {
                "id": policy.id,
                "name": policy.name,
                "desired_state": policy.desired_state,
                "live_state": policy.live_state,
                "compliance": policy.compliance,
            }
            for policy in policies
            if policy.compliance == PolicyCompliance.DRIFT
        ]
        return {
            "total_policies": len(policies),
            "drift_count": len(drifted_policies),
            "partial_count": sum(
                1 for policy in policies if policy.compliance == PolicyCompliance.PARTIAL
            ),
            "compliant_count": sum(
                1 for policy in policies if policy.compliance == PolicyCompliance.COMPLIANT
            ),
            "unknown_count": sum(
                1 for policy in policies if policy.compliance == PolicyCompliance.UNKNOWN
            ),
            "drifted_policies": drifted_policies,
        }

    def recover_to_baseline(self) -> dict[str, object]:
        with self._lock:
            store = self._load_store_unlocked()
            policies = self._policies_from_store(store)
            result = self._ovs_service.recover_baseline()
            timestamp = self._now_iso()

            updated_policies: list[PolicyRecord] = []
            for policy in policies:
                desired_state = (
                    PolicyDesiredState.ENABLED
                    if policy.id == "baseline_forwarding"
                    else PolicyDesiredState.DISABLED
                )
                updated_policies.append(
                    self._copy_policy(
                        policy,
                        enabled=desired_state == PolicyDesiredState.ENABLED,
                        desired_state=desired_state,
                        updated_at=timestamp,
                        last_applied_at=timestamp,
                        version=policy.version + 1,
                    )
                )

            updated_policies = self._refresh_policies_from_live(
                updated_policies,
                strict=True,
                verified_at=timestamp,
            )
            events = self._events_from_store(store)
            for policy in updated_policies:
                action = "apply" if policy.id == "baseline_forwarding" else "rollback"
                message = (
                    "Recovered switch to baseline forwarding state."
                    if policy.id == "baseline_forwarding"
                    else "Recovered baseline and cleared policy-specific enforcement."
                )
                events.append(
                    self._build_event(
                        policy=policy,
                        action=action,
                        result=self._event_result(policy),
                        timestamp=timestamp,
                        message=message,
                    )
                )
            evidence = self._evidence_from_store(store)
            for policy in updated_policies:
                action = "apply" if policy.id == "baseline_forwarding" else "rollback"
                evidence.append(
                    self._build_evidence_snapshot(
                        policy=policy,
                        action=action,
                        timestamp=timestamp,
                    )
                )
            self._save_store_unlocked(updated_policies, events, evidence)
            return result

    def _ensure_store(self) -> None:
        with self._lock:
            store = self._load_store_unlocked()
            self._save_store_unlocked(
                self._policies_from_store(store),
                self._events_from_store(store),
                self._evidence_from_store(store),
            )

    def _load_store_unlocked(self) -> dict[str, object]:
        if not self._store_path.exists():
            return self._seed_store_unlocked()

        try:
            raw_store = json.loads(self._store_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return self._seed_store_unlocked()

        if not isinstance(raw_store, dict):
            return self._seed_store_unlocked()

        policies = raw_store.get("policies")
        events = raw_store.get("events")
        evidence = raw_store.get("evidence")
        if not isinstance(policies, list) or not policies:
            return self._seed_store_unlocked(
                existing_events=events if isinstance(events, list) else None,
                existing_evidence=evidence if isinstance(evidence, list) else None,
            )

        return {
            "policies": policies,
            "events": events if isinstance(events, list) else [],
            "evidence": evidence if isinstance(evidence, list) else [],
        }

    def _seed_store_unlocked(
        self,
        existing_events: list[object] | None = None,
        existing_evidence: list[object] | None = None,
    ) -> dict[str, object]:
        timestamp = self._now_iso()
        policies = [
            PolicyRecord(
                id=policy_id,
                name=str(definition["name"]),
                type=str(definition["type"]),
                description=str(definition["description"]),
                target=str(definition["target"]),
                scope=str(definition["scope"]),
                priority=int(definition["priority"]),
                enabled=bool(definition["seed_enabled"]),
                desired_state=(
                    PolicyDesiredState.ENABLED
                    if definition["seed_enabled"]
                    else PolicyDesiredState.DISABLED
                ),
                live_state=PolicyLiveState.UNKNOWN,
                compliance=PolicyCompliance.UNKNOWN,
                created_at=timestamp,
                updated_at=timestamp,
                version=1,
            )
            for policy_id, definition in POLICY_DEFINITIONS.items()
        ]
        store = {
            "policies": [_model_to_dict(policy) for policy in policies],
            "events": existing_events or [],
            "evidence": existing_evidence or [],
        }
        self._write_store_unlocked(store)
        return store

    def _save_store_unlocked(
        self,
        policies: list[PolicyRecord],
        events: list[PolicyEventRecord],
        evidence: list[PolicyEvidenceRecord],
    ) -> None:
        store = {
            "policies": [_model_to_dict(policy) for policy in policies],
            "events": [_model_to_dict(event) for event in events[-self.MAX_EVENTS :]],
            "evidence": [
                _model_to_dict(snapshot)
                for snapshot in evidence[-self.MAX_EVIDENCE :]
            ],
        }
        self._write_store_unlocked(store)

    def _write_store_unlocked(self, store: dict[str, object]) -> None:
        self._store_path.parent.mkdir(parents=True, exist_ok=True)
        self._store_path.write_text(
            json.dumps(store, indent=2, sort_keys=True),
            encoding="utf-8",
        )

    def _policies_from_store(self, store: dict[str, object]) -> list[PolicyRecord]:
        raw_policies = store.get("policies", [])
        return [PolicyRecord(**policy) for policy in raw_policies if isinstance(policy, dict)]

    def _events_from_store(self, store: dict[str, object]) -> list[PolicyEventRecord]:
        raw_events = store.get("events", [])
        return [PolicyEventRecord(**event) for event in raw_events if isinstance(event, dict)]

    def _evidence_from_store(
        self,
        store: dict[str, object],
    ) -> list[PolicyEvidenceRecord]:
        raw_evidence = store.get("evidence", [])
        return [
            PolicyEvidenceRecord(**snapshot)
            for snapshot in raw_evidence
            if isinstance(snapshot, dict)
        ]

    def _refresh_policies_from_live(
        self,
        policies: list[PolicyRecord],
        *,
        strict: bool,
        verified_at: str | None = None,
    ) -> list[PolicyRecord]:
        try:
            status = self._ovs_service.get_policy_status()
        except RuntimeError:
            if strict:
                raise
            return [
                self._copy_policy(
                    policy,
                    execution_status=self._definition_for_policy(policy)["execution_status"],
                    execution_reason=self._definition_for_policy(policy).get(
                        "execution_reason"
                    ),
                )
                for policy in policies
            ]

        refresh_timestamp = verified_at or self._now_iso()
        refreshed_policies: list[PolicyRecord] = []
        for policy in policies:
            definition = self._definition_for_policy(policy)
            live_state = self._derive_live_state(definition, status)
            refreshed_policies.append(
                self._copy_policy(
                    policy,
                    live_state=live_state,
                    compliance=self._derive_compliance(
                        policy.desired_state,
                        live_state,
                    ),
                    last_verified_at=refresh_timestamp,
                    execution_status=definition["execution_status"],
                    execution_reason=definition.get("execution_reason"),
                )
            )
        return refreshed_policies

    def _derive_live_state(
        self,
        definition: dict[str, object],
        status: dict[str, object],
    ) -> PolicyLiveState:
        if (
            definition.get("execution_status")
            != PolicyExecutionStatus.SUPPORTED
        ):
            return PolicyLiveState.NOT_ENFORCED

        flow_cookies = status.get("flow_cookies")
        if not isinstance(flow_cookies, dict):
            return PolicyLiveState.UNKNOWN

        cookie_keys = [
            str(cookie_key)
            for cookie_key in definition.get("cookie_flags", ())
        ]
        if not cookie_keys:
            return PolicyLiveState.NOT_ENFORCED

        cookie_matches = [bool(flow_cookies.get(cookie_key)) for cookie_key in cookie_keys]
        match_count = sum(cookie_matches)

        if match_count == len(cookie_matches):
            return PolicyLiveState.ENFORCED
        if match_count > 0:
            return PolicyLiveState.PARTIAL
        return PolicyLiveState.NOT_ENFORCED

    def _derive_compliance(
        self,
        desired_state: PolicyDesiredState,
        live_state: PolicyLiveState,
    ) -> PolicyCompliance:
        if live_state == PolicyLiveState.UNKNOWN:
            return PolicyCompliance.UNKNOWN
        if desired_state == PolicyDesiredState.ENABLED:
            if live_state == PolicyLiveState.ENFORCED:
                return PolicyCompliance.COMPLIANT
            if live_state == PolicyLiveState.PARTIAL:
                return PolicyCompliance.PARTIAL
            return PolicyCompliance.DRIFT
        if live_state == PolicyLiveState.NOT_ENFORCED:
            return PolicyCompliance.COMPLIANT
        if live_state == PolicyLiveState.PARTIAL:
            return PolicyCompliance.PARTIAL
        return PolicyCompliance.DRIFT

    def _build_event(
        self,
        *,
        policy: PolicyRecord,
        action: str,
        result: str,
        timestamp: str,
        message: str,
    ) -> PolicyEventRecord:
        return PolicyEventRecord(
            id=uuid4().hex,
            policy_id=policy.id,
            policy_name=policy.name,
            action=action,
            result=result,
            timestamp=timestamp,
            desired_state=policy.desired_state,
            live_state=policy.live_state,
            compliance=policy.compliance,
            message=message,
        )

    def _build_evidence_snapshot(
        self,
        *,
        policy: PolicyRecord,
        action: str,
        timestamp: str,
    ) -> PolicyEvidenceRecord:
        definition = self._definition_for_policy(policy)
        expected_cookies = {
            str(cookie) for cookie in definition.get("expected_cookies", ())
        }

        if not expected_cookies:
            return PolicyEvidenceRecord(
                policy_id=policy.id,
                timestamp=timestamp,
                action=action,
                compliance=policy.compliance,
                live_state=policy.live_state,
                relevant_flows=[],
                flow_count=0,
                summary=(
                    "No execution mapping is available for live evidence capture. "
                    f"{definition.get('execution_reason') or 'Preview-only policy object.'}"
                ),
            )

        try:
            ovs_flows = self._ovs_service.get_ovs_flows()
            relevant_flows = [
                self._compact_flow_snapshot(flow)
                for flow in ovs_flows.get("flows", [])
                if isinstance(flow, dict)
                and str(flow.get("cookie", "")) in expected_cookies
            ]
            summary = (
                f"Observed {len(relevant_flows)} relevant flow(s). "
                f"Live state {self._enum_value(policy.live_state)}. "
                f"Compliance {self._enum_value(policy.compliance)}."
            )
        except RuntimeError:
            relevant_flows = []
            summary = (
                "Live flow evidence was unavailable during snapshot capture. "
                f"Live state {self._enum_value(policy.live_state)}. "
                f"Compliance {self._enum_value(policy.compliance)}."
            )

        return PolicyEvidenceRecord(
            policy_id=policy.id,
            timestamp=timestamp,
            action=action,
            compliance=policy.compliance,
            live_state=policy.live_state,
            relevant_flows=relevant_flows,
            flow_count=len(relevant_flows),
            summary=summary,
        )

    def _compact_flow_snapshot(self, flow: dict[str, object]) -> dict[str, object]:
        return {
            "label": str(flow.get("label", "Unclassified")),
            "flow_type": str(flow.get("flow_type", "unknown")),
            "cookie": str(flow.get("cookie", "")),
            "priority": int(flow.get("priority", 0) or 0),
            "actions": str(flow.get("actions", "")),
        }

    def _event_result(self, policy: PolicyRecord) -> str:
        return (
            "success"
            if policy.compliance == PolicyCompliance.COMPLIANT
            else "failed"
        )

    def _rollback_message(self, rollback_strategy: str) -> str:
        if rollback_strategy == "recover_baseline":
            return "Rolled back policy via baseline recovery."
        return "Rolled back policy via targeted flow removal."

    def _build_preview(
        self,
        policy: PolicyRecord,
        definition: dict[str, object],
    ) -> PolicyPreview:
        supports_live_execution = (
            definition.get("execution_status") == PolicyExecutionStatus.SUPPORTED
        )
        return PolicyPreview(
            policy=policy,
            mapped_enforcement_action=str(definition["mapped_enforcement_action"]),
            affected_target=policy.target,
            expected_impact=str(definition["expected_impact"]),
            notes=[str(note) for note in definition.get("notes", ())],
            risk=str(definition["risk"]),
            execution_status=definition["execution_status"],
            execution_reason=(
                str(definition["execution_reason"])
                if definition.get("execution_reason")
                else None
            ),
            generated_policy_shape=policy,
            mapping_reference_policy_id=(
                str(definition["mapping_reference_policy_id"])
                if definition.get("mapping_reference_policy_id")
                else None
            ),
            expected_cookies=[
                str(cookie) for cookie in definition.get("expected_cookies", ())
            ],
            expected_flow_labels=[
                str(label) for label in definition.get("expected_flow_labels", ())
            ],
            supports_apply=supports_live_execution,
            supports_verify=supports_live_execution,
            supports_rollback=supports_live_execution,
        )

    def _definition_for_policy(self, policy: PolicyRecord) -> dict[str, object]:
        if (
            policy.origin == PolicyOrigin.TEMPLATE
            or policy.template_type is not None
        ):
            return self._build_template_definition(policy)
        return self._get_seed_definition(policy.id)

    def _get_seed_definition(self, policy_id: str) -> dict[str, object]:
        definition = POLICY_DEFINITIONS.get(policy_id)
        if definition is None:
            raise KeyError(f"Policy '{policy_id}' was not found")
        return {
            **definition,
            "execution_status": PolicyExecutionStatus.SUPPORTED,
            "execution_reason": None,
            "mapping_reference_policy_id": policy_id,
            "expected_flow_labels": POLICY_FLOW_LABELS.get(policy_id, ()),
        }

    def _build_template_definition(self, policy: PolicyRecord) -> dict[str, object]:
        mapping_policy_id = self._template_mapping_policy_id(policy)
        action = self._enum_value(policy.action or "block").lower()
        protocol = self._enum_value(policy.protocol or "unknown").lower()
        direction = self._enum_value(policy.direction or "unknown").lower()
        target = self._build_template_target(
            str(policy.source_host or ""),
            str(policy.destination_host or ""),
            direction,
        )
        port_label = f"/{policy.port}" if policy.port is not None else ""

        if mapping_policy_id is None:
            return {
                "mapped_enforcement_action": "No live execution mapping available.",
                "expected_impact": (
                    "This policy will remain visible in Policy Center, but v1 will not "
                    "push any live enforcement for this template combination."
                ),
                "notes": [
                    "Preview-only object. Unsupported live enforcement for this template combination in v1.",
                    "No execution mapping available to the current seeded policy helpers.",
                    "Apply, verify, and rollback stay disabled until a future execution mapping is added.",
                ],
                "risk": (
                    "Low enforcement risk because no switch change will be attempted. "
                    "Operator risk remains if the object is assumed to be active."
                ),
                "cookie_flags": (),
                "expected_cookies": (),
                "expected_flow_labels": (),
                "execution_status": PolicyExecutionStatus.PREVIEW_ONLY,
                "execution_reason": (
                    "Preview-only. Unsupported live enforcement. "
                    "No execution mapping available."
                ),
                "mapping_reference_policy_id": None,
            }

        seed_definition = self._get_seed_definition(mapping_policy_id)
        protocol_label = protocol.upper() if protocol == "tcp" else protocol.upper()
        expected_impact = (
            f"Traffic matching {protocol_label}{port_label} on {target} is blocked "
            f"using the current {mapping_policy_id} enforcement path."
        )
        notes = [
            f"Reuses the existing seeded enforcement mapping '{mapping_policy_id}'.",
            "Evidence, verification, events, and reporting continue through the shared Policy Center pipeline.",
            "This template remains a separate policy object even though the live execution path is reused.",
        ]
        return {
            **seed_definition,
            "mapped_enforcement_action": (
                f"Reuse seeded mapping '{mapping_policy_id}': "
                f"{seed_definition['mapped_enforcement_action']}"
            ),
            "expected_impact": expected_impact,
            "notes": notes,
            "risk": str(seed_definition["risk"]),
            "mapping_reference_policy_id": mapping_policy_id,
            "expected_flow_labels": POLICY_FLOW_LABELS.get(mapping_policy_id, ()),
            "execution_status": PolicyExecutionStatus.SUPPORTED,
            "execution_reason": None,
        }

    def _normalize_template_request(
        self,
        template: PolicyTemplateRequest,
    ) -> dict[str, object]:
        name = " ".join(template.name.split()).strip()
        description = " ".join((template.description or "").split()).strip() or None
        template_type = "safe_host_traffic_block_v1"
        source_host = template.source_host.strip().lower()
        destination_host = template.destination_host.strip().lower()
        protocol = template.protocol.strip().lower()
        direction = template.direction.strip().lower()
        action = template.action.strip().lower()
        port = template.port

        if not name:
            raise ValueError("Policy name is required.")
        if template.template_type.strip() != template_type:
            raise ValueError(
                "Policy Template Builder v1 only supports template_type "
                "'safe_host_traffic_block_v1'."
            )
        if action != "block":
            raise ValueError("Policy Template Builder v1 only supports action 'block'.")
        if protocol not in {"icmp", "tcp", "ipv4"}:
            raise ValueError("Protocol must be one of icmp, tcp, or ipv4.")
        if direction not in {"one-way", "two-way"}:
            raise ValueError("Direction must be one of one-way or two-way.")
        if source_host not in DEMO_HOSTS or destination_host not in DEMO_HOSTS:
            raise ValueError("Source and destination must be known demo hosts.")
        if source_host == destination_host:
            raise ValueError("Source and destination hosts must be different.")
        if protocol != "tcp" and port is not None:
            raise ValueError("Port is only supported when protocol is tcp.")

        return {
            "name": name,
            "description": description,
            "template_type": template_type,
            "source_host": source_host,
            "destination_host": destination_host,
            "protocol": protocol,
            "port": port if protocol == "tcp" else None,
            "direction": direction,
            "action": action,
        }

    def _build_template_policy(
        self,
        normalized: dict[str, object],
        *,
        policy_id: str,
        timestamp: str,
    ) -> PolicyRecord:
        source_host = str(normalized["source_host"])
        destination_host = str(normalized["destination_host"])
        direction = str(normalized["direction"])
        protocol = str(normalized["protocol"])
        port = normalized["port"]
        policy = PolicyRecord(
            id=policy_id,
            name=str(normalized["name"]),
            type="template",
            description=(
                str(normalized["description"])
                if normalized["description"] is not None
                else self._default_template_description(
                    source_host,
                    destination_host,
                    protocol,
                    port if isinstance(port, int) else None,
                    direction,
                )
            ),
            target=self._build_template_target(source_host, destination_host, direction),
            scope=f"{protocol}{f'/{port}' if port is not None else ''}:{direction}",
            priority=self._template_priority(
                source_host,
                destination_host,
                protocol,
                port if isinstance(port, int) else None,
                direction,
            ),
            enabled=False,
            desired_state=PolicyDesiredState.DISABLED,
            live_state=PolicyLiveState.NOT_ENFORCED,
            compliance=PolicyCompliance.COMPLIANT,
            created_at=timestamp,
            updated_at=timestamp,
            version=1,
            origin=PolicyOrigin.TEMPLATE,
            template_type=str(normalized["template_type"]),
            source_host=source_host,
            destination_host=destination_host,
            protocol=protocol,
            port=port if isinstance(port, int) else None,
            direction=direction,
            action=str(normalized["action"]),
        )
        definition = self._definition_for_policy(policy)
        return self._copy_policy(
            policy,
            execution_status=definition["execution_status"],
            execution_reason=definition.get("execution_reason"),
        )

    def _template_mapping_policy_id(self, policy: PolicyRecord) -> str | None:
        if (
            self._enum_value(policy.action).lower() != "block"
            or self._enum_value(policy.direction).lower() != "two-way"
        ):
            return None

        host_pair = frozenset(
            {
                self._enum_value(policy.source_host).lower(),
                self._enum_value(policy.destination_host).lower(),
            }
        )
        if host_pair != frozenset({"h1", "h2"}):
            return None

        protocol = self._enum_value(policy.protocol).lower()
        if protocol == "icmp":
            return "block_ping_h1_h2"
        if protocol == "ipv4":
            return "isolate_h1"
        if protocol == "tcp" and policy.port == 80:
            return "block_http_h1_h2"
        return None

    def _build_template_target(
        self,
        source_host: str,
        destination_host: str,
        direction: str,
    ) -> str:
        connector = "<->" if direction == "two-way" else "->"
        return (
            f"{source_host} ({self._host_ip(source_host)}) "
            f"{connector} "
            f"{destination_host} ({self._host_ip(destination_host)})"
        )

    def _default_template_description(
        self,
        source_host: str,
        destination_host: str,
        protocol: str,
        port: int | None,
        direction: str,
    ) -> str:
        connector = "between" if direction == "two-way" else "from"
        if direction == "two-way":
            host_text = f"{source_host} and {destination_host}"
        else:
            host_text = f"{source_host} to {destination_host}"

        protocol_label = protocol.upper()
        if protocol == "tcp" and port is not None:
            protocol_label = f"TCP/{port}"

        return f"Block {protocol_label} traffic {connector} {host_text}."

    def _template_priority(
        self,
        source_host: str,
        destination_host: str,
        protocol: str,
        port: int | None,
        direction: str,
    ) -> int:
        template_policy = PolicyRecord(
            id="template-priority-probe",
            name="Template Priority Probe",
            type="template",
            description="",
            target="",
            scope="",
            priority=150,
            enabled=False,
            desired_state=PolicyDesiredState.DISABLED,
            live_state=PolicyLiveState.NOT_ENFORCED,
            compliance=PolicyCompliance.COMPLIANT,
            created_at=self._now_iso(),
            updated_at=self._now_iso(),
            origin=PolicyOrigin.TEMPLATE,
            template_type="safe_host_traffic_block_v1",
            source_host=source_host,
            destination_host=destination_host,
            protocol=protocol,
            port=port,
            direction=direction,
            action="block",
        )
        mapping_policy_id = self._template_mapping_policy_id(template_policy)
        if mapping_policy_id is None:
            return 150
        return int(POLICY_DEFINITIONS[mapping_policy_id]["priority"])

    def _build_template_id(self, name: str) -> str:
        slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
        if not slug:
            slug = "policy"
        return f"template-{slug}"

    def _ensure_unique_policy_id(
        self,
        base_id: str,
        existing_ids: set[str],
    ) -> str:
        if base_id not in existing_ids:
            return base_id

        suffix = 2
        while f"{base_id}-{suffix}" in existing_ids:
            suffix += 1
        return f"{base_id}-{suffix}"

    def _host_ip(self, host_id: str) -> str:
        host = DEMO_HOSTS.get(host_id)
        return host["ip"] if host is not None else "unknown"

    def _ensure_policy_supports_live_execution(
        self,
        policy: PolicyRecord,
        definition: dict[str, object],
        *,
        action: str,
    ) -> None:
        if definition.get("execution_status") == PolicyExecutionStatus.SUPPORTED:
            return

        raise ValueError(
            f"Policy '{policy.name}' is preview-only. "
            f"Cannot {action} because live enforcement is unsupported and no "
            "execution mapping is available."
        )

    def _find_policy(
        self,
        policies: list[PolicyRecord],
        policy_id: str,
    ) -> PolicyRecord:
        for policy in policies:
            if policy.id == policy_id:
                return policy
        raise KeyError(f"Policy '{policy_id}' was not found")

    def _copy_policy(self, policy: PolicyRecord, **updates: object) -> PolicyRecord:
        payload = _model_to_dict(policy)
        payload.update(updates)
        return PolicyRecord(**payload)

    def _enum_value(self, enum_value: object) -> str:
        return str(getattr(enum_value, "value", enum_value))

    def _now_iso(self) -> str:
        return datetime.now(timezone.utc).isoformat()


@lru_cache
def get_policy_center_service() -> PolicyCenterService:
    return PolicyCenterService()
