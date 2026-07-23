import {
  getProxyPublicStatus,
  JSON_RESPONSE_TIMEOUT_MS,
  MAX_JSON_RESPONSE_BYTES,
  MAX_REQUEST_BODY_BYTES,
  MAX_SSE_RESPONSE_BYTES,
  MAX_WEB_ASSET_BYTES,
  MAX_WEB_DOCUMENT_BYTES,
  PROXY_METHODS,
  SSE_RESPONSE_TIMEOUT_MS,
  UPSTREAM_CONNECT_TIMEOUT_MS,
  WEB_RELAY_METHODS,
  WEB_RESPONSE_TIMEOUT_MS,
} from "@/lib/proxy-config";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(): Promise<Response> {
  const status = getProxyPublicStatus();

  return Response.json(
    {
      status: status.state,
      proxyEndpoint: "/api/proxy/*",
      upstreamConfigured: status.upstreamConfigured,
      upstreamHost: status.upstreamHost,
      accessTokenConfigured: status.accessTokenConfigured,
      authentication: {
        mode: status.authMode,
        userAllowlistConfigured:
          status.proxyUserAllowlistConfigured,
      },
      allowedRouteCount: status.allowedRouteCount,
      supportedMethods: PROXY_METHODS,
      preflightMethod: "OPTIONS",
      webRelay: {
        enabled: status.webRelayEnabled,
        endpoint: "/web/*",
        allowedPathCount: status.webRelayPathCount,
        accessBoundary: "sites_access_control_and_user_allowlist",
        userAllowlistConfigured:
          status.webRelayUserAllowlistConfigured,
        supportedMethods: WEB_RELAY_METHODS,
        scriptPolicy: "blocked",
        formPolicy: "blocked",
      },
      supportedResponseTypes: [
        "application/json",
        "application/*+json",
        "text/event-stream",
      ],
      maxRequestBodyBytes: MAX_REQUEST_BODY_BYTES,
      maxJsonResponseBytes: MAX_JSON_RESPONSE_BYTES,
      maxEventStreamResponseBytes: MAX_SSE_RESPONSE_BYTES,
      upstreamConnectTimeoutMs: UPSTREAM_CONNECT_TIMEOUT_MS,
      jsonResponseTimeoutMs: JSON_RESPONSE_TIMEOUT_MS,
      eventStreamResponseTimeoutMs: SSE_RESPONSE_TIMEOUT_MS,
      maxWebDocumentBytes: MAX_WEB_DOCUMENT_BYTES,
      maxWebAssetBytes: MAX_WEB_ASSET_BYTES,
      webResponseTimeoutMs: WEB_RESPONSE_TIMEOUT_MS,
      reachability: "not_checked",
      missing: status.missing,
      issues: status.issues,
    },
    {
      headers: {
        "Cache-Control": "private, no-store, no-transform",
        "Content-Security-Policy":
          "default-src 'none'; frame-ancestors 'none'; sandbox",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      },
      status: status.state === "ready" ? 200 : 503,
    },
  );
}

export async function HEAD(): Promise<Response> {
  const response = await GET();
  return new Response(null, {
    headers: response.headers,
    status: response.status,
  });
}
