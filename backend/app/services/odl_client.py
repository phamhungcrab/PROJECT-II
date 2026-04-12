from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from urllib.parse import quote

import requests

from app.core.config import Settings, get_settings

NETWORK_TOPOLOGY_ROOT = "/rests/data/network-topology:network-topology"
INVENTORY_ROOT = "/rests/data/opendaylight-inventory:nodes"
DEMO_POLICY_NODE_ID = "openflow:1"
DEMO_POLICY_TABLE_ID = 0
DEMO_POLICY_PRIORITY = 100


@dataclass(frozen=True)
class DemoPingBlockFlow:
    flow_id: str
    source_ipv4: str
    destination_ipv4: str
    flow_name: str


DEMO_PING_BLOCK_FLOWS = (
    DemoPingBlockFlow(
        flow_id="9001",
        source_ipv4="10.0.0.1/32",
        destination_ipv4="10.0.0.2/32",
        flow_name="demo-block-ping-h1-to-h2",
    ),
    DemoPingBlockFlow(
        flow_id="9002",
        source_ipv4="10.0.0.2/32",
        destination_ipv4="10.0.0.1/32",
        flow_name="demo-block-ping-h2-to-h1",
    ),
)


class OpenDaylightError(Exception):
    """Base exception for OpenDaylight integration failures."""


class OpenDaylightUnavailable(OpenDaylightError):
    """Raised when the controller cannot be reached."""


class OpenDaylightResponseError(OpenDaylightError):
    """Raised when the controller returns an unexpected HTTP response."""

    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


class OpenDaylightNotFound(OpenDaylightResponseError):
    """Raised when a requested OpenDaylight resource does not exist."""


