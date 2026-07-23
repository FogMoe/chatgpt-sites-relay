const REQUIRED_ENV = [
  "PROXY_UPSTREAM_ORIGIN",
  "PROXY_ALLOWED_ROUTES",
] as const;

const PRIVATE_HOST_SUFFIXES = [".internal", ".local", ".localhost"];
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,256}$/;
const QUERY_KEY_PATTERN = /^[A-Za-z0-9_.-]{1,128}$/;

export const PROXY_METHODS = ["GET", "HEAD", "POST"] as const;
export const PROXY_AUTH_MODES = ["token", "sites-user"] as const;
export const WEB_RELAY_METHODS = ["GET", "HEAD"] as const;
export const MAX_REQUEST_BODY_BYTES = 1_048_576;
export const MAX_JSON_RESPONSE_BYTES = 8_388_608;
export const MAX_SSE_RESPONSE_BYTES = 67_108_864;
export const MAX_WEB_DOCUMENT_BYTES = 4_194_304;
export const MAX_WEB_ASSET_BYTES = 20_971_520;
export const UPSTREAM_CONNECT_TIMEOUT_MS = 15_000;
export const JSON_RESPONSE_TIMEOUT_MS = 60_000;
export const SSE_RESPONSE_TIMEOUT_MS = 900_000;
export const WEB_RESPONSE_TIMEOUT_MS = 60_000;

export type ProxyMethod = (typeof PROXY_METHODS)[number];
export type ProxyAuthMode = (typeof PROXY_AUTH_MODES)[number];

export type ProxyRouteRule = {
  method: ProxyMethod;
  pathPrefix: string;
};

export type WebRelayConfig = {
  allowedPathPrefixes: readonly string[];
  allowedQueryKeys: readonly string[];
  allowedUserEmails: readonly string[];
  enabled: boolean;
};

export type ProxyConfig = {
  accessToken: string | null;
  allowedOrigins: readonly string[];
  allowedQueryKeys: readonly string[];
  allowedRoutes: readonly ProxyRouteRule[];
  allowedUserEmails: readonly string[];
  authMode: ProxyAuthMode;
  exposeUpstreamHost: boolean;
  upstreamAuthorization: string | null;
  upstreamOrigin: string;
  upstreamHost: string;
  webRelay: WebRelayConfig;
};

export type ProxyConfigResult =
  | {
      state: "ready";
      config: ProxyConfig;
    }
  | {
      state: "setup_required";
      missing: readonly string[];
    }
  | {
      state: "invalid";
      issues: readonly string[];
    };

export type ProxyPublicStatus = {
  accessTokenConfigured: boolean;
  allowedRouteCount: number;
  authMode: ProxyAuthMode | null;
  issues: readonly string[];
  missing: readonly string[];
  proxyUserAllowlistConfigured: boolean;
  state: ProxyConfigResult["state"];
  upstreamConfigured: boolean;
  upstreamHost: string | null;
  webRelayEnabled: boolean;
  webRelayPathCount: number;
  webRelayUserAllowlistConfigured: boolean;
};

