import { getChatGPTUser } from "@/app/chatgpt-auth";
import {
  isAllowedProxyRoute,
  JSON_RESPONSE_TIMEOUT_MS,
  MAX_JSON_RESPONSE_BYTES,
  MAX_REQUEST_BODY_BYTES,
  MAX_SSE_RESPONSE_BYTES,
  PROXY_METHODS,
  readProxyConfig,
  SSE_RESPONSE_TIMEOUT_MS,
  UPSTREAM_CONNECT_TIMEOUT_MS,
  type ProxyConfig,
} from "@/lib/proxy-config";
import { createLimitedResponseStream } from "@/lib/relay-stream";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PROXY_ROUTE = "/api/proxy";
const LOCAL_METHODS = [...PROXY_METHODS, "OPTIONS"] as const;
const MAX_PATH_BYTES = 2_048;
const MAX_QUERY_BYTES = 4_096;
const ALLOWED_REQUEST_HEADERS = new Set([
  "accept",
  "content-type",
  "idempotency-key",
  "last-event-id",
  "x-proxy-token",
]);
const EXPOSED_RESPONSE_HEADERS = [
  "openai-request-id",
  "retry-after",
  "x-ratelimit-limit-requests",
  "x-ratelimit-limit-tokens",
  "x-ratelimit-remaining-requests",
  "x-ratelimit-remaining-tokens",
  "x-ratelimit-reset-requests",
  "x-ratelimit-reset-tokens",
  "x-relay-request-id",
];
const COPIED_RESPONSE_HEADERS = [
  "content-language",
  "openai-request-id",
  "retry-after",
  "x-ratelimit-limit-requests",
  "x-ratelimit-limit-tokens",
  "x-ratelimit-remaining-requests",
  "x-ratelimit-remaining-tokens",
  "x-ratelimit-reset-requests",
  "x-ratelimit-reset-tokens",
];
const NO_BODY_STATUSES = new Set([204, 205, 304]);

type CorsDecision = {
  allowed: boolean;
  origin: string | null;
};

type PreparedBody =
  | { ok: true; body: ArrayBuffer | null; contentType: string | null }
  | { ok: false; response: Response };

