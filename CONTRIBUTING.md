# Contributing

## Setup

```bash
npm install
npm run check
npm run build
npm test
```

## Workflow

1. Add/modify command behavior in `src/cli.ts`.
2. Keep API logic in `src/mangadex.ts`.
3. Keep terminal output shaping in `src/format.ts`.
4. Update docs/examples in `README.md` and `SKILL.md`.

## Pull request checklist

- [ ] `npm run check` passes
- [ ] `npm run build` passes
- [ ] `npm test` passes
- [ ] README examples reflect current CLI
- [ ] No secrets committed