export function readProxyConfig(
  runtimeEnv: Record<string, string | undefined> = process.env,
): ProxyConfigResult {
  const requestedAuthMode = parseRequestedAuthMode(
    runtimeEnv.PROXY_AUTH_MODE,
  );
  const missing: string[] = [...REQUIRED_ENV].filter(
    (name) => !clean(runtimeEnv[name]),
  );
  if (
    requestedAuthMode === "token" &&
    !clean(runtimeEnv.PROXY_ACCESS_TOKEN)
  ) {
    missing.push("PROXY_ACCESS_TOKEN");
  }
  if (
    requestedAuthMode === "sites-user" &&
    !clean(runtimeEnv.PROXY_ALLOWED_USER_EMAILS)
  ) {
    missing.push("PROXY_ALLOWED_USER_EMAILS");
  }
  if (missing.length > 0) {
    return {
      state: "setup_required",
      missing,
    };
  }

  const issues: string[] = [];
  const authMode = parseAuthMode(runtimeEnv.PROXY_AUTH_MODE, issues);
  const upstreamOrigin = parseUpstreamOrigin(
    runtimeEnv.PROXY_UPSTREAM_ORIGIN!,
    issues,
  );
  const allowedRoutes = parseAllowedRoutes(
    runtimeEnv.PROXY_ALLOWED_ROUTES!,
    issues,
  );
  const allowedQueryKeys = parseAllowedQueryKeys(
    runtimeEnv.PROXY_ALLOWED_QUERY_KEYS,
    "PROXY_ALLOWED_QUERY_KEYS",
    issues,
  );
  const allowedOrigins = parseAllowedOrigins(
    runtimeEnv.PROXY_ALLOWED_ORIGINS,
    issues,
  );
  const accessToken =
    authMode === "token" ? clean(runtimeEnv.PROXY_ACCESS_TOKEN)! : null;
  const allowedUserEmails =
    authMode === "sites-user"
      ? parseAllowedUserEmails(
          runtimeEnv.PROXY_ALLOWED_USER_EMAILS,
          "PROXY_ALLOWED_USER_EMAILS",
          issues,
        )
      : [];
  const upstreamAuthorization =
    clean(runtimeEnv.PROXY_UPSTREAM_AUTHORIZATION) ?? null;
  const exposeUpstreamHost = parseBoolean(
    runtimeEnv.EXPOSE_UPSTREAM_HOST,
    "EXPOSE_UPSTREAM_HOST",
    false,
    issues,
  );
  const webRelayEnabled = parseBoolean(
    runtimeEnv.WEB_RELAY_ENABLED,
    "WEB_RELAY_ENABLED",
    false,
    issues,
  );
  const webRelayPathPrefixes = webRelayEnabled
    ? parsePathPrefixes(
        runtimeEnv.WEB_RELAY_ALLOWED_PATH_PREFIXES,
        "WEB_RELAY_ALLOWED_PATH_PREFIXES",
        issues,
      )
    : [];
  const webRelayAllowedUserEmails = webRelayEnabled
    ? parseAllowedUserEmails(
        runtimeEnv.WEB_RELAY_ALLOWED_USER_EMAILS,
        "WEB_RELAY_ALLOWED_USER_EMAILS",
        issues,
      )
    : [];
  const webRelayQueryKeys = webRelayEnabled
    ? parseAllowedQueryKeys(
        runtimeEnv.WEB_RELAY_ALLOWED_QUERY_KEYS,
        "WEB_RELAY_ALLOWED_QUERY_KEYS",
        issues,
      )
    : [];

  if (authMode === "token" && !isStrongAccessToken(accessToken ?? "")) {
    issues.push(
      "PROXY_ACCESS_TOKEN must be a random base64url string containing 32 to 256 characters.",
    );
  }
  if (
    upstreamAuthorization &&
    (upstreamAuthorization.length > 4_096 ||
      !isPrintableAscii(upstreamAuthorization))
  ) {
    issues.push(
      "PROXY_UPSTREAM_AUTHORIZATION must contain printable ASCII characters and be no longer than 4096 characters.",
    );
  }

  if (issues.length > 0 || !upstreamOrigin || !authMode) {
    return {
      state: "invalid",
      issues,
    };
  }

  return {
    state: "ready",
    config: {
      accessToken,
      allowedOrigins,
      allowedQueryKeys,
      allowedRoutes,
      allowedUserEmails,
      authMode,
      exposeUpstreamHost,
      upstreamAuthorization,
      upstreamOrigin: upstreamOrigin.origin,
      upstreamHost: upstreamOrigin.host,
      webRelay: {
        allowedPathPrefixes: webRelayPathPrefixes,
        allowedQueryKeys: webRelayQueryKeys,
        allowedUserEmails: webRelayAllowedUserEmails,
        enabled: webRelayEnabled,
      },
    },
  };
}

export function getProxyPublicStatus(
  runtimeEnv: Record<string, string | undefined> = process.env,
): ProxyPublicStatus {
  const result = readProxyConfig(runtimeEnv);
  const requestedAuthMode = parseRequestedAuthMode(
    runtimeEnv.PROXY_AUTH_MODE,
  );

  return {
    accessTokenConfigured: Boolean(clean(runtimeEnv.PROXY_ACCESS_TOKEN)),
    allowedRouteCount:
      result.state === "ready" ? result.config.allowedRoutes.length : 0,
    authMode:
      result.state === "ready"
        ? result.config.authMode
        : requestedAuthMode,
    issues: result.state === "invalid" ? result.issues : [],
    missing: result.state === "setup_required" ? result.missing : [],
    proxyUserAllowlistConfigured: Boolean(
      clean(runtimeEnv.PROXY_ALLOWED_USER_EMAILS),
    ),
    state: result.state,
    upstreamConfigured: Boolean(clean(runtimeEnv.PROXY_UPSTREAM_ORIGIN)),
    upstreamHost:
      result.state === "ready" && result.config.exposeUpstreamHost
        ? result.config.upstreamHost
        : null,
    webRelayEnabled:
      result.state === "ready" && result.config.webRelay.enabled,
    webRelayPathCount:
      result.state === "ready"
        ? result.config.webRelay.allowedPathPrefixes.length
        : 0,
    webRelayUserAllowlistConfigured:
      result.state === "ready" &&
      result.config.webRelay.allowedUserEmails.length > 0,
  };
}

