export function normalizeBaseUrl(value) {
  return String(value || "").replace(/\/+$/, "");
}

export function replaceScopeTokens(scope, replacements) {
  if (!scope || !replacements?.size) return scope;

  return String(scope)
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => replacements.get(token) || token)
    .join(" ");
}

export function transformOAuthParams(params, config) {
  const next = new URLSearchParams(params);

  if (next.has("resource")) {
    const resource = next.get("resource");

    if (config.stripResource) {
      next.delete("resource");
    } else if (resource && config.resourceReplacements.has(resource)) {
      next.set("resource", config.resourceReplacements.get(resource));
    }
  }

  if (next.has("scope")) {
    next.set("scope", replaceScopeTokens(next.get("scope"), config.scopeReplacements));
  }

  return next;
}
