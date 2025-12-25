<script>
  import { onMount } from "svelte";
  import PrimaryButton from "$lib/components/PrimaryButton.svelte";

  const defaultBaseUrl = "https://cdn.jsdelivr.net/gh/TheRainbowPhoenix/PBooru@master/enc/";
  const defaultKey = "phoebefox";
  const cacheName = "pbooru-decrypted-v1";
  const cacheUrlPrefix = "https://cache.pbooru.local/";

  let panel = "loading";
  let baseUrl = "";
  let key = "";
  let status = "";
  let items = [];
  let metadataById = new Map();
  let filterTag = null;
  let modalOpen = false;
  let modalItem = null;
  let modalImageSrc = "";
  let modalMeta = "";
  let modalTags = { artists: [], characters: [], others: [] };
  let showProgress = false;
  let progressValue = 0;
  let fullLoadInFlight = false;
  let fullLoaded = false;
  let fullAutoTimer = null;

  const blobCache = new Map();
  const modalUrls = new Set();
  const thumbUrls = new Map();

  const toCacheUrl = (cacheKey) => `${cacheUrlPrefix}${encodeURIComponent(cacheKey)}`;

  const normalizeManifestItem = (item) => {
    if (item.full || item.thumb || item.clip) return item;
    return {
      id: item.id,
      name: item.name,
      full: { bin: item.bin, ext: item.ext, bytes: item.bytes, sha256: item.sha256 },
      clip: { bin: item.bin, ext: item.ext },
      thumb: { bin: item.bin, ext: item.ext },
      tags: item.tags ?? [],
    };
  };

  const fetchJson = async (url) => {
    const response = await fetch(url, { cache: "no-cache" });
    if (!response.ok) throw new Error(`Failed ${url}: ${response.status}`);
    return response.json();
  };

  const fetchArrayBuffer = async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed ${url}: ${response.status}`);
    return response.arrayBuffer();
  };

  const fetchWithProgress = async (url, onProgress) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed ${url}: ${response.status}`);
    const contentLength = response.headers.get("content-length");
    if (!response.body || !contentLength) {
      const buf = await response.arrayBuffer();
      onProgress(1);
      return buf;
    }
    const total = Number(contentLength);
    let loaded = 0;
    const reader = response.body.getReader();
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.length;
      onProgress(Math.min(loaded / total, 1));
    }
    const buffer = new Uint8Array(loaded);
    let offset = 0;
    for (const chunk of chunks) {
      buffer.set(chunk, offset);
      offset += chunk.length;
    }
    return buffer.buffer;
  };

  const xorBytes = (data, keyBytes) => {
    const out = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) {
      out[i] = data[i] ^ keyBytes[i % keyBytes.length];
    }
    return out;
  };

  const extToMime = (ext) => {
    switch (ext) {
      case "jpg":
      case "jpeg":
        return "image/jpeg";
      case "png":
        return "image/png";
      case "webp":
        return "image/webp";
      case "gif":
        return "image/gif";
      default:
        return "application/octet-stream";
    }
  };

  const variantFallbacks = {
    thumb: "clip",
    clip: "full",
  };

  const pickVariant = (item, variant) => {
    const normalized = normalizeManifestItem(item);
    if (normalized[variant]) return normalized[variant];
    const fallback = variantFallbacks[variant];
    return fallback ? pickVariant(normalized, fallback) : normalized.full;
  };

  const buildEncUrl = (root, bin) => `${root}/${bin}`;

  const getCachedBlob = async (cacheKey) => {
    if (!("caches" in window)) return null;
    const cache = await caches.open(cacheName);
    const cached = await cache.match(toCacheUrl(cacheKey));
    if (!cached) return null;
    return cached.blob();
  };

  const setCachedBlob = async (cacheKey, blob) => {
    if (!("caches" in window)) return;
    const cache = await caches.open(cacheName);
    await cache.put(toCacheUrl(cacheKey), new Response(blob));
  };

  const hasCachedBlob = async (cacheKey) => {
    if (blobCache.has(cacheKey)) return true;
    if (!("caches" in window)) return false;
    const cache = await caches.open(cacheName);
    return Boolean(await cache.match(toCacheUrl(cacheKey)));
  };

  const decryptVariant = async (item, variant, keyBytes, rootUrl, progressCb = null) => {
    const variantData = pickVariant(item, variant);
    const cacheKey = `pbooru:${variant}:${item.id}:${variantData.ext}`;
    const memBlob = blobCache.get(cacheKey);
    if (memBlob) return URL.createObjectURL(memBlob);
    const cachedBlob = await getCachedBlob(cacheKey);
    if (cachedBlob) {
      blobCache.set(cacheKey, cachedBlob);
      return URL.createObjectURL(cachedBlob);
    }
    const binUrl = buildEncUrl(rootUrl, variantData.bin);
    const buf = progressCb ? await fetchWithProgress(binUrl, progressCb) : await fetchArrayBuffer(binUrl);
    const enc = new Uint8Array(buf);
    const dec = xorBytes(enc, keyBytes);
    const blob = new Blob([dec], { type: extToMime(variantData.ext) });
    await setCachedBlob(cacheKey, blob);
    blobCache.set(cacheKey, blob);
    return URL.createObjectURL(blob);
  };

  const showPanel = (name) => {
    panel = name;
  };

  const buildTagIndex = () => {
    const counts = new Map();
    items.forEach((item) => {
      const tags = metadataById.get(item.id)?.tags ?? item.tags ?? [];
      tags.forEach((tag) => {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      });
    });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  };

  const renderModalTags = (tags) => {
    const artists = [];
    const characters = [];
    const others = [];
    tags.forEach((tag) => {
      if (tag.startsWith("artist:")) {
        artists.push({ label: tag.replace(/^artist:/, ""), filter: tag });
      } else if (tag.startsWith("character:")) {
        characters.push({ label: tag.replace(/^character:/, ""), filter: tag });
      } else {
        others.push({ label: tag, filter: tag });
      }
    });
    artists.sort((a, b) => a.label.localeCompare(b.label));
    characters.sort((a, b) => a.label.localeCompare(b.label));
    others.sort((a, b) => a.label.localeCompare(b.label));
    modalTags = { artists, characters, others };
  };

  const resetModal = () => {
    modalOpen = false;
    modalItem = null;
    modalImageSrc = "";
    modalMeta = "";
    modalTags = { artists: [], characters: [], others: [] };
    showProgress = false;
    progressValue = 0;
    fullLoadInFlight = false;
    fullLoaded = false;
    for (const url of modalUrls) {
      URL.revokeObjectURL(url);
    }
    modalUrls.clear();
    if (fullAutoTimer) {
      clearTimeout(fullAutoTimer);
      fullAutoTimer = null;
    }
    if (location.hash) {
      history.replaceState(null, "", location.pathname + location.search);
    }
  };

  const applyFilter = (tag) => {
    filterTag = tag;
    showPanel("posts");
  };

  const clearFilter = () => {
    filterTag = null;
  };

  const loadGallery = async () => {
    status = "Loading manifest…";
    showPanel("loading");
    const rootUrl = baseUrl.replace(/\/+$/, "");
    if (!rootUrl || !key) {
      status = "Please fill base URL and key.";
      showPanel("connection");
      return;
    }
    localStorage.setItem("pbooru.baseUrl", rootUrl);
    localStorage.setItem("pbooru.key", key);
    try {
      const manifest = await fetchJson(`${rootUrl}/manifest.json`);
      let metadata = { items: [] };
      try {
        metadata = await fetchJson(`${rootUrl}/metadata.json`);
      } catch (error) {
        console.warn("No metadata.json found, continuing.");
      }
      metadataById = new Map((metadata.items ?? []).map((item) => [item.id, item]));
      items = manifest.items.map(normalizeManifestItem);
      status = "Done.";
      showPanel("posts");
      const hashId = decodeURIComponent(location.hash.replace(/^#/, ""));
      if (hashId) {
        const selected = items.find((item) => item.id === hashId);
        if (selected) {
          await openModal(selected);
        }
      }
    } catch (error) {
      console.error(error);
      status = `Error: ${error.message ?? error}`;
      showPanel("connection");
    }
  };

  const copyLink = async () => {
    if (!modalItem) return;
    const url = `${location.origin}${location.pathname}#${encodeURIComponent(modalItem.id)}`;
    await navigator.clipboard.writeText(url);
  };

  const openModal = async (item) => {
    resetModal();
    modalItem = item;
    modalOpen = true;
    location.hash = encodeURIComponent(item.id);
    modalImageSrc = "";
    fullLoadInFlight = false;
    fullLoaded = false;
    progressValue = 0;
    showProgress = false;
    const metadata = metadataById.get(item.id);
    const rating = metadata?.rating ? `Rating: ${metadata.rating}` : null;
    const date = metadata?.date ? `Date: ${metadata.date}` : null;
    const source = metadata?.source ? `Source: ${metadata.source}` : null;
    modalMeta = [date, rating, source].filter(Boolean).join(" · ");
    renderModalTags(metadata?.tags ?? item.tags ?? []);

    const keyBytes = new TextEncoder().encode(key);
    const rootUrl = baseUrl.replace(/\/+$/, "");
    const clipUrl = await decryptVariant(item, "clip", keyBytes, rootUrl);
    modalUrls.add(clipUrl);
    modalImageSrc = clipUrl;

    const fullCacheKey = `pbooru:full:${item.id}:${item.full.ext}`;
    if (await hasCachedBlob(fullCacheKey)) {
      fullLoaded = true;
      const fullUrl = await decryptVariant(item, "full", keyBytes, rootUrl);
      modalUrls.add(fullUrl);
      modalImageSrc = fullUrl;
    }

    if (fullAutoTimer) clearTimeout(fullAutoTimer);
    fullAutoTimer = setTimeout(() => {
      if (modalItem?.id === item.id && !fullLoaded) {
        loadFull(item);
      }
    }, 4000);
  };

  const loadFull = async (item) => {
    if (fullLoadInFlight || fullLoaded || !modalItem) return;
    fullLoadInFlight = true;
    showProgress = true;
    progressValue = 0;
    const keyBytes = new TextEncoder().encode(key);
    const rootUrl = baseUrl.replace(/\/+$/, "");
    const fullUrl = await decryptVariant(item, "full", keyBytes, rootUrl, (progress) => {
      progressValue = progress;
    });
    modalUrls.add(fullUrl);
    modalImageSrc = fullUrl;
    progressValue = 1;
    setTimeout(() => {
      showProgress = false;
    }, 800);
    fullLoaded = true;
    fullLoadInFlight = false;
  };

  const getThumbUrl = async (item) => {
    if (thumbUrls.has(item.id)) return thumbUrls.get(item.id);
    const keyBytes = new TextEncoder().encode(key);
    const rootUrl = baseUrl.replace(/\/+$/, "");
    const url = await decryptVariant(item, "thumb", keyBytes, rootUrl);
    thumbUrls.set(item.id, url);
    return url;
  };

  const getItemTags = (item) => metadataById.get(item.id)?.tags ?? item.tags ?? [];
  const getItemDate = (item) =>
    metadataById.get(item.id)?.date ?? item.date ?? "1970-01-01T00:00:00.000Z";

  const filteredItems = () => {
    if (!filterTag) return items;
    return items.filter((item) => getItemTags(item).includes(filterTag));
  };

  const groupItemsByDate = (list) => {
    const groups = new Map();
    list.forEach((item) => {
      const day = getItemDate(item).slice(0, 10);
      if (!groups.has(day)) groups.set(day, []);
      groups.get(day).push(item);
    });
    return Array.from(groups.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  };

  onMount(() => {
    baseUrl = localStorage.getItem("pbooru.baseUrl") ?? defaultBaseUrl;
    key = localStorage.getItem("pbooru.key") ?? defaultKey;
    loadGallery();
  });
</script>

<header>
  <h1>PB<span class="accent">ooru</span></h1>
  <div class="header-actions">
    <button class="menu-button" on:click={() => showPanel("posts")}>Posts</button>
    <button class="menu-button" on:click={() => showPanel("tags")}>Tags</button>
    <button class="menu-button" on:click={() => showPanel("connection")}>Connection</button>
  </div>
</header>

<main>
  {#if panel === "posts"}
    <section>
      <div id="filterBar">
        {#if filterTag}
          <div class="filter-pill">
            {filterTag}
            <button type="button" on:click={clearFilter}>×</button>
          </div>
        {/if}
      </div>
      {#each groupItemsByDate(filteredItems()) as [date, dayItems]}
        <div class="date-group" style="margin-bottom: 16px;">
          <h2>{date}</h2>
          <div class="grid">
            {#each dayItems as item (item.id)}
              <button
                class={`card ${modalItem?.id === item.id && modalOpen ? "active" : ""}`}
                type="button"
                on:click={() => openModal(item)}
              >
                {#await getThumbUrl(item)}
                  <div class="thumb-skeleton"></div>
                {:then url}
                  <img src={url} alt={item.name ?? item.id} loading="lazy" />
                {:catch}
                  <div class="thumb-skeleton"></div>
                {/await}
                <div class="card-info">
                  <div>
                    {item.full.width ?? "?"}x{item.full.height ?? "?"},
                    {(item.full.bytes / 1024).toFixed(1)}KB {item.full.ext.toUpperCase()}
                  </div>
                  <div class="card-tags">
                    {#each getItemTags(item).slice(0, 8) as tag}
                      <span class="tag-pill">{tag}</span>
                    {/each}
                    {#if getItemTags(item).length > 8}
                      <span class="tag-pill">{getItemTags(item).length - 8} more</span>
                    {/if}
                  </div>
                </div>
              </button>
            {/each}
          </div>
        </div>
      {/each}
    </section>
  {:else if panel === "tags"}
    <section class="panel">
      <h2>Tags</h2>
      <div class="tag-directory">
        {#each buildTagIndex() as [tag, count]}
          <button type="button" on:click={() => applyFilter(tag)}>
            {tag} ({count})
          </button>
        {/each}
      </div>
    </section>
  {:else if panel === "connection"}
    <section class="panel">
      <h2>Connection</h2>
      <label>
        Assets base URL (enc/ root with manifest.json):
        <input bind:value={baseUrl} placeholder={defaultBaseUrl} />
      </label>
      <label>
        XOR key:
        <input bind:value={key} placeholder="same key used in encode.py" />
      </label>
      <PrimaryButton text="Load gallery" on:click={loadGallery} />
      <p class="hint"><small>This is obfuscation only. If the browser can decrypt, users can extract it.</small></p>
      <div id="status">{status}</div>
    </section>
  {:else}
    <section class="panel">
      <h2>Loading database</h2>
      <div class="thumb-skeleton"></div>
      <div id="status">{status}</div>
    </section>
  {/if}
</main>

<div class={`modal ${modalOpen ? "active" : ""}`}>
  <div class="modal-content">
    <aside class="modal-sidebar">
      <button class="modal-close" type="button" on:click={resetModal}>Back</button>
      <div class="modal-title">{modalItem?.name ?? ""}</div>
      <div>
        {#if modalTags.artists.length}
          <div class="tag-section">
            <h3>Artist</h3>
            <ul class="tag-list">
              {#each modalTags.artists as tag}
                <li on:click={() => (resetModal(), applyFilter(tag.filter))}>{tag.label}</li>
              {/each}
            </ul>
          </div>
        {/if}
        {#if modalTags.characters.length}
          <div class="tag-section">
            <h3>Character</h3>
            <ul class="tag-list">
              {#each modalTags.characters as tag}
                <li on:click={() => (resetModal(), applyFilter(tag.filter))}>{tag.label}</li>
              {/each}
            </ul>
          </div>
        {/if}
        {#if modalTags.others.length}
          <div class="tag-section">
            <h3>Tags</h3>
            <ul class="tag-list">
              {#each modalTags.others as tag}
                <li on:click={() => (resetModal(), applyFilter(tag.filter))}>{tag.label}</li>
              {/each}
            </ul>
          </div>
        {/if}
      </div>
      <div>{modalMeta}</div>

      <div class="sidebar-footer">
        <button
          class="primary"
          type="button"
          class:fullLoaded
          disabled={fullLoadInFlight || fullLoaded}
          on:click={() => loadFull(modalItem)}
        >
          {#if fullLoadInFlight}
            Loading...
          {:else if fullLoaded}
            Loaded
          {:else}
            Load full
          {/if}
        </button>
        <button class="menu-button" type="button" on:click={copyLink}>Copy link</button>
      </div>
    </aside>
    <div class="modal-body">
      <div class={`image-stage ${showProgress ? "loading" : ""}`}>
        {#if modalImageSrc}
          <img src={modalImageSrc} alt={modalItem?.name ?? "Full image"} />
        {/if}
      </div>
      {#if showProgress}
        <div class="progress-bar-root">
          <div class="progress-bar">
            <div style={`width: ${Math.round(progressValue * 100)}%`}></div>
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>


<style>
  .fullLoaded {
    display: none;
    opacity: 0.1;
    pointer-events: none;
  }
</style>