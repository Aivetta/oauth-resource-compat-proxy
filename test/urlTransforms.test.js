import assert from "node:assert/strict";
import test from "node:test";
import {
  replaceScopeTokens,
  transformOAuthParams
} from "../src/oauthTransforms.js";

test("replaces exact scope tokens only", () => {
  const replacements = new Map([
    ["https://mcp.example.com/mcp/mcp.access", "api://00000000-0000-0000-0000-000000000000/mcp.access"]
  ]);

  assert.equal(
    replaceScopeTokens(
      "openid https://mcp.example.com/mcp/mcp.access offline_access",
      replacements
    ),
    "openid api://00000000-0000-0000-0000-000000000000/mcp.access offline_access"
  );
});

test("rewrites resource and scope for Entra", () => {
  const params = new URLSearchParams({
    client_id: "client",
    resource: "https://proxy.example.com/mcp",
    scope: "https://mcp.example.com/mcp/mcp.access"
  });

  const transformed = transformOAuthParams(params, {
    stripResource: false,
    resourceReplacements: new Map([
      ["https://proxy.example.com/mcp", "api://00000000-0000-0000-0000-000000000000"]
    ]),
    scopeReplacements: new Map([
      ["https://mcp.example.com/mcp/mcp.access", "api://00000000-0000-0000-0000-000000000000/mcp.access"]
    ])
  });

  assert.equal(transformed.get("resource"), "api://00000000-0000-0000-0000-000000000000");
  assert.equal(transformed.get("scope"), "api://00000000-0000-0000-0000-000000000000/mcp.access");
});

test("can strip resource completely", () => {
  const transformed = transformOAuthParams(
    new URLSearchParams({ resource: "https://proxy.example.com/mcp" }),
    {
      stripResource: true,
      resourceReplacements: new Map(),
      scopeReplacements: new Map()
    }
  );

  assert.equal(transformed.has("resource"), false);
});

test("leaves unrelated oauth parameters untouched", () => {
  const params = new URLSearchParams({
    state: "opaque-state",
    redirect_uri: "https://client.example.com/callback",
    code: "auth-code",
    code_verifier: "verifier",
    code_challenge: "challenge",
    code_challenge_method: "S256"
  });

  const transformed = transformOAuthParams(params, {
    stripResource: false,
    resourceReplacements: new Map(),
    scopeReplacements: new Map()
  });

  assert.equal(transformed.toString(), params.toString());
});

test("leaves unknown resource unchanged in replace mode", () => {
  const transformed = transformOAuthParams(
    new URLSearchParams({ resource: "https://other.example.com/mcp" }),
    {
      stripResource: false,
      resourceReplacements: new Map([
        ["https://proxy.example.com/mcp", "api://00000000-0000-0000-0000-000000000000"]
      ]),
      scopeReplacements: new Map()
    }
  );

  assert.equal(transformed.get("resource"), "https://other.example.com/mcp");
});
