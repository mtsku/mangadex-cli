#!/usr/bin/env node

import { Command } from "commander";
import { ZodError, z } from "zod";

import {
  clearCredentials,
  clearTokens,
  getConfigPath,
  getCredentialFromConfigOrEnv,
  loadConfig,
  requireAccessToken,
  resolveAccessToken,
  saveConfig,
  saveCredentials,
} from "./config.js";
import { ApiError, AuthError, CliError, ValidationError } from "./errors.js";
import {
  printAuthorSearch,
  printChapterDetails,
  printChapterList,
  printFeed,
  printGroupSearch,
  printJson,
  printMangaDetails,
  printMangaSearch,
  printRecommendations,
  printWorksByAuthor,
  printWorksByGroup,
  type RecommendationMeta,
} from "./format.js";
import {
  bestLocalizedText,
  getChapter,
  getChaptersByManga,
  getFeedUpdates,
  getFollowedManga,
  getManga,
  getMangaByAuthor,
  getMangaByGroup,
  getMangaReadingStatuses,
  getMe,
  listMangaTags,
  oauthPasswordLogin,
  oauthRefresh,
  oauthTokenExchange,
  recommendManga,
  resolveEntityId,
  searchAuthor,
  searchGroup,
  searchManga,
  type MangaAttributes,
  type MdEntity,
} from "./mangadex.js";
import type { CliContext } from "./types.js";

const intSchema = z.coerce.number().int().min(1);

const program = new Command();

program
  .name("mangadexcli")
  .description("Production-ready MangaDex CLI (direct API)")
  .option("--json", "Output raw JSON")
  .option("--dry-run", "Preview auth mutation output without writing")
  .option("--token <token>", "Use access token directly (highest precedence)")
  .showSuggestionAfterError();

const auth = program.command("auth").description("Manage MangaDex auth tokens and OAuth data");

auth
  .command("set-token")
  .description("Save access token in ~/.config/mangadex-cli/config.json")
  .argument("<token>", "MangaDex access token")
  .option("--refresh-token <refreshToken>", "Optional refresh token")
  .action((token: string, options: { refreshToken?: string }, command: Command) => {
    const ctx = getContext(command);
    const parsed = z.string().min(20).parse(token.trim());
    const current = loadConfig();
    const next = {
      ...current,
      accessToken: parsed,
      refreshToken: options.refreshToken?.trim() || current.refreshToken,
    };
    if (!ctx.dryRun) {
      saveConfig(next);
    }
    output(ctx, {
      ok: true,
      dryRun: ctx.dryRun,
      source: "config",
      configPath: getConfigPath(),
      refreshStored: Boolean(next.refreshToken),
    });
  });

auth
  .command("clear-token")
  .description("Remove stored access/refresh tokens")
  .action((_options: Record<string, unknown>, command: Command) => {
    const ctx = getContext(command);
    if (!ctx.dryRun) {
      clearTokens();
    }
    output(ctx, { ok: true, dryRun: ctx.dryRun, configPath: getConfigPath() });
  });

auth
  .command("where")
  .description("Show token and credential source resolution")
  .action((_options: Record<string, unknown>, command: Command) => {
    const ctx = getContext(command);
    const token = resolveAccessToken(ctx.tokenFlag);
    const creds = getCredentialFromConfigOrEnv();
    output(ctx, {
      tokenSource: token.source,
      tokenPresent: Boolean(token.token),
      clientIdPresent: Boolean(creds.clientId),
      clientSecretPresent: Boolean(creds.clientSecret),
      configPath: getConfigPath(),
      envVars: ["MANGADEX_TOKEN", "MANGADEX_ACCESS_TOKEN", "MANGADEX_CLIENT_ID", "MANGADEX_CLIENT_SECRET"],
    });
  });