export function isAllowedProxyRoute(
  method: string,
  pathname: string,
  rules: readonly ProxyRouteRule[],
): boolean {
  return rules.some(
    (rule) =>
      rule.method === method &&
      (rule.pathPrefix === "/" ||
        pathname === rule.pathPrefix ||
        pathname.startsWith(`${rule.pathPrefix}/`)),
  );
}

export function isAllowedPathPrefix(
  pathname: string,
  prefixes: readonly string[],
): boolean {
  return prefixes.some(
    (prefix) =>
      prefix === "/" ||
      pathname === prefix ||
      pathname.startsWith(`${prefix}/`),
  );
}

export function hasOnlyAllowedQueryKeys(
  searchParams: URLSearchParams,
  allowedKeys: readonly string[],
): boolean {
  return [...searchParams.keys()].every((key) => allowedKeys.includes(key));
}

function clean(value: string | undefined): string | undefined {
  const cleaned = value?.trim();
  return cleaned ? cleaned : undefined;
}

function parseUpstreamOrigin(
  value: string,
  issues: string[],
): URL | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    issues.push("PROXY_UPSTREAM_ORIGIN must be a valid URL.");
    return null;
  }

  if (url.protocol !== "https:") {
    issues.push("PROXY_UPSTREAM_ORIGIN must use https://.");
  }
  if (url.username || url.password) {
    issues.push("PROXY_UPSTREAM_ORIGIN cannot contain credentials.");
  }
  if (url.port && url.port !== "443") {
    issues.push("PROXY_UPSTREAM_ORIGIN can only use the default HTTPS port.");
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    issues.push(
      "PROXY_UPSTREAM_ORIGIN must be an origin without a path, query, or fragment.",
    );
  }
  if (
    url.hostname.endsWith(".") ||
    looksLikeIpLiteral(url.hostname) ||
    isPrivateHostname(url.hostname)
  ) {
    issues.push(
      "PROXY_UPSTREAM_ORIGIN must use a canonical DNS hostname rather than an IP literal or local hostname.",
    );
  }

  return url;
}

function parseAllowedRoutes(
  value: string,
  issues: string[],
): ProxyRouteRule[] {
  const items = splitCsv(value);
  if (items.length === 0) {
    issues.push("PROXY_ALLOWED_ROUTES must contain at least one route rule.");
    return [];
  }

  const rules: ProxyRouteRule[] = [];
  for (const item of items) {
    const separator = item.indexOf(":");
    const rawMethod = separator > 0 ? item.slice(0, separator) : "";
    const rawPath = separator > 0 ? item.slice(separator + 1) : "";
    const method = rawMethod.toUpperCase();
    const pathPrefix = normalizePathPrefix(rawPath);

    if (
      !(PROXY_METHODS as readonly string[]).includes(method) ||
      rawMethod !== method ||
      !pathPrefix
    ) {
      issues.push(
        "PROXY_ALLOWED_ROUTES contains an invalid METHOD:/path rule.",
      );
      continue;
    }

    const rule = { method: method as ProxyMethod, pathPrefix };
    if (
      !rules.some(
        (candidate) =>
          candidate.method === rule.method &&
          candidate.pathPrefix === rule.pathPrefix,
      )
    ) {
      rules.push(rule);
    }
  }

  return rules;
}

function parsePathPrefixes(
  value: string | undefined,
  variableName: string,
  issues: string[],
): string[] {
  const items = splitCsv(value);
  if (items.length === 0) {
    issues.push(`${variableName} must contain at least one path prefix.`);
    return [];
  }

  const prefixes: string[] = [];
  for (const item of items) {
    const pathPrefix = normalizePathPrefix(item);
    if (!pathPrefix) {
      issues.push(`${variableName} contains an invalid path prefix.`);
      continue;
    }
    if (!prefixes.includes(pathPrefix)) prefixes.push(pathPrefix);
  }
  return prefixes;
}

function normalizePathPrefix(value: string): string | null {
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[%?#\u0000-\u001f]/.test(value)
  ) {
    return null;
  }

  const segments = value.split("/").slice(1);
  if (
    segments.some(
      (segment) =>
        segment === "." || segment === ".." || segment.length > 255,
    )
  ) {
    return null;
  }

  return value.length > 1 && value.endsWith("/")
    ? value.slice(0, -1)
    : value;
}

function parseAllowedQueryKeys(
  value: string | undefined,
  variableName: string,
  issues: string[],
): string[] {
  const keys: string[] = [];
  for (const item of splitCsv(value)) {
    if (!QUERY_KEY_PATTERN.test(item)) {
      issues.push(
        `${variableName} contains an invalid query parameter name.`,
      );
      continue;
    }
    if (!keys.includes(item)) keys.push(item);
  }
  return keys;
}

