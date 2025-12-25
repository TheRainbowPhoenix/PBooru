#!/usr/bin/env node
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import sharp from "sharp";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

function parseArgs(argv) {
  const args = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : "true";
    args.set(key, value);
  }
  return args;
}

function xorBytes(buffer, keyBytes) {
  const out = Buffer.alloc(buffer.length);
  for (let i = 0; i < buffer.length; i += 1) {
    out[i] = buffer[i] ^ keyBytes[i % keyBytes.length];
  }
  return out;
}

function sha256Hex(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function formatForVariant(ext, variant) {
  if (variant === "full") return ext;
  if (ext === "gif") return "png";
  return ext;
}

function normalizeExt(ext) {
  return ext.toLowerCase().replace(".", "");
}

function buildVariantName(hash, ext, variant) {
  return `${variant}/${hash}.${ext}.bin`;
}

async function ensureDirs(outDir) {
  await fs.mkdir(path.join(outDir, "full"), { recursive: true });
  await fs.mkdir(path.join(outDir, "clip"), { recursive: true });
  await fs.mkdir(path.join(outDir, "thumb"), { recursive: true });
}

async function loadExistingMetadata(metadataPath) {
  try {
    const raw = await fs.readFile(metadataPath, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.items)) {
      return parsed;
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn(`Failed to read metadata.json: ${error.message}`);
    }
  }
  return { items: [] };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rawDir = args.get("raw_dir") ?? "raw";
  const outDir = args.get("out_dir") ?? "enc";
  const key = args.get("key");
  const thumbSize = Number(args.get("thumb_size") ?? "200");
  const clipSize = Number(args.get("clip_size") ?? "800");
  const manifestPath = args.get("manifest") ?? path.join(outDir, "manifest.json");
  const metadataPath = args.get("metadata") ?? path.join(outDir, "metadata.json");

  if (!key) {
    throw new Error("Missing --key (XOR key used for encryption).");
  }

  const keyBytes = Buffer.from(key, "utf-8");
  if (keyBytes.length < 8) {
    throw new Error("Use a longer key (>= 8 chars).");
  }

  await ensureDirs(outDir);

  const files = await fs.readdir(rawDir);
  const items = [];
  const metadata = await loadExistingMetadata(metadataPath);
  const metadataById = new Map(metadata.items.map((item) => [item.id, item]));

  for (const name of files.sort()) {
    const ext = path.extname(name).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext)) continue;

    const originalName = path.basename(name, ext);
    const sourcePath = path.join(rawDir, name);
    const raw = await fs.readFile(sourcePath);
    const originalExt = normalizeExt(ext);
    const hash = sha256Hex(raw);
    const image = sharp(raw, { animated: true });
    const info = await image.metadata();
    const width = info.width ?? null;
    const height = info.height ?? null;

    const thumbExt = formatForVariant(originalExt, "thumb");
    const clipExt = formatForVariant(originalExt, "clip");

    const thumbBuffer = await image
      .resize({ width: thumbSize, height: thumbSize, fit: "inside", withoutEnlargement: true })
      .toFormat(thumbExt)
      .toBuffer();
    const clipBuffer = await image
      .resize({ width: clipSize, height: clipSize, fit: "inside", withoutEnlargement: true })
      .toFormat(clipExt)
      .toBuffer();

    const fullEnc = xorBytes(raw, keyBytes);
    const thumbEnc = xorBytes(thumbBuffer, keyBytes);
    const clipEnc = xorBytes(clipBuffer, keyBytes);

    const fullName = buildVariantName(hash, originalExt, "full");
    const thumbName = buildVariantName(hash, thumbExt, "thumb");
    const clipName = buildVariantName(hash, clipExt, "clip");

    await fs.writeFile(path.join(outDir, fullName), fullEnc);
    await fs.writeFile(path.join(outDir, thumbName), thumbEnc);
    await fs.writeFile(path.join(outDir, clipName), clipEnc);

    items.push({
      id: hash,
      name: originalName,
      full: {
        bin: fullName,
        ext: originalExt,
        bytes: raw.length,
        sha256: hash,
        width,
        height,
      },
      clip: {
        bin: clipName,
        ext: clipExt,
        bytes: clipBuffer.length,
      },
      thumb: {
        bin: thumbName,
        ext: thumbExt,
        bytes: thumbBuffer.length,
      },
      tags: metadataById.get(hash)?.tags ?? [],
    });
  }

  const manifest = {
    note: "Client-side XOR is obfuscation, not access control.",
    sizes: { thumb: thumbSize, clip: clipSize },
    items,
  };

  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const newMetadataItems = items.map((item) => {
    const existing = metadataById.get(item.id);
    return {
      id: item.id,
      name: item.name ?? "",
      tags: existing?.tags ?? [],
      rating: existing?.rating ?? "safe",
      source: existing?.source ?? "",
    };
  });
  await fs.writeFile(
    metadataPath,
    `${JSON.stringify({ items: newMetadataItems }, null, 2)}\n`,
  );

  console.log(`Wrote ${items.length} items to ${manifestPath} and ${metadataPath}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
