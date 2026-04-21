# State: { container_name: monitor_id }
# Ownership is ID-based — user-created monitors for the same name never conflict.

import json
import os
import time
from pathlib import Path

import docker
from uptime_kuma_api import DockerType, MonitorType, UptimeKumaApi

URL = os.getenv("KUMA_URL")
USER = os.getenv("KUMA_USERNAME")
PASS = os.getenv("KUMA_PASSWORD")
STATE = Path("/app/data/state.json")
SKIP = {"uptime-kuma", "kuma-init", "container-sync"}
dc = docker.DockerClient(base_url="unix://var/run/docker.sock")


def tracked():
    out = set()
    for container in dc.containers.list(all=True):
        labels = container.labels or {}
        if container.name in SKIP or labels.get("com.docker.compose.service") in SKIP:
            continue
        if str(labels.get("kuma.ignore", "")).lower() in {"true", "1", "yes"}:
            continue
        if container.status == "running":
            out.add(container.name)
        elif container.status == "exited":
            try:
                if int(container.attrs["State"]["ExitCode"]) != 0:
                    out.add(container.name)
            except Exception:
                out.add(container.name)
    return out


def load():
    try:
        return json.loads(STATE.read_text())
    except Exception:
        return {}


def save(s):
    STATE.parent.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps(s, indent=2))


def host_id(api):
    for docker_host in api.get_docker_hosts() or []:
        if docker_host.get("dockerType") in (DockerType.SOCKET, "socket"):
            return str(docker_host["id"])
    api.add_docker_host(
        name="local",
        dockerType=DockerType.SOCKET,
        dockerDaemon="/var/run/docker.sock",
    )
    return host_id(api)


def add_monitor(api, name, hid):
    result = api.add_monitor(
        type=MonitorType.DOCKER,
        name=f"cs::{name}",
        docker_container=name,
        docker_host=hid,
        interval=60,
        retryInterval=60,
        maxretries=3,
    )
    return int(result["monitorID"]) if result and "monitorID" in result else None


print("container-sync: started", flush=True)
state = load()

while True:
    try:
        desired = tracked()
        with UptimeKumaApi(URL) as api:
            api.login(USER, PASS)
            hid = host_id(api)
            dirty = False

            try:
                live_ids = {
                    int(monitor["id"])
                    for monitor in (api.get_monitors() or [])
                    if "id" in monitor
                }
                for name in list(state):
                    if state[name] not in live_ids:
                        print(
                            f"container-sync: monitor {state[name]} for {name} missing, resetting",
                            flush=True,
                        )
                        del state[name]
                        dirty = True
            except Exception:
                pass

            for name in list(state):
                if name not in desired:
                    try:
                        api.delete_monitor(state[name])
                    except Exception as error:
                        print(f"container-sync: delete error: {error}", flush=True)
                    del state[name]
                    dirty = True
                    print(f"container-sync: removed {name}", flush=True)

            for name in desired:
                if name not in state:
                    monitor_id = add_monitor(api, name, hid)
                    if monitor_id:
                        state[name] = monitor_id
                        dirty = True
                        print(
                            f"container-sync: added {name} (id={monitor_id})",
                            flush=True,
                        )

            if dirty:
                save(state)
    except Exception as error:
        print(f"container-sync: error: {error}", flush=True)
    time.sleep(5)
