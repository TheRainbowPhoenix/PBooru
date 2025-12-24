// tools/xor-encode.mjs
import { promises as fs } from "node:fs";
import path from "node:path";

function xorBytes(buf, keyBytes) {
  const out = Buffer.allocUnsafe(buf.length);
  for (let i = 0; i < buf.length; i++) out[i] = buf[i] ^ keyBytes[i % keyBytes.length];
  return out;
}

function mimeFromExt(ext) {
  const e = ext.toLowerCase();
  if (e === ".jpg" || e === ".jpeg") return "image/jpeg";
  if (e === ".png") return "image/png";
  if (e === ".webp") return "image/webp";
  if (e === ".avif") return "image/avif";
  if (e === ".gif") return "image/gif";
  return "application/octet-stream";
}

async function main() {
  const inDir = process.argv[2] ?? "images";
  const outDir = process.argv[3] ?? "encrypted";
  const key = process.argv[4] ?? "devkey";
  const keyBytes = Buffer.from(key, "utf8");

  await fs.mkdir(outDir, { recursive: true });

  const files = (await fs.readdir(inDir))
    .filter(f => !f.startsWith("."))
    .sort();

  const manifest = [];
  for (const file of files) {
    const inPath = path.join(inDir, file);
    const ext = path.extname(file);
    const mime = mimeFromExt(ext);

    const raw = await fs.readFile(inPath);
    const enc = xorBytes(raw, keyBytes);

    const outName = `${path.basename(file)}.xor`;
    const outPath = path.join(outDir, outName);
    await fs.writeFile(outPath, enc);

    manifest.push({
      id: path.basename(file),
      file: outName,
      mime,
      bytes: raw.length,
      // you can add tags, rating, source, createdAt, etc here
      tags: []
    });

    console.log(`Encoded ${file} -> ${outPath}`);
  }

  await fs.writeFile("manifest.json", JSON.stringify({ version: 1, items: manifest }, null, 2));
  console.log("Wrote manifest.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
    