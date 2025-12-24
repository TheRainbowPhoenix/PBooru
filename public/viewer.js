function xorBytes(data, keyBytes) {
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    out[i] = data[i] ^ keyBytes[i % keyBytes.length];
  }
  return out;
}

function extToMime(ext) {
  switch (ext) {
    case "jpg":
    case "jpeg": return "image/jpeg";
    case "png": return "image/png";
    case "webp": return "image/webp";
    case "gif": return "image/gif";
    default: return "application/octet-stream";
  }
}

async function fetchJson(url) {
  const r = await fetch(url, { cache: "no-cache" });
  if (!r.ok) throw new Error(`Failed ${url}: ${r.status}`);
  return r.json();
}

async function fetchArrayBuffer(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Failed ${url}: ${r.status}`);
  return r.arrayBuffer();
}

const statusEl = document.getElementById("status");
const gridEl = document.getElementById("grid");
const filterBarEl = document.getElementById("filterBar");
const tagsPanelEl = document.getElementById("tagsPanel");
const galleryPanelEl = document.getElementById("galleryPanel");
const connectionPanelEl = document.getElementById("connectionPanel");
const loadingPanelEl = document.getElementById("loadingPanel");
const tagDirectoryEl = document.getElementById("tagDirectory");
const openTagsBtn = document.getElementById("openTags");
const openPostsBtn = document.getElementById("openPosts");
const openConnectionBtn = document.getElementById("openConnection");
const baseUrlInput = document.getElementById("baseUrl");
const keyInput = document.getElementById("key");
const loadBtn = document.getElementById("load");
const cacheName = "pbooru-decrypted-v1";
const cacheUrlPrefix = "https://cache.pbooru.local/";
const modalEl = document.getElementById("modal");
const modalTitleEl = document.getElementById("modalTitle");
const modalImageEl = document.getElementById("modalImage");
const modalMetaEl = document.getElementById("modalMeta");
const tagSectionsEl = document.getElementById("tagSections");
const imageStageEl = document.getElementById("imageStage");
const progressBarEl = document.getElementById("progressBar");
const progressFillEl = document.getElementById("progressFill");
const loadFullBtn = document.getElementById("loadFull");
const copyLinkBtn = document.getElementById("copyLink");
const modalCloseBtn = document.getElementById("modalClose");

const variantFallbacks = {
  thumb: "clip",
  clip: "full",
};

function normalizeManifestItem(item) {
  if (item.full || item.thumb || item.clip) return item;
  return {
    id: item.id,
    name: item.name,
    full: { bin: item.bin, ext: item.ext, bytes: item.bytes, sha256: item.sha256 },
    clip: { bin: item.bin, ext: item.ext },
    thumb: { bin: item.bin, ext: item.ext },
    tags: item.tags ?? [],
  };
}

function pickVariant(item, variant) {
  const normalized = normalizeManifestItem(item);
  if (normalized[variant]) return normalized[variant];
  const fallback = variantFallbacks[variant];
  return fallback ? pickVariant(normalized, fallback) : normalized.full;
}

function buildEncUrl(baseUrl, bin) {
  return `${baseUrl}/${bin}`;
}

async function fetchWithProgress(url, onProgress) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Failed ${url}: ${r.status}`);
  const contentLength = r.headers.get("content-length");
  if (!r.body || !contentLength) {
    const buf = await r.arrayBuffer();
    onProgress(1);
    return buf;
  }
  const total = Number(contentLength);
  let loaded = 0;
  const reader = r.body.getReader();
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
}

async function decryptVariant(item, variant, keyBytes, baseUrl, progressCb = null) {
  const variantData = pickVariant(item, variant);
  const cacheKey = `pbooru:${variant}:${item.id}:${variantData.ext}`;
  const memBlob = blobCache.get(cacheKey);
  if (memBlob) {
    return URL.createObjectURL(memBlob);
  }
  const cachedBlob = await getCachedBlob(cacheKey);
  if (cachedBlob) {
    blobCache.set(cacheKey, cachedBlob);
    return URL.createObjectURL(cachedBlob);
  }
  const binUrl = buildEncUrl(baseUrl, variantData.bin);
  const buf = progressCb ? await fetchWithProgress(binUrl, progressCb) : await fetchArrayBuffer(binUrl);
  const enc = new Uint8Array(buf);
  const dec = xorBytes(enc, keyBytes);
  const blob = new Blob([dec], { type: extToMime(variantData.ext) });
  await setCachedBlob(cacheKey, blob);
  blobCache.set(cacheKey, blob);
  return URL.createObjectURL(blob);
}

