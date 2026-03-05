---
name: mangadex-cli
version: 0.1.0
description: Direct MangaDex CLI for search, manga/chapter lookup, follow-feed checks, and recommendations.
allowed-tools: Bash
metadata:
  openclaw:
    install:
      - kind: node
        package: @mtsku/mangadex-cli
        bins: [mangadexctl]
    requires:
      bins: [node]
emoji: 📚
---

# MangaDex CLI

Use this skill when you need practical MangaDex workflows without browser relay dependencies.

## Command map

- Discovery/search:
  - `mangadexctl search manga "<query>"`
  - `mangadexctl search author "<query>"`
  - `mangadexctl search group "<query>"`
  - `mangadexctl works author "<author uuid|name>"`
  - `mangadexctl works group "<group uuid|name>"`
- Manga/chapter info:
  - `mangadexctl manga details <manga_uuid>`
  - `mangadexctl manga chapters <manga_uuid> --lang en -n 30`
  - `mangadexctl manga latest <manga_uuid> --lang en -n 10`
  - `mangadexctl chapter meta <chapter_uuid>`
- Follow feed:
  - `mangadexctl feed updates --window 24h --lang en`
  - `mangadexctl feed updates --window 7d`
- Recommendations:
  - `mangadexctl recommend suggest --tags "action,mystery" -n 10`
  - `mangadexctl recommend suggest --from-followed --exclude-library --window 7d -n 10`

## Auth quick setup

- Personal client login (recommended):
  - `mangadexctl auth set-client <client_id> <client_secret>`
  - `mangadexctl auth login <username> <password>`
- Token-only (if you already have a bearer token):
  - `mangadexctl auth set-token <access_token>`
- OAuth code exchange (advanced/public-client style):
  - `mangadexctl auth exchange --code <code> --redirect-uri <uri> [--code-verifier <verifier>]`
  - `mangadexctl auth refresh`
- Verify auth:
  - `mangadexctl whoami`
  - `mangadexctl auth where`

## Output

- Add `--json` globally for machine-readable output.

## Notes

- Public endpoints work without auth.
- Follow feed and library-aware exclusions require auth.
- Recommendation output includes heuristic transparency and exclusion counts.
