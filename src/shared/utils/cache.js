/**
 * High-Performance In-Memory Cache with TTL & Pattern Invalidation
 * Used for caching lookup tables, settings, categories, units, and user scopes.
 */

class MemoryCache {
    constructor() {
        this.cache = new Map();
    }

    /**
     * Set a key with TTL (in seconds)
     */
    set(key, value, ttlSeconds = 60) {
        const expiresAt = Date.now() + (ttlSeconds * 1000);
        this.cache.set(key, { value, expiresAt });
    }

    /**
     * Get a value by key. Returns null if expired or missing.
     */
    get(key) {
        const item = this.cache.get(key);
        if (!item) return null;
        if (Date.now() > item.expiresAt) {
            this.cache.delete(key);
            return null;
        }
        return item.value;
    }

    /**
     * Delete a single key
     */
    delete(key) {
        this.cache.delete(key);
    }

    /**
     * Invalidate keys starting with a prefix (e.g. 'categories:shop_123')
     */
    invalidatePrefix(prefix) {
        for (const key of this.cache.keys()) {
            if (key.startsWith(prefix)) {
                this.cache.delete(key);
            }
        }
    }

    /**
     * Clear the entire cache
     */
    clear() {
        this.cache.clear();
    }
}

const globalCache = new MemoryCache();

module.exports = globalCache;
