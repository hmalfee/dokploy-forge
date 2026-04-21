import json
import os
import sqlite3
import time

import bcrypt
from uptime_kuma_api import UptimeKumaApi, DockerType, NotificationType

URL = os.environ["KUMA_URL"]
USER = os.environ.get("KUMA_USERNAME", "").strip()
PASS = os.environ.get("KUMA_PASSWORD", "").strip()
DB = "/app/data/kuma.db"
STATE_FILE = "/app/data/kuma_init_state.json"


def sync_db_user():
    if not (USER and PASS and os.path.exists(DB)):
        return
    conn = sqlite3.connect(DB)
    cur = conn.cursor()
    if not cur.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='user'"
    ).fetchone():
        conn.close()
        return
    row = cur.execute("SELECT id FROM user LIMIT 1").fetchone()
    if row:
        print(f"Syncing credentials → {DB}", flush=True)
        cur.execute(
            "UPDATE user SET username=?, password=? WHERE id=?",
            (USER, bcrypt.hashpw(PASS.encode(), bcrypt.gensalt(10)).decode(), row[0]),
        )
        conn.commit()
    conn.close()


def ensure_docker_host(api):
    if any(h["dockerType"] == DockerType.SOCKET for h in api.get_docker_hosts()):
        return
    api.add_docker_host(
        name="local",
        dockerType=DockerType.SOCKET,
        dockerDaemon="/var/run/docker.sock",
    )
    print("Docker host created", flush=True)


def ensure_smtp(api):
    env = {
        key: os.environ.get(key)
        for key in (
            "SMTP_HOST",
            "SMTP_PORT",
            "SMTP_USERNAME",
            "SMTP_PASSWORD",
            "SMTP_FROM_NAME",
            "SMTP_FROM_ADDRESS",
            "SMTP_TO_ADDRESS",
        )
    }
    if not all(env.values()):
        return

    state = {}
    try:
        with open(STATE_FILE) as state_file:
            state = json.load(state_file)
    except Exception:
        pass

    cfg = {
        "name": "Default SMTP",
        "type": NotificationType.SMTP,
        "isDefault": True,
        "applyExisting": True,
        "smtpHost": env["SMTP_HOST"],
        "smtpPort": int(env["SMTP_PORT"]),
        "smtpFrom": (
            f'"{env["SMTP_FROM_NAME"]}" <{env["SMTP_FROM_ADDRESS"]}>'
            if env["SMTP_FROM_NAME"]
            else env["SMTP_FROM_ADDRESS"]
        ),
        "smtpTo": env["SMTP_TO_ADDRESS"],
        "smtpUsername": env["SMTP_USERNAME"],
        "smtpPassword": env["SMTP_PASSWORD"],
    }

    existing_id = state.get("smtp_notification_id")
    if existing_id and existing_id not in {
        n.get("id") for n in api.get_notifications()
    }:
        existing_id = None

    try:
        if existing_id:
            api.edit_notification(existing_id, **cfg)
            print(f"SMTP updated (id={existing_id})", flush=True)
        else:
            response = api.add_notification(**cfg)
            notification_id = (
                response.get("id") if getattr(response, "get", None) else None
            )
            if notification_id:
                state["smtp_notification_id"] = notification_id
                with open(STATE_FILE, "w") as state_file:
                    json.dump(state, state_file)
            print(f"SMTP created (id={notification_id})", flush=True)
    except Exception as error:
        print(f"SMTP setup failed: {error}", flush=True)


while True:
    try:
        sync_db_user()
        with UptimeKumaApi(URL) as api:
            api.login(USER, PASS)
            ensure_docker_host(api)
            ensure_smtp(api)
        print("Init done.", flush=True)
        break
    except Exception as error:
        try:
            with UptimeKumaApi(URL) as api:
                api.setup(USER, PASS)
        except Exception:
            pass
        print(f"Retrying in 3s: {error}", flush=True)
        time.sleep(3)
