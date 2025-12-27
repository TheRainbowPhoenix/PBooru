/**
 * @file loader.js
 * @description Handles fetching, decrypting, and caching of images.
 */

import { xorBytes } from './crypto';
// eslint-disable-next-line no-unused-vars
import * as T from './types'; 

const CACHE_NAME = 'pbooru-v2';
const CACHE_URL_PREFIX = "https://cache.pbooru.local/"; 
const MEM_CACHE = new Map(); // In-memory Blob URL cache

export class ImageLoader {
  /**
   * @param {string} baseUrl - URL to the folder containing manifest.json (no trailing slash).
   * @param {string} key - The XOR key string.
   */
  constructor(baseUrl, key) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.key = key;
  }

  /**
   * Maps extensions to MIME types.
   * @param {string} ext 
   * @returns {string}
   */
  extToMime(ext) {
    const map = { 
      jpg: 'image/jpeg', 
      jpeg: 'image/jpeg', 
      png: 'image/png', 
      webp: 'image/webp', 
      gif: 'image/gif' 
    };
    return map[ext.toLowerCase()] || 'application/octet-stream';
  }

  /**
   * Helper to generate the fake URL for the Cache API.
   * @param {string} key 
   */
  toCacheUrl(key) {
    return `${CACHE_URL_PREFIX}${encodeURIComponent(key)}`;
  }

  /**
   * Resolves the exact file path and MIME type for a requested variant.
   * Handles fallback logic (Thumb -> Clip -> Full).
   * 
   * @param {T.GalleryItem} item 
   * @param {'thumb'|'clip'|'full'} variant 
   * @returns {{ binPath: string, mime: string, cacheKey: string }}
   */
  getVariantDetails(item, variant) {
    // Fallback chain: thumb -> clip -> full
    if (variant === 'thumb' && !item.thumb) return this.getVariantDetails(item, 'clip');
    if (variant === 'clip' && !item.clip) return this.getVariantDetails(item, 'full');
    
    // @ts-ignore - we know item[variant] exists now due to fallbacks
    const target = item[variant] || item.full;
    return {
      binPath: `${this.baseUrl}/${target.bin}`,
      mime: this.extToMime(target.ext),
      cacheKey: `pbooru:${item.hash}:${variant}`
    };
  }

  /**
   * Main method to load an image. Checks Memory -> Cache API -> Network.
   * 
   * @param {T.GalleryItem} item 
   * @param {'thumb'|'clip'|'full'} variant 
   * @param {(progress: number) => void} [onProgress] - Optional callback (0.0 to 1.0).
   * @returns {Promise<string>} Blob URL (e.g. "blob:http://...")
   */
  async load(item, variant, onProgress) {
    const { binPath, mime, cacheKey } = this.getVariantDetails(item, variant);

    // 1. Check Memory (fastest)
    if (MEM_CACHE.has(cacheKey)) {
      return MEM_CACHE.get(cacheKey);
    }

    // 2. Check Browser Cache Storage (fast)
    if ('caches' in window) {
      try {
        const cache = await caches.open(CACHE_NAME);
        const syntheticUrl = this.toCacheUrl(cacheKey);
        const cachedRes = await cache.match(syntheticUrl);
        
        if (cachedRes) {
          const blob = await cachedRes.blob();
          const url = URL.createObjectURL(blob);
          MEM_CACHE.set(cacheKey, url);
          return url;
        }
      } catch (e) {
        console.warn("Cache API error (read)", e);
      }
    }

    // 3. Fetch & Decrypt (slow)
    const encryptedBuf = await this.fetchWithProgress(binPath, onProgress);
    const decryptedBytes = xorBytes(encryptedBuf, this.key);
    const blob = new Blob([decryptedBytes], { type: mime });

    // 4. Save to Cache
    if ('caches' in window) {
      try {
        const cache = await caches.open(CACHE_NAME);
        const syntheticUrl = this.toCacheUrl(cacheKey);
        
        // We store the DECRYPTED blob so next time we skip download & math
        await cache.put(syntheticUrl, new Response(blob)); 
      } catch (e) {
        console.warn("Cache API error (write)", e);
      }
    }

    const url = URL.createObjectURL(blob);
    MEM_CACHE.set(cacheKey, url);
    return url;
  }

  /**
   * Fetch helper that supports progress events via ReadableStream.
   * @param {string} url 
   * @param {(p: number) => void} [onProgress] 
   * @returns {Promise<ArrayBuffer>}
   */
  async fetchWithProgress(url, onProgress) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const totalStr = res.headers.get('content-length');
    const total = totalStr ? parseInt(totalStr, 10) : 0;
    // If no stream support or no content-length, fall back to basic blob
    if (!total || !res.body) return res.arrayBuffer();

    const reader = res.body.getReader();
    const chunks = [];
    let loaded = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.length;
      if (onProgress) onProgress(loaded / total);
    }

    const result = new Uint8Array(loaded);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result.buffer;
  }
}