auth
  .command("set-client")
  .description("Save OAuth client credentials")
  .argument("<clientId>", "OAuth client ID")
  .argument("<clientSecret>", "OAuth client secret")
  .action((clientId: string, clientSecret: string, _opts: Record<string, unknown>, command: Command) => {
    const ctx = getContext(command);
    const id = z.string().min(3).parse(clientId.trim());
    const secret = z.string().min(3).parse(clientSecret.trim());
    if (!ctx.dryRun) {
      saveCredentials(id, secret);
    }
    output(ctx, {
      ok: true,
      dryRun: ctx.dryRun,
      configPath: getConfigPath(),
      message: "OAuth client credentials updated.",
    });
  });

auth
  .command("clear-client")
  .description("Remove stored OAuth client credentials")
  .action((_options: Record<string, unknown>, command: Command) => {
    const ctx = getContext(command);
    if (!ctx.dryRun) {
      clearCredentials();
    }
    output(ctx, { ok: true, dryRun: ctx.dryRun, message: "OAuth credentials removed." });
  });

auth
  .command("login")
  .description("Personal client login (OAuth password flow)")
  .argument("<username>", "MangaDex username")
  .argument("<password>", "MangaDex password")
  .option("--client-id <id>", "OAuth client ID (or MANGADEX_CLIENT_ID / config)")
  .option("--client-secret <secret>", "OAuth client secret (or env/config)")
  .action(
    async (
      username: string,
      password: string,
      options: { clientId?: string; clientSecret?: string },
      command: Command,
    ) => {
      const ctx = getContext(command);
      const stored = getCredentialFromConfigOrEnv();
      const clientId = options.clientId?.trim() || stored.clientId;
      const clientSecret = options.clientSecret?.trim() || stored.clientSecret;

      if (!clientId || !clientSecret) {
        throw new ValidationError(
          "clientId/clientSecret are required for personal client login. Use auth set-client or --client-id/--client-secret.",
        );
      }

      const payload = await oauthPasswordLogin({
        clientId,
        clientSecret,
        username: username.trim(),
        password,
      });

      if (!ctx.dryRun) {
        const current = loadConfig();
        saveConfig({
          ...current,
          accessToken: payload.access_token,
          refreshToken: payload.refresh_token,
          clientId,
          clientSecret,
        });
      }

      output(ctx, {
        ok: true,
        dryRun: ctx.dryRun,
        accessTokenStored: !ctx.dryRun,
        refreshTokenStored: Boolean(payload.refresh_token),
        tokenType: payload.token_type,
        expiresIn: payload.expires_in,
      });
    },
  );

auth
  .command("exchange")
  .description("Exchange OAuth authorization code for access token")
  .requiredOption("--code <code>", "Authorization code")
  .requiredOption("--redirect-uri <uri>", "OAuth redirect URI")
  .option("--code-verifier <verifier>", "PKCE code verifier")
  .option("--client-id <id>", "OAuth client ID (or MANGADEX_CLIENT_ID / config)")
  .option("--client-secret <secret>", "OAuth client secret (or env/config)")
  .action(
    async (
      options: {
        code: string;
        redirectUri: string;
        codeVerifier?: string;
        clientId?: string;
        clientSecret?: string;
      },
      command: Command,
    ) => {
      const ctx = getContext(command);
      const stored = getCredentialFromConfigOrEnv();
      const clientId = options.clientId?.trim() || stored.clientId;
      if (!clientId) {
        throw new ValidationError("clientId is required. Use --client-id or auth set-client.");
      }

      const payload = await oauthTokenExchange({
        clientId,
        clientSecret: options.clientSecret?.trim() || stored.clientSecret,
        code: options.code.trim(),
        redirectUri: options.redirectUri.trim(),
        codeVerifier: options.codeVerifier?.trim(),
      });

      if (!ctx.dryRun) {
        const current = loadConfig();
        saveConfig({
          ...current,
          accessToken: payload.access_token,
          refreshToken: payload.refresh_token,
          clientId,
          clientSecret: options.clientSecret?.trim() || stored.clientSecret,
        });
      }

      output(ctx, {
        ok: true,
        dryRun: ctx.dryRun,
        tokenType: payload.token_type,
        expiresIn: payload.expires_in,
        refreshStored: Boolean(payload.refresh_token) && !ctx.dryRun,
        note: "Open browser authorize URL depends on your app settings; this command only handles token exchange.",
      });
    },
  );

