import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { AuthError, ValidationError } from "./errors.js";
import type { ConfigFile, TokenSource } from "./types.js";

const CONFIG_DIR = join(homedir(), ".config", "mangadex-cli");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export function getConfigPath() {
  return CONFIG_FILE;
}

export function loadConfig(): ConfigFile {
  if (!existsSync(CONFIG_FILE)) {
    return {};
  }

  try {
    const raw = readFileSync(CONFIG_FILE, "utf8");
    const parsed = JSON.parse(raw) as ConfigFile;
    for (const key of ["accessToken", "refreshToken", "clientId", "clientSecret"] as const) {
      if (parsed[key] !== undefined && typeof parsed[key] !== "string") {
        throw new ValidationError(`Stored ${key} is invalid.`);
      }
    }
    return parsed;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new ValidationError(`Could not read config file: ${CONFIG_FILE}`, error);
  }
}

export function saveConfig(next: ConfigFile) {
  mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  const payload: ConfigFile = {
    ...next,
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(CONFIG_FILE, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  chmodSync(CONFIG_FILE, 0o600);
}

export function clearTokens() {
  const current = loadConfig();
  delete current.accessToken;
  delete current.refreshToken;
  saveConfig(current);
}

export function saveCredentials(clientId: string, clientSecret: string) {
  const current = loadConfig();
  current.clientId = clientId;
  current.clientSecret = clientSecret;
  saveConfig(current);
}

export function clearCredentials() {
  const current = loadConfig();
  delete current.clientId;
  delete current.clientSecret;
  saveConfig(current);
}

export function resolveAccessToken(tokenFlag?: string): { token?: string; source: TokenSource } {
  if (tokenFlag?.trim()) {
    return { token: tokenFlag.trim(), source: "flag" };
  }

  const envToken = process.env.MANGADEX_TOKEN ?? process.env.MANGADEX_ACCESS_TOKEN;
  if (envToken?.trim()) {
    return { token: envToken.trim(), source: "env" };
  }

  const fileToken = loadConfig().accessToken;
  if (fileToken?.trim()) {
    return { token: fileToken.trim(), source: "config" };
  }

  return { token: undefined, source: "none" };
}

export function requireAccessToken(tokenFlag?: string): { token: string; source: Exclude<TokenSource, "none"> } {
  const resolved = resolveAccessToken(tokenFlag);
  if (!resolved.token || resolved.source === "none") {
    throw new AuthError(
      "MangaDex token is required for this command. Set MANGADEX_TOKEN or run: mangadexctl auth set-token <token>",
    );
  }

  return { token: resolved.token, source: resolved.source };
}

export function getCredentialFromConfigOrEnv(): { clientId?: string; clientSecret?: string } {
  const config = loadConfig();
  const clientId = process.env.MANGADEX_CLIENT_ID ?? config.clientId;
  const clientSecret = process.env.MANGADEX_CLIENT_SECRET ?? config.clientSecret;
  return {
    clientId: clientId?.trim() || undefined,
    clientSecret: clientSecret?.trim() || undefined,
  };
}
