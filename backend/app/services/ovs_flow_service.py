import subprocess


class OVSFlowService:
    BRIDGE = "s1"
    PROTOCOL = "OpenFlow10"
    NORMAL_COOKIE = "0x1001"
    BLOCK_PING_COOKIE_1 = "0x9001"
    BLOCK_PING_COOKIE_2 = "0x9002"
    BLOCK_HTTP_COOKIE_1 = "0x9011"
    BLOCK_HTTP_COOKIE_2 = "0x9012"
    ISOLATE_H1_COOKIE_1 = "0x9021"
    ISOLATE_H1_COOKIE_2 = "0x9022"

    def _run(self, cmd: list[str]) -> str:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            message = result.stderr.strip() or result.stdout.strip() or "Command failed"
            raise RuntimeError(message)
        return result.stdout.strip()

    def delete_flow_by_cookie(self, cookie: str) -> None:
        self._run(
            [
                "sudo",
                "-n",
                "ovs-ofctl",
                "-O",
                self.PROTOCOL,
                "del-flows",
                self.BRIDGE,
                f"cookie={cookie}/-1",
            ]
        )

    def add_normal_flow(self) -> None:
        self.delete_flow_by_cookie(self.NORMAL_COOKIE)
        self._run(
            [
                "sudo",
                "-n",
                "ovs-ofctl",
                "-O",
                self.PROTOCOL,
                "add-flow",
                self.BRIDGE,
                f"cookie={self.NORMAL_COOKIE},priority=10,actions=normal",
            ]
        )

    def remove_normal_flow(self) -> None:
        self._run(
            [
                "sudo",
                "-n",
                "ovs-ofctl",
                "-O",
                self.PROTOCOL,
                "del-flows",
                self.BRIDGE,
                f"cookie={self.NORMAL_COOKIE}/-1",
            ]
        )

    def add_block_ping_flows(self) -> None:
        self.delete_flow_by_cookie(self.BLOCK_PING_COOKIE_1)
        self.delete_flow_by_cookie(self.BLOCK_PING_COOKIE_2)
        self._run(
            [
                "sudo",
                "-n",
                "ovs-ofctl",
                "-O",
                self.PROTOCOL,
                "add-flow",
                self.BRIDGE,
                f"cookie={self.BLOCK_PING_COOKIE_1},priority=100,icmp,nw_src=10.0.0.1,nw_dst=10.0.0.2,actions=drop",
            ]
        )
        self._run(
            [
                "sudo",
                "-n",
                "ovs-ofctl",
                "-O",
                self.PROTOCOL,
                "add-flow",
                self.BRIDGE,
                f"cookie={self.BLOCK_PING_COOKIE_2},priority=100,icmp,nw_src=10.0.0.2,nw_dst=10.0.0.1,actions=drop",
            ]
        )

    def remove_block_ping_flows(self) -> None:
        self._run(
            [
                "sudo",
                "-n",
                "ovs-ofctl",
                "-O",
                self.PROTOCOL,
                "del-flows",
                self.BRIDGE,
                f"cookie={self.BLOCK_PING_COOKIE_1}/-1",
            ]
        )
        self._run(
            [
                "sudo",
                "-n",
                "ovs-ofctl",
                "-O",
                self.PROTOCOL,
                "del-flows",
                self.BRIDGE,
                f"cookie={self.BLOCK_PING_COOKIE_2}/-1",
            ]
        )

    def add_block_http_flows(self) -> None:
        self.delete_flow_by_cookie(self.BLOCK_HTTP_COOKIE_1)
        self.delete_flow_by_cookie(self.BLOCK_HTTP_COOKIE_2)
        self._run(
            [
                "sudo",
                "-n",
                "ovs-ofctl",
                "-O",
                self.PROTOCOL,
                "add-flow",
                self.BRIDGE,
                f"cookie={self.BLOCK_HTTP_COOKIE_1},priority=110,tcp,nw_src=10.0.0.1,nw_dst=10.0.0.2,tp_dst=80,actions=drop",
            ]
        )
        self._run(
            [
                "sudo",
                "-n",
                "ovs-ofctl",
                "-O",
                self.PROTOCOL,
                "add-flow",
                self.BRIDGE,
                f"cookie={self.BLOCK_HTTP_COOKIE_2},priority=110,tcp,nw_src=10.0.0.2,nw_dst=10.0.0.1,tp_src=80,actions=drop",
            ]
        )

    def remove_block_http_flows(self) -> None:
        self.delete_flow_by_cookie(self.BLOCK_HTTP_COOKIE_1)
        self.delete_flow_by_cookie(self.BLOCK_HTTP_COOKIE_2)

    def add_isolate_h1_flows(self) -> None:
        self.delete_flow_by_cookie(self.ISOLATE_H1_COOKIE_1)
        self.delete_flow_by_cookie(self.ISOLATE_H1_COOKIE_2)
        self._run(
            [
                "sudo",
                "-n",
                "ovs-ofctl",
                "-O",
                self.PROTOCOL,
                "add-flow",
                self.BRIDGE,
                f"cookie={self.ISOLATE_H1_COOKIE_1},priority=120,ip,nw_src=10.0.0.1,nw_dst=10.0.0.2,actions=drop",
            ]
        )
        self._run(
            [
                "sudo",
                "-n",
                "ovs-ofctl",
                "-O",
                self.PROTOCOL,
                "add-flow",
                self.BRIDGE,
                f"cookie={self.ISOLATE_H1_COOKIE_2},priority=120,ip,nw_src=10.0.0.2,nw_dst=10.0.0.1,actions=drop",
            ]
        )

    def remove_isolate_h1_flows(self) -> None:
        self.delete_flow_by_cookie(self.ISOLATE_H1_COOKIE_1)
        self.delete_flow_by_cookie(self.ISOLATE_H1_COOKIE_2)

    def dump_flows(self) -> str:
        return self._run(
            [
                "sudo",
                "-n",
                "ovs-ofctl",
                "-O",
                self.PROTOCOL,
                "dump-flows",
                self.BRIDGE,
            ]
        )

    def get_ovs_flows(self) -> dict[str, object]:
        raw_flows = self.dump_flows()
        flows: list[dict[str, object]] = []
        flow_labels = {
            self.NORMAL_COOKIE: ("base", "Base Forwarding"),
            self.BLOCK_PING_COOKIE_1: ("policy", "Block Ping A->B"),
            self.BLOCK_PING_COOKIE_2: ("policy", "Block Ping B->A"),
            self.BLOCK_HTTP_COOKIE_1: ("policy", "Block HTTP A->B"),
            self.BLOCK_HTTP_COOKIE_2: ("policy", "Block HTTP B->A"),
            self.ISOLATE_H1_COOKIE_1: ("policy", "Isolate H1 A->B"),
            self.ISOLATE_H1_COOKIE_2: ("policy", "Isolate H1 B->A"),
        }

        for line in raw_flows.splitlines():
            stripped_line = line.strip()
            if not stripped_line or " cookie=" not in f" {stripped_line}":
                continue

            match_part, _, actions_part = stripped_line.partition(" actions=")
            actions = actions_part.strip()
            cookie = ""
            priority = 0

            for segment in [part.strip() for part in match_part.split(",")]:
                if segment.startswith("cookie="):
                    cookie = segment.split("=", 1)[1]
                elif segment.startswith("priority="):
                    try:
                        priority = int(segment.split("=", 1)[1])
                    except ValueError:
                        priority = 0

            flow_type, label = flow_labels.get(cookie, ("unknown", "Unclassified"))
            flows.append(
                {
                    "cookie": cookie,
                    "priority": priority,
                    "flow_type": flow_type,
                    "label": label,
                    "match": match_part.strip(),
                    "actions": actions,
                    "raw": stripped_line,
                }
            )

        return {
            "bridge": self.BRIDGE,
            "protocol": self.PROTOCOL,
            "flow_count": len(flows),
            "flows": flows,
            "raw_flows": raw_flows,
        }

    def get_policy_status(self) -> dict[str, object]:
        raw_flows = self.dump_flows()
        has_base_normal = f"cookie={self.NORMAL_COOKIE}" in raw_flows
        has_block_ping_1 = f"cookie={self.BLOCK_PING_COOKIE_1}" in raw_flows
        has_block_ping_2 = f"cookie={self.BLOCK_PING_COOKIE_2}" in raw_flows
        has_block_http_1 = f"cookie={self.BLOCK_HTTP_COOKIE_1}" in raw_flows
        has_block_http_2 = f"cookie={self.BLOCK_HTTP_COOKIE_2}" in raw_flows
        has_isolate_h1_1 = f"cookie={self.ISOLATE_H1_COOKIE_1}" in raw_flows
        has_isolate_h1_2 = f"cookie={self.ISOLATE_H1_COOKIE_2}" in raw_flows

        return {
            "mode": "ovs-direct",
            "base_forwarding_enabled": has_base_normal,
            "block_ping_enabled": has_block_ping_1 or has_block_ping_2,
            "block_http_enabled": has_block_http_1 or has_block_http_2,
            "isolate_h1_enabled": has_isolate_h1_1 or has_isolate_h1_2,
            "flow_cookies": {
                "base_normal": has_base_normal,
                "block_ping_1": has_block_ping_1,
                "block_ping_2": has_block_ping_2,
                "block_http_1": has_block_http_1,
                "block_http_2": has_block_http_2,
                "isolate_h1_1": has_isolate_h1_1,
                "isolate_h1_2": has_isolate_h1_2,
            },
            "raw_flows": raw_flows,
        }

    def recover_baseline(self) -> dict[str, object]:
        self.remove_block_ping_flows()
        self.remove_block_http_flows()
        self.remove_isolate_h1_flows()
        self.add_normal_flow()
        return {
            "recovered": True,
            "mode": "ovs-direct",
            "base_forwarding_enabled": True,
            "block_ping_enabled": False,
            "block_http_enabled": False,
            "isolate_h1_enabled": False,
        }
