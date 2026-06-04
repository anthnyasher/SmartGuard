import sys

lines = open("/etc/nginx/sites-available/default").read().splitlines()
ws_block = """
    location /ws/ {
        proxy_pass http://localhost:8000/ws/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
"""

out = []
inserted = False
for l in lines:
    out.append(l)
    if l.strip() == "location /api/ {" and not inserted:
        out.insert(-1, ws_block)
        inserted = True

open("/etc/nginx/sites-available/default", "w").write("\n".join(out) + "\n")
print("Done patching Nginx.")