async function handleProxyRequest(
  request: Request,
): Promise<Response> {
  const configResult = readProxyConfig();
  if (configResult.state === "setup_required") {
    return errorResponse(
      503,
      "proxy_not_configured",
      "Proxy runtime values are not configured.",
    );
  }
  if (configResult.state === "invalid") {
    return errorResponse(
      503,
      "proxy_invalid_config",
      "Proxy runtime configuration is invalid.",
    );
  }

  const config = configResult.config;
  const requestUrl = new URL(request.url);
  if (config.upstreamOrigin === requestUrl.origin) {
    return errorResponse(
      503,
      "proxy_invalid_config",
      "The upstream cannot be the proxy itself.",
    );
  }

  const cors = evaluateCors(request, config);
  if (!cors.allowed) {
    return errorResponse(
      403,
      "origin_not_allowed",
      "The request origin is not allowed.",
    );
  }

  if (!(PROXY_METHODS as readonly string[]).includes(request.method)) {
    return withCors(
      errorResponse(
        405,
        "method_not_allowed",
        "This HTTP method is not supported.",
        { Allow: LOCAL_METHODS.join(", ") },
      ),
      cors,
    );
  }

  const authorizationResponse = await authorizeProxyRequest(request, config);
  if (authorizationResponse) {
    return withCors(authorizationResponse, cors);
  }

  const pathResult = validateProxyPath(requestUrl, request.method, config);
  if (!pathResult.ok) {
    return withCors(pathResult.response, cors);
  }

  const preparedBody = await prepareRequestBody(request);
  if (!preparedBody.ok) {
    return withCors(preparedBody.response, cors);
  }

  const requestId = crypto.randomUUID();
  const upstreamHeadersResult = buildUpstreamHeaders(
    request,
    config,
    requestId,
    preparedBody.contentType,
  );
  if (!upstreamHeadersResult.ok) {
    return withCors(upstreamHeadersResult.response, cors);
  }

  const upstreamUrl = `${config.upstreamOrigin}${pathResult.rawPath}${requestUrl.search}`;
  const abortController = new AbortController();
  let connectTimedOut = false;
  if (request.signal.aborted) {
    abortController.abort();
  } else {
    request.signal.addEventListener(
      "abort",
      () => abortController.abort(),
      { once: true },
    );
  }
  const connectTimer = setTimeout(() => {
    connectTimedOut = true;
    abortController.abort();
  }, UPSTREAM_CONNECT_TIMEOUT_MS);

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(upstreamUrl, {
      body:
        request.method === "POST" && preparedBody.body
          ? preparedBody.body
          : undefined,
      cache: "no-store",
      headers: upstreamHeadersResult.headers,
      method: request.method,
      redirect: "manual",
      signal: abortController.signal,
    });
  } catch {
    clearTimeout(connectTimer);
    return withCors(
      errorResponse(
        connectTimedOut ? 504 : 502,
        connectTimedOut ? "upstream_timeout" : "upstream_unavailable",
        connectTimedOut
          ? "The upstream did not respond before the connection timeout."
          : "The upstream request could not be completed.",
      ),
      cors,
    );
  }
  clearTimeout(connectTimer);

  if (upstreamResponse.status >= 300 && upstreamResponse.status < 400) {
    await upstreamResponse.body?.cancel();
    return withCors(
      errorResponse(
        502,
        "upstream_redirect_blocked",
        "Upstream redirects are not allowed.",
      ),
      cors,
    );
  }

  const hasNoBody =
    request.method === "HEAD" || NO_BODY_STATUSES.has(upstreamResponse.status);
  const contentType = upstreamResponse.headers.get("content-type");
  const contentEncoding = upstreamResponse.headers.get("content-encoding");

  if (!hasNoBody && !isAllowedResponseContentType(contentType)) {
    await upstreamResponse.body?.cancel();
    return withCors(
      errorResponse(
        502,
        "unsupported_upstream_content_type",
        "The upstream returned a response type that this proxy does not serve.",
      ),
      cors,
    );
  }
  if (
    contentEncoding &&
    contentEncoding.toLowerCase() !== "identity"
  ) {
    await upstreamResponse.body?.cancel();
    return withCors(
      errorResponse(
        502,
        "unsupported_upstream_encoding",
        "The upstream returned an unsupported content encoding.",
      ),
      cors,
    );
  }

  const isEventStream = isEventStreamContentType(contentType);
  const responseByteLimit = isEventStream
    ? MAX_SSE_RESPONSE_BYTES
    : MAX_JSON_RESPONSE_BYTES;
  const responseTimeoutMs = isEventStream
    ? SSE_RESPONSE_TIMEOUT_MS
    : JSON_RESPONSE_TIMEOUT_MS;
  const contentLength = upstreamResponse.headers.get("content-length");
  if (!hasNoBody && contentLength) {
    const declaredLength = Number(contentLength);
    if (
      !Number.isSafeInteger(declaredLength) ||
      declaredLength < 0 ||
      declaredLength > responseByteLimit
    ) {
      await upstreamResponse.body?.cancel();
      return withCors(
        errorResponse(
          502,
          "upstream_response_too_large",
          "The upstream response exceeds the configured relay limit.",
        ),
        cors,
      );
    }
  }

  const responseHeaders = buildResponseHeaders(
    upstreamResponse,
    cors,
    requestId,
  );
  if (hasNoBody) {
    await upstreamResponse.body?.cancel();
  }
  const responseBody =
    hasNoBody || !upstreamResponse.body
      ? null
      : createLimitedResponseStream(
          upstreamResponse.body,
          responseByteLimit,
          responseTimeoutMs,
          abortController,
        );

  return new Response(responseBody, {
    headers: responseHeaders,
    status: upstreamResponse.status,
  });
}

async function authorizeProxyRequest(
  request: Request,
  config: ProxyConfig,
): Promise<Response | null> {
  if (config.authMode === "token") {
    if (
      !(await constantTimeEqual(
        request.headers.get("x-proxy-token") ?? "",
        config.accessToken ?? "",
      ))
    ) {
      return errorResponse(
        401,
        "proxy_unauthorized",
        "A valid proxy access token is required.",
      );
    }
    return null;
  }

  const user = await getChatGPTUser();
  if (!user) {
    return errorResponse(
      401,
      "proxy_authentication_required",
      "Sign in with ChatGPT to access this proxy.",
    );
  }

  const email = user.email.trim().toLowerCase();
  if (!config.allowedUserEmails.includes(email)) {
    return errorResponse(
      403,
      "proxy_user_not_allowed",
      "This ChatGPT user is not allowed to access this proxy.",
    );
  }

  return null;
}