auth
  .command("refresh")
  .description("Refresh access token using refresh token")
  .option("--refresh-token <token>", "Refresh token (otherwise config)")
  .option("--client-id <id>", "OAuth client ID (or env/config)")
  .option("--client-secret <secret>", "OAuth client secret (or env/config)")
  .action(
    async (
      options: {
        refreshToken?: string;
        clientId?: string;
        clientSecret?: string;
      },
      command: Command,
    ) => {
      const ctx = getContext(command);
      const current = loadConfig();
      const stored = getCredentialFromConfigOrEnv();
      const refreshToken = options.refreshToken?.trim() || current.refreshToken;
      const clientId = options.clientId?.trim() || stored.clientId;

      if (!refreshToken) {
        throw new ValidationError("Refresh token is required. Set one with auth set-token --refresh-token or --refresh-token.");
      }
      if (!clientId) {
        throw new ValidationError("clientId is required. Use --client-id or auth set-client.");
      }

      const payload = await oauthRefresh({
        clientId,
        clientSecret: options.clientSecret?.trim() || stored.clientSecret,
        refreshToken,
      });

      if (!ctx.dryRun) {
        saveConfig({
          ...current,
          accessToken: payload.access_token,
          refreshToken: payload.refresh_token ?? refreshToken,
          clientId,
          clientSecret: options.clientSecret?.trim() || stored.clientSecret,
        });
      }

      output(ctx, {
        ok: true,
        dryRun: ctx.dryRun,
        expiresIn: payload.expires_in,
        refreshStored: !ctx.dryRun,
      });
    },
  );

program
  .command("whoami")
  .description("Show currently authenticated MangaDex user")
  .action(async (_options: Record<string, unknown>, command: Command) => {
    const ctx = getContext(command);
    const authToken = requireAccessToken(ctx.tokenFlag);
    const me = await getMe(authToken.token);
    output(ctx, me, (value) => {
      const username = typeof value.attributes.username === "string" ? value.attributes.username : "unknown";
      console.log(`${username} (#${value.id})`);
      const roles = Array.isArray(value.attributes.roles) ? value.attributes.roles : [];
      if (roles.length) {
        console.log(`Roles: ${roles.join(", ")}`);
      }
    });
  });

const search = program.command("search").description("Discovery/search workflows");

search
  .command("manga")
  .description("Search manga by title")
  .argument("<query>", "Title search query")
  .option("-n, --limit <number>", "Results count", "10")
  .action(async (query: string, options: { limit?: string }, command: Command) => {
    const ctx = getContext(command);
    const limit = intSchema.max(100).parse(options.limit ?? "10");
    const { data } = await searchManga({ title: query, limit });
    output(ctx, data.data, printMangaSearch);
  });

search
  .command("author")
  .description("Search author")
  .argument("<query>", "Author name")
  .option("-n, --limit <number>", "Results count", "10")
  .action(async (query: string, options: { limit?: string }, command: Command) => {
    const ctx = getContext(command);
    const limit = intSchema.max(100).parse(options.limit ?? "10");
    const { data } = await searchAuthor(query, limit);
    output(ctx, data.data, printAuthorSearch);
  });

search
  .command("group")
  .description("Search scanlation group")
  .argument("<query>", "Group name")
  .option("-n, --limit <number>", "Results count", "10")
  .action(async (query: string, options: { limit?: string }, command: Command) => {
    const ctx = getContext(command);
    const limit = intSchema.max(100).parse(options.limit ?? "10");
    const { data } = await searchGroup(query, limit);
    output(ctx, data.data, printGroupSearch);
  });

const works = program.command("works").description("Show works by author/group");

