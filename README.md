<p align="center">
  <img src="static/icon.svg" width="120" alt="BigScale logo" />
</p>

<h1 align="center">BigScale</h1>

<p align="center">
  <b>Your own private network, on your own server.</b><br/>
  A self-hosted mesh VPN coordinator (Tailscale-compatible) with a friendly web panel —<br/>
  invites, groups, voice rooms and remote desktop through the <a href="https://github.com/big-comm/biglace">BigLace</a> app.
</p>

<p align="center">
  <a href="https://hub.docker.com/r/talesam/bigscale"><img src="https://img.shields.io/docker/v/talesam/bigscale?sort=semver&label=Docker%20Hub&logo=docker&logoColor=white" alt="Docker Hub version" /></a>
  <a href="https://hub.docker.com/r/talesam/bigscale"><img src="https://img.shields.io/docker/pulls/talesam/bigscale?logo=docker&logoColor=white" alt="Docker pulls" /></a>
  <img src="https://img.shields.io/badge/arch-amd64%20%7C%20arm64-informational" alt="amd64 | arm64" />
  <img src="https://img.shields.io/badge/Engine-Headscale-2D3036?style=flat" alt="Powered by Headscale" />
  <img src="https://img.shields.io/badge/License-MIT-22c55e?style=flat" alt="License: MIT" />
</p>

---