async function handleOptions(request: Request): Promise<Response> {
  const configResult = readProxyConfig();
  if (configResult.state !== "ready") {
    return errorResponse(
      503,
      configResult.state === "invalid"
        ? "proxy_invalid_config"
        : "proxy_not_configured",
      configResult.state === "invalid"
        ? "Proxy runtime configuration is invalid."
        : "Proxy runtime values are not configured.",
    );
  }

  const cors = evaluateCors(request, configResult.config);
  if (!cors.allowed) {
    return errorResponse(
      403,
      "origin_not_allowed",
      "The request origin is not allowed.",
    );
  }

  const requestedMethod = request.headers
    .get("access-control-request-method")
    ?.toUpperCase();
  if (
    requestedMethod &&
    !(PROXY_METHODS as readonly string[]).includes(requestedMethod)
  ) {
    return withCors(
      errorResponse(
        405,
        "method_not_allowed",
        "This HTTP method is not supported.",
        { Allow: LOCAL_METHODS.join(", ") },
      ),
      cors,
    );
  }

  const requestedHeaders = (
    request.headers.get("access-control-request-headers") ?? ""
  )
    .split(",")
    .map((header) => header.trim().toLowerCase())
    .filter(Boolean);
  if (requestedHeaders.some((header) => !ALLOWED_REQUEST_HEADERS.has(header))) {
    return withCors(
      errorResponse(
        400,
        "header_not_allowed",
        "The preflight requested an unsupported header.",
      ),
      cors,
    );
  }

  const headers = securityHeaders();
  headers.set("Access-Control-Allow-Methods", LOCAL_METHODS.join(", "));
  headers.set(
    "Access-Control-Allow-Headers",
    [...ALLOWED_REQUEST_HEADERS].join(", "),
  );
  headers.set("Access-Control-Max-Age", "600");
  applyCorsHeaders(headers, cors, true);

  return new Response(null, { status: 204, headers });
}

function validateProxyPath(
  url: URL,
  method: string,
  config: ProxyConfig,
):
  | { ok: true; decodedPath: string; rawPath: string }
  | { ok: false; response: Response } {
  if (
    url.pathname !== PROXY_ROUTE &&
    !url.pathname.startsWith(`${PROXY_ROUTE}/`)
  ) {
    return {
      ok: false,
      response: errorResponse(
        400,
        "invalid_proxy_path",
        "The proxy path is invalid.",
      ),
    };
  }

  const rawPath = url.pathname.slice(PROXY_ROUTE.length) || "/";
  if (
    rawPath.length > MAX_PATH_BYTES ||
    url.search.length > MAX_QUERY_BYTES ||
    rawPath.includes("\\") ||
    rawPath.includes("//") ||
    /%(?:25|2f|5c|00)/i.test(rawPath)
  ) {
    return {
      ok: false,
      response: errorResponse(
        400,
        "invalid_proxy_path",
        "The proxy path is invalid.",
      ),
    };
  }

  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(rawPath);
  } catch {
    return {
      ok: false,
      response: errorResponse(
        400,
        "invalid_proxy_path",
        "The proxy path contains invalid encoding.",
      ),
    };
  }

  const segments = decodedPath.split("/").slice(1);
  if (
    decodedPath.includes("\0") ||
    decodedPath.includes("\\") ||
    segments.some(
      (segment) =>
        segment === "." || segment === ".." || segment.length > 255,
    )
  ) {
    return {
      ok: false,
      response: errorResponse(
        400,
        "invalid_proxy_path",
        "The proxy path is invalid.",
      ),
    };
  }

  if (!isAllowedProxyRoute(method, decodedPath, config.allowedRoutes)) {
    return {
      ok: false,
      response: errorResponse(
        403,
        "route_not_allowed",
        "The requested method and path are outside the configured policy.",
      ),
    };
  }

  if (
    [...url.searchParams.keys()].some(
      (key) => !config.allowedQueryKeys.includes(key),
    )
  ) {
    return {
      ok: false,
      response: errorResponse(
        403,
        "query_not_allowed",
        "The request contains a query parameter outside the configured policy.",
      ),
    };
  }

  return { ok: true, decodedPath, rawPath };
}