function setProgress(value) {
  if (value == null) {
    progressBarEl.style.display = "none";
    return;
  }
  progressBarEl.style.display = "block";
  progressFillEl.style.width = `${Math.round(value * 100)}%`;
}

function openModal() {
  modalEl.classList.add("active");
}

function renderTagSection(title, tags) {
  if (!tags.length) return;
  const section = document.createElement("div");
  section.className = "tag-section";

  const heading = document.createElement("h3");
  heading.textContent = title;
  section.appendChild(heading);

  const list = document.createElement("ul");
  list.className = "tag-list";
  tags.forEach((tag) => {
    const item = document.createElement("li");
    item.textContent = tag.label;
    item.addEventListener("click", () => {
      closeModal();
      applyTagFilter(tag.filter);
    });
    list.appendChild(item);
  });
  section.appendChild(list);
  tagSectionsEl.appendChild(section);
}

function renderTags(tags) {
  tagSectionsEl.innerHTML = "";
  const artistTags = [];
  const characterTags = [];
  const otherTags = [];

  tags.forEach((tag) => {
    if (tag.startsWith("artist:")) {
      artistTags.push({ label: tag.replace(/^artist:/, ""), filter: tag });
    } else if (tag.startsWith("character:")) {
      characterTags.push({ label: tag.replace(/^character:/, ""), filter: tag });
    } else {
      otherTags.push({ label: tag, filter: tag });
    }
  });

  artistTags.sort((a, b) => a.label.localeCompare(b.label));
  characterTags.sort((a, b) => a.label.localeCompare(b.label));
  otherTags.sort((a, b) => a.label.localeCompare(b.label));

  renderTagSection("Artist", artistTags);
  renderTagSection("Character", characterTags);
  renderTagSection("Tags", otherTags);
}

function closeModal() {
  modalEl.classList.remove("active");
  imageStageEl.classList.remove("loading");
  modalImageEl.src = "";
  modalTitleEl.textContent = "";
  modalMetaEl.textContent = "";
  tagSectionsEl.innerHTML = "";
  setProgress(null);
  currentItem = null;
  fullLoadInFlight = false;
  fullLoaded = false;
  loadFullBtn.textContent = "Load full";
  loadFullBtn.disabled = false;
  if (fullAutoTimer) {
    clearTimeout(fullAutoTimer);
    fullAutoTimer = null;
  }
  for (const url of modalUrls) {
    URL.revokeObjectURL(url);
  }
  modalUrls.clear();
  if (location.hash) {
    history.replaceState(null, "", location.pathname + location.search);
  }
}

let currentItem = null;
let currentKeyBytes = null;
let currentBaseUrl = null;
let currentMetadataById = new Map();
let currentItems = [];
let currentFilterTag = null;
const blobCache = new Map();
const modalUrls = new Set();
let fullAutoTimer = null;
let fullLoadInFlight = false;
let fullLoaded = false;

function toCacheUrl(cacheKey) {
  return `${cacheUrlPrefix}${encodeURIComponent(cacheKey)}`;
}

async function getCachedBlob(cacheKey) {
  if (!("caches" in window)) return null;
  const cache = await caches.open(cacheName);
  const cached = await cache.match(toCacheUrl(cacheKey));
  if (!cached) return null;
  return cached.blob();
}

async function hasCachedBlob(cacheKey) {
  if (blobCache.has(cacheKey)) return true;
  if (!("caches" in window)) return false;
  const cache = await caches.open(cacheName);
  const cached = await cache.match(toCacheUrl(cacheKey));
  return Boolean(cached);
}

async function setCachedBlob(cacheKey, blob) {
  if (!("caches" in window)) return;
  const cache = await caches.open(cacheName);
  await cache.put(toCacheUrl(cacheKey), new Response(blob));
}

function applyTagFilter(tag) {
  currentFilterTag = tag;
  renderFilterPill();
  showGalleryPanel();
  renderGrid();
}

function renderFilterPill() {
  filterBarEl.innerHTML = "";
  if (!currentFilterTag) return;
  const pill = document.createElement("div");
  pill.className = "filter-pill";
  pill.textContent = currentFilterTag;
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.textContent = "×";
  closeBtn.addEventListener("click", () => {
    currentFilterTag = null;
    renderFilterPill();
    renderGrid();
  });
  pill.appendChild(closeBtn);
  filterBarEl.appendChild(pill);
}

function showTagsPanel() {
  tagsPanelEl.classList.remove("hidden");
  galleryPanelEl.classList.add("hidden");
  connectionPanelEl.classList.add("hidden");
  loadingPanelEl.classList.add("hidden");
}

