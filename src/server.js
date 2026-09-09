import http from "node:http";
import { URL, URLSearchParams } from "node:url";
import { buildConfig } from "./config.js";
import { transformOAuthParams } from "./oauthTransforms.js";

const hopByHopHeaders = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade"
]);

function copyRequestHeaders(headers, overrides = {}) {
  const next = {};

  for (const [name, value] of Object.entries(headers)) {
    if (!hopByHopHeaders.has(name.toLowerCase()) && name.toLowerCase() !== "host") {
      next[name] = value;
    }
  }

  return { ...next, ...overrides };
}

function copyResponseHeaders(response) {
  const headers = {};

  response.headers.forEach((value, name) => {
    if (hopByHopHeaders.has(name.toLowerCase())) return;
    headers[name] = value;
  });

  return headers;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function sendJson(res, status, body, headers = {}) {
  res.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
    ...headers
  });
  res.end(JSON.stringify(body));
}

function oauthServerMetadata(config) {
  return {
    issuer: config.publicBaseUrl,
    authorization_endpoint: `${config.publicBaseUrl}/authorize`,
    token_endpoint: `${config.publicBaseUrl}/token`,
    scopes_supported: config.publicScope ? [config.publicScope] : undefined,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic"],
    code_challenge_methods_supported: ["S256"]
  };
}

function protectedResourceMetadata(config) {
  return {
    resource: config.publicMcpResource,
    authorization_servers: [config.publicBaseUrl],
    scopes_supported: config.publicScope ? [config.publicScope] : undefined,
    bearer_methods_supported: ["header"]
  };
}

async function handleAuthorize(req, res, config) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "method_not_allowed" }, { allow: "GET" });
    return;
  }

  const currentUrl = new URL(req.url, config.publicBaseUrl);
  const params = transformOAuthParams(currentUrl.searchParams, config);
  const upstreamUrl = new URL(`${config.upstreamAuthBaseUrl}/authorize`);
  upstreamUrl.search = params.toString();

  res.writeHead(302, {
    location: upstreamUrl.toString(),
    "cache-control": "no-store"
  });
  res.end();
}

async function handleToken(req, res, config) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "method_not_allowed" }, { allow: "POST" });
    return;
  }

  const body = await readBody(req);
  const contentType = req.headers["content-type"] || "";
  let outboundBody = body;

  if (contentType.includes("application/x-www-form-urlencoded")) {
    outboundBody = Buffer.from(transformOAuthParams(new URLSearchParams(body.toString("utf8")), config).toString());
  }

  const response = await fetch(`${config.upstreamAuthBaseUrl}/token`, {
    method: "POST",
    headers: copyRequestHeaders(req.headers, {
      "content-length": String(outboundBody.length)
    }),
    body: outboundBody,
    redirect: "manual"
  });

  const responseBody = Buffer.from(await response.arrayBuffer());
  res.writeHead(response.status, copyResponseHeaders(response));
  res.end(responseBody);
}

async function handleRequest(req, res, config) {
  const url = new URL(req.url, config.publicBaseUrl);

  if (url.pathname === "/healthz") {
    if (req.method !== "GET") {
      sendJson(res, 405, { error: "method_not_allowed" }, { allow: "GET" });
      return;
    }
    sendJson(res, 200, { ok: true });
    return;
  }

  if (url.pathname === "/.well-known/oauth-authorization-server") {
    if (req.method !== "GET") {
      sendJson(res, 405, { error: "method_not_allowed" }, { allow: "GET" });
      return;
    }
    sendJson(res, 200, oauthServerMetadata(config));
    return;
  }

  if (
    url.pathname === "/.well-known/oauth-protected-resource" ||
    url.pathname === `/.well-known/oauth-protected-resource${config.mcpPath}`
  ) {
    if (req.method !== "GET") {
      sendJson(res, 405, { error: "method_not_allowed" }, { allow: "GET" });
      return;
    }
    sendJson(res, 200, protectedResourceMetadata(config));
    return;
  }

  if (url.pathname === "/authorize") {
    await handleAuthorize(req, res, config);
    return;
  }

  if (url.pathname === "/token") {
    await handleToken(req, res, config);
    return;
  }

  sendJson(res, 404, { error: "not_found" });
}

function main() {
  const config = buildConfig();

  const server = http.createServer((req, res) => {
    handleRequest(req, res, config).catch((error) => {
      sendJson(res, 502, {
        error: "proxy_error",
        error_description: error.message
      });
    });
  });

  server.listen(config.port, config.host, () => {
    console.log(`OAuth resource compatibility proxy listening on ${config.host}:${config.port}`);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