works
  .command("author")
  .description("Show manga by author (name or UUID)")
  .argument("<author>", "Author UUID or search text")
  .option("-n, --limit <number>", "Results count", "20")
  .action(async (author: string, options: { limit?: string }, command: Command) => {
    const ctx = getContext(command);
    const limit = intSchema.max(100).parse(options.limit ?? "20");
    const authorId = await resolveEntityId("author", author);
    const { data } = await getMangaByAuthor(authorId, limit);

    output(
      ctx,
      { authorId, manga: data.data },
      (payload) => printWorksByAuthor(payload.authorId, payload.manga),
    );
  });

works
  .command("group")
  .description("Show recent releases by group (name or UUID)")
  .argument("<group>", "Group UUID or search text")
  .option("-n, --limit <number>", "Results count", "20")
  .action(async (group: string, options: { limit?: string }, command: Command) => {
    const ctx = getContext(command);
    const limit = intSchema.max(100).parse(options.limit ?? "20");
    const groupId = await resolveEntityId("group", group);
    const { data } = await getMangaByGroup(groupId, limit);

    output(
      ctx,
      { groupId, releases: data.data },
      (payload) => printWorksByGroup(payload.groupId, payload.releases),
    );
  });

const manga = program.command("manga").description("Manga details and chapter workflows");

manga
  .command("details")
  .description("Show manga details")
  .argument("<mangaId>", "Manga UUID")
  .action(async (mangaId: string, _options: Record<string, unknown>, command: Command) => {
    const ctx = getContext(command);
    const { data } = await getManga(mangaId);
    output(ctx, data.data, printMangaDetails);
  });

manga
  .command("chapters")
  .description("List chapters for a manga")
  .argument("<mangaId>", "Manga UUID")
  .option("-n, --limit <number>", "Results count", "20")
  .option("--lang <codes>", "Comma-separated language codes, e.g. en,ja")
  .option("--asc", "Sort oldest first")
  .action(
    async (
      mangaId: string,
      options: {
        limit?: string;
        lang?: string;
        asc?: boolean;
      },
      command: Command,
    ) => {
      const ctx = getContext(command);
      const limit = intSchema.max(500).parse(options.limit ?? "20");
      const langs = splitCsv(options.lang);
      const { data } = await getChaptersByManga({
        mangaId,
        limit,
        translatedLanguage: langs,
        order: options.asc ? "asc" : "desc",
      });
      output(ctx, data.data, printChapterList);
    },
  );

manga
  .command("latest")
  .description("Show latest chapters for a manga")
  .argument("<mangaId>", "Manga UUID")
  .option("-n, --limit <number>", "Latest result count", "10")
  .option("--lang <codes>", "Comma-separated language codes, e.g. en")
  .action(async (mangaId: string, options: { limit?: string; lang?: string }, command: Command) => {
    const ctx = getContext(command);
    const limit = intSchema.max(100).parse(options.limit ?? "10");
    const langs = splitCsv(options.lang);
    const { data } = await getChaptersByManga({
      mangaId,
      limit,
      translatedLanguage: langs,
      order: "desc",
    });
    output(ctx, data.data, printChapterList);
  });

const chapter = program.command("chapter").description("Chapter metadata commands");

chapter
  .command("meta")
  .description("Show chapter metadata")
  .argument("<chapterId>", "Chapter UUID")
  .action(async (chapterId: string, _options: Record<string, unknown>, command: Command) => {
    const ctx = getContext(command);
    const { data } = await getChapter(chapterId);
    output(ctx, data.data, printChapterDetails);
  });

const feed = program.command("feed").description("Follow-feed updates (auth required)");

feed
  .command("updates")
  .description("Check if followed manga got new chapters recently")
  .option("--window <window>", "Time window: 24h | 7d | 48h ...", "24h")
  .option("-n, --limit <number>", "Result count", "30")
  .option("--lang <codes>", "Comma-separated language codes, e.g. en")
  .action(
    async (
      options: {
        window?: string;
        limit?: string;
        lang?: string;
      },
      command: Command,
    ) => {
      const ctx = getContext(command);
      const token = requireAccessToken(ctx.tokenFlag);
      const windowHours = parseWindowHours(options.window ?? "24h");
      const sinceIso = toMangaDexDateTime(new Date(Date.now() - windowHours * 3600 * 1000));
      const limit = intSchema.max(500).parse(options.limit ?? "30");
      const langs = splitCsv(options.lang);

      const { data } = await getFeedUpdates({
        token: token.token,
        limit,
        sinceIso,
        translatedLanguage: langs,
      });

      output(
        ctx,
        {
          window: options.window ?? "24h",
          sinceIso,
          total: data.total,
          chapters: data.data,
        },
        (payload) => printFeed(payload.chapters, windowHours),
      );
    },
  );

