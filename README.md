# TEEFFA Worker

Cloudflare Worker implementation of the TEEFFA Engineering Decision API — electrical panel sizing, BOM generation, and quotation system targeting the Saudi Arabian market (SAR pricing, Arabic rule messages).

Ported from the FastAPI backend in [TEEFFA-ENGINEERING-SYSTEM](https://github.com/Dosarey99/TEEFFA-ENGINEERING-SYSTEM).

**Live URL:** `https://teeffa-api.ama-intel-sa.workers.dev`

---

## Stack

| Layer | Technology |
|---|---|
| Runtime | Cloudflare Workers (edge, TypeScript) |
| Storage | Cloudflare KV (project persistence) |
| Auth | Bearer token via Cloudflare Secret |
| Deploy | Wrangler CLI |

---

## Local Development

### Prerequisites

- Node.js 18+
- A Cloudflare account (free tier works)
- Wrangler authenticated: `npx wrangler login`

### Install

```bash
git clone https://github.com/Dosarey99/teeffa-worker.git
cd teeffa-worker
npm install
```

### Run locally

```bash
npm run dev
# → http://localhost:8788
```

KV runs in local mode automatically — no namespace IDs needed for dev.

---

## Deploy to Cloudflare

### 1. Create KV namespaces

```bash
npx wrangler kv namespace create PROJECTS_KV
npx wrangler kv namespace create PROJECTS_KV --preview
```

Copy the returned IDs into `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "PROJECTS_KV"
id = "<production-id>"
preview_id = "<preview-id>"
```

### 2. Set secrets

```bash
npx wrangler secret put ADMIN_USER       # e.g. admin
npx wrangler secret put ADMIN_PASSWORD   # e.g. admin123
npx wrangler secret put TEEFFA_TOKEN     # any strong random string
```

### 3. Deploy

```bash
npm run deploy
# → https://teeffa-api.<your-subdomain>.workers.dev
```

---

## Login

```bash
curl -X POST https://teeffa-api.ama-intel-sa.workers.dev/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

Response:

```json
{
  "token": "1234567890abcdef",
  "role": "admin",
  "username": "admin"
}
```

Use the token as `Authorization: Bearer <token>` on all protected endpoints.

---

## API Endpoints

### `GET /api/health`

Public. Returns system status.

```bash
curl https://teeffa-api.ama-intel-sa.workers.dev/api/health
```

```json
{"status": "ok", "system": "TEEFFA Engineering Decision System"}
```

---

### `POST /api/login`

Public. Returns a Bearer token.

**Body:**

```json
{
  "username": "admin",
  "password": "admin123"
}
```

---

### `GET /api/dashboard` *(auth)*

Summary statistics across all projects.

```bash
curl https://teeffa-api.ama-intel-sa.workers.dev/api/dashboard \
  -H "Authorization: Bearer <token>"
```

```json
{
  "total_projects": 4,
  "pass_count": 1,
  "warning_count": 1,
  "fail_count": 2,
  "total_quoted_value_sar": 80647.07,
  "expected_profit_sar": 13441.13,
  "recent_projects": [...]
}
```

---

### `POST /api/calculate` *(auth)*

Core endpoint. Runs the full engineering pipeline and saves the project.

**Body (`QuoteInput`):**

```json
{
  "project_name": "Main Distribution Board",
  "customer_name": "Saudi Aramco",
  "panel_type": "MDB",
  "phase": "3PH",
  "voltage": 400,
  "power_kw": 500,
  "power_factor": 0.9,
  "diversity_factor": 0.8,
  "main_breaker_amp": 1000,
  "breaker_type": "ACB",
  "outgoing_breakers_count": 36,
  "brand": "Schneider",
  "ip_rating": "IP54",
  "has_motors": true,
  "has_generator": true
}
```

| Field | Type | Values / Default |
|---|---|---|
| `project_name` | string | any |
| `customer_name` | string | any |
| `panel_type` | enum | `MDB` `SUB_PANEL` `ATS` `PUMP_PANEL` `CONTROL_PANEL` |
| `phase` | enum | `3PH` `1PH` |
| `voltage` | number | V, default `400` |
| `power_kw` | number | kW, > 0 |
| `power_factor` | number | (0, 1], default `0.85` |
| `diversity_factor` | number | (0, 1.5], default `1.0` |
| `main_breaker_amp` | integer | A, > 0 |
| `breaker_type` | enum | `MCB` `MCCB` `ACB` |
| `outgoing_breakers_count` | integer | 0–120, default `12` |
| `brand` | enum | `Schneider` `ABB` `Siemens` `LS` `CHINT` `Generic` |
| `ip_rating` | enum | `IP42` `IP54` `IP65` |
| `has_motors` | boolean | default `false` |
| `has_generator` | boolean | default `false` |
| `width_mm` | integer | optional, overrides recommended |
| `height_mm` | integer | optional, overrides recommended |
| `depth_mm` | integer | optional, overrides recommended |
| `engineer_price` | number | optional SAR, triggers price sanity check |
| `notes` | string | optional |

**Response includes:**
- `engineering` — calculated/design current, recommended breaker, cable, busbar, panel dimensions, material weights
- `rules` — PASS / WARNING / FAIL decisions with Arabic messages (IEC 60947 / SEC checks)
- `pricing` — 9-line BOM in SAR + direct cost + 10% overhead + 20% profit = final price
- `layout` — panel zones with height percentages and manufacturing notes
- `factory_message` — Arabic WhatsApp-ready factory order text
- `whatsapp_url` — pre-encoded `wa.me` URL

---

### `GET /api/projects` *(auth)*

List all saved projects (full objects, newest first).

```bash
curl https://teeffa-api.ama-intel-sa.workers.dev/api/projects \
  -H "Authorization: Bearer <token>"
```

---

### `GET /api/projects/:id` *(auth)*

Retrieve a single project by its 8-character ID.

```bash
curl https://teeffa-api.ama-intel-sa.workers.dev/api/projects/61155EDF \
  -H "Authorization: Bearer <token>"
```

---

### `GET /api/projects/:id/factory-message` *(auth)*

Returns the Arabic factory message and WhatsApp URL for a saved project.

```bash
curl https://teeffa-api.ama-intel-sa.workers.dev/api/projects/61155EDF/factory-message \
  -H "Authorization: Bearer <token>"
```

---

## Engineering Formulas

```
3PH: I = P(kW)×1000 / (√3 × V × PF)
1PH: I = P(kW)×1000 / (V × PF)

demand_current = calculated × diversity_factor
margin         = 1.25 (has_motors) | 1.15 (standard)  +0.05 if has_generator
design_current = demand_current × margin

Breaker family: MCB ≤ 63A · MCCB ≤ 630A · ACB > 630A
Standards: IEC 60947 (breakers), IEC 60364 (cable), SEC (Saudi)
Pricing:   direct_cost × 1.10 (overhead) × 1.20 (profit) = final_price
```

---

## Local Offline Deployment (Ubuntu)

For air-gapped or on-premise environments with no internet access.

### Requirements

```bash
sudo apt update
sudo apt install -y nodejs npm git
node --version   # 18+ required
```

### Option A — Wrangler local mode (recommended for single-machine use)

Wrangler's `dev` command runs the full Worker runtime locally using Miniflare with in-process KV. No Cloudflare account needed at runtime.

```bash
git clone https://github.com/Dosarey99/teeffa-worker.git
cd teeffa-worker
npm install

# Set env vars in a .dev.vars file (Wrangler loads this in dev mode)
cat > .dev.vars <<EOF
ADMIN_USER=admin
ADMIN_PASSWORD=admin123
TEEFFA_TOKEN=your-secret-token
EOF

npm run dev
# → http://localhost:8788
```

To bind to all interfaces (LAN access):

```bash
npx wrangler dev --ip 0.0.0.0 --port 8788
```

### Option B — Run as a systemd service (persistent background process)

```bash
# Create a dedicated user
sudo useradd -m -s /bin/bash teeffa

# Clone and install as that user
sudo -u teeffa bash -c "
  git clone https://github.com/Dosarey99/teeffa-worker.git /home/teeffa/teeffa-worker
  cd /home/teeffa/teeffa-worker && npm install
"

# Create .dev.vars
sudo -u teeffa tee /home/teeffa/teeffa-worker/.dev.vars <<EOF
ADMIN_USER=admin
ADMIN_PASSWORD=admin123
TEEFFA_TOKEN=your-secret-token
EOF

# Create systemd unit
sudo tee /etc/systemd/system/teeffa-worker.service <<EOF
[Unit]
Description=TEEFFA Engineering Worker API
After=network.target

[Service]
Type=simple
User=teeffa
WorkingDirectory=/home/teeffa/teeffa-worker
ExecStart=/usr/bin/npx wrangler dev --ip 0.0.0.0 --port 8788
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable teeffa-worker
sudo systemctl start teeffa-worker

# Check status
sudo systemctl status teeffa-worker
```

API will be available at `http://<server-ip>:8788`.

### Option C — Reverse proxy with Nginx (production LAN)

```bash
sudo apt install -y nginx

sudo tee /etc/nginx/sites-available/teeffa <<EOF
server {
    listen 80;
    server_name teeffa.local;

    location / {
        proxy_pass http://127.0.0.1:8788;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/teeffa /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Then update the frontend:

```bash
# In TEEFFA-ENGINEERING-SYSTEM/frontend/.env
VITE_API_URL=http://teeffa.local/api
```

### Offline KV persistence

In local Wrangler dev mode, KV data is stored in `.wrangler/state/` inside the project directory. Back up this folder to persist projects across restarts.

```bash
# Backup
tar -czf teeffa-kv-backup-$(date +%F).tar.gz /home/teeffa/teeffa-worker/.wrangler/state/

# Restore
tar -xzf teeffa-kv-backup-2026-06-21.tar.gz -C /
```

---

## Repository Links

| Repo | URL |
|---|---|
| Worker (this repo) | https://github.com/Dosarey99/teeffa-worker |
| Full stack (FastAPI + React) | https://github.com/Dosarey99/TEEFFA-ENGINEERING-SYSTEM |

---

## Notes

- PDF generation is not available in the Worker — it requires ReportLab which cannot run in the Workers edge runtime. Use the FastAPI backend for PDF quotes.
- The static token auth is intentional for v1. Rotate `TEEFFA_TOKEN` via `wrangler secret put TEEFFA_TOKEN` at any time without redeploying.
- All prices in SAR (Saudi Riyals), ex-VAT. VAT (15%) is not applied by the engine.