function showGalleryPanel() {
  tagsPanelEl.classList.add("hidden");
  galleryPanelEl.classList.remove("hidden");
  connectionPanelEl.classList.add("hidden");
  loadingPanelEl.classList.add("hidden");
}

function showConnectionPanel() {
  tagsPanelEl.classList.add("hidden");
  galleryPanelEl.classList.add("hidden");
  connectionPanelEl.classList.remove("hidden");
  loadingPanelEl.classList.add("hidden");
}

function showLoadingPanel() {
  tagsPanelEl.classList.add("hidden");
  galleryPanelEl.classList.add("hidden");
  connectionPanelEl.classList.add("hidden");
  loadingPanelEl.classList.remove("hidden");
}

function buildTagIndex() {
  const counts = new Map();
  currentItems.forEach((item) => {
    const tags = currentMetadataById.get(item.id)?.tags ?? item.tags ?? [];
    tags.forEach((tag) => {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    });
  });
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function renderTagDirectory() {
  tagDirectoryEl.innerHTML = "";
  const tags = buildTagIndex();
  tags.forEach(([tag, count]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `${tag} (${count})`;
    button.addEventListener("click", () => {
      applyTagFilter(tag);
    });
    tagDirectoryEl.appendChild(button);
  });
}

async function renderGrid() {
  gridEl.innerHTML = "";
  const itemsToShow = currentFilterTag
    ? currentItems.filter((item) => {
        const tags = currentMetadataById.get(item.id)?.tags ?? item.tags ?? [];
        return tags.includes(currentFilterTag);
      })
    : currentItems;

  const concurrency = 6;
  let idx = 0;

  async function worker() {
    while (idx < itemsToShow.length) {
      const item = itemsToShow[idx++];
      const objUrl = await decryptVariant(item, "thumb", currentKeyBytes, currentBaseUrl);

      const card = document.createElement("div");
      card.className = "card";
      card.dataset.id = item.id;

      const skeleton = document.createElement("div");
      skeleton.className = "thumb-skeleton";

      const img = document.createElement("img");
      img.loading = "lazy";
      img.src = objUrl;
      img.alt = item.name ?? item.id;
      img.addEventListener("load", () => {
        card.classList.remove("loading");
        skeleton.remove();
      });

      const info = document.createElement("div");
      info.className = "card-info";
      const tags = currentMetadataById.get(item.id)?.tags ?? item.tags ?? [];
      const details = document.createElement("div");
      const bytesKb = (item.full.bytes / 1024).toFixed(1);
      details.textContent = `${item.full.width ?? "?"}x${item.full.height ?? "?"}, ${bytesKb}KB ${item.full.ext.toUpperCase()}`;
      info.appendChild(details);

      if (tags.length) {
        const tagWrap = document.createElement("div");
        tagWrap.className = "card-tags";
        tags.slice(0, 8).forEach((tag) => {
          const pill = document.createElement("span");
          pill.className = "tag-pill";
          pill.textContent = tag;
          tagWrap.appendChild(pill);
        });
        if (tags.length > 8) {
          const more = document.createElement("span");
          more.className = "tag-pill";
          more.textContent = `${tags.length - 8} more`;
          tagWrap.appendChild(more);
        }
        info.appendChild(tagWrap);
      }

      card.classList.add("loading");
      card.appendChild(skeleton);
      card.addEventListener("click", async () => {
        await showItem(item, tags);
      });

      gridEl.appendChild(card);
      card.appendChild(img);
      card.appendChild(info);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
}

modalCloseBtn.addEventListener("click", closeModal);
openTagsBtn.addEventListener("click", () => {
  renderTagDirectory();
  showTagsPanel();
});
openPostsBtn.addEventListener("click", () => {
  showGalleryPanel();
});
openConnectionBtn.addEventListener("click", () => {
  showConnectionPanel();
});

const defaultBaseUrl = "https://cdn.jsdelivr.net/gh/TheRainbowPhoenix/PBooru@master/enc/";
const defaultKey = "phoebefox";
const savedBaseUrl = localStorage.getItem("pbooru.baseUrl") ?? defaultBaseUrl;
const savedKey = localStorage.getItem("pbooru.key") ?? defaultKey;
baseUrlInput.value = savedBaseUrl;
keyInput.value = savedKey;

showLoadingPanel();

const loadConf = async () => {
  gridEl.innerHTML = "";
  statusEl.textContent = "Loading manifest…";
  closeModal();

  const baseUrl = baseUrlInput.value.replace(/\/+$/, "");
  const key = keyInput.value;
  if (!baseUrl || !key) {
    statusEl.textContent = "Please fill base URL and key.";
    return;
  }
  showLoadingPanel();
  const keyBytes = new TextEncoder().encode(key);
  currentKeyBytes = keyBytes;
  currentBaseUrl = baseUrl;
  localStorage.setItem("pbooru.baseUrl", baseUrl);
  localStorage.setItem("pbooru.key", key);

  try {
    const manifestUrl = `${baseUrl}/manifest.json`;
    const manifest = await fetchJson(manifestUrl);
    const metadataUrl = `${baseUrl}/metadata.json`;
    let metadata = { items: [] };
    try {
      metadata = await fetchJson(metadataUrl);
    } catch (error) {
      console.warn("No metadata.json found, continuing.");
    }

    const metadataById = new Map((metadata.items ?? []).map((item) => [item.id, item]));
    currentMetadataById = metadataById;
    currentItems = manifest.items.map(normalizeManifestItem);
    currentFilterTag = null;

    statusEl.textContent = `Found ${currentItems.length} items. Loading…`;
    renderFilterPill();
    showGalleryPanel();
    await renderGrid();
    statusEl.textContent = "Done.";

    const hashId = decodeURIComponent(location.hash.replace(/^#/, ""));
    if (hashId) {
      const selected = currentItems.find((item) => item.id === hashId);
      if (selected) {
        const tags = metadataById.get(selected.id)?.tags ?? selected.tags ?? [];
        await showItem(selected, tags);
      }
    }
  } catch (e) {
    console.error(e);
    statusEl.textContent = `Error: ${e.message ?? e}`;
    showConnectionPanel();
  }
}

(async function() {
  await loadConf();
}());

copyLinkBtn.addEventListener("click", async () => {
  if (!currentItem) return;
  const url = `${location.origin}${location.pathname}#${encodeURIComponent(currentItem.id)}`;
  await navigator.clipboard.writeText(url);
  copyLinkBtn.textContent = "Copied!";
  setTimeout(() => {
    copyLinkBtn.textContent = "Copy link";
  }, 1500);
});

loadBtn.addEventListener("click", loadConf);

async function showItem(item, tags) {
  if (!currentKeyBytes || !currentBaseUrl) return;
  currentItem = item;
  fullLoadInFlight = false;
  fullLoaded = false;
  location.hash = encodeURIComponent(item.id);
  modalTitleEl.textContent = item.name || "Untitled";
  const metadata = currentMetadataById.get(item.id);
  const rating = metadata?.rating ? `Rating: ${metadata.rating}` : null;
  const source = metadata?.source ? `Source: ${metadata.source}` : null;
  const metaParts = [rating, source].filter(Boolean);
  modalMetaEl.textContent = metaParts.length ? metaParts.join(" · ") : `ID: ${item.id}`;
  renderTags(metadata?.tags ?? tags ?? []);
  openModal();
  imageStageEl.classList.add("loading");
  setProgress(null);

  const clipUrl = await decryptVariant(item, "clip", currentKeyBytes, currentBaseUrl);
  modalUrls.add(clipUrl);
  modalImageEl.src = clipUrl;
  imageStageEl.classList.remove("loading");

  const fullCacheKey = `pbooru:full:${item.id}:${item.full.ext}`;
  if (await hasCachedBlob(fullCacheKey)) {
    fullLoaded = true;
    const fullUrl = await decryptVariant(item, "full", currentKeyBytes, currentBaseUrl);
    modalUrls.add(fullUrl);
    modalImageEl.src = fullUrl;
    loadFullBtn.textContent = "Loaded";
    loadFullBtn.disabled = true;
  } else {
    loadFullBtn.textContent = "Load full";
    loadFullBtn.disabled = false;
  }

  const loadFull = async () => {
    if (fullLoadInFlight || fullLoaded) return;
    if (!currentItem) return;
    fullLoadInFlight = true;
    loadFullBtn.textContent = "Loading...";
    loadFullBtn.disabled = true;
    imageStageEl.classList.add("loading");
    setProgress(0);
    const fullUrl = await decryptVariant(
      item,
      "full",
      currentKeyBytes,
      currentBaseUrl,
      (progress) => setProgress(progress),
    );
    modalUrls.add(fullUrl);
    modalImageEl.src = fullUrl;
    imageStageEl.classList.remove("loading");
    setProgress(1);
    setTimeout(() => setProgress(null), 800);
    fullLoaded = true;
    fullLoadInFlight = false;
    loadFullBtn.textContent = "Loaded";
    loadFullBtn.disabled = true;
  };
  loadFullBtn.onclick = loadFull;
  if (fullAutoTimer) clearTimeout(fullAutoTimer);
  fullAutoTimer = setTimeout(() => {
    if (currentItem?.id === item.id) {
      loadFull();
    }
  }, 4000);
}