function xorArrayBufferToUint8Array(buf, keyStr) {
  const data = new Uint8Array(buf);
  const key = new TextEncoder().encode(keyStr);
  for (let i = 0; i < data.length; i++) data[i] = data[i] ^ key[i % key.length];
  return data;
}

export async function loadXorImageAsObjectURL(url, mime, keyStr) {
  const res = await fetch(url, { cache: "force-cache" });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${url}`);
  const encBuf = await res.arrayBuffer();
  const decBytes = xorArrayBufferToUint8Array(encBuf, keyStr);
  const blob = new Blob([decBytes], { type: mime });
  return URL.createObjectURL(blob);
}
