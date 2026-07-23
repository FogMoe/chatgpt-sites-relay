import {
  chatGPTSignInPath,
  getChatGPTUser,
} from "@/app/chatgpt-auth";
import {
  hasOnlyAllowedQueryKeys,
  isAllowedPathPrefix,
  MAX_WEB_ASSET_BYTES,
  MAX_WEB_DOCUMENT_BYTES,
  readProxyConfig,
  UPSTREAM_CONNECT_TIMEOUT_MS,
  WEB_RELAY_METHODS,
  WEB_RESPONSE_TIMEOUT_MS,
  type ProxyConfig,
} from "@/lib/proxy-config";
import {
  createLimitedResponseStream,
  readLimitedUtf8Body,
} from "@/lib/relay-stream";
import {
  decodeSafePath,
  rewriteMirroredCss,
  rewriteWebMirrorUrl,
  sanitizeMirroredHtml,
} from "@/lib/web-mirror";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const WEB_ROUTE = "/web";
const MAX_QUERY_BYTES = 4_096;
const NO_BODY_STATUSES = new Set([204, 205]);
const IMAGE_MEDIA_TYPES = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/vnd.microsoft.icon",
  "image/webp",
  "image/x-icon",
]);
const FONT_MEDIA_TYPES = new Set([
  "application/font-woff",
  "application/vnd.ms-fontobject",
  "font/woff",
  "font/woff2",
]);

type WebContentKind = "asset" | "css" | "html";