const recommend = program.command("recommend").description("Recommendation helper with transparent heuristic");

recommend
  .command("suggest")
  .description("Suggest manga based on tag interests and optional auth library exclusions")
  .option("--tags <tags>", "Comma-separated tags (names or UUIDs)")
  .option("--from-followed", "Infer top tags from followed manga (auth required)")
  .option("--exclude-library", "Exclude reading/read/followed entries where API allows (auth required)")
  .option("--window <window>", "When using --from-followed, inspect feed window (e.g. 7d)", "7d")
  .option("-n, --limit <number>", "Final recommendation count", "10")
  .action(
    async (
      options: {
        tags?: string;
        fromFollowed?: boolean;
        excludeLibrary?: boolean;
        window?: string;
        limit?: string;
      },
      command: Command,
    ) => {
      const ctx = getContext(command);
      const limit = intSchema.max(50).parse(options.limit ?? "10");
      const providedTags = splitCsv(options.tags);

      const includeTagIds = await resolveTagIds(providedTags);
      const inferredTagIds = options.fromFollowed ? await inferTagIdsFromFollowed(ctx, options.window ?? "7d") : [];
      const mergedTagIds = Array.from(new Set([...includeTagIds, ...inferredTagIds]));

      const raw = await recommendManga({
        includeTagIds: mergedTagIds.length ? mergedTagIds : undefined,
        limit: Math.max(30, limit * 3),
      });

      const excludeIds = options.excludeLibrary ? await getExcludedLibraryIds(ctx) : new Set<string>();
      const filtered = raw.data.data.filter((manga) => !excludeIds.has(manga.id)).slice(0, limit);

      const tagNames = await toTagLabels(mergedTagIds);
      const metadata: RecommendationMeta = {
        heuristic:
          "Rank by MangaDex followedCount/rating. Blend explicit tags + optional followed-feed inferred tags. Then filter library IDs from reading status/follows.",
        excludedCount: excludeIds.size,
        inputTags: tagNames,
        usedFallback: mergedTagIds.length === 0,
      };

      output(
        ctx,
        {
          metadata,
          recommendations: filtered,
          note: "Recommendations are heuristic (popularity + tag filters), not personalized ML.",
        },
        (payload) => printRecommendations(payload.recommendations, payload.metadata),
      );
    },
  );

program.parseAsync(process.argv).catch((error: unknown) => {
  if (error instanceof ZodError) {
    console.error(`Validation error: ${error.message}`);
    process.exitCode = 2;
    return;
  }

  if (error instanceof ValidationError || error instanceof AuthError || error instanceof ApiError || error instanceof CliError) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }

  console.error(error instanceof Error ? error.message : "Unexpected error");
  process.exitCode = 1;
});

function getContext(command: Command): CliContext {
  const root = command.optsWithGlobals<{
    json?: boolean;
    token?: string;
    dryRun?: boolean;
  }>();
  return {
    json: Boolean(root.json),
    tokenFlag: root.token?.trim() || undefined,
    dryRun: Boolean(root.dryRun),
  };
}

function output<T>(ctx: CliContext, payload: T, writer?: (value: T) => void) {
  if (ctx.json) {
    printJson(payload);
    return;
  }
  if (writer) {
    writer(payload);
    return;
  }
  if (typeof payload === "string") {
    console.log(payload);
    return;
  }
  printJson(payload);
}

function splitCsv(value?: string): string[] | undefined {
  if (!value?.trim()) return undefined;
  const entries = value
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  return entries.length ? entries : undefined;
}