async function prepareRequestBody(request: Request): Promise<PreparedBody> {
  if (request.method !== "POST") {
    return { ok: true, body: null, contentType: null };
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const parsed = Number(contentLength);
    if (
      !Number.isSafeInteger(parsed) ||
      parsed < 0 ||
      parsed > MAX_REQUEST_BODY_BYTES
    ) {
      return {
        ok: false,
        response: errorResponse(
          413,
          "payload_too_large",
          "The request body exceeds the 1 MiB limit.",
        ),
      };
    }
  }

  const contentEncoding = request.headers.get("content-encoding");
  if (contentEncoding && contentEncoding.toLowerCase() !== "identity") {
    return {
      ok: false,
      response: errorResponse(
        415,
        "unsupported_request_encoding",
        "Compressed request bodies are not supported.",
      ),
    };
  }

  const contentType = request.headers.get("content-type");
  if (
    !isJsonContentType(contentType) ||
    !boundedHeader(contentType, 256)
  ) {
    return {
      ok: false,
      response: errorResponse(
        415,
        "unsupported_request_content_type",
        "POST requests must use application/json.",
      ),
    };
  }

  const bodyResult = await readBodyWithLimit(
    request.body,
    MAX_REQUEST_BODY_BYTES,
  );
  if (!bodyResult.ok) {
    const tooLarge = bodyResult.reason === "too_large";
    return {
      ok: false,
      response: errorResponse(
        tooLarge ? 413 : 400,
        tooLarge ? "payload_too_large" : "invalid_request_body",
        tooLarge
          ? "The request body exceeds the 1 MiB limit."
          : "The request body could not be read.",
      ),
    };
  }
  const body = bodyResult.body;
  if (body.byteLength === 0) {
    return {
      ok: false,
      response: errorResponse(
        400,
        "empty_request_body",
        "POST requests must contain a JSON body.",
      ),
    };
  }

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(body);
    JSON.parse(text);
  } catch {
    return {
      ok: false,
      response: errorResponse(
        400,
        "invalid_json",
        "The request body is not valid UTF-8 JSON.",
      ),
    };
  }

  return { ok: true, body, contentType };
}

function buildUpstreamHeaders(
  request: Request,
  config: ProxyConfig,
  requestId: string,
  contentType: string | null,
):
  | { ok: true; headers: Headers }
  | { ok: false; response: Response } {
  const accept = request.headers.get("accept");
  const safeAccept = accept ? boundedHeader(accept, 512) : "application/json";
  if (!safeAccept) {
    return {
      ok: false,
      response: errorResponse(
        400,
        "invalid_header",
        "Accept is too long.",
      ),
    };
  }

  const headers = new Headers({
    Accept: safeAccept,
    "Accept-Encoding": "identity",
    "User-Agent": "SitesRelay/0.1",
    "X-Request-ID": requestId,
  });

  if (contentType) headers.set("Content-Type", contentType);
  if (config.upstreamAuthorization) {
    headers.set("Authorization", config.upstreamAuthorization);
  }

  const lastEventId = request.headers.get("last-event-id");
  if (lastEventId) {
    const value = boundedHeader(lastEventId, 512);
    if (!value) {
      return {
        ok: false,
        response: errorResponse(
          400,
          "invalid_header",
          "Last-Event-ID is too long.",
        ),
      };
    }
    headers.set("Last-Event-ID", value);
  }

  const idempotencyKey = request.headers.get("idempotency-key");
  if (idempotencyKey) {
    if (
      idempotencyKey.length > 128 ||
      !/^[A-Za-z0-9._:-]+$/.test(idempotencyKey)
    ) {
      return {
        ok: false,
        response: errorResponse(
          400,
          "invalid_header",
          "Idempotency-Key is invalid.",
        ),
      };
    }
    headers.set("Idempotency-Key", idempotencyKey);
  }

  return { ok: true, headers };
}