async function handleWebRelay(request: Request): Promise<Response> {
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

  const config = configResult.config;
  if (!config.webRelay.enabled) {
    return errorResponse(
      503,
      "web_relay_disabled",
      "The static web mirror is not enabled.",
    );
  }

  const requestUrl = new URL(request.url);
  if (requestUrl.search.length > MAX_QUERY_BYTES) {
    return errorResponse(
      400,
      "invalid_web_query",
      "The static mirror query is invalid.",
    );
  }

  const authorizationResponse = await authorizeWebRelay(
    request,
    requestUrl,
    config,
  );
  if (authorizationResponse) return authorizationResponse;

  if (config.upstreamOrigin === requestUrl.origin) {
    return errorResponse(
      503,
      "proxy_invalid_config",
      "The upstream cannot be the relay itself.",
    );
  }
  if (request.headers.has("x-sites-relay-hop")) {
    return errorResponse(
      508,
      "relay_loop_detected",
      "The request already passed through a Sites relay.",
    );
  }

  const pathResult = validateWebPath(requestUrl, config);
  if (!pathResult.ok) return pathResult.response;

  const requestId = crypto.randomUUID();
  const upstreamUrl = new URL(
    `${pathResult.rawPath}${pathResult.query}`,
    config.upstreamOrigin,
  );
  const headersResult = buildUpstreamHeaders(request, config, requestId);
  if (!headersResult.ok) return headersResult.response;

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
    upstreamResponse = await fetch(upstreamUrl.href, {
      cache: "no-store",
      headers: headersResult.headers,
      method: request.method,
      redirect: "manual",
      signal: abortController.signal,
    });
  } catch {
    clearTimeout(connectTimer);
    return errorResponse(
      connectTimedOut ? 504 : 502,
      connectTimedOut ? "upstream_timeout" : "upstream_unavailable",
      connectTimedOut
        ? "The upstream did not respond before the connection timeout."
        : "The upstream request could not be completed.",
    );
  }
  clearTimeout(connectTimer);

  if (upstreamResponse.status >= 300 && upstreamResponse.status < 400) {
    const location = upstreamResponse.headers.get("location");
    await upstreamResponse.body?.cancel();
    const rewrittenLocation = location
      ? rewriteWebMirrorUrl(location, upstreamUrl, {
          allowedPathPrefixes: config.webRelay.allowedPathPrefixes,
          allowedQueryKeys: config.webRelay.allowedQueryKeys,
          upstreamOrigin: config.upstreamOrigin,
        })
      : null;
    if (!rewrittenLocation) {
      return errorResponse(
        502,
        "upstream_redirect_blocked",
        "The upstream redirect is outside the static mirror policy.",
      );
    }
    const headers = webSecurityHeaders(requestUrl.origin);
    headers.set("Location", rewrittenLocation);
    headers.set("X-Relay-Request-ID", requestId);
    return new Response(null, {
      headers,
      status: upstreamResponse.status,
    });
  }

  const hasNoBody =
    request.method === "HEAD" ||
    NO_BODY_STATUSES.has(upstreamResponse.status);
  if (hasNoBody && NO_BODY_STATUSES.has(upstreamResponse.status)) {
    await upstreamResponse.body?.cancel();
    return new Response(null, {
      headers: buildResponseHeaders(null, requestId, requestUrl.origin),
      status: upstreamResponse.status,
    });
  }

  const contentEncoding = upstreamResponse.headers.get("content-encoding");
  if (contentEncoding && contentEncoding.toLowerCase() !== "identity") {
    await upstreamResponse.body?.cancel();
    return errorResponse(
      502,
      "unsupported_upstream_encoding",
      "Compressed upstream responses are not supported.",
    );
  }

  const contentType = boundedHeader(
    upstreamResponse.headers.get("content-type"),
    256,
  );
  const contentKind = classifyContentType(contentType);
  if (!contentType || !contentKind || !hasSupportedCharset(contentType)) {
    await upstreamResponse.body?.cancel();
    return errorResponse(
      502,
      "unsupported_upstream_content_type",
      "The upstream returned content outside the static mirror policy.",
    );
  }

  const maxBytes =
    contentKind === "asset"
      ? MAX_WEB_ASSET_BYTES
      : MAX_WEB_DOCUMENT_BYTES;
  const contentLength = upstreamResponse.headers.get("content-length");
  if (contentLength) {
    const declaredLength = Number(contentLength);
    if (
      !Number.isSafeInteger(declaredLength) ||
      declaredLength < 0 ||
      declaredLength > maxBytes
    ) {
      await upstreamResponse.body?.cancel();
      return errorResponse(
        502,
        "upstream_response_too_large",
        "The upstream response exceeds the static mirror limit.",
      );
    }
  }

  if (hasNoBody) {
    await upstreamResponse.body?.cancel();
    return new Response(null, {
      headers: buildResponseHeaders(
        contentType,
        requestId,
        requestUrl.origin,
      ),
      status: upstreamResponse.status,
    });
  }

  if (contentKind === "html" || contentKind === "css") {
    const bodyResult = await readLimitedUtf8Body(
      upstreamResponse.body,
      maxBytes,
      WEB_RESPONSE_TIMEOUT_MS,
      abortController,
    );
    if (!bodyResult.ok) {
      return errorResponse(
        bodyResult.reason === "timeout" ? 504 : 502,
        bodyResult.reason === "too_large"
          ? "upstream_response_too_large"
          : bodyResult.reason === "timeout"
            ? "upstream_response_timeout"
            : "invalid_upstream_body",
        bodyResult.reason === "too_large"
          ? "The upstream response exceeds the static mirror limit."
          : bodyResult.reason === "timeout"
            ? "The upstream response exceeded the static mirror time limit."
            : "The upstream response is not valid UTF-8 content.",
      );
    }

    let transformed: string;
    try {
      const source = new TextDecoder().decode(bodyResult.body);
      const policy = {
        allowedPathPrefixes: config.webRelay.allowedPathPrefixes,
        allowedQueryKeys: config.webRelay.allowedQueryKeys,
        upstreamOrigin: config.upstreamOrigin,
      };
      transformed =
        contentKind === "html"
          ? sanitizeMirroredHtml(source, upstreamUrl, policy)
          : rewriteMirroredCss(source, upstreamUrl, policy);
    } catch {
      return errorResponse(
        502,
        "upstream_transform_failed",
        "The upstream document could not be transformed safely.",
      );
    }

    const output = new TextEncoder().encode(transformed);
    if (output.byteLength > maxBytes) {
      return errorResponse(
        502,
        "upstream_response_too_large",
        "The transformed response exceeds the static mirror limit.",
      );
    }
    return new Response(output, {
      headers: buildResponseHeaders(
        contentKind === "html"
          ? "text/html; charset=utf-8"
          : "text/css; charset=utf-8",
        requestId,
        requestUrl.origin,
      ),
      status: upstreamResponse.status,
    });
  }

  const responseBody = upstreamResponse.body
    ? createLimitedResponseStream(
        upstreamResponse.body,
        maxBytes,
        WEB_RESPONSE_TIMEOUT_MS,
        abortController,
      )
    : null;
  return new Response(responseBody, {
    headers: buildResponseHeaders(
      contentType,
      requestId,
      requestUrl.origin,
    ),
    status: upstreamResponse.status,
  });
}

