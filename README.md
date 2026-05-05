<p align="center">
  <img src="static/icon.svg" width="120" alt="BigScale logo" />
</p>

<h1 align="center">BigScale</h1>

<p align="center">
  Self-hosted mesh VPN coordinator (Tailscale-compatible) with a modern admin web panel.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/SvelteKit-FF3E00?style=flat&logo=svelte&logoColor=white" alt="SvelteKit" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/TailwindCSS-06B6D4?style=flat&logo=tailwindcss&logoColor=white" alt="TailwindCSS" />
  <img src="https://img.shields.io/badge/DaisyUI-5A0EF8?style=flat&logo=daisyui&logoColor=white" alt="DaisyUI" />
  <img src="https://img.shields.io/badge/Vite-646CFF?style=flat&logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/Node.js-339933?style=flat&logo=nodedotjs&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/Docker-2496ED?style=flat&logo=docker&logoColor=white" alt="Docker" />
  <img src="https://img.shields.io/badge/Engine-Headscale-2D3036?style=flat" alt="Powered by Headscale" />
  <img src="https://img.shields.io/badge/License-MIT-22c55e?style=flat" alt="License: MIT" />
</p>

---

BigScale is a self-hosted VPN coordinator that bundles a Tailscale-compatible engine with a modern web panel for managing users, devices and authentication keys — all in a single Docker image. The engine is built from the open-source [Headscale](https://github.com/juanfont/headscale) source (pinned per release; see `HEADSCALE_VERSION` in the `Dockerfile`) and shipped under the `bigscale` binary name.

Pair it with the desktop client **[BigLace](https://github.com/big-comm/biglace)** to connect Linux machines to your network.

## Features

- **Self-hosted VPN coordinator** — you own your data, no dependency on Tailscale Inc.
- **Single Docker image** — server, panel and bootstrap all in one container.
- **Modern web panel** (SvelteKit + DaisyUI) with light/dark themes, fully responsive.
- **i18n**: English, Portuguese (Brazil), Spanish.
- **Username/password login** — first login forces the default password to be changed.
- **Full management**: users, devices, preauth keys, API keys, routes, tags.
- **Visual ACL editor** with a fallback advanced JSON (HuJSON) mode.
- **Server health badge** in the sidebar with live polling.
- **Zero-config**: one command brings the stack up — API key and admin password are generated/rotated by the container itself.

## Quick start

### Requirements
- Docker + Docker Compose v2
- (Production) a public domain with HTTPS through a reverse proxy (Caddy, Nginx, Traefik, …)

### Option A — pre-built image (fastest)

Pull the published multi-arch image (`linux/amd64` + `linux/arm64`):

```bash
docker pull talesam/bigscale:latest
# or, from GitHub Container Registry:
docker pull ghcr.io/talesam/bigscale:latest
```

Then drop it into your own `docker-compose.yml` (or use the one in this repo, which already references `bigscale:latest`).

### Option B — build from source

```bash
git clone https://github.com/talesam/bigscale.git
cd bigscale
docker compose up -d
```

The first build compiles the VPN engine from the upstream Headscale source (pinned via `HEADSCALE_VERSION` in the `Dockerfile`) and bundles it with the panel into a single image — no external Headscale image is pulled at runtime.

That's it. Open the panel and sign in with **admin** / **bigscale** — you will be required to change the password immediately. The internal API key is generated automatically by the container on first boot and stored in the `bigscale-panel-data` volume.

In local development, the panel listens on **3000** and the engine on **18080** (via `docker-compose.override.yml`). In production, see [Reverse proxy](#reverse-proxy).

## Reverse proxy

The container exposes two ports:

| Port | What it serves | Who consumes it |
|---|---|---|
| `3000` | Admin web panel (SvelteKit) | You, in the browser |
| `8080` | VPN engine (Tailscale/Headscale protocol) | BigLace / Tailscale clients |

Both **must be reachable over HTTPS in production**. You have two options:

### Option 1 — Two subdomains (simplest, recommended)

```caddyfile
panel.your-domain.com {
    reverse_proxy bigscale:3000
}

vpn.your-domain.com {
    reverse_proxy bigscale:8080
}
```

Each proxy host stays trivial: a single forward, zero custom locations. The trade-off is one extra TLS certificate.

### Option 2 — Single domain with path-based routing

If you only have one subdomain available, route the engine paths to `bigscale:8080` and everything else to the panel `bigscale:3000`. The Tailscale/Headscale protocol uses these paths — no others need to be exposed:

| Path | Match | Target |
|---|---|---|
| `/key` | prefix | `bigscale:8080` |
| `/machine/` | prefix | `bigscale:8080` |
| `/ts2021` | prefix | `bigscale:8080` |
| `/derp` | **exact** | `bigscale:8080` |
| `/derp/` | prefix | `bigscale:8080` |
| _everything else_ | — | `bigscale:3000` |

> **Both `/derp` (exact) and `/derp/` (prefix) are required.** Tailscale clients open the WebSocket relay with `GET /derp` (no trailing slash). If only `/derp/` is configured, the request falls through to the panel and gets a `301 → /derp/`, which the WebSocket upgrade does not survive. Symptom: clients connect fine but log `Tailscale could not connect to the DERP relay server` and never establish peer traffic.

Caddy example:

```caddyfile
vpn.your-domain.com {
    @engine path /key /machine/* /ts2021 /derp /derp/*
    reverse_proxy @engine bigscale:8080
    reverse_proxy bigscale:3000
}
```

Caddy's `path` matcher is exact for `/derp` and prefix for `/derp/*` automatically — listing both is enough.

Nginx Proxy Manager: set the default forward to `bigscale:3000` and add Custom Locations for the engine paths pointing to `bigscale:8080`. Enable **Websockets Support** and **HTTP/2**.

NPM caveat — the `/derp` exact match: NPM's "Custom Location" field does not accept the `= /derp` syntax. Workaround: open the proxy host → **Advanced** tab → paste:

```nginx
location = /derp {
    proxy_pass         http://bigscale:8080;
    proxy_http_version 1.1;
    proxy_set_header   Host                $host;
    proxy_set_header   Upgrade             $http_upgrade;
    proxy_set_header   Connection          $http_connection;
    proxy_set_header   X-Real-IP           $remote_addr;
    proxy_set_header   X-Forwarded-For     $remote_addr;
    proxy_set_header   X-Forwarded-Proto   $scheme;
    proxy_buffering    off;
    proxy_request_buffering off;
    proxy_read_timeout 1h;
    proxy_send_timeout 1h;
}
```

Keep the regular `/derp/` (with trailing slash) as a normal Custom Location — NPM accepts that one through the UI.

> **Do not expose `/api/v1/`, `/health`, `/version` or `/swagger` publicly.** They are administrative endpoints; the panel already talks to the engine over `localhost` inside the container.

## Embedded DERP relay & STUN (UDP 3478)

BigScale ships with Headscale's embedded DERP relay enabled by default (`derp.server.enabled: true` in `config.yaml`). The relay listens on **UDP 3478** for STUN. **This port is not exposed by the default `docker-compose.yml`** — clients can connect to the coordinator and see each other in the panel, but peer-to-peer traffic will silently fail.

### What goes wrong if UDP 3478 is closed

- `tailscale netcheck` reports `UDP: false` and `IPv4: (no addr found)`
- Peers behind NAT cannot discover each other's public address → no direct P2P
- The DERP relay over HTTPS still works as fallback, so traffic flows through the server (slower, uses your bandwidth)
- If the `/derp` exact-match location (above) is missing too, even the relay fallback fails and `tailscale ping` times out

### Fix

1. **Publish UDP 3478** in `docker-compose.yml`:
   ```yaml
   services:
     bigscale:
       ports:
         - "3478:3478/udp"
       expose:
         - "3000"
         - "8080"
   ```

2. **Open the host firewall**:
   ```bash
   sudo ufw allow 3478/udp comment "BigScale STUN"
   ```

3. **Open the cloud edge firewall** (Oracle Cloud Security List, AWS Security Group, GCP Firewall Rule, Hetzner Firewall, …): allow UDP 3478 inbound from `0.0.0.0/0`. The host firewall is not enough — most cloud providers block all UDP at the edge by default.

Verify on a connected client: `tailscale netcheck` should show `UDP: true` and a discovered IPv4 address. `tailscale ping <peer-ip>` should report `pong from … via DERP(...)` first, then upgrade to `via <ip>:<port>` once NAT-punching succeeds.

### Alternative: skip the embedded DERP

If you don't want to expose UDP at all (simpler firewall, but every byte of peer traffic flows through Tailscale's network), disable the embedded DERP and use Tailscale's public relays in `config.yaml`:

```yaml
derp:
  server:
    enabled: false
  urls:
    - https://controlplane.tailscale.com/derpmap/default
```

## ACL policy — user reference format

The visual ACL editor accepts free-form text in `src`/`dst`/group members and **does not validate** that the references match real users. Following Headscale's convention, user references must be **`username@`** — the username followed by `@`, with **nothing** after:

```json
{
  "groups": {
    "group:devs": ["alice@", "bob@"]
  },
  "acls": [
    { "action": "accept", "src": ["group:devs"], "dst": ["group:devs:*"] }
  ]
}
```

Common mistakes that the editor will save without warning:

| What you typed | Why it doesn't work |
|---|---|
| `@alice` | `@` at the start — no match, silently fails |
| `alice@your-domain.com` | Only matches if the user's `email` field is set; users created via the panel (no OIDC) have `email` empty |
| `alice` | No `@` — interpreted as a literal token, not a user reference |

`bigscale policy check -f policy.json` reports "Policy is valid" for all of the above (it's a syntactic check, not semantic), so a green light from `policy check` does not guarantee that the references resolve to actual users. If peers appear online in the panel but `tailscale status` does not list them as peers, the most likely cause is a malformed user reference in a `src`/group.

## Environment variables (all optional)

| Variable | Description | Default |
|---|---|---|
| `ADMIN_USERNAME` | Initial panel username | `admin` |
| `ADMIN_PASSWORD` | Initial panel password | `bigscale` |
| `COOKIE_SECURE`  | Set to `true` when serving the panel over HTTPS | `false` |

`ADMIN_USERNAME` / `ADMIN_PASSWORD` are seeds only — once the admin changes the password from the panel, the value persisted in the `bigscale-panel-data` volume is what counts.

The engine API key is generated automatically by the entrypoint and stored in `/data/api-key` inside the container (volume `bigscale-panel-data`). It never reaches the browser.

## Usage

1. Open the panel on your domain.
2. Sign in with `admin` / `bigscale` (you will be forced to change the password immediately).
3. In **Users**, create a user and generate an **authentication key (preauth key)**.
4. Share the public engine URL and the auth key with the end user.
5. The user pastes the URL + auth key into the **BigLace** app (or runs `tailscale up --login-server=<URL> --authkey=<KEY>`).

## Architecture

```
┌─────────────────────────────────────────┐
│  Client (BigLace or tailscale CLI)      │
└─────────────────┬───────────────────────┘
                  │ WireGuard via Headscale protocol
                  ▼
┌─────────────────────────────────────────┐
│              bigscale (one container)   │
│                                         │
│   ┌──────────────────────────────────┐  │
│   │ engine  (bigscale serve, :8080)  │  │  ← P2P coordination
│   └──────────────────────────────────┘  │
│             ▲                           │
│             │ HTTP API (localhost)      │
│   ┌─────────┴────────────────────────┐  │
│   │ panel   (Node + SvelteKit, :3000)│  │  ← admin web
│   │  • Server-side session cookie    │  │
│   │  • Admin password in /data/*.json│  │
│   │  • Proxy /api/bs/v1 → engine     │  │
│   └──────────────────────────────────┘  │
│                                         │
│  entrypoint.sh:                         │
│   • starts the engine                   │
│   • waits for /health + unix socket     │
│   • runs `bigscale apikeys create` once │
│   • starts the panel in foreground      │
└─────────────────────────────────────────┘
```

The engine API key **never** reaches the browser. All panel calls go through the `/api/bs/v1/*` proxy, which validates the session and adds the `Authorization` header server-side. The key lives at `/data/api-key` inside the container, owned by the panel process.

## Building the image

The `Dockerfile` is a three-stage build:

1. **`server-bin`** — `golang:1.25-alpine` clones the upstream Headscale repo at the pinned tag (`HEADSCALE_VERSION`, default `v0.28.0`) and compiles it from source into `/bigscale`. Reproducible build, no upstream image dependency.
2. **`panel-build`** — `node:20-alpine` builds the SvelteKit admin panel.
3. **final** — `node:20-alpine` with the compiled engine, the panel, and the entrypoint that orchestrates both processes.

`docker compose build` produces the image. To embed version metadata (commit, date) in OCI image labels, use the helper script:

```bash
./scripts/build.sh
```

The script reads the version from `package.json`, the current date, and the short commit hash, and injects them as `BIGSCALE_VERSION`, `BUILD_DATE` and `VCS_REF`. Inspect with:

```bash
docker inspect bigscale:latest --format '{{json .Config.Labels}}' | jq
```

These variables **do not go into `.env`** — they are build-only and are baked into the image.

### Bumping the engine

To track a newer Headscale release, edit the `HEADSCALE_VERSION` ARG in the `Dockerfile` (it appears in stage 1 and the final stage so the OCI label `org.bigscale.engine.version` matches what's actually in the binary), then rebuild. Bump deliberately — upstream may introduce breaking config or API changes between minor versions.

### Multi-arch builds

The published images at `talesam/bigscale` and `ghcr.io/talesam/bigscale` are multi-arch (`linux/amd64` + `linux/arm64`), built by the GitHub Actions workflow at `.github/workflows/docker-publish.yml` on every push to `master` and on `v*.*.*` tags.

To produce a multi-arch build locally:

```bash
docker buildx create --name bigscale-builder --use --bootstrap
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t bigscale:latest \
  --build-arg VERSION=$(jq -r .version package.json) \
  .
```

(The default `docker` driver can only target the host arch; `buildx` with the `docker-container` driver is required for multi-arch.)

## Development

```bash
npm install
npm run dev   # panel on http://localhost:8080
```

For local development, bring up only the container (engine on 18080 via `docker-compose.override.yml`) and export the env:

```bash
docker compose up -d
export BIGSCALE_SERVER_URL=http://localhost:18080
# The key was generated inside the container; copy it out for local dev:
docker exec bigscale cat /data/api-key
export BIGSCALE_API_KEY=<copied-key>
```

## Tech stack

- **Frontend** — [SvelteKit](https://kit.svelte.dev/), [TypeScript](https://www.typescriptlang.org/), [TailwindCSS](https://tailwindcss.com/), [DaisyUI](https://daisyui.com/), [Vite](https://vitejs.dev/)
- **Backend (panel)** — [Node.js](https://nodejs.org/) (SvelteKit Node adapter)
- **VPN engine** — [Headscale](https://github.com/juanfont/headscale)
- **Container runtime** — [Docker](https://www.docker.com/) + Docker Compose v2

## License

[MIT](LICENSE) © BigScale contributors