BigScale bundles a Tailscale-compatible coordinator — built from the open-source [Headscale](https://github.com/juanfont/headscale) source, pinned per release — with a web panel, in **one Docker image**. Run it on any small VPS (or a Raspberry Pi) and you have a private network for your family, friends, company or community: every device reaches the others directly and encrypted (WireGuard), wherever they are, and **you** decide who gets in.

People join with the desktop app **[BigLace](https://github.com/big-comm/biglace)**: they open an invite link, type their name, and they're in — no accounts to create by hand, no keys to copy. Any Tailscale client also works.

## What you get

**For the person running the server**
- **One container, one command** — coordinator, panel, built-in relay (DERP/STUN) and bootstrap in a single image for `amd64` and `arm64`.
- **Zero configuration files** — on first start the container writes its own config from your domain and prints a random admin password.
- **Web panel** (English, Português, Español; light/dark): users, devices, access rules (visual ACL editor), invites, API keys.
- **Network settings** — choose who may invite new people (any member · any member with your approval · administrators only), whether members see everyone or only their own contacts, and the invite limits.
- **Several administrators** — give trusted people the admin role; they open the panel from BigLace under their own name, without sharing a password.

**For the people on the network** (with BigLace)
- **Invites by link or QR code** — whoever joins reaches only the person who invited them (and, if chosen, one group). Separate circles stay separate: your friend and your sister don't see each other unless you put them in the same group.
- **Groups** — anyone creates a group (family, work, a class) and invites people already on the network; they accept or decline.
- **Voice rooms** — every group has a voice room; the sound goes straight between the participants, never through the server.
- **Remote desktop** — see and control another computer of the network (X11 and Wayland, hardware-accelerated), always with the owner's permission.
- **Device keys** — every BigLace install signs its requests with its own key, so nobody can act on behalf of another device, even from inside the network.

## Quick start (5 minutes)

You need: a Linux server with Docker, a domain name pointing to it (e.g. `vpn.example.com`), and these ports open — **TCP 80 and 443**, **UDP 3478**.

```bash
mkdir bigscale && cd bigscale
curl -fsSLO https://raw.githubusercontent.com/talesam/bigscale/master/examples/caddy/docker-compose.yml
curl -fsSLO https://raw.githubusercontent.com/talesam/bigscale/master/examples/caddy/Caddyfile
echo "BIGSCALE_DOMAIN=vpn.example.com" > .env      # ← your domain

docker compose up -d
docker compose logs bigscale | grep -A6 "First start"   # shows the admin password
```

Open `https://vpn.example.com`, sign in as **admin** with the password from the log, and choose your own password. Caddy takes care of the HTTPS certificate.

Already running a reverse proxy (Nginx Proxy Manager, Traefik, …)? Use [`examples/existing-proxy/docker-compose.yml`](examples/existing-proxy/docker-compose.yml) and see [Reverse proxy](#reverse-proxy) for the routes.

### Bring people in

1. Install [BigLace](https://github.com/big-comm/biglace) on your computer and join with an invite from the panel (**Invites → New invite**). Add yourself to the administrators in **Settings → Administrators** if you like managing from the app.
2. From then on anyone on the network can invite others from BigLace (unless you restrict it in **Settings → Network**): **Invites → Invite someone**, then send the link or QR code.
3. Groups, voice rooms and remote desktop are all in BigLace.

Plain Tailscale clients work too: create a user and an auth key in the panel, then `tailscale up --login-server=https://vpn.example.com --authkey=<key>`.

### Image tags

| Tag | What it is |
|---|---|
| `talesam/bigscale:latest` | Latest release |
| `talesam/bigscale:X.Y.Z` | A specific release (pin this in production if you prefer explicit upgrades) |

Also published at `ghcr.io/talesam/bigscale`. Both are multi-arch (`linux/amd64`, `linux/arm64`).

### Updating and backups

Everything that matters lives in the mounted folders (`./config` and `./data`):

```bash
docker compose stop bigscale
tar czf bigscale-backup-$(date +%F).tgz config data     # backup
docker compose pull && docker compose up -d             # update
```

To move to another server, copy the folder and start it there (keep the same domain).

### Build from source

```bash
git clone https://github.com/talesam/bigscale.git
cd bigscale
BIGSCALE_PUBLIC_URL=http://localhost:18080 docker compose up -d --build
```

The first build compiles the coordinator from the pinned Headscale source. Locally the panel listens on **3000** and the coordinator on **18080** (via `docker-compose.override.yml`).

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

Each proxy host stays trivial: a single forward, zero custom locations. The trade-off is one extra TLS certificate. Set `BIGSCALE_PUBLIC_URL=https://vpn.your-domain.com` and `BIGSCALE_PANEL_URL=https://panel.your-domain.com` so invite links point at the panel.

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

BigScale ships with Headscale's embedded DERP relay enabled by default (`derp.server.enabled: true` in `config.yaml`). The relay listens on **UDP 3478** for STUN. If that port isn't reachable from the internet, clients still connect and see each other in the panel, but direct peer-to-peer traffic silently fails.

### What goes wrong if UDP 3478 is closed

- `tailscale netcheck` reports `UDP: false` and `IPv4: (no addr found)`
- Peers behind NAT cannot discover each other's public address → no direct P2P
- The DERP relay over HTTPS still works as fallback, so traffic flows through the server (slower, uses your bandwidth)
- If the `/derp` exact-match location (above) is missing too, even the relay fallback fails and `tailscale ping` times out

### Fix

1. **Publish UDP 3478** in `docker-compose.yml` (the examples already do):
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

## Panel as a network peer

On first boot the entrypoint registers the panel itself as a node of its own network (system user **`_panel`**, node **`panel`**). BigLace talks to the panel over the encrypted network for everything a member does — invites, groups, voice room presence, signing in to the admin panel — and every such request is **signed with the device's own key** (Ed25519). The panel pins each device's key when the device enrolls, so a request is accepted only from the device it claims to come from; the network address alone is never taken as proof.

`_panel` and the `panel` node are reserved: the panel hides them and refuses to delete them. Don't remove them with the CLI either — that breaks every BigLace feature above until the container restarts.

Container requirements (already in the examples): `cap_add: [NET_ADMIN]`, `devices: [/dev/net/tun]` and the `./data/tailscale` volume. Without `/dev/net/tun` the container falls back to userspace networking (slower, still works).

## Environment variables

| Variable | Description | Default |
|---|---|---|
| `BIGSCALE_PUBLIC_URL` | **Required on first start.** Public address clients use, e.g. `https://vpn.example.com`. Written into the generated `config.yaml` as `server_url` | _(unset)_ |
| `BIGSCALE_BASE_DOMAIN` | MagicDNS domain for device names (first start only) | `bigscale.net` |
| `COOKIE_SECURE` | `true` when the panel is served over HTTPS (it should be) | `false` |
| `ADMIN_USERNAME` | Panel admin user created on first start | `admin` |
| `ADMIN_PASSWORD` | Initial admin password. Unset → a random one is generated, printed in the log and saved to `/data/initial-admin-password` | _(random)_ |
| `BIGSCALE_PANEL_URL` | Public panel address used in invite links, if different from `BIGSCALE_PUBLIC_URL` | `BIGSCALE_PUBLIC_URL` |
| `BIGSCALE_PANEL_HOSTNAME` | Name of the panel's own node on the network | `panel` |
| `BIGSCALE_DISABLE_TAILNET_PEER` | `true` to keep the panel off the network (BigLace invites, groups and rooms then stop working) | `false` |
| `TZ` | Time zone for logs | `UTC` |

The admin user and password are seeds only: once changed in the panel, the value saved in `./data/panel` is what counts. The coordinator API key is generated by the container and stays inside it (`/data/api-key`); it never reaches the browser.

What the panel stores in `./data/panel`: `admin.json`, `invites.json`, `accounts.json`, `member-groups.json`, `group-requests.json`, `network-settings.json`, device keys and metadata. Back it up together with `./data/server` (the coordinator's database and keys).

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
