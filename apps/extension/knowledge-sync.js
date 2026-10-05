// Generated from knowledge-sync.ts — edit knowledge-sync.ts, then pnpm build.
const CACHE_KEY = "_cc_knowledge_cache";
const SYNC_INTERVAL_MS = 30 * 60 * 1e3;
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1e3;
const ccKnowledgeSync = {
  /**
   * Full bootstrap — downloads all knowledge for current context.
   * Called on first auth or when cache is stale/missing.
   */
  async bootstrap(context) {
    var _a, _b, _c;
    const { backendUrl, accessToken } = await chrome.storage.local.get(["backendUrl", "accessToken"]);
    if (!backendUrl || !accessToken) {
      console.warn("[CC:sync] Cannot bootstrap \u2014 not authenticated");
      return null;
    }
    try {
      const res = await fetch(backendUrl + "/sync/bootstrap", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + accessToken
        },
        body: JSON.stringify({
          context: context || {},
          capabilities: [
            "field_mapping",
            "synonym",
            "fill_rule",
            "derivation_rule",
            "portal_definition",
            "option_translation",
            "component_adapter"
          ],
          schema_version: "1.0.0",
          extension_version: ((_c = (_b = (_a = chrome.runtime).getManifest) == null ? void 0 : _b.call(_a)) == null ? void 0 : _c.version) || "0.0.0"
        })
      });
      if (!res.ok) {
        console.warn("[CC:sync] Bootstrap failed:", res.status);
        return null;
      }
      const data = await res.json();
      const cache = {
        manifest_version: data.manifest_version,
        updated_at: (/* @__PURE__ */ new Date()).toISOString(),
        artifacts: data.artifacts || {},
        record_count: data.record_count || 0
      };
      await chrome.storage.local.set({ [CACHE_KEY]: cache });
      console.log("[CC:sync] Bootstrap complete:", cache.record_count, "records, manifest:", cache.manifest_version);
      return cache;
    } catch (e) {
      console.warn("[CC:sync] Bootstrap error:", e.message);
      return null;
    }
  },
  /**
   * Delta sync — fetches only changes since last manifest_version.
   * Falls back to bootstrap if server says manifest_expired.
   */
  async delta(context) {
    const { backendUrl, accessToken } = await chrome.storage.local.get(["backendUrl", "accessToken"]);
    if (!backendUrl || !accessToken) return null;
    const cache = await this.getCache();
    if (!(cache == null ? void 0 : cache.manifest_version)) {
      return this.bootstrap(context);
    }
    try {
      const res = await fetch(backendUrl + "/sync/delta", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + accessToken
        },
        body: JSON.stringify({
          manifest_version: cache.manifest_version,
          context: context || {}
        })
      });
      if (!res.ok) {
        console.warn("[CC:sync] Delta failed:", res.status);
        return null;
      }
      const data = await res.json();
      if (data.error === "manifest_expired" || data.action === "bootstrap") {
        console.log("[CC:sync] Manifest expired, doing full bootstrap");
        return this.bootstrap(context);
      }
      if (data.changes && data.change_count > 0) {
        const updatedCache = this._applyDelta(cache, data);
        await chrome.storage.local.set({ [CACHE_KEY]: updatedCache });
        console.log("[CC:sync] Delta applied:", data.change_count, "changes, new manifest:", updatedCache.manifest_version);
        return updatedCache;
      }
      cache.manifest_version = data.manifest_version;
      cache.updated_at = (/* @__PURE__ */ new Date()).toISOString();
      await chrome.storage.local.set({ [CACHE_KEY]: cache });
      return cache;
    } catch (e) {
      console.warn("[CC:sync] Delta error:", e.message);
      return null;
    }
  },
  /**
   * Check cache freshness without downloading data.
   */
  async check() {
    const { backendUrl, accessToken } = await chrome.storage.local.get(["backendUrl", "accessToken"]);
    if (!backendUrl || !accessToken) return { fresh: false, recommendation: "bootstrap" };
    const cache = await this.getCache();
    if (!(cache == null ? void 0 : cache.manifest_version)) return { fresh: false, recommendation: "bootstrap" };
    try {
      const res = await fetch(backendUrl + "/sync/check", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + accessToken
        },
        body: JSON.stringify({ manifest_version: cache.manifest_version })
      });
      if (!res.ok) return { fresh: false, recommendation: "bootstrap" };
      return await res.json();
    } catch (e) {
      const age = Date.now() - new Date(cache.updated_at).getTime();
      return { fresh: age < STALE_THRESHOLD_MS, recommendation: age > STALE_THRESHOLD_MS ? "bootstrap" : "ok" };
    }
  },
  /**
   * Read the full cached knowledge object.
   */
  async getCache() {
    const data = await chrome.storage.local.get(CACHE_KEY);
    return data[CACHE_KEY] || null;
  },
  /**
   * Get cached semantic_aliases map { label: semantic_key }.
   * Returns empty object if cache is not populated.
   */
  async getCachedAliases() {
    var _a;
    const cache = await this.getCache();
    return ((_a = cache == null ? void 0 : cache.artifacts) == null ? void 0 : _a.semantic_aliases) || {};
  },
  /**
   * Get cached field_mappings array.
   * Each entry: { semantic_key, profile_key, match_patterns, confidence }
   */
  async getCachedFieldMappings() {
    var _a;
    const cache = await this.getCache();
    return ((_a = cache == null ? void 0 : cache.artifacts) == null ? void 0 : _a.field_mappings) || [];
  },
  /**
   * Get cached derivation_rules (if included in artifacts).
   */
  async getCachedDerivationRules() {
    var _a;
    const cache = await this.getCache();
    return ((_a = cache == null ? void 0 : cache.artifacts) == null ? void 0 : _a.derivation_rules) || [];
  },
  /**
   * Schedule periodic sync. Call once from background.ts on startup.
   */
  startPeriodicSync() {
    setTimeout(() => this._periodicSync(), 1e4);
    setInterval(() => this._periodicSync(), SYNC_INTERVAL_MS);
  },
  async _periodicSync() {
    const cache = await this.getCache();
    if (!cache) {
      await this.bootstrap();
      return;
    }
    const age = Date.now() - new Date(cache.updated_at).getTime();
    if (age > STALE_THRESHOLD_MS) {
      await this.bootstrap();
    } else {
      await this.delta();
    }
  },
  /**
   * Apply delta changes to cached artifacts.
   * @private
   */
  _applyDelta(cache, deltaResponse) {
    const updated = {
      ...cache,
      manifest_version: deltaResponse.manifest_version,
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    const { added, updated: changed, removed } = deltaResponse.changes || {};
    const arts = { ...updated.artifacts };
    if (removed == null ? void 0 : removed.length) {
      for (const item of removed) {
        if (item.kind === "synonym" && arts.semantic_aliases) {
          delete arts.semantic_aliases[item.key];
        } else if (item.kind === "field_mapping" && arts.field_mappings) {
          arts.field_mappings = arts.field_mappings.filter((m) => m.semantic_key !== item.key);
        } else if (item.kind === "option_translation" && arts.option_translations) {
          arts.option_translations = arts.option_translations.filter(
            (t) => t.field_semantic_key !== item.key
          );
        }
      }
    }
    const upserts = [...added || [], ...changed || []];
    for (const item of upserts) {
      const data = item.data || {};
      if (item.kind === "synonym" && data.canonical && data.variants) {
        if (!arts.semantic_aliases) arts.semantic_aliases = {};
        arts.semantic_aliases[data.canonical] = data.variants;
      } else if (item.kind === "field_mapping") {
        if (!arts.field_mappings) arts.field_mappings = [];
        const idx = arts.field_mappings.findIndex((m) => m.semantic_key === data.semantic_key);
        const entry = {
          semantic_key: data.semantic_key,
          profile_key: data.profile_key,
          match_patterns: data.match_patterns || [],
          confidence: data.confidence || 0.9
        };
        if (idx >= 0) arts.field_mappings[idx] = entry;
        else arts.field_mappings.push(entry);
      } else if (item.kind === "option_translation") {
        if (!arts.option_translations) arts.option_translations = [];
        arts.option_translations.push({
          field_semantic_key: data.field_semantic_key,
          profile_value: data.profile_value,
          option_text: data.option_text
        });
      }
    }
    updated.artifacts = arts;
    return updated;
  }
};
