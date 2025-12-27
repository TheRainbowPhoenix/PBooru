/**
 * @file crypto.js
 * @description Client-side XOR decryption utilities.
 */

/**
 * XORs a buffer against a key string.
 * Used for simple obfuscation.
 * 
 * @param {ArrayBuffer} buffer - The encrypted file data.
 * @param {string} keyString - The user provided key.
 * @returns {Uint8Array} - The decrypted data.
 */
export const xorBytes = (buffer, keyString) => {
  const data = new Uint8Array(buffer);
  const key = new TextEncoder().encode(keyString);
  const out = new Uint8Array(data.length);
  
  for (let i = 0; i < data.length; i++) {
    out[i] = data[i] ^ key[i % key.length];
  }
  return out;
};