/**
 * @file types.js
 * @description Type definitions for the Booru application.
 */

/**
 * Represents a specific file variant (full, clip, thumb).
 * @typedef {Object} ImageVariant
 * @property {string} bin - Path to the encrypted binary relative to root (e.g., "thumb/xyz.bin").
 * @property {string} ext - Extension (jpg, png, etc).
 * @property {number} bytes - File size in bytes.
 * @property {string} [sha256] - Hash of the specific file (usually only on 'full').
 * @property {number} [width] - Image width (usually only on 'full').
 * @property {number} [height] - Image height (usually only on 'full').
 */

/**
 * An item as it appears in manifest.json.
 * @typedef {Object} ManifestItem
 * @property {string} hash - The SHA256 content hash (Primary ID).
 * @property {string} name - The original filename or ID.
 * @property {ImageVariant} full - The full resolution image.
 * @property {ImageVariant} [clip] - A reduced resolution version (e.g. 800px).
 * @property {ImageVariant} [thumb] - A thumbnail version (e.g. 200px).
 * @property {string[]} [tags] - Optional tags directly in manifest (rare).
 */

/**
 * An item as it appears in metadata.json.
 * @typedef {Object} MetadataItem
 * @property {string} hash - The SHA256 content hash.
 * @property {string} name - Name/ID matching manifest.
 * @property {string[]} tags - List of tags.
 * @property {string} [rating] - e.g. 'safe', 'questionable', 'explicit'.
 * @property {string} [source] - Source URL.
 * @property {string} [date] - ISO Date string.
 */

/**
 * The merged object used by the UI components.
 * @typedef {Object} GalleryItem
 * @property {string} hash
 * @property {string} name
 * @property {ImageVariant} full
 * @property {ImageVariant} [clip]
 * @property {ImageVariant} [thumb]
 * @property {string[]} tags
 * @property {string} rating
 * @property {string|null} date
 * @property {string} source
 */

export {};