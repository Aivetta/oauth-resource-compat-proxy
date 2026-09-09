# OAuth Resource Compatibility Proxy

Small Node.js proxy for the Claude MCP OAuth + Microsoft Entra `AADSTS9010010`
compatibility issue.

Claude sends an RFC 8707 `resource` value based on the public MCP URL. Microsoft
Entra validates requests against the Application ID URI configured on the app
registration, and the requested scope must belong to that same resource.

For example, if Entra expects:

```text
Application ID URI = api://00000000-0000-0000-0000-000000000000
Scope              = api://00000000-0000-0000-0000-000000000000/Tasks.Read
```

This proxy lets Claude talk to a public MCP URL, while the proxy rewrites OAuth
authorize/token parameters to the exact resource and scope values Entra accepts.

## What It Does

- `/.well-known/oauth-protected-resource` returns `PUBLIC_MCP_RESOURCE`.
- `/.well-known/oauth-protected-resource/mcp` returns `PUBLIC_MCP_RESOURCE`.
- `/.well-known/oauth-authorization-server` returns proxy `/authorize` and `/token`.
- `/authorize` redirects to Entra after rewriting `resource` and `scope`.
- `/token` forwards to Entra after rewriting form parameters.

It does not proxy MCP traffic. Route `/mcp` to your real MCP server with Nginx,
Caddy, Cloudflare, or another reverse proxy.

## Configure

Copy `.env.example` and set your real values:

```sh
cp .env.example .env
```

Scope replacement uses exact token matching. If Claude sends `Tasks.Read`, set
`PUBLIC_SCOPE=Tasks.Read`. If Claude sends
`https://your-proxy.example.com/mcp/Tasks.Read`, set `PUBLIC_SCOPE` to that full
value.

The most important rule:

```text
AUDIENCE_RESOURCE must be exactly the Entra Application ID URI.
UPSTREAM_SCOPE must be exactly the scope value Entra accepts for that resource.
```

There is no inference from suffixes or hostnames.

### HTTPS Application ID URI

Use this when Entra accepts the same HTTPS Application ID URI as the public MCP
resource.

```sh
PUBLIC_BASE_URL=https://your-proxy.example.com
UPSTREAM_AUTH_BASE_URL=https://login.microsoftonline.com/YOUR_TENANT_ID/v2.0

PUBLIC_MCP_RESOURCE=https://your-proxy.example.com/mcp
AUDIENCE_RESOURCE=https://your-proxy.example.com/mcp

PUBLIC_SCOPE=Tasks.Read
UPSTREAM_SCOPE=https://your-proxy.example.com/mcp/Tasks.Read
```

This turns:

```text
resource=https://your-proxy.example.com/mcp
scope=Tasks.Read
```

into:

```text
resource=https://your-proxy.example.com/mcp
scope=https://your-proxy.example.com/mcp/Tasks.Read
```

### api:// Application ID URI

Use this when Entra is registered with an `api://...` Application ID URI.

```sh
PUBLIC_BASE_URL=https://your-proxy.example.com
UPSTREAM_AUTH_BASE_URL=https://login.microsoftonline.com/YOUR_TENANT_ID/v2.0

PUBLIC_MCP_RESOURCE=https://your-proxy.example.com/mcp
AUDIENCE_RESOURCE=api://00000000-0000-0000-0000-000000000000

PUBLIC_SCOPE=Tasks.Read
UPSTREAM_SCOPE=api://00000000-0000-0000-0000-000000000000/Tasks.Read
```

This turns:

```text
resource=https://your-proxy.example.com/mcp
scope=Tasks.Read
```

into:

```text
resource=api://00000000-0000-0000-0000-000000000000
scope=api://00000000-0000-0000-0000-000000000000/Tasks.Read
```

Both examples follow the same rule: the `resource` sent to Entra is the app's
Application ID URI, and the `scope` sent to Entra belongs to that same resource.

If Entra rejects the `resource` parameter even after replacement, set:

```sh
STRIP_RESOURCE=true
```

When `STRIP_RESOURCE=true`, the proxy removes `resource` from `/authorize` and
`/token` requests before forwarding them to Entra. Scope replacement still runs.
Treat this as a fallback compatibility mode for providers that reject RFC 8707
`resource` on the upstream leg.

## Run

Node 20+ is required.

```sh
node --env-file=.env src/server.js
```

If your environment variables are already exported by the shell or runtime, you
can also use:

```sh
npm start
```

For local-only testing, set `HOST=127.0.0.1`.

The MCP URL for Claude should be:

```text
https://your-proxy.example.com/mcp
```

Example Nginx split:

```nginx
location /mcp {
    proxy_pass http://mcp-server:3001;
}

location /.well-known/ {
    proxy_pass http://oauth-compat-proxy:8787;
}

location /authorize {
    proxy_pass http://oauth-compat-proxy:8787;
}

location /token {
    proxy_pass http://oauth-compat-proxy:8787;
}
```

Health check:

```text
GET /healthz
```

## E2E Check

Before calling this a working workaround for your deployment, run the full flow:

```text
Claude connector
  -> public reverse proxy
  -> compat proxy OAuth discovery
  -> compat proxy /authorize
  -> Entra sign-in/consent
  -> compat proxy /token
  -> Claude calls /mcp through the reverse proxy
  -> real MCP server
```

Confirm that Entra no longer returns `AADSTS9010010`, and that the final MCP
request reaches the real MCP server with an access token issued by Entra.

Also confirm issuer behavior during the full OAuth flow. This proxy publishes
itself as the authorization server issuer:

```json
{
  "issuer": "https://your-proxy.example.com"
}
```

The actual authorization code and tokens are still issued by Microsoft Entra.
If your MCP client enforces strict authorization-server issuer binding across
the redirect callback, this facade approach may need an additional callback
handling layer. The current implementation should be treated as a compact
workaround until this is verified end to end with your Claude connector and
tenant.

## Test

```sh
npm test
```