function buildResponseHeaders(
  upstreamResponse: Response,
  cors: CorsDecision,
  requestId: string,
): Headers {
  const headers = securityHeaders();
  for (const name of COPIED_RESPONSE_HEADERS) {
    const value = boundedHeader(upstreamResponse.headers.get(name), 1_024);
    if (value) headers.set(name, value);
  }

  const contentType = upstreamResponse.headers.get("content-type");
  const safeContentType = boundedHeader(contentType, 256);
  if (safeContentType) headers.set("Content-Type", safeContentType);
  headers.set("X-Relay-Request-ID", requestId);
  applyCorsHeaders(headers, cors);
  if (cors.origin) {
    headers.set(
      "Access-Control-Expose-Headers",
      EXPOSED_RESPONSE_HEADERS.join(", "),
    );
  }
  return headers;
}

function evaluateCors(request: Request, config: ProxyConfig): CorsDecision {
  const rawOrigin = request.headers.get("origin");
  if (!rawOrigin) return { allowed: true, origin: null };

  let origin: string;
  try {
    const parsed = new URL(rawOrigin);
    origin = parsed.origin;
    if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
      return { allowed: false, origin: null };
    }
  } catch {
    return { allowed: false, origin: null };
  }

  const requestOrigin = new URL(request.url).origin;
  return {
    allowed:
      origin === requestOrigin || config.allowedOrigins.includes(origin),
    origin,
  };
}

function withCors(response: Response, cors: CorsDecision): Response {
  if (!cors.origin || !cors.allowed) return response;
  const headers = new Headers(response.headers);
  applyCorsHeaders(headers, cors);
  return new Response(response.body, {
    headers,
    status: response.status,
  });
}

function applyCorsHeaders(
  headers: Headers,
  cors: CorsDecision,
  preflight = false,
): void {
  if (!cors.origin || !cors.allowed) return;
  headers.set("Access-Control-Allow-Origin", cors.origin);
  headers.set(
    "Vary",
    preflight
      ? "Origin, Access-Control-Request-Method, Access-Control-Request-Headers"
      : "Origin",
  );
}

function errorResponse(
  status: number,
  error: string,
  message: string,
  extraHeaders?: HeadersInit,
): Response {
  const headers = securityHeaders();
  headers.set("Content-Type", "application/json; charset=utf-8");
  if (extraHeaders) {
    new Headers(extraHeaders).forEach((value, key) => headers.set(key, value));
  }
  return Response.json(
    { error, message },
    {
      status,
      headers,
    },
  );
}

function securityHeaders(): Headers {
  return new Headers({
    "Cache-Control": "private, no-store, no-transform",
    "Content-Security-Policy":
      "default-src 'none'; frame-ancestors 'none'; sandbox",
    Pragma: "no-cache",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  });
}

function isJsonContentType(value: string | null): boolean {
  if (!value) return false;
  const mediaType = value.split(";", 1)[0].trim().toLowerCase();
  return mediaType === "application/json" || mediaType.endsWith("+json");
}

function isAllowedResponseContentType(value: string | null): boolean {
  if (!value) return false;
  const mediaType = value.split(";", 1)[0].trim().toLowerCase();
  return (
    mediaType === "application/json" ||
    mediaType.endsWith("+json") ||
    mediaType === "text/event-stream"
  );
}

function isEventStreamContentType(value: string | null): boolean {
  if (!value) return false;
  return value.split(";", 1)[0].trim().toLowerCase() === "text/event-stream";
}

function boundedHeader(value: string | null, maxLength: number): string | null {
  if (!value || value.length > maxLength) return null;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code > 0x7e) return null;
  }
  return value;
}

async function readBodyWithLimit(
  stream: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<
  | { ok: true; body: ArrayBuffer }
  | { ok: false; reason: "read_error" | "too_large" }
> {
  if (!stream) {
    return { ok: true, body: new ArrayBuffer(0) };
  }

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel("Request body exceeds the configured limit.");
        return { ok: false, reason: "too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: "read_error" };
  } finally {
    reader.releaseLock();
  }

  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, body: combined.buffer };
}

async function constantTimeEqual(
  provided: string,
  expected: string,
): Promise<boolean> {
  const encoder = new TextEncoder();
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const left = new Uint8Array(providedHash);
  const right = new Uint8Array(expectedHash);
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

export {
  handleProxyRequest as GET,
  handleProxyRequest as HEAD,
  handleProxyRequest as POST,
  handleOptions as OPTIONS,
};
