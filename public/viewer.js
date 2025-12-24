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

document.getElementById("load").addEventListener("click", async () => {
  gridEl.innerHTML = "";
  statusEl.textContent = "Loading manifest…";

  const baseUrl = document.getElementById("baseUrl").value.replace(/\/+$/, "");
  const key = document.getElementById("key").value;
  if (!baseUrl || !key) {
    statusEl.textContent = "Please fill base URL and key.";
    return;
  }
  const keyBytes = new TextEncoder().encode(key);

  try {
    const manifestUrl = `${baseUrl}/manifest.json`;
    const manifest = await fetchJson(manifestUrl);

    statusEl.textContent = `Found ${manifest.items.length} items. Loading…`;

    // naive parallelism control
    const concurrency = 6;
    let idx = 0;

    async function worker() {
      while (idx < manifest.items.length) {
        const item = manifest.items[idx++];
        const binUrl = `${baseUrl}/enc/${item.bin}`;
        const buf = await fetchArrayBuffer(binUrl);
        const enc = new Uint8Array(buf);
        const dec = xorBytes(enc, keyBytes);

        const blob = new Blob([dec], { type: extToMime(item.ext) });
        const objUrl = URL.createObjectURL(blob);

        const card = document.createElement("div");
        card.className = "card";

        const img = document.createElement("img");
        img.loading = "lazy";
        img.src = objUrl;
        img.alt = item.id;

        const cap = document.createElement("div");
        cap.innerHTML = `<strong>${item.id}</strong><br/><small>${item.ext}, ${item.bytes} bytes</small>`;

        card.appendChild(img);
        card.appendChild(cap);
        gridEl.appendChild(card);
      }
    }

    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    statusEl.textContent = "Done.";
  } catch (e) {
    console.error(e);
    statusEl.textContent = `Error: ${e.message ?? e}`;
  }
});
