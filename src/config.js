import { normalizeBaseUrl } from "./oauthTransforms.js";

function requiredEnv(env, name) {
  const value = env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function parsePositiveInteger(env, name, fallback) {
  const raw = env[name];
  if (!raw) return fallback;

  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function parseScopeReplacements(env) {
  const replacements = new Map();

  if (env.PUBLIC_SCOPE && env.UPSTREAM_SCOPE) {
    replacements.set(env.PUBLIC_SCOPE, env.UPSTREAM_SCOPE);
  }

  return replacements;
}

export function buildConfig(env = process.env) {
  const publicBaseUrl = normalizeBaseUrl(requiredEnv(env, "PUBLIC_BASE_URL"));
  const upstreamAuthBaseUrl = normalizeBaseUrl(requiredEnv(env, "UPSTREAM_AUTH_BASE_URL"));
  const mcpPath = env.MCP_PATH || "/mcp";
  const audienceResource = env.AUDIENCE_RESOURCE || "";
  const stripResource = env.STRIP_RESOURCE === "true";
  const publicMcpResource = env.PUBLIC_MCP_RESOURCE || `${publicBaseUrl}${mcpPath}`;

  const resourceReplacements = new Map();
  if (audienceResource) {
    resourceReplacements.set(publicMcpResource, audienceResource);
    resourceReplacements.set(`${publicBaseUrl}${mcpPath}`, audienceResource);
  }

  return {
    audienceResource,
    host: env.HOST || "0.0.0.0",
    mcpPath,
    port: parsePositiveInteger(env, "PORT", 8787),
    publicBaseUrl,
    publicMcpResource,
    publicScope: env.PUBLIC_SCOPE || "",
    resourceReplacements,
    scopeReplacements: parseScopeReplacements(env),
    stripResource,
    upstreamAuthBaseUrl
  };
}
