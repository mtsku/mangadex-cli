import { ApiError } from "./errors.js";
import type { RequestMeta } from "./types.js";

const API_BASE = "https://api.mangadex.org";
const AUTH_BASE = "https://auth.mangadex.org/realms/mangadex/protocol/openid-connect";
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

interface MdRelationship {
  id: string;
  type: string;
  attributes?: Record<string, unknown>;
}

export interface MdEntity<TAttributes = Record<string, unknown>> {
  id: string;
  type: string;
  attributes: TAttributes;
  relationships?: MdRelationship[];
}

interface MdListResponse<TAttributes> {
  result: string;
  response: string;
  data: Array<MdEntity<TAttributes>>;
  limit: number;
  offset: number;
  total: number;
}

interface MdSingleResponse<TAttributes> {
  result: string;
  response: string;
  data: MdEntity<TAttributes>;
}

export interface MdRequestOptions {
  token?: string;
  retries?: number;
  timeoutMs?: number;
}

export interface OAuthTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_expires_in?: number;
  refresh_token?: string;
  token_type: string;
  scope?: string;
}

export interface MangaAttributes {
  title?: Record<string, string>;
  altTitles?: Array<Record<string, string>>;
  description?: Record<string, string>;
  status?: string;
  year?: number;
  tags?: Array<MdEntity<{ name?: Record<string, string> }>>;
  links?: Record<string, string>;
  availableTranslatedLanguages?: string[];
  lastChapter?: string;
  contentRating?: string;
  publicationDemographic?: string;
  state?: string;
  chapterNumbersResetOnNewVolume?: boolean;
  latestUploadedChapter?: string;
  originalLanguage?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PersonAttributes {
  name?: string;
  biography?: Array<Record<string, string>>;
  imageUrl?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface GroupAttributes {
  name?: string;
  website?: string;
  ircServer?: string;
  ircChannel?: string;
  discord?: string;
  contactEmail?: string;
  description?: string;
  twitter?: string;
  mangaUpdates?: string;
  focusedLanguages?: string[];
  official?: boolean;
  verified?: boolean;
  inactive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ChapterAttributes {
  title?: string;
  volume?: string;
  chapter?: string;
  pages?: number;
  translatedLanguage?: string;
  externalUrl?: string;
  publishAt?: string;
  readableAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function toInt(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoff(attempt: number, retryAfter?: number) {
  if (retryAfter && retryAfter > 0) {
    return retryAfter * 1000;
  }
  return Math.min(10_000, 400 * 2 ** attempt + Math.floor(Math.random() * 150));
}

function buildUrl(path: string, query: Record<string, unknown> = {}) {
  const url = new URL(path, API_BASE);

  for (const [key, raw] of Object.entries(query)) {
    if (raw === undefined || raw === null || raw === "") {
      continue;
    }
    if (Array.isArray(raw)) {
      const arrayKey = key.endsWith("[]") ? key : `${key}[]`;
      for (const value of raw) {
        if (value !== undefined && value !== null && value !== "") {
          url.searchParams.append(arrayKey, String(value));
        }
      }
      continue;
    }
    url.searchParams.set(key, String(raw));
  }

  return url.toString();
}

async function mdRequest<T>(
  method: "GET" | "POST",
  path: string,
  {
    token,
    body,
    query,
    retries = 2,
    timeoutMs = 20_000,
  }: {
    token?: string;
    body?: unknown;
    query?: Record<string, unknown>;
    retries?: number;
    timeoutMs?: number;
  } = {},
): Promise<{ data: T; meta: RequestMeta }> {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(buildUrl(path, query), {
        method,
        headers: {
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const meta: RequestMeta = {
        rateLimit: toInt(response.headers.get("x-ratelimit-limit")),
        rateRemaining: toInt(response.headers.get("x-ratelimit-remaining")),
        retryAfter: toInt(response.headers.get("retry-after")),
      };

      const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

      if (!response.ok && RETRYABLE_STATUS.has(response.status) && attempt < retries) {
        await sleep(backoff(attempt, meta.retryAfter));
        continue;
      }

      if (!response.ok) {
        const message =
          typeof payload.message === "string"
            ? payload.message
            : typeof payload.error === "string"
              ? payload.error
              : `MangaDex API request failed (${response.status}).`;
        throw new ApiError(message, response.status, payload);
      }

      return {
        data: payload as T,
        meta,
      };
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      if (attempt < retries) {
        await sleep(backoff(attempt));
        continue;
      }
      throw new ApiError(
        error instanceof Error ? `Network error: ${error.message}` : "Network error calling MangaDex API.",
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new ApiError("MangaDex request failed after retries.");
}

export async function oauthTokenExchange(params: {
  clientId: string;
  clientSecret?: string;
  code: string;
  redirectUri: string;
  codeVerifier?: string;
}) {
  const body = new URLSearchParams();
  body.set("grant_type", "authorization_code");
  body.set("client_id", params.clientId);
  if (params.clientSecret) body.set("client_secret", params.clientSecret);
  body.set("code", params.code);
  body.set("redirect_uri", params.redirectUri);
  if (params.codeVerifier) body.set("code_verifier", params.codeVerifier);

  const response = await fetch(`${AUTH_BASE}/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });

  const payload = (await response.json()) as OAuthTokenResponse & Record<string, unknown>;
  if (!response.ok || !payload.access_token) {
    throw new ApiError("OAuth token exchange failed.", response.status, payload);
  }

  return payload;
}

export async function oauthRefresh(params: { clientId: string; clientSecret?: string; refreshToken: string }) {
  const body = new URLSearchParams();
  body.set("grant_type", "refresh_token");
  body.set("client_id", params.clientId);
  if (params.clientSecret) body.set("client_secret", params.clientSecret);
  body.set("refresh_token", params.refreshToken);

  const response = await fetch(`${AUTH_BASE}/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });

  const payload = (await response.json()) as OAuthTokenResponse & Record<string, unknown>;
  if (!response.ok || !payload.access_token) {
    throw new ApiError("OAuth refresh failed.", response.status, payload);
  }

  return payload;
}

export async function oauthPasswordLogin(params: {
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
}) {
  const body = new URLSearchParams();
  body.set("grant_type", "password");
  body.set("client_id", params.clientId);
  body.set("client_secret", params.clientSecret);
  body.set("username", params.username);
  body.set("password", params.password);

  const response = await fetch(`${AUTH_BASE}/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });

  const payload = (await response.json()) as OAuthTokenResponse & Record<string, unknown>;
  if (!response.ok || !payload.access_token) {
    throw new ApiError("Personal client password login failed.", response.status, payload);
  }

  return payload;
}

export async function loginWithPassword(params: { username: string; password: string }) {
  const { data } = await mdRequest<{ token?: { session?: string; refresh?: string } }>("POST", "/auth/login", {
    body: {
      username: params.username,
      password: params.password,
    },
    retries: 0,
  });

  if (!data.token?.session) {
    throw new ApiError("Login did not return a session token.");
  }

  return {
    accessToken: data.token.session,
    refreshToken: data.token.refresh,
  };
}

export async function getMe(token: string) {
  const { data } = await mdRequest<MdSingleResponse<{ username?: string; roles?: string[] }>>("GET", "/user/me", {
    token,
  });
  return data.data;
}

export async function searchManga(query: { title: string; limit: number; offset?: number; includes?: string[] }) {
  return mdRequest<MdListResponse<MangaAttributes>>("GET", "/manga", {
    query: {
      title: query.title,
      limit: query.limit,
      offset: query.offset ?? 0,
      includes: query.includes ?? ["author", "artist", "cover_art"],
      "order[relevance]": "desc",
    },
  });
}

export async function searchAuthor(name: string, limit: number) {
  return mdRequest<MdListResponse<PersonAttributes>>("GET", "/author", {
    query: {
      name,
      limit,
      "order[name]": "asc",
    },
  });
}

export async function searchGroup(name: string, limit: number) {
  return mdRequest<MdListResponse<GroupAttributes>>("GET", "/group", {
    query: {
      name,
      limit,
      "order[name]": "asc",
    },
  });
}

export async function getManga(mangaId: string) {
  return mdRequest<MdSingleResponse<MangaAttributes>>("GET", `/manga/${mangaId}`, {
    query: {
      includes: ["author", "artist", "cover_art"],
    },
  });
}

export async function getChaptersByManga(query: {
  mangaId: string;
  limit: number;
  offset?: number;
  translatedLanguage?: string[];
  order?: "asc" | "desc";
}) {
  return mdRequest<MdListResponse<ChapterAttributes>>("GET", "/chapter", {
    query: {
      manga: query.mangaId,
      limit: query.limit,
      offset: query.offset ?? 0,
      translatedLanguage: query.translatedLanguage?.length ? query.translatedLanguage : undefined,
      includes: ["scanlation_group", "user", "manga"],
      "order[publishAt]": query.order ?? "desc",
    },
  });
}

export async function getChapter(chapterId: string) {
  return mdRequest<MdSingleResponse<ChapterAttributes>>("GET", `/chapter/${chapterId}`, {
    query: {
      includes: ["scanlation_group", "user", "manga"],
    },
  });
}

export async function getFeedUpdates(query: {
  token: string;
  limit: number;
  offset?: number;
  sinceIso?: string;
  translatedLanguage?: string[];
}) {
  return mdRequest<MdListResponse<ChapterAttributes>>("GET", "/user/follows/manga/feed", {
    token: query.token,
    query: {
      limit: query.limit,
      offset: query.offset ?? 0,
      includes: ["scanlation_group", "manga", "user"],
      translatedLanguage: query.translatedLanguage?.length ? query.translatedLanguage : undefined,
      publishAtSince: query.sinceIso,
      "order[publishAt]": "desc",
    },
  });
}

export async function getMangaReadingStatuses(token: string) {
  return mdRequest<{ statuses?: Record<string, string> }>("GET", "/manga/status", { token });
}

export async function getFollowedManga(token: string, limit = 100, offset = 0) {
  return mdRequest<MdListResponse<MangaAttributes>>("GET", "/user/follows/manga", {
    token,
    query: {
      limit,
      offset,
      includes: ["author", "artist", "cover_art"],
    },
  });
}

export async function getMangaByAuthor(authorId: string, limit: number) {
  return mdRequest<MdListResponse<MangaAttributes>>("GET", "/manga", {
    query: {
      authors: [authorId],
      limit,
      includes: ["author", "artist", "cover_art"],
      "order[followedCount]": "desc",
    },
  });
}

export async function getMangaByGroup(groupId: string, limit: number) {
  return mdRequest<MdListResponse<ChapterAttributes>>("GET", "/chapter", {
    query: {
      groups: [groupId],
      limit,
      includes: ["manga", "scanlation_group"],
      "order[publishAt]": "desc",
    },
  });
}

export async function resolveEntityId(type: "author" | "group", text: string): Promise<string> {
  if (isUuid(text)) {
    return text;
  }

  if (type === "author") {
    const { data } = await searchAuthor(text, 1);
    const first = data.data[0];
    if (!first) throw new ApiError(`No author found for query: ${text}`);
    return first.id;
  }

  const { data } = await searchGroup(text, 1);
  const first = data.data[0];
  if (!first) throw new ApiError(`No group found for query: ${text}`);
  return first.id;
}

export async function recommendManga(options: {
  includeTagIds?: string[];
  yearFrom?: number;
  yearTo?: number;
  limit: number;
  offset?: number;
  contentRating?: string[];
}) {
  return mdRequest<MdListResponse<MangaAttributes>>("GET", "/manga", {
    query: {
      includedTags: options.includeTagIds,
      limit: options.limit,
      offset: options.offset ?? 0,
      includes: ["author", "artist", "cover_art"],
      contentRating: options.contentRating ?? ["safe", "suggestive", "erotica"],
      year: options.yearFrom,
      "order[followedCount]": "desc",
      "order[rating]": "desc",
    },
  });
}

export async function listMangaTags() {
  return mdRequest<{
    result: string;
    data: Array<MdEntity<{ name?: Record<string, string>; group?: string }>>;
  }>("GET", "/manga/tag");
}

export function relationshipByType(entity: { relationships?: MdRelationship[] }, type: string) {
  return entity.relationships?.filter((rel) => rel.type === type) ?? [];
}

export function relationshipOne(entity: { relationships?: MdRelationship[] }, type: string) {
  return relationshipByType(entity, type)[0];
}

export function bestLocalizedText(map?: Record<string, string>, preferred = "en") {
  if (!map) return undefined;
  if (map[preferred]) return map[preferred];
  const first = Object.values(map)[0];
  return first;
}

export function altTitlesToArray(altTitles?: Array<Record<string, string>>) {
  if (!altTitles?.length) return [];
  return altTitles.flatMap((entry) => Object.values(entry)).filter(Boolean);
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}