async function authorizeWebRelay(
  request: Request,
  requestUrl: URL,
  config: ProxyConfig,
): Promise<Response | null> {
  const user = await getChatGPTUser();
  if (!user) {
    if (isTopLevelDocumentNavigation(request)) {
      const headers = webSecurityHeaders();
      headers.set(
        "Location",
        chatGPTSignInPath(`${requestUrl.pathname}${requestUrl.search}`),
      );
      return new Response(null, { headers, status: 302 });
    }
    return errorResponse(
      401,
      "web_authentication_required",
      "Sign in with ChatGPT to access the static web mirror.",
    );
  }

  const email = user.email.trim().toLowerCase();
  if (!config.webRelay.allowedUserEmails.includes(email)) {
    return errorResponse(
      403,
      "web_user_not_allowed",
      "This ChatGPT user is not allowed to access the static web mirror.",
    );
  }

  return null;
}

function isTopLevelDocumentNavigation(request: Request): boolean {
  if (request.method !== "GET") return false;

  const fetchDestination = request.headers
    .get("sec-fetch-dest")
    ?.trim()
    .toLowerCase();
  if (fetchDestination) return fetchDestination === "document";

  return (
    request.headers.get("accept")?.toLowerCase().includes("text/html") ??
    false
  );
}

function validateWebPath(
  url: URL,
  config: ProxyConfig,
):
  | { ok: true; decodedPath: string; query: string; rawPath: string }
  | { ok: false; response: Response } {
  if (url.pathname !== WEB_ROUTE && !url.pathname.startsWith(`${WEB_ROUTE}/`)) {
    return {
      ok: false,
      response: errorResponse(
        400,
        "invalid_web_path",
        "The static mirror path is invalid.",
      ),
    };
  }
  if (url.search.length > MAX_QUERY_BYTES) {
    return {
      ok: false,
      response: errorResponse(
        400,
        "invalid_web_query",
        "The static mirror query is invalid.",
      ),
    };
  }

  const rawPath = url.pathname.slice(WEB_ROUTE.length) || "/";
  const decodedPath = decodeSafePath(rawPath);
  if (!decodedPath) {
    return {
      ok: false,
      response: errorResponse(
        400,
        "invalid_web_path",
        "The static mirror path is invalid.",
      ),
    };
  }
  if (
    !isAllowedPathPrefix(
      decodedPath,
      config.webRelay.allowedPathPrefixes,
    )
  ) {
    return {
      ok: false,
      response: errorResponse(
        403,
        "web_path_not_allowed",
        "The requested path is outside the static mirror policy.",
      ),
    };
  }
  if (
    !hasOnlyAllowedQueryKeys(
      url.searchParams,
      config.webRelay.allowedQueryKeys,
    )
  ) {
    return {
      ok: false,
      response: errorResponse(
        403,
        "web_query_not_allowed",
        "The request contains a query parameter outside the static mirror policy.",
      ),
    };
  }

  const canonicalQuery = url.searchParams.toString();
  return {
    ok: true,
    decodedPath,
    query: canonicalQuery ? `?${canonicalQuery}` : "",
    rawPath,
  };
}

