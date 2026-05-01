# BigScale

Servidor de coordenação VPN mesh (compatível com Tailscale) + painel de administração web.

BigScale é um coordenador VPN auto-hospedado, baseado no motor open-source [Headscale](https://github.com/juanfont/headscale), embalado como `bigscale` e acompanhado de um painel web moderno para gerenciar usuários, dispositivos e chaves de autenticação.

Use junto com o cliente desktop **[BigLace](https://github.com/BigCommunity/biglace)** para conectar máquinas Linux à sua rede.

---

## Recursos

- **Coordenador VPN** auto-hospedado — você controla seus dados, sem dependência da Tailscale Inc.
- **Painel web** moderno (SvelteKit + DaisyUI), tema claro/escuro, responsivo.
- **Idiomas**: Inglês, Português (Brasil), Espanhol.
- **Login com usuário e senha** — primeiro acesso força troca da senha default.
- **Gestão completa**: usuários, dispositivos, preauth keys, API keys.
- **Zero-config**: 1 comando e o stack roda — chave de API e senha são geradas/trocadas pelo painel.

---

## Instalação rápida

### Pré-requisitos
- Docker + Docker Compose v2
- (Em produção) domínio público com HTTPS via reverse proxy (Caddy, Nginx, Traefik…)

### Passos

```bash
git clone https://github.com/talesam/bigscale.git
cd bigscale
docker compose up -d
```

Pronto. Acesse o painel e faça login com **admin** / **bigscale** — o painel força você a trocar a senha imediatamente. A `BIGSCALE_API_KEY` é gerada automaticamente pelo serviço `bigscale-init` na primeira execução e ficou guardada num volume Docker.

Em desenvolvimento local, o painel sobe na **3000** e o servidor na **18080** (via `docker-compose.override.yml`). Em produção, configure seu reverse proxy:

```caddyfile
seu-dominio.com {
    reverse_proxy bigscale-panel:3000
}
```

O endpoint público do **servidor** (porta `8080` interna) deve apontar pro `bigscale-server:8080` para que os clientes Tailscale/BigLace consigam conectar — geralmente em um subdomínio separado, ex: `vpn.seu-dominio.com → bigscale-server:8080`.

---

## Variáveis de ambiente (todas opcionais)

| Variável | Descrição | Padrão |
|---|---|---|
| `ADMIN_USERNAME` | Usuário inicial do painel | `admin` |
| `ADMIN_PASSWORD` | Senha inicial do painel | `bigscale` |

`ADMIN_USERNAME` / `ADMIN_PASSWORD` são apenas seeds — uma vez que o admin troca a senha pelo painel, o valor armazenado no volume `bigscale-panel-data` é o que vale.

A chave da API do servidor (`BIGSCALE_API_KEY_FILE`) é gerada automaticamente. A `BIGSCALE_SERVER_URL` é fixada internamente em `http://bigscale-server:8080` via `docker-compose.yml`.

---

## Uso

1. Acesse o painel pelo seu domínio.
2. Login: `admin` / `bigscale` (você será forçado a trocar imediatamente).
3. Em **Usuários**, crie um usuário e gere uma **chave de autenticação (preauth key)**.
4. Compartilhe a URL pública do servidor + a authkey com o usuário final.
5. O usuário cola URL + authkey no app **BigLace** (ou roda `tailscale up --login-server=<URL> --authkey=<KEY>`).

---

## Arquitetura

```
┌─────────────────────────────────────────┐
│  Cliente (BigLace ou tailscale CLI)     │
└─────────────────┬───────────────────────┘
                  │ WireGuard via protocolo Headscale
                  ▼
┌─────────────────────────────────────────┐
│        bigscale-server (motor VPN)      │  ← coordenação P2P
└─────────────────────────────────────────┘
                  ▲
                  │ HTTP API (interno)
┌─────────────────┴───────────────────────┐
│   bigscale-panel (SvelteKit + Node)     │  ← admin web
│  • Sessão server-side (cookie httpOnly) │
│  • Senha do admin em /data/admin.json   │
│  • Proxy /api/bs/v1 → bigscale-server   │
└─────────────────────────────────────────┘

bigscale-init (one-shot, encerra após rodar):
  espera o server, executa `bigscale apikeys create`
  e escreve a chave em volume compartilhado.
```

A chave da API do servidor **nunca** é enviada ao navegador. Todas as chamadas do painel passam pelo proxy `/api/bs/v1/*`, que valida a sessão e adiciona o header `Authorization` server-side. A chave fica em volume Docker `bigscale-shared`, montado read-only pelo painel.

---

## Build da imagem

A imagem do painel é gerada via `docker compose build`. Para incluir metadados de versão (commit, data) nos LABELs OCI das imagens, use o script:

```bash
./scripts/build.sh
```

O script lê a versão de `package.json`, a data atual, e o hash curto do commit, e os injeta como `BIGSCALE_VERSION`, `BUILD_DATE` e `VCS_REF` no build de **ambas** as imagens (`bigscale/server:VERSION` e `bigscale/panel:VERSION`). Inspecione com:

```bash
docker inspect bigscale/panel:latest --format '{{json .Config.Labels}}' | jq
docker inspect bigscale/server:latest --format '{{json .Config.Labels}}' | jq
```

Essas variáveis **não vão para o `.env`** — são exclusivas do build e ficam embutidas nas imagens.

---

## Desenvolvimento

```bash
npm install
npm run dev   # painel em http://localhost:8080
```

Para dev local, suba só o servidor (que ficará na 18080 via `docker-compose.override.yml`) e exporte:

```bash
docker compose up -d bigscale-server bigscale-init
export BIGSCALE_SERVER_URL=http://localhost:18080
# A chave foi gerada pelo bigscale-init e está no volume bigscale-shared.
# Para usar em dev local fora do docker, copie:
docker run --rm -v bigscale_bigscale-shared:/s alpine cat /s/api-key
export BIGSCALE_API_KEY=<chave-copiada>
```

---

## Licença

MIT
