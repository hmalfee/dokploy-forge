import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

D = "/beszel_data"
BASE = os.getenv("HUB_URL")
EMAIL, PASSWORD = os.getenv("ADMIN_EMAIL"), os.getenv("ADMIN_PASSWORD")
SYSTEM_NAME = os.getenv("SYSTEM_NAME")
STORAGE = f"{D}/state.json"


def api(method, path, data=None, token=None, params=None):
    url = BASE + path + ("?" + urllib.parse.urlencode(params) if params else "")
    req = urllib.request.Request(
        url, json.dumps(data).encode() if data else None, method=method
    )
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        print(f"post: HTTP {e.code} {method} {path}")
        return None


# Auth with retry (stabilization window)
for _ in range(30):
    r = api(
        "POST",
        "/api/collections/_superusers/auth-with-password",
        {"identity": EMAIL, "password": PASSWORD},
    )
    if r and (tok := r.get("token")):
        break
    time.sleep(1)
else:
    raise SystemExit("post: auth failed")

state = json.loads(open(STORAGE).read()) if os.path.exists(STORAGE) else {}

# First boot: register agent token and persist IDs
if not state.get("user_id"):
    uid = api(
        "GET",
        "/api/collections/users/records",
        token=tok,
        params={"filter": f"email='{EMAIL}'", "fields": "id", "perPage": 1},
    )["items"][0]["id"]
    aid = api(
        "GET",
        "/api/collections/_superusers/records",
        token=tok,
        params={"filter": f"email='{EMAIL}'", "fields": "id", "perPage": 1},
    )["items"][0]["id"]
    r = api(
        "POST",
        "/api/collections/universal_tokens/records",
        {"user": uid, "token": open(f"{D}/agent_token").read().strip()},
        token=tok,
    )
    assert r and r.get("id"), "post: token insert failed"
    api("PATCH", f"/api/collections/users/records/{uid}", {"role": "admin"}, token=tok)
    state.update(user_id=uid, admin_id=aid)
    open(STORAGE, "w").write(json.dumps(state, indent=2))
    print(f"post: provisioned — uid={uid} aid={aid}")
else:
    print("post: already provisioned — skipping")

# SMTP (every boot if configured)
host = os.getenv("SMTP_HOST")
port = os.getenv("SMTP_PORT")
username = os.getenv("SMTP_USERNAME")
password = os.getenv("SMTP_PASSWORD")
sender_address = os.getenv("SMTP_SENDER_ADDRESS")
sender_name = os.getenv("SMTP_SENDER_NAME")

if all([host, port, username, password, sender_address]):
    port_int = int(port)
    r = api(
        "PATCH",
        "/api/settings",
        {
            "smtp": {
                "enabled": True,
                "host": host,
                "port": port_int,
                "username": username,
                "password": password,
                "tls": port_int == 465,
                "authMethod": "PLAIN",
            },
            "meta": {
                "senderName": sender_name,
                "senderAddress": sender_address,
            },
        },
        token=tok,
    )
    print(f"post: SMTP {'applied' if r else 'FAILED'} → {host}:{port}")
else:
    print(
        "post: Incomplete SMTP config — skipped "
        "(requires HOST, PORT, USERNAME, PASSWORD, SENDER_ADDRESS)"
    )

# Sync ADMIN_EMAIL into notification email list (every boot)
r = api(
    "GET",
    "/api/collections/user_settings/records",
    token=tok,
    params={"filter": f"user='{state['user_id']}'", "perPage": 1},
)
items = (r or {}).get("items", [])
if items:
    rec = items[0]
    settings = rec.get("settings") or {}
    email_list = settings.get("emails") or []
    if EMAIL not in email_list:
        email_list.append(EMAIL)
        settings["emails"] = email_list
        r2 = api(
            "PATCH",
            f"/api/collections/user_settings/records/{rec['id']}",
            {"settings": settings},
            token=tok,
        )
        print(
            f"post: notification emails → appended {EMAIL} ({'ok' if r2 else 'FAILED'})"
        )
    else:
        print(f"post: notification emails already contain {EMAIL} — skipped")
else:
    print("post: no user_settings record yet — will be seeded on first UI login")

# Wait for system record (first boot only, already known on re-deploy)
if not state.get("system_id"):
    print("post: waiting for system record...")
    for _ in range(60):
        r = api(
            "GET",
            "/api/collections/systems/records",
            token=tok,
            params={"perPage": 200, "sort": "created"},
        )
        if items := (r or {}).get("items"):
            state["system_id"] = items[0]["id"]
            print(f"post: system discovered — sid={state['system_id']}")
            break
        time.sleep(1)
    else:
        raise SystemExit("post: no system discovered after 60s")
else:
    print(f"post: system known — sid={state['system_id']}")

sid = state["system_id"]

# Ensure user↔system association and enforce deterministic local name
r = api(
    "PATCH",
    f"/api/collections/systems/records/{sid}",
    {"users": [state["user_id"]], "name": SYSTEM_NAME},
    token=tok,
)
print(
    "post: enforced system identity/name "
    f"sid={sid} name='{SYSTEM_NAME}' ({'ok' if r else 'FAILED'})"
)

# Prune duplicate system records
r = api("GET", "/api/collections/systems/records", token=tok, params={"perPage": 200})
pruned = [s["id"] for s in (r or {}).get("items", []) if s["id"] != sid]
for pid in pruned:
    api("DELETE", f"/api/collections/systems/records/{pid}", token=tok)
if pruned:
    print(f"post: pruned {len(pruned)} duplicate(s)")

open(STORAGE, "w").write(json.dumps(state, indent=2))
print(f"post: done — sid={sid}")
