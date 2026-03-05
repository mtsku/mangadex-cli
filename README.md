# mangadex-cli

Direct MangaDex CLI for discovery, manga/chapter lookup, follow-feed checks, and recommendations.

## Features

- Discovery/search
  - Manga, author, and group search
  - Works by author or group
- Manga/chapter info
  - Manga details, chapter lists, latest chapters, chapter metadata
- Feed updates
  - Followed manga updates by time window (`24h`, `7d`, etc.)
- Recommendations
  - Tag-based suggestions
  - Optional followed-feed inferred tags
  - Optional library-aware exclusions where endpoint access allows
- Auth and output
  - Public read commands without auth
  - OAuth/token workflows for account-specific commands
  - Human output and global `--json`

## Install

```bash
npm install -g @mtsku/mangadex-cli
```

For local source install from this repository:

```bash
npm install
npm run build
npm install -g .
```

Repository: <https://github.com/mtsku/mangadex-cli>

## Auth Setup

### Personal client login (recommended)

```bash
mangadexcli auth set-client <client_id> <client_secret>
mangadexcli auth login <username> <password>
mangadexcli whoami
```

Alternative env vars:

```bash
export MANGADEX_TOKEN="..."
export MANGADEX_CLIENT_ID="..."
export MANGADEX_CLIENT_SECRET="..."
```

### OAuth authorization-code exchange

```bash
mangadexcli auth set-client <client_id> <client_secret>
mangadexcli auth exchange --code <code> --redirect-uri <redirect_uri> [--code-verifier <pkce_verifier>]
mangadexcli auth refresh
```

## Core Examples

### Discovery/search

```bash
mangadexcli search manga "blue lock" -n 5
mangadexcli search author "Inoue Takehiko" -n 5
mangadexcli search group "asura" -n 5
mangadexcli works author "Inoue Takehiko" -n 15
mangadexcli works group "asura" -n 20
```

### Manga/chapter info

```bash
mangadexcli manga details <manga_uuid>
mangadexcli manga chapters <manga_uuid> --lang en -n 30
mangadexcli manga latest <manga_uuid> --lang en -n 10
mangadexcli chapter meta <chapter_uuid>
```

### Follow feed updates

```bash
mangadexcli feed updates --window 24h --lang en -n 30
mangadexcli feed updates --window 7d -n 100
```

### Recommendations

```bash
mangadexcli recommend suggest --tags "action,psychological" -n 10
mangadexcli recommend suggest --from-followed --window 7d --exclude-library -n 10
```

### JSON mode

```bash
mangadexcli --json manga details <manga_uuid>
mangadexcli --json feed updates --window 24h
```

## Config and Token Storage

Stored config path:

```text
~/.config/mangadex-cli/config.json
```

File permissions are set to `0600`.

Inspect auth/token resolution:

```bash
mangadexcli auth where
```

Resolution precedence:

1. `--token`
2. `MANGADEX_TOKEN` / `MANGADEX_ACCESS_TOKEN`
3. Stored config token

## Troubleshooting

- `MangaDex token is required`:
  - Set `MANGADEX_TOKEN` or run `mangadexcli auth set-token <token>`
- OAuth exchange/refresh fails:
  - Verify redirect URI, client ID/secret, and PKCE verifier
- Empty follow feed:
  - The account may not have followed updates in that window/language
- Recommendation exclusions partial:
  - Exclusion coverage depends on endpoint access/scope

## Development

```bash
npm run check
npm run build
npm test
```

## License

MIT
