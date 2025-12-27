/**
 * @file store.js
 * @description State management for the application.
 */

import { writable, derived, get } from 'svelte/store';
import { ImageLoader } from './loader';
// eslint-disable-next-line no-unused-vars
import * as T from './types'; // Import types for JSDoc

// --- CONFIG ---
const storedConfig = typeof localStorage !== 'undefined' 
  ? { url: localStorage.getItem('pb_url') || '', key: localStorage.getItem('pb_key') || '' }
  : { url: '', key: '' };

export const config = writable(storedConfig);

config.subscribe(val => {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('pb_url', val.url);
    localStorage.setItem('pb_key', val.key);
  }
});

// --- STATE ---
export const status = writable('idle'); 
export const errorMsg = writable('');
export const currentView = writable('posts'); 
export const activeHash = writable(null);
export const isPaginated = writable(false); // Toggle between Infinite / Paged
export const currentPage = writable(1);
export const itemsPerPage = 40;

// --- DATA ---

/** @type {import('svelte/store').Writable<T.ManifestItem[]>} */
const rawManifest = writable([]);

/** @type {import('svelte/store').Writable<T.MetadataItem[]>} */
const rawMetadata = writable([]);

/**
 * Merges Manifest + Metadata into a single useful object keyed by Hash
 * @type {import('svelte/store').Readable<T.GalleryItem[]>}
 */
export const gallery = derived([rawManifest, rawMetadata], ([$man, $meta]) => {
  const metaMap = new Map($meta.map(m => [m.hash, m]));
  
  const items = $man.map(item => {
    // Find hash via fallback chain if manifest is messy
    const hash = item.hash || item.sha256 || (item.full ? item.full.sha256 : null) || item.name;
    const meta = metaMap.get(hash) || {};

    // Fallback logic for date sorting
    const dateStr = meta.date || item.date || '1970-01-01T00:00:00.000Z';
    
    return {
      hash: item.hash,
      name: item.name,
      full: item.full,
      clip: item.clip,
      thumb: item.thumb,
      tags: meta.tags || item.tags || [],
      rating: meta.rating || 'safe',
      date: dateStr,
      source: meta.source || ''
    };
  });

  return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
});

// --- FILTERING ---

/** @type {import('svelte/store').Writable<string|null>} */
export const activeFilter = writable(null);

export const filteredGallery = derived([gallery, activeFilter], ([$gallery, $filter]) => {
  if (!$filter) return $gallery;
  return $gallery.filter(item => item.tags.includes($filter));
});

// --- ACTIONS ---

export const actions = {
  /**
   * Loads manifest and metadata from the remote source.
   */
  async init() {
    const { url, key } = get(config);
    if (!url || !key) {
      currentView.set('config');
      return;
    }

    status.set('loading');
    try {
      const cleanUrl = url.replace(/\/+$/, "");
      
      // Load Manifest
      const manRes = await fetch(`${cleanUrl}/manifest.json`);
      if(!manRes.ok) throw new Error("Manifest not found");
      const manJson = await manRes.json();
      
      // Load Metadata (optional)
      let metaJson = { items: [] };
      try {
        const metaRes = await fetch(`${cleanUrl}/metadata.json`);
        if(metaRes.ok) metaJson = await metaRes.json();
      } catch (e) { console.warn("Metadata missing, tags will be empty."); }

      // Normalize Manifest Items specifically to fix any data inconsistencies
      /** @type {T.ManifestItem[]} */
      const normalizedItems = manJson.items.map(i => {
        // Fallback chain to find the hash
        const foundHash = i.hash || i.sha256 || (i.full ? i.full.sha256 : null) || i.name;
        
        return {
          hash: foundHash, 
          name: i.name,
          full: i.full,
          clip: i.clip,
          thumb: i.thumb
        };
      });

      rawManifest.set(normalizedItems);
      rawMetadata.set(metaJson.items);
      status.set('ready');
      currentView.set('posts');
    } catch (e) {
      console.error(e);
      errorMsg.set(e.message);
      status.set('error');
      currentView.set('config');
    }
  },

  /**
   * Sets the active tag filter.
   * @param {string|null} tag 
   */
  setFilter(tag) {
    activeFilter.set(tag);
    currentPage.set(1);
    currentView.set('posts');
  },
  
  /**
   * Opens an image in the modal.
   * @param {string} hash 
   */
  openImage(hash) {
    activeHash.set(hash);
    if(typeof window !== 'undefined') window.location.hash = hash;
  },

  /**
   * Closes the modal.
   */
  closeModal() {
    activeHash.set(null);
    if(typeof window !== 'undefined') history.replaceState(null, null, ' ');
  },

  setPage(page) {
    currentPage.set(page);
    if (typeof window !== 'undefined') window.scrollTo(0, 0);
  },

  /**
   * Hard Reset: Clears Config, Cache Storage, and LocalStorage
   */
  async factoryReset() {
    if (!confirm("This will wipe all cached images and settings. Continue?")) return;
    
    // Clear Stores
    config.set({ url: '', key: '' });
    rawManifest.set([]);
    rawMetadata.set([]);
    
    // Clear LocalStorage
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }

    // Clear Cache API
    if ('caches' in window) {
      const keys = await caches.keys();
      for (const key of keys) {
        if (key.startsWith('pbooru')) await caches.delete(key);
      }
    }

    window.location.reload();
  }
};