# mangadex-cli

Practical MangaDex CLI for daily use, with public read commands plus auth-aware workflows (follow feed, reading-status-aware recommendations).

## Features

- Discovery/search
  - manga search
  - author search
  - group search
  - show works by author/group
- Manga/chapter info
  - manga details (synopsis, tags, status, links)
  - chapter lists + latest chapters by manga
  - chapter metadata output
- Follow feed/updates
  - check followed manga updates in time windows (`24h`, `7d`, etc.)
- Recommendations
  - tag-based + optional followed-feed inferred tags
  - optional exclusion of reading/read/followed entries where API allows
  - transparent heuristic output
- Auth-aware
  - no-auth public reads
  - token-based auth + OAuth code exchange/refresh helpers
  - local token storage guidance
- Output/runtime
  - human-readable output + `--json`
  - retry/backoff for transient API failures

## Install

**For users:** Install via ClawHub (recommended) or npm.

```bash
# ClawHub (OpenClaw agent integration)
clawhub install mangadex-cli

# NPM (global CLI)
npm install -g @mtsku/mangadex-cli
```

See [SKILL.md](./SKILL.md) for agent tool usage details.

**For development / local testing:** Build from source.

```bash
git clone <your-repo>
cd mangadex-cli
npm install
npm run build
```

## Auth setup

### Fast path: personal client login (recommended)

Per MangaDex docs, personal clients use OAuth password flow.

```bash
mangadexctl auth set-client <client_id> <client_secret>
mangadexctl auth login <username> <password>
mangadexctl whoami
```

Alternative env vars:

```bash
export MANGADEX_TOKEN="..."
export MANGADEX_CLIENT_ID="..."
export MANGADEX_CLIENT_SECRET="..."
```

### OAuth authorization-code exchange (advanced / public-client style)

Use this only if you explicitly have an authorization code flow set up.

```bash
mangadexctl auth set-client <client_id> <client_secret>
mangadexctl auth exchange --code <code> --redirect-uri <redirect_uri> [--code-verifier <pkce_verifier>]
mangadexctl auth refresh
```

## Core examples

### Discovery/search

```bash
mangadexctl search manga "blue lock" -n 5
mangadexctl search author "Inoue Takehiko" -n 5
mangadexctl search group "asura" -n 5
mangadexctl works author "Inoue Takehiko" -n 15
mangadexctl works group "asura" -n 20
```

### Manga/chapter info

```bash
mangadexctl manga details <manga_uuid>
mangadexctl manga chapters <manga_uuid> --lang en -n 30
mangadexctl manga latest <manga_uuid> --lang en -n 10
mangadexctl chapter meta <chapter_uuid>
```

### Follow feed updates

```bash
mangadexctl feed updates --window 24h --lang en -n 30
mangadexctl feed updates --window 7d -n 100
```

### Recommendations

```bash
mangadexctl recommend suggest --tags "action,psychological" -n 10
mangadexctl recommend suggest --from-followed --window 7d --exclude-library -n 10
```

### JSON mode

```bash
mangadexctl --json manga details <manga_uuid>
mangadexctl --json feed updates --window 24h
```

## Config/token storage

Stored config path:

```text
~/.config/mangadex-cli/config.json
```

File permissions are set to `0600`.

Inspect resolution order:

```bash
mangadexctl auth where
```

Resolution precedence:

1. `--token`
2. `MANGADEX_TOKEN` / `MANGADEX_ACCESS_TOKEN`
3. stored config token

## Troubleshooting

- `MangaDex token is required`:
  - use `auth set-token` or set `MANGADEX_TOKEN`
- OAuth exchange/refresh fails:
  - verify app redirect URI, client ID/secret, and PKCE verifier
- empty follow feed:
  - token may be valid but account has no followed updates in selected window/language
- recommendation exclusions partial:
  - exclusion depends on endpoint access/scope; CLI continues with available signals

## Development

```bash
npm run check
npm run build
npm test
```

## License

MIT