function parseWindowHours(value: string): number {
  const input = value.trim().toLowerCase();
  const parsed = input.match(/^(\d+)\s*([hd])$/);
  if (!parsed) {
    throw new ValidationError("Invalid --window. Use forms like 24h, 48h, 7d.");
  }

  const amountText = parsed[1];
  const unit = parsed[2];
  if (!amountText || !unit) {
    throw new ValidationError("Invalid --window. Use forms like 24h, 48h, 7d.");
  }
  const amount = Number.parseInt(amountText, 10);
  const hours = unit === "d" ? amount * 24 : amount;
  if (hours <= 0 || hours > 24 * 120) {
    throw new ValidationError("--window out of supported range (1h to 120d).");
  }
  return hours;
}

function toMangaDexDateTime(date: Date): string {
  // MangaDex expects YYYY-MM-DDTHH:mm:ss (no timezone suffix)
  return date.toISOString().slice(0, 19);
}

async function resolveTagIds(tags?: string[]) {
  if (!tags?.length) return [];
  const explicitIds = tags.filter((tag) => /^[0-9a-f-]{36}$/i.test(tag));
  const names = tags.filter((tag) => !/^[0-9a-f-]{36}$/i.test(tag)).map((t) => t.toLowerCase());
  if (!names.length) return explicitIds;

  const all = await listMangaTags();
  const nameToId = new Map<string, string>();
  for (const tag of all.data.data) {
    const name = bestLocalizedText(tag.attributes.name);
    if (name) {
      nameToId.set(name.toLowerCase(), tag.id);
    }
  }

  const resolved = names.flatMap((name) => (nameToId.has(name) ? [nameToId.get(name) as string] : []));
  return Array.from(new Set([...explicitIds, ...resolved]));
}

async function toTagLabels(tagIds: string[]) {
  if (!tagIds.length) return [];
  const all = await listMangaTags();
  const idToName = new Map(all.data.data.map((tag) => [tag.id, bestLocalizedText(tag.attributes.name) ?? tag.id]));
  return tagIds.map((id) => idToName.get(id) ?? id);
}

async function inferTagIdsFromFollowed(ctx: CliContext, window: string): Promise<string[]> {
  const token = requireAccessToken(ctx.tokenFlag);
  const hours = parseWindowHours(window);
  const sinceIso = toMangaDexDateTime(new Date(Date.now() - hours * 3600 * 1000));

  const feed = await getFeedUpdates({ token: token.token, limit: 100, sinceIso });
  const mangaRelIds = Array.from(
    new Set(
      feed.data.data
        .flatMap((chapter) => chapter.relationships ?? [])
        .filter((rel) => rel.type === "manga")
        .map((rel) => rel.id),
    ),
  ).slice(0, 20);

  if (!mangaRelIds.length) {
    return [];
  }

  const tagCounter = new Map<string, number>();

  for (const mangaId of mangaRelIds) {
    try {
      const details = await getManga(mangaId);
      const tags = details.data.data.attributes.tags ?? [];
      for (const tag of tags) {
        tagCounter.set(tag.id, (tagCounter.get(tag.id) ?? 0) + 1);
      }
    } catch {
      continue;
    }
  }

  return Array.from(tagCounter.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id]) => id);
}

async function getExcludedLibraryIds(ctx: CliContext): Promise<Set<string>> {
  const token = requireAccessToken(ctx.tokenFlag);
  const excluded = new Set<string>();

  try {
    const statuses = await getMangaReadingStatuses(token.token);
    const entries = Object.entries(statuses.data.statuses ?? {});
    for (const [mangaId, status] of entries) {
      if (["reading", "completed", "on_hold", "plan_to_read", "dropped", "re_reading"].includes(status)) {
        excluded.add(mangaId);
      }
    }
  } catch {
    // Endpoint availability differs by auth scope; continue with partial exclusion.
  }

  try {
    const followed = await getFollowedManga(token.token, 100);
    for (const manga of followed.data.data) {
      excluded.add(manga.id);
    }
  } catch {
    // Continue with statuses only.
  }

  return excluded;
}
