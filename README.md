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
- **Modern web panel** (SvelteKit + DaisyUI) with light/dark themes, fully responsive.
- **i18n**: English, Portuguese (Brazil), Spanish.
- **Username/password login** — first login forces the default password to be changed.
- **Full management**: users, devices, preauth keys, API keys, routes, tags.
- **Visual ACL editor** with a fallback advanced JSON (HuJSON) mode.
- **Server health badge** in the sidebar with live polling.
- **Zero-config**: one command brings the stack up — API key and admin password are generated/rotated by the panel itself.

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

That's it. Open the panel and sign in with **admin** / **bigscale** — you will be required to change the password immediately. The `BIGSCALE_API_KEY` is generated automatically by the `bigscale-init` service on first boot and stored in a Docker volume.

In local development, the panel listens on **3000** and the server on **18080** (via `docker-compose.override.yml`). In production, point your reverse proxy at the panel:

```caddyfile
your-domain.com {
    reverse_proxy bigscale-panel:3000
}
```

The public **server** endpoint (internal port `8080`) must reach `bigscale-server:8080` so that Tailscale/BigLace clients can connect — typically on a separate subdomain, e.g. `vpn.your-domain.com → bigscale-server:8080`.

## Environment variables (all optional)

| Variable | Description | Default |
|---|---|---|
| `ADMIN_USERNAME` | Initial panel username | `admin` |
| `ADMIN_PASSWORD` | Initial panel password | `bigscale` |

`ADMIN_USERNAME` / `ADMIN_PASSWORD` are seeds only — once the admin changes the password from the panel, the value persisted in the `bigscale-panel-data` volume is what counts.

The server API key (`BIGSCALE_API_KEY_FILE`) is generated automatically. `BIGSCALE_SERVER_URL` is hard-coded internally to `http://bigscale-server:8080` via `docker-compose.yml`.

## Usage

1. Open the panel on your domain.
2. Sign in with `admin` / `bigscale` (you will be forced to change the password immediately).
3. In **Users**, create a user and generate an **authentication key (preauth key)**.
4. Share the public server URL and the auth key with the end user.
5. The user pastes the URL + auth key into the **BigLace** app (or runs `tailscale up --login-server=<URL> --authkey=<KEY>`).

## Architecture

```
┌─────────────────────────────────────────┐
│  Client (BigLace or tailscale CLI)      │
└─────────────────┬───────────────────────┘
                  │ WireGuard via Headscale protocol
                  ▼
┌─────────────────────────────────────────┐
│        bigscale-server (VPN engine)     │  ← P2P coordination
└─────────────────────────────────────────┘
                  ▲
                  │ HTTP API (internal)
┌─────────────────┴───────────────────────┐
│   bigscale-panel (SvelteKit + Node)     │  ← admin web
│  • Server-side session (httpOnly cookie)│
│  • Admin password in /data/admin.json   │
│  • Proxy /api/bs/v1 → bigscale-server   │
└─────────────────────────────────────────┘

bigscale-init (one-shot, exits after running):
  waits for the server, runs `bigscale apikeys create`,
  writes the key to a shared volume.
```

The server API key **never** reaches the browser. All panel calls go through the `/api/bs/v1/*` proxy, which validates the session and adds the `Authorization` header server-side. The key lives in the Docker volume `bigscale-shared`, mounted read-only by the panel.

## Building images

The panel image is produced by `docker compose build`. To embed version metadata (commit, date) in OCI image labels, use the helper script:

```bash
./scripts/build.sh
```

The script reads the version from `package.json`, the current date, and the short commit hash, and injects them as `BIGSCALE_VERSION`, `BUILD_DATE` and `VCS_REF` into the build of **both** images (`bigscale/server:VERSION` and `bigscale/panel:VERSION`). Inspect with:

```bash
docker inspect bigscale/panel:latest --format '{{json .Config.Labels}}' | jq
docker inspect bigscale/server:latest --format '{{json .Config.Labels}}' | jq
```

These variables **do not go into `.env`** — they are build-only and are baked into the images.

## Development

```bash
npm install
npm run dev   # panel on http://localhost:8080
```

For local development, bring up only the server (which listens on 18080 via `docker-compose.override.yml`) and export the env:

```bash
docker compose up -d bigscale-server bigscale-init
export BIGSCALE_SERVER_URL=http://localhost:18080
# The key was generated by bigscale-init and lives in the bigscale-shared volume.
# To use it from local dev outside Docker, copy it out:
docker run --rm -v bigscale_bigscale-shared:/s alpine cat /s/api-key
export BIGSCALE_API_KEY=<copied-key>
```

## Tech stack

- **Frontend** — [SvelteKit](https://kit.svelte.dev/), [TypeScript](https://www.typescriptlang.org/), [TailwindCSS](https://tailwindcss.com/), [DaisyUI](https://daisyui.com/), [Vite](https://vitejs.dev/)
- **Backend (panel)** — [Node.js](https://nodejs.org/) (SvelteKit Node adapter)
- **VPN engine** — [Headscale](https://github.com/juanfont/headscale)
- **Container runtime** — [Docker](https://www.docker.com/) + Docker Compose v2

## License

[MIT](LICENSE) © BigScale contributors