function buildUpstreamHeaders(
  request: Request,
  config: ProxyConfig,
  requestId: string,
):
  | { ok: true; headers: Headers }
  | { ok: false; response: Response } {
  const accept = request.headers.get("accept");
  const safeAccept = accept
    ? boundedHeader(accept, 512)
    : "text/html,text/css,image/avif,image/webp,image/png,image/jpeg,font/woff2;q=0.9,*/*;q=0.1";
  if (!safeAccept) {
    return {
      ok: false,
      response: errorResponse(
        400,
        "invalid_header",
        "The Accept header is invalid.",
      ),
    };
  }

  const headers = new Headers({
    Accept: safeAccept,
    "Accept-Encoding": "identity",
    "User-Agent": "SitesRelay/0.2 WebMirror",
    "X-Request-ID": requestId,
    "X-Sites-Relay-Hop": "1",
  });
  if (config.upstreamAuthorization) {
    headers.set("Authorization", config.upstreamAuthorization);
  }
  return { ok: true, headers };
}

function classifyContentType(value: string | null): WebContentKind | null {
  if (!value) return null;
  const mediaType = value.split(";", 1)[0].trim().toLowerCase();
  if (mediaType === "text/html") return "html";
  if (mediaType === "text/css") return "css";
  if (IMAGE_MEDIA_TYPES.has(mediaType) || FONT_MEDIA_TYPES.has(mediaType)) {
    return "asset";
  }
  return null;
}

function hasSupportedCharset(value: string): boolean {
  const match = /;\s*charset\s*=\s*"?([^";\s]+)"?/i.exec(value);
  if (!match) return true;
  const charset = match[1].toLowerCase();
  return charset === "utf-8" || charset === "utf8";
}

function buildResponseHeaders(
  contentType: string | null,
  requestId: string,
  requestOrigin: string,
): Headers {
  const headers = webSecurityHeaders(requestOrigin);
  if (contentType) headers.set("Content-Type", contentType);
  headers.set("X-Relay-Request-ID", requestId);
  headers.set("X-Web-Mirror", "static");
  return headers;
}

function webSecurityHeaders(requestOrigin?: string): Headers {
  const webResourceSource = requestOrigin
    ? `${requestOrigin}${WEB_ROUTE}/`
    : "'none'";
  return new Headers({
    "Cache-Control": "private, no-store, no-transform",
    "Content-Security-Policy":
      `default-src 'none'; script-src 'none'; style-src ${webResourceSource}; img-src ${webResourceSource}; font-src ${webResourceSource}; connect-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'; manifest-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'; sandbox allow-same-origin`,
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Permissions-Policy":
      "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    Pragma: "no-cache",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
  });
}

function boundedHeader(value: string | null, maxLength: number): string | null {
  if (!value || value.length > maxLength) return null;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code > 0x7e) return null;
  }
  return value;
}

function errorResponse(
  status: number,
  error: string,
  message: string,
): Response {
  const headers = webSecurityHeaders();
  headers.set("Content-Type", "application/json; charset=utf-8");
  if (status === 405) {
    headers.set("Allow", WEB_RELAY_METHODS.join(", "));
  }
  return Response.json({ error, message }, { headers, status });
}

function rejectUnsupportedMethod(): Response {
  return errorResponse(
    405,
    "method_not_allowed",
    "The static web mirror only supports GET and HEAD.",
  );
}

export {
  handleWebRelay as GET,
  handleWebRelay as HEAD,
  rejectUnsupportedMethod as OPTIONS,
};
