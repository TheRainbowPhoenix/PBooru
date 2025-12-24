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
  const binUrl = buildEncUrl(baseUrl, variantData.bin);
  const buf = progressCb ? await fetchWithProgress(binUrl, progressCb) : await fetchArrayBuffer(binUrl);
  const enc = new Uint8Array(buf);
  const dec = xorBytes(enc, keyBytes);
  const blob = new Blob([dec], { type: extToMime(variantData.ext) });
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
    item.textContent = tag;
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
      artistTags.push(tag.replace(/^artist:/, ""));
    } else if (tag.startsWith("character:")) {
      characterTags.push(tag.replace(/^character:/, ""));
    } else {
      otherTags.push(tag);
    }
  });

  artistTags.sort();
  characterTags.sort();
  otherTags.sort();

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
  for (const url of objectUrls) {
    URL.revokeObjectURL(url);
  }
  objectUrls.clear();
  if (location.hash) {
    history.replaceState(null, "", location.pathname + location.search);
  }
}

let currentItem = null;
let currentKeyBytes = null;
let currentBaseUrl = null;
let currentMetadataById = new Map();
const objectUrls = new Set();

modalCloseBtn.addEventListener("click", closeModal);

copyLinkBtn.addEventListener("click", async () => {
  if (!currentItem) return;
  const url = `${location.origin}${location.pathname}#${encodeURIComponent(currentItem.id)}`;
  await navigator.clipboard.writeText(url);
  copyLinkBtn.textContent = "Copied!";
  setTimeout(() => {
    copyLinkBtn.textContent = "Copy link";
  }, 1500);
});

document.getElementById("load").addEventListener("click", async () => {
  gridEl.innerHTML = "";
  statusEl.textContent = "Loading manifest…";
  closeModal();

  const baseUrl = document.getElementById("baseUrl").value.replace(/\/+$/, "");
  const key = document.getElementById("key").value;
  if (!baseUrl || !key) {
    statusEl.textContent = "Please fill base URL and key.";
    return;
  }
  const keyBytes = new TextEncoder().encode(key);
  currentKeyBytes = keyBytes;
  currentBaseUrl = baseUrl;

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
    const items = manifest.items.map(normalizeManifestItem);

    statusEl.textContent = `Found ${items.length} items. Loading…`;

    // naive parallelism control
    const concurrency = 6;
    let idx = 0;

    async function worker() {
      while (idx < items.length) {
        const item = items[idx++];
        const objUrl = await decryptVariant(item, "thumb", keyBytes, baseUrl);
        objectUrls.add(objUrl);

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

        const cap = document.createElement("div");
        const tags = metadataById.get(item.id)?.tags ?? item.tags ?? [];
        const title = item.name || item.id.slice(0, 12);
        cap.innerHTML = `<strong>${title}</strong><br/><small>${item.full.ext}, ${item.full.bytes} bytes</small><small class="hash">${item.id.slice(0, 12)}…</small>`;
        if (tags.length) {
          const tagEl = document.createElement("div");
          tagEl.className = "tags";
          tagEl.textContent = tags.join(", ");
          cap.appendChild(tagEl);
        }

        card.classList.add("loading");
        card.appendChild(skeleton);
        card.addEventListener("click", async () => {
          await showItem(item, tags);
        });

        card.appendChild(img);
        card.appendChild(cap);
        gridEl.appendChild(card);
      }
    }

    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    statusEl.textContent = "Done.";

    const hashId = decodeURIComponent(location.hash.replace(/^#/, ""));
    if (hashId) {
      const selected = items.find((item) => item.id === hashId);
      if (selected) {
        const tags = metadataById.get(selected.id)?.tags ?? selected.tags ?? [];
        await showItem(selected, tags);
      }
    }
  } catch (e) {
    console.error(e);
    statusEl.textContent = `Error: ${e.message ?? e}`;
  }
});

async function showItem(item, tags) {
  if (!currentKeyBytes || !currentBaseUrl) return;
  currentItem = item;
  location.hash = encodeURIComponent(item.id);
  modalTitleEl.textContent = item.name || item.id;
  const metadata = currentMetadataById.get(item.id);
  const rating = metadata?.rating ? `Rating: ${metadata.rating}` : null;
  const source = metadata?.source ? `Source: ${metadata.source}` : null;
  const metaParts = [rating, source].filter(Boolean);
  modalMetaEl.textContent = metaParts.length ? metaParts.join(" · ") : `Hash: ${item.id}`;
  renderTags(metadata?.tags ?? tags ?? []);
  openModal();
  imageStageEl.classList.add("loading");
  setProgress(null);

  const clipUrl = await decryptVariant(item, "clip", currentKeyBytes, currentBaseUrl);
  objectUrls.add(clipUrl);
  modalImageEl.src = clipUrl;
  imageStageEl.classList.remove("loading");

  loadFullBtn.onclick = async () => {
    if (!currentItem) return;
    imageStageEl.classList.add("loading");
    setProgress(0);
    const fullUrl = await decryptVariant(
      item,
      "full",
      currentKeyBytes,
      currentBaseUrl,
      (progress) => setProgress(progress),
    );
    objectUrls.add(fullUrl);
    modalImageEl.src = fullUrl;
    imageStageEl.classList.remove("loading");
    setProgress(1);
    setTimeout(() => setProgress(null), 800);
  };
}
