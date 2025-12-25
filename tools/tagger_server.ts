import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { extname, join, resolve } from "https://deno.land/std@0.224.0/path/mod.ts";

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const root = resolve(Deno.cwd());

async function sha256Hex(data: Uint8Array) {
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function readJson(path: string) {
  const raw = await Deno.readTextFile(path);
  return JSON.parse(raw);
}

async function writeJson(path: string, data: unknown) {
  await Deno.writeTextFile(path, JSON.stringify(data, null, 2));
}

async function listRawImages(rawDir: string) {
  const entries = [];
  for await (const entry of Deno.readDir(rawDir)) {
    if (!entry.isFile) continue;
    const ext = extname(entry.name).toLowerCase();
    if (!IMAGE_EXTS.has(ext)) continue;
    entries.push(entry.name);
  }
  return entries.sort();
}

async function buildState(rawDir: string, encDir: string) {
  const manifestPath = join(encDir, "manifest.json");
  const metadataPath = join(encDir, "metadata.json");
  let metadata = { items: [] };
  try {
    metadata = await readJson(metadataPath);
  } catch {
    metadata = { items: [] };
  }
  const metadataById = new Map(
    (metadata.items ?? []).map((item: { id: string }) => [item.id, item]),
  );
  const rawFiles = await listRawImages(rawDir);
  const items = [];
  for (const file of rawFiles) {
    const fullPath = join(rawDir, file);
    const bytes = await Deno.readFile(fullPath);
    const stat = await Deno.stat(fullPath);
    const createdAt = stat.birthtime ?? stat.mtime ?? new Date();
    const hash = await sha256Hex(bytes);
    const existing = metadataById.get(hash);
    items.push({
      id: hash,
      name: file.replace(extname(file), ""),
      file,
      tags: existing?.tags ?? [],
      rating: existing?.rating ?? "safe",
      source: existing?.source ?? "",
      date: existing?.date ?? createdAt.toISOString(),
    });
  }
  return { manifestPath, metadataPath, items };
}

async function handleState(url: URL) {
  const rawDir = resolve(root, url.searchParams.get("rawDir") ?? "./raw");
  const encDir = resolve(root, url.searchParams.get("encDir") ?? "./enc");
  const state = await buildState(rawDir, encDir);
  return new Response(JSON.stringify({ items: state.items }, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
}

async function handleMetadata(request: Request) {
  const body = await request.json();
  const encDir = resolve(root, body.encDir ?? "./enc");
  const metadataPath = join(encDir, "metadata.json");
  await writeJson(metadataPath, { items: body.items ?? [] });
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
}

async function handleBuild(request: Request) {
  const body = await request.json();
  const rawDir = resolve(root, body.rawDir ?? "./raw");
  const encDir = resolve(root, body.encDir ?? "./enc");
  const key = body.key ?? "";
  if (!key) {
    return new Response(JSON.stringify({ message: "Missing key." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const command = new Deno.Command("node", {
    args: ["tools/build_gallery.mjs", "--raw_dir", rawDir, "--out_dir", encDir, "--key", key],
    cwd: root,
  });
  const { stdout, stderr } = await command.output();
  const message = new TextDecoder().decode(stdout) || new TextDecoder().decode(stderr);
  return new Response(JSON.stringify({ message: message.trim() }), {
    headers: { "Content-Type": "application/json" },
  });
}

async function handleStatic(pathname: string) {
  if (pathname === "/") {
    const html = await Deno.readTextFile(join(root, "tools/tagger.html"));
    return new Response(html, { headers: { "Content-Type": "text/html" } });
  }
  if (pathname.startsWith("/raw/")) {
    const filePath = join(root, pathname);
    const file = await Deno.readFile(filePath);
    return new Response(file);
  }
  return new Response("Not found", { status: 404 });
}

console.log("PBooru tagger running on http://localhost:8787");
serve(async (request) => {
  const url = new URL(request.url);
  if (url.pathname === "/api/state") return handleState(url);
  if (url.pathname === "/api/metadata" && request.method === "POST") {
    return handleMetadata(request);
  }
  if (url.pathname === "/api/build" && request.method === "POST") {
    return handleBuild(request);
  }
  return handleStatic(url.pathname);
}, { port: 8787 });
