#!/usr/bin/env python3
from __future__ import annotations
import argparse
import base64
import hashlib
import json
from pathlib import Path

def xor_bytes(data: bytes, key: bytes) -> bytes:
    out = bytearray(len(data))
    klen = len(key)
    for i, b in enumerate(data):
        out[i] = b ^ key[i % klen]
    return bytes(out)

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--in_dir", required=True, help="Directory with source images (jpg/png/webp...)")
    ap.add_argument("--out_dir", required=True, help="Directory to write encrypted .bin files")
    ap.add_argument("--key", required=True, help="XOR key (string). Not secure; obfuscation only.")
    ap.add_argument("--base_url", default="", help="Base URL where enc/ is hosted (optional; can be set in viewer)")
    args = ap.parse_args()

    in_dir = Path(args.in_dir)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    key_bytes = args.key.encode("utf-8")
    if len(key_bytes) < 8:
        raise SystemExit("Use a longer key (>= 8 chars). Still not secure, but less trivial.")

    items = []
    for p in sorted(in_dir.glob("*")):
        if not p.is_file():
            continue
        ext = p.suffix.lower().lstrip(".")
        if ext not in {"jpg", "jpeg", "png", "webp", "gif"}:
            continue

        raw = p.read_bytes()
        enc = xor_bytes(raw, key_bytes)
        sha256 = hashlib.sha256(raw).hexdigest()

        out_name = f"{p.stem}.{ext}.bin"
        (out_dir / out_name).write_bytes(enc)

        items.append({
            "id": p.stem,
            "ext": ext,
            "bin": out_name,
            "sha256": sha256,
            "bytes": len(raw),
            "url": (args.base_url.rstrip("/") + "/" + out_name) if args.base_url else out_name
        })

    manifest = {
        "note": "Client-side XOR is obfuscation, not access control.",
        "items": items,
    }
    (out_dir.parent / "manifest.json").write_text(json.dumps(manifest, indent=2), "utf-8")

    print(f"Wrote {len(items)} encrypted blobs to {out_dir} and manifest.json")

if __name__ == "__main__":
    main()
