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

BigScale is a self-hosted VPN coordinator built on top of the open-source [Headscale](https://github.com/juanfont/headscale) engine, packaged as `bigscale` and shipped together with a modern web panel for managing users, devices and authentication keys.

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

### Steps

```bash
git clone https://github.com/talesam/bigscale.git
cd bigscale
docker compose up -d
```

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

If you only have one subdomain available, route the engine paths to `bigscale:8080` and everything else to the panel `bigscale:3000`. The Tailscale/Headscale protocol uses **exactly four** paths — no others need to be exposed:

| Path | Target |
|---|---|
| `/key` | `bigscale:8080` |
| `/machine/` | `bigscale:8080` |
| `/ts2021` | `bigscale:8080` |
| `/derp/` | `bigscale:8080` |
| _everything else_ | `bigscale:3000` |

Caddy example:

```caddyfile
vpn.your-domain.com {
    @engine path /key /machine/* /ts2021 /derp/*
    reverse_proxy @engine bigscale:8080
    reverse_proxy bigscale:3000
}
```

Nginx Proxy Manager: set the proxy host's default forward to `bigscale:3000` and add four custom locations for the paths above pointing to `bigscale:8080`. Enable **Websockets Support** so the `/ts2021` and `/derp/` upgrades work, and **HTTP/2**.

> **Do not expose `/api/v1/`, `/health`, `/version` or `/swagger` publicly.** They are administrative endpoints; the panel already talks to the engine over `localhost` inside the container.

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

`docker compose build` produces the image. To embed version metadata (commit, date) in OCI image labels, use the helper script:

```bash
./scripts/build.sh
```

The script reads the version from `package.json`, the current date, and the short commit hash, and injects them as `BIGSCALE_VERSION`, `BUILD_DATE` and `VCS_REF`. Inspect with:

```bash
docker inspect bigscale:latest --format '{{json .Config.Labels}}' | jq
```

These variables **do not go into `.env`** — they are build-only and are baked into the image.

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