function parseAllowedUserEmails(
  value: string | undefined,
  variableName: string,
  issues: string[],
): string[] {
  const rawValue = clean(value);
  if (!rawValue) {
    issues.push(
      `${variableName} must contain at least one exact email address.`,
    );
    return [];
  }
  if (rawValue.split(",").some((item) => !item.trim())) {
    issues.push(`${variableName} contains an empty email entry.`);
    return [];
  }

  const items = splitCsv(rawValue);
  const emails: string[] = [];
  for (const item of items) {
    const normalized = item.toLowerCase();
    if (!isExactEmailIdentifier(normalized)) {
      issues.push(`${variableName} contains an invalid email address.`);
      continue;
    }
    if (!emails.includes(normalized)) emails.push(normalized);
  }
  return emails;
}

function parseRequestedAuthMode(
  value: string | undefined,
): ProxyAuthMode | null {
  const normalized = clean(value)?.toLowerCase() ?? "token";
  return (PROXY_AUTH_MODES as readonly string[]).includes(normalized)
    ? (normalized as ProxyAuthMode)
    : null;
}

function parseAuthMode(
  value: string | undefined,
  issues: string[],
): ProxyAuthMode | null {
  const authMode = parseRequestedAuthMode(value);
  if (!authMode) {
    issues.push("PROXY_AUTH_MODE must be token or sites-user.");
  }
  return authMode;
}

function parseBoolean(
  value: string | undefined,
  variableName: string,
  defaultValue: boolean,
  issues: string[],
): boolean {
  const normalized = clean(value)?.toLowerCase();
  if (!normalized) return defaultValue;
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  issues.push(`${variableName} must be true or false.`);
  return defaultValue;
}

function parseAllowedOrigins(
  value: string | undefined,
  issues: string[],
): string[] {
  const origins: string[] = [];
  for (const item of splitCsv(value)) {
    let url: URL;
    try {
      url = new URL(item);
    } catch {
      issues.push("PROXY_ALLOWED_ORIGINS contains an invalid origin.");
      continue;
    }

    const isLocalHttp =
      url.protocol === "http:" && isLoopbackHostname(url.hostname);
    if (
      (url.protocol !== "https:" && !isLocalHttp) ||
      url.hostname.endsWith(".") ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      url.username ||
      url.password
    ) {
      issues.push(
        "PROXY_ALLOWED_ORIGINS must contain exact HTTPS origins; HTTP is only allowed for loopback development origins.",
      );
      continue;
    }

    if (!origins.includes(url.origin)) origins.push(url.origin);
  }

  return origins;
}

function isExactEmailIdentifier(value: string): boolean {
  if (
    value.length > 254 ||
    value.includes("*") ||
    /[\u0000-\u0020\u007f]/.test(value)
  ) {
    return false;
  }

  const separator = value.indexOf("@");
  if (
    separator <= 0 ||
    separator !== value.lastIndexOf("@") ||
    separator > 64 ||
    separator === value.length - 1
  ) {
    return false;
  }

  const localPart = value.slice(0, separator);
  const domain = value.slice(separator + 1);
  const domainLabels = domain.split(".");
  return (
    !localPart.startsWith(".") &&
    !localPart.endsWith(".") &&
    !localPart.includes("..") &&
    !/["(),:;<>[\]\\]/.test(localPart) &&
    domain.length <= 253 &&
    !domain.startsWith(".") &&
    !domain.endsWith(".") &&
    !domain.includes("..") &&
    domainLabels.every((label) =>
      /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label),
    )
  );
}

function splitCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isStrongAccessToken(value: string): boolean {
  if (!TOKEN_PATTERN.test(value)) return false;
  const lowered = value.toLowerCase();
  if (
    lowered.includes("replace") ||
    lowered.includes("placeholder") ||
    lowered.includes("example") ||
    lowered.includes("changeme")
  ) {
    return false;
  }
  return new Set(value).size >= 12;
}

function isPrintableAscii(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code > 0x7e) return false;
  }
  return true;
}

function looksLikeIpLiteral(hostname: string): boolean {
  return (
    hostname.startsWith("[") ||
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)
  );
}

function isPrivateHostname(hostname: string): boolean {
  const lowered = hostname.toLowerCase();
  return (
    lowered === "localhost" ||
    PRIVATE_HOST_SUFFIXES.some((suffix) => lowered.endsWith(suffix))
  );
}

function isLoopbackHostname(hostname: string): boolean {
  const lowered = hostname.toLowerCase();
  return (
    lowered === "localhost" ||
    lowered === "127.0.0.1" ||
    lowered === "[::1]"
  );
}
