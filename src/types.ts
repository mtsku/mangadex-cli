export type TokenSource = "flag" | "env" | "config" | "none";

export interface ConfigFile {
  accessToken?: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
  updatedAt?: string;
}

export interface CliContext {
  json: boolean;
  tokenFlag?: string;
  dryRun: boolean;
}

export type EntityType = "manga" | "author" | "group";

export interface RequestMeta {
  rateLimit?: number;
  rateRemaining?: number;
  retryAfter?: number;
}
