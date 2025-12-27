/**
 * @file store.js
 * @description State management for the application.
 */

import { writable, derived, get } from 'svelte/store';
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
export const status = writable('idle'); // idle, loading, error, ready
export const errorMsg = writable('');
export const currentView = writable('posts'); // posts, tags, config
export const activeHash = writable(null); // For modal

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
  
  return $man.map(item => {
    // If the manifest didn't contain a hash, try to find it by name in metadata, or skip
    // But our init() logic ensures item.hash exists.
    const meta = metaMap.get(item.hash) || {};
    
    return {
      hash: item.hash,
      name: item.name,
      full: item.full,
      clip: item.clip,
      thumb: item.thumb,
      tags: meta.tags || item.tags || [],
      rating: meta.rating || 'safe',
      date: meta.date || null,
      source: meta.source || ''
    };
  });
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
  }
};