import glob
import json
import os
import secrets
import sqlite3

import bcrypt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ed25519

D = "/beszel_data"
EMAIL = os.getenv("ADMIN_EMAIL")
PWD = os.getenv("ADMIN_PASSWORD")
STORAGE = f"{D}/state.json"
TOKEN_F = f"{D}/agent_token"

# SSH keypair (write-once)
key_path = f"{D}/id_ed25519"
pub_key_path = f"{D}/id_ed25519.pub"
if not os.path.exists(key_path):
    priv = ed25519.Ed25519PrivateKey.generate()
    open(key_path, "wb").write(
        priv.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.OpenSSH,
            serialization.NoEncryption(),
        )
    )
    os.chmod(key_path, 0o600)
    print("pre: generated SSH keypair")
if not os.path.exists(pub_key_path):
    priv = serialization.load_ssh_private_key(
        open(key_path, "rb").read(), password=None
    )
    open(pub_key_path, "wb").write(
        priv.public_key().public_bytes(
            serialization.Encoding.OpenSSH, serialization.PublicFormat.OpenSSH
        )
    )

# Agent token (write-once)
if not os.path.exists(TOKEN_F):
    open(TOKEN_F, "w").write(secrets.token_hex(32))
    print("pre: generated agent token")

# Remove stale config.yml
cfg = f"{D}/config.yml"
if os.path.exists(cfg):
    os.remove(cfg)
    print("pre: removed stale config.yml")

# Re-deploy: sync credentials via SQLite (skipped on first boot)
dbs = glob.glob(f"{D}/pb_data/data.db") + glob.glob(f"{D}/data.db")
state = json.loads(open(STORAGE).read()) if os.path.exists(STORAGE) else {}
if not dbs or not state:
    print("pre: first boot — skipping SQLite sync")
    raise SystemExit(0)

h = bcrypt.hashpw(PWD.encode(), bcrypt.gensalt(10)).decode()
conn = sqlite3.connect(dbs[0])
cur = conn.cursor()
has_tk = "tokenKey" in {c[1] for c in cur.execute("PRAGMA table_info(users)")}

if uid := state.get("user_id"):
    args = (
        (EMAIL, h, secrets.token_hex(32), "admin", uid)
        if has_tk
        else (EMAIL, h, "admin", uid)
    )
    cur.execute(
        "UPDATE users SET email=?,password=?"
        f"{',tokenKey=?' if has_tk else ''},role=? WHERE id=?",
        args,
    )
if aid := state.get("admin_id"):
    cur.execute("UPDATE _superusers SET email=?,password=? WHERE id=?", (EMAIL, h, aid))
if sid := state.get("system_id"):
    cur.execute("DELETE FROM systems WHERE id != ?", (sid,))

conn.commit()
conn.close()
print("pre: synced credentials")
