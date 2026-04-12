from __future__ import annotations

import json
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from threading import Lock
from uuid import uuid4

from pydantic import BaseModel

from app.models.policy_center import (
    PolicyCompliance,
    PolicyDesiredState,
    PolicyEventRecord,
    PolicyLiveState,
    PolicyPreview,
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
        "seed_enabled": False,
    },
}


def _model_to_dict(model: BaseModel) -> dict[str, object]:
    if hasattr(model, "model_dump"):
        return model.model_dump(mode="json")
    return model.dict()


class PolicyCenterService:
    MAX_EVENTS = 200

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
        definition = self._get_definition(policy_id)
        return PolicyPreview(
            policy=policy,
            mapped_enforcement_action=str(definition["mapped_enforcement_action"]),
            affected_target=policy.target,
            expected_impact=str(definition["expected_impact"]),
            notes=[str(note) for note in definition["notes"]],
            risk=str(definition["risk"]),
        )

    def apply_policy(self, policy_id: str) -> dict[str, object]:
        with self._lock:
            store = self._load_store_unlocked()
            policies = self._policies_from_store(store)
            self._find_policy(policies, policy_id)
            definition = self._get_definition(policy_id)

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
            self._save_store_unlocked(policies, events)

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
            self._save_store_unlocked(policies, events)
            return updated_policy

    def rollback_policy(self, policy_id: str) -> dict[str, object]:
        with self._lock:
            store = self._load_store_unlocked()
            policies = self._policies_from_store(store)
            self._find_policy(policies, policy_id)
            definition = self._get_definition(policy_id)

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
            self._save_store_unlocked(policies, events)

            return {
                "rolled_back": True,
                "policy": updated_policy,
                "event": event,
            }

    def verify_policy(self, policy_id: str) -> dict[str, object]:
        with self._lock:
            store = self._load_store_unlocked()
            policies = self._policies_from_store(store)
            self._find_policy(policies, policy_id)

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
            self._save_store_unlocked(policies, events)

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
            self._save_store_unlocked(updated_policies, events)
            return result

    def _ensure_store(self) -> None:
        with self._lock:
            store = self._load_store_unlocked()
            self._save_store_unlocked(
                self._policies_from_store(store),
                self._events_from_store(store),
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
        if not isinstance(policies, list) or not policies:
            return self._seed_store_unlocked(existing_events=events if isinstance(events, list) else None)

        return {
            "policies": policies,
            "events": events if isinstance(events, list) else [],
        }

    def _seed_store_unlocked(
        self,
        existing_events: list[object] | None = None,
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
        }
        self._write_store_unlocked(store)
        return store

    def _save_store_unlocked(
        self,
        policies: list[PolicyRecord],
        events: list[PolicyEventRecord],
    ) -> None:
        store = {
            "policies": [_model_to_dict(policy) for policy in policies],
            "events": [_model_to_dict(event) for event in events[-self.MAX_EVENTS :]],
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
            return policies

        refresh_timestamp = verified_at or self._now_iso()
        return [
            self._copy_policy(
                policy,
                live_state=self._derive_live_state(policy.id, status),
                compliance=self._derive_compliance(
                    policy.desired_state,
                    self._derive_live_state(policy.id, status),
                ),
                last_verified_at=refresh_timestamp,
            )
            for policy in policies
        ]

    def _derive_live_state(
        self,
        policy_id: str,
        status: dict[str, object],
    ) -> PolicyLiveState:
        definition = self._get_definition(policy_id)
        flow_cookies = status.get("flow_cookies")
        if not isinstance(flow_cookies, dict):
            return PolicyLiveState.UNKNOWN

        cookie_keys = [str(cookie_key) for cookie_key in definition["cookie_flags"]]
        cookie_matches = [
            bool(flow_cookies.get(cookie_key))
            for cookie_key in cookie_keys
        ]
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

    def _get_definition(self, policy_id: str) -> dict[str, object]:
        definition = POLICY_DEFINITIONS.get(policy_id)
        if definition is None:
            raise KeyError(f"Policy '{policy_id}' was not found")
        return definition

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
