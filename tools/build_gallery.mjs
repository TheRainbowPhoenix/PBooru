#!/usr/bin/env node
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import sharp from "sharp";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

/**
 * Parses command line arguments (flags).
 */
function parseArgs(argv) {
  const args = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    // If next arg is not a flag, take it as value, else true
    const value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : "true";
    args.set(key, value);
  }
  return args;
}

/**
 * Simple XOR obfuscation.
 */
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

function normalizeExt(ext) {
  return ext.toLowerCase().replace(".", "");
}

/**
 * Determines target extension. 
 * E.g., GIFs are converted to PNG for thumbs/clips to handle animation better/smaller.
 */
function formatForVariant(ext, variant) {
  if (variant === "full") return ext;
  if (ext === "gif") return "png"; // Sharp handles gif resizing better as png/webp usually
  return ext;
}

function buildVariantName(hash, ext, variant) {
  return `${variant}/${hash}.${ext}.bin`;
}

async function ensureDirs(outDir) {
  await fs.mkdir(path.join(outDir, "full"), { recursive: true });
  await fs.mkdir(path.join(outDir, "clip"), { recursive: true });
  await fs.mkdir(path.join(outDir, "thumb"), { recursive: true });
}

/**
 * Loads existing metadata to preserve tags.
 */
async function loadExistingMetadata(metadataPath) {
  try {
    const raw = await fs.readFile(metadataPath, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.items)) {
      return parsed.items;
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn(`[WARN] Could not read existing metadata: ${error.message}`);
    }
  }
  return [];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  
  // Configuration
  const rawDir = args.get("raw_dir") ?? "raw";
  const outDir = args.get("out_dir") ?? "enc";
  const key = args.get("key");
  const thumbSize = Number(args.get("thumb_size") ?? "200");
  const clipSize = Number(args.get("clip_size") ?? "800");
  const manifestPath = args.get("manifest") ?? path.join(outDir, "manifest.json");
  const metadataPath = args.get("metadata") ?? path.join(outDir, "metadata.json");

  if (!key) {
    console.error("Error: Missing --key argument.");
    console.error("Usage: node build_gallery.js --key mySecretKey");
    process.exit(1);
  }

  const keyBytes = Buffer.from(key, "utf-8");
  if (keyBytes.length < 8) {
    throw new Error("Use a longer key (>= 8 chars) for better obfuscation.");
  }

  console.log(`Building gallery from '${rawDir}' to '${outDir}'...`);

  await ensureDirs(outDir);

  // 1. Load Existing Metadata
  // We map by Hash (primary) and Name (fallback) to find existing tags.
  const oldItems = await loadExistingMetadata(metadataPath);
  const metaByHash = new Map(oldItems.map(i => [i.hash, i]));
  const metaByName = new Map(oldItems.map(i => [i.name, i]));

  const files = await fs.readdir(rawDir);
  const manifestItems = [];
  const metadataItems = [];

  for (const filename of files.sort()) {
    const ext = path.extname(filename).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext)) continue;

    const sourcePath = path.join(rawDir, filename);
    const originalName = path.basename(filename, ext);
    const originalExt = normalizeExt(ext);
    
    // Read File & Hash
    const rawBuffer = await fs.readFile(sourcePath);
    const hash = sha256Hex(rawBuffer);

    // --- MERGE LOGIC START ---
    // Try to find existing metadata to preserve tags
    let existing = metaByHash.get(hash);
    if (!existing) {
      // Fallback: If hash changed (re-encoded) but name is same, use name to keep tags
      existing = metaByName.get(originalName);
    }
    
    const tags = existing ? (existing.tags || []) : [];
    const rating = existing ? (existing.rating || "safe") : "safe";
    const source = existing ? (existing.source || "") : "";
    // Preserve date, or use file creation time if new
    let dateStr = existing ? existing.date : null;
    if (!dateStr) {
      const stats = await fs.stat(sourcePath);
      dateStr = stats.birthtime.toISOString();
    }
    // --- MERGE LOGIC END ---

    console.log(`Processing: ${filename} -> ${hash.substring(0, 8)}... [Tags: ${tags.length}]`);

    // Image Processing
    const image = sharp(rawBuffer, { animated: true });
    const info = await image.metadata();
    
    // Determine extensions
    const thumbExt = formatForVariant(originalExt, "thumb");
    const clipExt = formatForVariant(originalExt, "clip");

    // Resize
    const thumbBuffer = await image
      .resize({ width: thumbSize, height: thumbSize, fit: "inside", withoutEnlargement: true })
      .toFormat(thumbExt)
      .toBuffer();
      
    const clipBuffer = await image
      .resize({ width: clipSize, height: clipSize, fit: "inside", withoutEnlargement: true })
      .toFormat(clipExt)
      .toBuffer();

    // Encrypt
    const fullEnc = xorBytes(rawBuffer, keyBytes);
    const thumbEnc = xorBytes(thumbBuffer, keyBytes);
    const clipEnc = xorBytes(clipBuffer, keyBytes);

    // Paths
    const fullName = buildVariantName(hash, originalExt, "full");
    const thumbName = buildVariantName(hash, thumbExt, "thumb");
    const clipName = buildVariantName(hash, clipExt, "clip");

    // Write to disk
    await fs.writeFile(path.join(outDir, fullName), fullEnc);
    await fs.writeFile(path.join(outDir, thumbName), thumbEnc);
    await fs.writeFile(path.join(outDir, clipName), clipEnc);

    // Add to Manifest (Technical Data)
    manifestItems.push({
      hash: hash, // Strict: Top level hash
      name: originalName,
      full: {
        bin: fullName,
        ext: originalExt,
        bytes: rawBuffer.length,
        sha256: hash,
        width: info.width,
        height: info.height,
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
      }
    });

    // Add to Metadata (User Data)
    metadataItems.push({
      hash: hash,
      name: originalName,
      tags: tags,
      rating: rating,
      source: source,
      date: dateStr
    });
  }

  const manifest = {
    note: "Client-side XOR is obfuscation, not access control.",
    generatedAt: new Date().toISOString(),
    sizes: { thumb: thumbSize, clip: clipSize },
    items: manifestItems,
  };

  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  // Write Metadata
  // We overwrite the file, but we constructed `metadataItems` using the merged data.
  await fs.writeFile(metadataPath, JSON.stringify({ items: metadataItems }, null, 2));

  console.log(`\nSuccess!`);
  console.log(`Processed ${manifestItems.length} items.`);
  console.log(`Manifest: ${manifestPath}`);
  console.log(`Metadata: ${metadataPath}`);
}

main().catch((error) => {
  console.error("Fatal Error:", error);
  process.exit(1);
});
