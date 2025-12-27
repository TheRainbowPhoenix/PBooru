import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { extname, join, resolve, basename } from "https://deno.land/std@0.224.0/path/mod.ts";
import { crypto } from "https://deno.land/std@0.224.0/crypto/mod.ts";

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const root = resolve(Deno.cwd());

// --- Helpers ---

async function fileExists(path: string) {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}

async function sha256Hex(data: Uint8Array) {
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function readJson(path: string) {
  try {
    const raw = await Deno.readTextFile(path);
    return JSON.parse(raw);
  } catch {
    return { items: [] };
  }
}

async function writeJson(path: string, data: unknown) {
  await Deno.writeTextFile(path, JSON.stringify(data, null, 2));
}

// --- Core Logic ---

async function buildState(rawDir: string, encDir: string) {
  const metadataPath = join(encDir, "metadata.json");
  const rawAbs = resolve(root, rawDir);

  // 1. Load Existing Metadata
  const metadata = await readJson(metadataPath);
  const metaByHash = new Map(metadata.items.map((it: any) => [it.hash, it]));
  // Fallback map by name (legacy support or if hash changed slightly but name didn't)
  const metaByName = new Map(metadata.items.map((it: any) => [it.name, it]));

  const items = [];
  
  if (!(await fileExists(rawAbs))) {
    throw new Error(`Raw directory not found: ${rawAbs}`);
  }

  // 2. Scan Raw Files
  for await (const entry of Deno.readDir(rawAbs)) {
    if (!entry.isFile) continue;
    const ext = extname(entry.name).toLowerCase();
    if (!IMAGE_EXTS.has(ext)) continue;

    const fullPath = join(rawAbs, entry.name);
    
    // We MUST calculate hash here to match the "build" script logic.
    // Otherwise, we can't reliably link to existing metadata.
    const bytes = await Deno.readFile(fullPath);
    const hash = await sha256Hex(bytes);
    
    const stat = await Deno.stat(fullPath);
    const createdAt = stat.birthtime ?? stat.mtime ?? new Date();
    const name = basename(entry.name, ext); // filename without ext

    // 3. Merge Strategy
    // Try Hash first, then Name
    const existing = metaByHash.get(hash) ?? metaByName.get(name);

    items.push({
      hash, // Strict new structure uses 'hash'
      name,
      file: entry.name, // Used by frontend to load image preview
      tags: existing?.tags ?? [],
      rating: existing?.rating ?? "safe",
      source: existing?.source ?? "",
      date: existing?.date ?? createdAt.toISOString(),
    });
  }

  // Sort by date desc
  items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return { items };
}

// --- Handlers ---

async function handleState(url: URL) {
  try {
    const rawDir = url.searchParams.get("rawDir") ?? "raw";
    const encDir = url.searchParams.get("encDir") ?? "enc";
    const state = await buildState(rawDir, encDir);
    return new Response(JSON.stringify(state), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(e.message, { status: 500 });
  }
}

async function handleMetadataSave(req: Request) {
  try {
    const body = await req.json();
    const encDir = resolve(root, body.encDir ?? "enc");
    const metadataPath = join(encDir, "metadata.json");

    // We only save the specific fields required by the new structure
    const cleanItems = (body.items ?? []).map((it: any) => ({
      hash: it.hash,
      name: it.name,
      tags: Array.isArray(it.tags) ? it.tags : [],
      rating: it.rating ?? "safe",
      source: it.source ?? "",
      date: it.date
    }));

    await writeJson(metadataPath, { items: cleanItems });
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (e: any) {
    return new Response(e.message, { status: 500 });
  }
}

async function handleBuild(req: Request) {
  try {
    const body = await req.json();
    const rawDir = body.rawDir ?? "raw";
    const encDir = body.encDir ?? "enc";
    const key = body.key ?? "";

    if (!key) throw new Error("Key is required");

    console.log("Spawning build process...");
    
    const cmd = new Deno.Command("node", {
      args: [
        "tools/build_gallery.mjs", // Assuming build_gallery.mjs is in tools/
        "--raw_dir", rawDir,
        "--out_dir", encDir,
        "--key", key
      ],
      cwd: root,
    });

    const { stdout, stderr, code } = await cmd.output();
    const output = new TextDecoder().decode(stdout) + "\n" + new TextDecoder().decode(stderr);
    
    if (code !== 0) throw new Error(`Build failed:\n${output}`);
    
    return new Response(JSON.stringify({ message: "Build complete!\n" + output }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ message: e.message }), { status: 500 });
  }
}

async function handleStatic(pathname: string) {
  // Serve the HTML template
  if (pathname === "/" || pathname === "/index.html") {
    try {
      const html = await Deno.readTextFile(join(root, "tools/tagger.html"));
      return new Response(html, { headers: { "Content-Type": "text/html" } });
    } catch {
      return new Response("tagger.html not found in tools/", { status: 404 });
    }
  }

  // Serve Raw Images for Preview
  if (pathname.startsWith("/raw/")) {
    try {
      // Security: simple preventing of going up directories
      const safePath = pathname.replace("/raw/", "").replace(/\.\./g, "");
      const filePath = join(root, "raw", safePath); // Assuming default raw dir for preview
      const file = await Deno.readFile(filePath);
      return new Response(file);
    } catch {
      return new Response("Image not found", { status: 404 });
    }
  }
  
  return new Response("Not Found", { status: 404 });
}

// --- Server Entry ---

console.log("PBooru Tagger running on http://localhost:8787");

serve(async (req) => {
  const url = new URL(req.url);

  if (url.pathname === "/api/state") return handleState(url);
  
  if (req.method === "POST") {
    if (url.pathname === "/api/metadata") return handleMetadataSave(req);
    if (url.pathname === "/api/build") return handleBuild(req);
  }

  return handleStatic(url.pathname);
}, { port: 8787 });