class OpenDaylightClient:
    def __init__(self, settings: Settings):
        self._settings = settings
        self._session = requests.Session()
        self._session.auth = (settings.odl_username, settings.odl_password)
        self._session.headers.update({"Accept": "application/json"})

    def get_topology_raw(self) -> dict[str, object]:
        path = (
            f"{NETWORK_TOPOLOGY_ROOT}/topology="
            f"{quote(self._settings.odl_topology_id, safe=':')}"
        )
        return self._get_json(path)

    def get_topology_summary(self) -> dict[str, object]:
        payload = self.get_topology_raw()
        topologies = payload.get("network-topology:topology", [])
        topology = next(
            (
                item
                for item in topologies
                if item.get("topology-id") == self._settings.odl_topology_id
            ),
            topologies[0] if topologies else None,
        )

        if topology is None:
            raise OpenDaylightNotFound(
                status_code=404,
                detail=f"Topology '{self._settings.odl_topology_id}' was not found",
            )

        nodes = topology.get("node", [])
        links = topology.get("link", [])
        switch_nodes = [
            node for node in nodes if str(node.get("node-id", "")).startswith("openflow:")
        ]
        host_nodes = [
            node for node in nodes if not str(node.get("node-id", "")).startswith("openflow:")
        ]

        return {
            "topology_id": topology.get("topology-id", self._settings.odl_topology_id),
            "node_count": len(nodes),
            "switch_count": len(switch_nodes),
            "host_count": len(host_nodes),
            "link_count": len(links),
            "termination_point_count": sum(
                len(node.get("termination-point", [])) for node in nodes
            ),
            "nodes": [
                {
                    "node_id": node.get("node-id"),
                    "inventory_ref": node.get(
                        "opendaylight-topology-inventory:inventory-node-ref"
                    ),
                    "termination_point_count": len(node.get("termination-point", [])),
                }
                for node in nodes
            ],
            "links": [
                {
                    "link_id": link.get("link-id"),
                    "source_node": link.get("source", {}).get("source-node"),
                    "source_tp": link.get("source", {}).get("source-tp"),
                    "destination_node": link.get("destination", {}).get("dest-node"),
                    "destination_tp": link.get("destination", {}).get("dest-tp"),
                }
                for link in links
            ],
        }

    def get_inventory_nodes(self) -> dict[str, object]:
        payload = self._get_json(INVENTORY_ROOT)
        nodes = payload.get("opendaylight-inventory:nodes", {}).get("node", [])

        return {
            "count": len(nodes),
            "nodes": [self._normalize_inventory_node(node) for node in nodes],
        }

    def get_node_flows(self, node_id: str) -> dict[str, object]:
        payload = self._get_json(self._node_inventory_path(node_id), node_id=node_id)
        nodes = payload.get("opendaylight-inventory:node", [])
        if not nodes:
            raise OpenDaylightNotFound(
                status_code=404,
                detail=f"Node '{node_id}' was not found in OpenDaylight inventory",
            )

        node = nodes[0]
        tables = node.get("flow-node-inventory:table", [])
        normalized_tables = []
        total_flows = 0

        for table in tables:
            table_flows = table.get("flow", [])
            total_flows += len(table_flows)
            if not table_flows:
                continue

            stats = table.get(
                "opendaylight-flow-table-statistics:flow-table-statistics", {}
            )
            normalized_tables.append(
                {
                    "table_id": table.get("id"),
                    "active_flows": _to_int(stats.get("active-flows")),
                    "packets_looked_up": _to_int(stats.get("packets-looked-up")),
                    "packets_matched": _to_int(stats.get("packets-matched")),
                    "flows": [self._normalize_flow(flow, table.get("id")) for flow in table_flows],
                }
            )

        return {
            "node_id": node.get("id", node_id),
            "table_count": len(tables),
            "flow_count": total_flows,
            "tables": normalized_tables,
        }

    def apply_demo_block_ping_policy(self) -> dict[str, object]:
        self._ensure_node_exists(DEMO_POLICY_NODE_ID)
        applied_flow_ids: list[str] = []

        try:
            for flow in DEMO_PING_BLOCK_FLOWS:
                self._put_json(
                    self._flow_inventory_path(
                        node_id=DEMO_POLICY_NODE_ID,
                        table_id=DEMO_POLICY_TABLE_ID,
                        flow_id=flow.flow_id,
                    ),
                    self._build_demo_ping_block_flow_payload(flow),
                )
                applied_flow_ids.append(flow.flow_id)
        except OpenDaylightError:
            for flow_id in applied_flow_ids:
                try:
                    self._delete_resource(
                        self._flow_inventory_path(
                            node_id=DEMO_POLICY_NODE_ID,
                            table_id=DEMO_POLICY_TABLE_ID,
                            flow_id=flow_id,
                        ),
                        ignore_not_found=True,
                    )
                except OpenDaylightError:
                    continue
            raise

        return {
            "applied": True,
            "node_id": DEMO_POLICY_NODE_ID,
            "flow_ids": [flow.flow_id for flow in DEMO_PING_BLOCK_FLOWS],
        }

    def remove_demo_block_ping_policy(self) -> dict[str, object]:
        self._ensure_node_exists(DEMO_POLICY_NODE_ID)

        for flow in DEMO_PING_BLOCK_FLOWS:
            self._delete_resource(
                self._flow_inventory_path(
                    node_id=DEMO_POLICY_NODE_ID,
                    table_id=DEMO_POLICY_TABLE_ID,
                    flow_id=flow.flow_id,
                ),
                ignore_not_found=True,
            )

        return {
            "removed": True,
            "node_id": DEMO_POLICY_NODE_ID,
            "flow_ids": [flow.flow_id for flow in DEMO_PING_BLOCK_FLOWS],
        }

    def get_demo_block_ping_policy_status(self) -> dict[str, object]:
        self._ensure_node_exists(DEMO_POLICY_NODE_ID)
        flow_ids = [flow.flow_id for flow in DEMO_PING_BLOCK_FLOWS]
        active = all(
            self._resource_exists(
                self._flow_inventory_path(
                    node_id=DEMO_POLICY_NODE_ID,
                    table_id=DEMO_POLICY_TABLE_ID,
                    flow_id=flow_id,
                )
            )
            for flow_id in flow_ids
        )

        return {
            "active": active,
            "node_id": DEMO_POLICY_NODE_ID,
            "flow_ids": flow_ids,
        }

    def _normalize_inventory_node(self, node: dict[str, object]) -> dict[str, object]:
        tables = node.get("flow-node-inventory:table", [])
        connectors = node.get("node-connector", [])
        flow_count = sum(len(table.get("flow", [])) for table in tables)

        return {
            "node_id": node.get("id"),
            "manufacturer": node.get("flow-node-inventory:manufacturer"),
            "hardware": node.get("flow-node-inventory:hardware"),
            "software": node.get("flow-node-inventory:software"),
            "serial_number": node.get("flow-node-inventory:serial-number"),
            "description": node.get("flow-node-inventory:description"),
            "ip_address": node.get("flow-node-inventory:ip-address"),
            "table_count": len(tables),
            "flow_count": flow_count,
            "connector_count": len(connectors),
            "snapshot": {
                "start": node.get("flow-node-inventory:snapshot-gathering-status-start"),
                "end": node.get("flow-node-inventory:snapshot-gathering-status-end"),
            },
            "connectors": [self._normalize_connector(connector) for connector in connectors],
        }

    def _normalize_connector(self, connector: dict[str, object]) -> dict[str, object]:
        return {
            "connector_id": connector.get("id"),
            "name": connector.get("flow-node-inventory:name"),
            "port_number": connector.get("flow-node-inventory:port-number"),
            "hardware_address": connector.get("flow-node-inventory:hardware-address"),
            "state": connector.get("flow-node-inventory:state", {}),
            "configuration": connector.get("flow-node-inventory:configuration"),
            "statistics": connector.get(
                "opendaylight-port-statistics:flow-capable-node-connector-statistics", {}
            ),
        }

    def _normalize_flow(
        self, flow: dict[str, object], default_table_id: object
    ) -> dict[str, object]:
        return {
            "flow_id": flow.get("id"),
            "table_id": flow.get("table_id", default_table_id),
            "priority": flow.get("priority"),
            "cookie": flow.get("cookie"),
            "idle_timeout": flow.get("idle-timeout"),
            "hard_timeout": flow.get("hard-timeout"),
            "match": flow.get("match", {}),
            "instructions": flow.get("instructions", {}),
            "statistics": flow.get("opendaylight-flow-statistics:flow-statistics", {}),
        }

    def _node_inventory_path(self, node_id: str) -> str:
        safe_node_id = quote(node_id, safe=":")
        return f"{INVENTORY_ROOT}/node={safe_node_id}"

    def _flow_inventory_path(self, node_id: str, table_id: int, flow_id: str) -> str:
        safe_node_id = quote(node_id, safe=":")
        safe_table_id = quote(str(table_id), safe="")
        safe_flow_id = quote(flow_id, safe="")
        return (
            f"{INVENTORY_ROOT}/node={safe_node_id}"
            f"/flow-node-inventory:table={safe_table_id}/flow={safe_flow_id}"
        )

    def _build_demo_ping_block_flow_payload(
        self, flow: DemoPingBlockFlow
    ) -> dict[str, object]:
        return {
            "flow-node-inventory:flow": [
                {
                    "id": flow.flow_id,
                    "table_id": DEMO_POLICY_TABLE_ID,
                    "flow-name": flow.flow_name,
                    "priority": DEMO_POLICY_PRIORITY,
                    "installHw": False,
                    "strict": False,
                    "barrier": False,
                    "idle-timeout": 0,
                    "hard-timeout": 0,
                    "cookie": int(flow.flow_id),
                    "match": {
                        "ethernet-match": {
                            "ethernet-type": {
                                "type": 2048,
                            }
                        },
                        "ipv4-source": flow.source_ipv4,
                        "ipv4-destination": flow.destination_ipv4,
                        "ip-match": {
                            "ip-protocol": 1,
                        },
                    },
                    "instructions": {
                        "instruction": [
                            {
                                "order": 0,
                                "apply-actions": {
                                    "action": [
                                        {
                                            "order": 0,
                                            "drop-action": {},
                                        }
                                    ]
                                },
                            }
                        ]
                    },
                }
            ]
        }

    def _ensure_node_exists(self, node_id: str) -> None:
        self._get_json(self._node_inventory_path(node_id), node_id=node_id)

    def _put_json(self, path: str, payload: dict[str, object]) -> None:
        self._request("PUT", path, json_body=payload)

    def _delete_resource(self, path: str, ignore_not_found: bool = False) -> None:
        self._request("DELETE", path, ignore_not_found=ignore_not_found)

    def _resource_exists(self, path: str) -> bool:
        try:
            response = self._request("GET", path, ignore_not_found=True)
            return response.status_code != 404
        except OpenDaylightResponseError as exc:
            if exc.status_code == 409 and "data-missing" in exc.detail.lower():
                return False
            raise

    def _get_json(self, path: str, node_id: str | None = None) -> dict[str, object]:
        response = self._request("GET", path, node_id=node_id)
        try:
            return response.json()
        except ValueError as exc:
            raise OpenDaylightResponseError(
                status_code=502,
                detail="OpenDaylight returned invalid JSON",
            ) from exc

    def _request(
        self,
        method: str,
        path: str,
        node_id: str | None = None,
        json_body: dict[str, object] | None = None,
        ignore_not_found: bool = False,
    ) -> requests.Response:
        url = f"{self._settings.normalized_odl_base_url}{path}"
        try:
            response = self._session.request(
                method=method,
                url=url,
                timeout=self._settings.odl_timeout_seconds,
                json=json_body,
            )
        except requests.RequestException as exc:
            raise OpenDaylightUnavailable(
                f"Cannot reach OpenDaylight at {self._settings.normalized_odl_base_url}: {exc}"
            ) from exc

        if ignore_not_found and response.status_code == 404:
            return response

        if response.status_code == 404 and node_id is not None:
            raise OpenDaylightNotFound(
                status_code=404,
                detail=f"Node '{node_id}' was not found in OpenDaylight inventory",
            )

        if response.status_code == 404:
            raise OpenDaylightNotFound(
                status_code=404,
                detail=f"OpenDaylight resource was not found at path '{path}'",
            )

        if response.status_code >= 400:
            detail = response.text.strip() or f"OpenDaylight returned HTTP {response.status_code}"
            raise OpenDaylightResponseError(
                status_code=response.status_code,
                detail=detail,
            )

        return response


@lru_cache
def get_odl_client() -> OpenDaylightClient:
    return OpenDaylightClient(get_settings())


def _to_int(value: object) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None
