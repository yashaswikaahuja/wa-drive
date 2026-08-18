#!/usr/bin/env python3
"""Insert location /ws for extension-service WSS on api.cybercontrol.fun nginx site."""
from pathlib import Path
import subprocess
import sys
import time

CONF = Path("/etc/nginx/sites-enabled/api.cybercontrol.fun")
NEEDLE = "    location /socket.io/ {"
BLOCK = """    # Extension WSS protocol (T4) — cybercontrol-ext :3300 /ws
    location /ws {
        proxy_pass http://cc_ext;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400s;
        proxy_buffering off;
    }

"""

def main() -> int:
    if not CONF.exists():
        print(f"missing {CONF}", file=sys.stderr)
        return 1
    text = CONF.read_text()
    if "location /ws" in text:
        print("ALREADY_HAS_WS")
    else:
        if NEEDLE not in text:
            print("needle not found", file=sys.stderr)
            return 1
        bak = CONF.with_suffix(CONF.suffix + f".bak.{int(time.time())}")
        bak.write_text(text)
        CONF.write_text(text.replace(NEEDLE, BLOCK + NEEDLE, 1))
        print(f"PATCHED (backup {bak})")
    r = subprocess.run(["nginx", "-t"], capture_output=True, text=True)
    sys.stdout.write(r.stdout or "")
    sys.stderr.write(r.stderr or "")
    if r.returncode != 0:
        return r.returncode
    r2 = subprocess.run(["systemctl", "reload", "nginx"])
    print("RELOADED" if r2.returncode == 0 else "RELOAD_FAILED")
    return r2.returncode

if __name__ == "__main__":
    raise SystemExit(main())
