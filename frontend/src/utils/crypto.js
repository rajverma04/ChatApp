/**
 * crypto.js — Client-side E2E encryption utilities for DMs
 *
 * Algorithm: ECDH P-256 for key agreement → HKDF-SHA-256 to derive AES-256-GCM key
 *
 * Key pair lifecycle:
 *   - Generated once per user session and persisted in localStorage
 *   - Public key (SPKI base64) is uploaded to the server after login
 *   - Private key (PKCS8 base64) never leaves the browser
 */

const DB_KEY = "chat_e2e_privkey";
const PUB_KEY = "chat_e2e_pubkey";

// Cache derived AES keys per contact to avoid repeated HKDF each message
const sharedKeyCache = new Map(); // contactName → CryptoKey

// ─── Key pair management ─────────────────────────────────────────────────────

/**
 * Generate (or load from localStorage) the user's ECDH P-256 key pair.
 * @returns {{ publicKeyB64: string }}  — base64 SPKI public key for upload to server
 */
export async function initKeyPair() {
    const storedPriv = localStorage.getItem(DB_KEY);
    const storedPub = localStorage.getItem(PUB_KEY);

    if (storedPriv && storedPub) {
        return { publicKeyB64: storedPub };
    }

    // Generate a fresh key pair
    const keyPair = await crypto.subtle.generateKey(
        { name: "ECDH", namedCurve: "P-256" },
        true,
        ["deriveKey"]
    );

    const privRaw = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
    const pubRaw = await crypto.subtle.exportKey("spki", keyPair.publicKey);

    const privB64 = btoa(String.fromCharCode(...new Uint8Array(privRaw)));
    const pubB64 = btoa(String.fromCharCode(...new Uint8Array(pubRaw)));

    localStorage.setItem(DB_KEY, privB64);
    localStorage.setItem(PUB_KEY, pubB64);

    return { publicKeyB64: pubB64 };
}

/** Export the stored public key as base64 SPKI (for re-sending if needed). */
export function getMyPublicKeyB64() {
    return localStorage.getItem(PUB_KEY);
}

// ─── Shared-key derivation ───────────────────────────────────────────────────

async function loadMyPrivateKey() {
    const b64 = localStorage.getItem(DB_KEY);
    if (!b64) throw new Error("No private key found. Call initKeyPair() first.");
    const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    return crypto.subtle.importKey(
        "pkcs8",
        raw.buffer,
        { name: "ECDH", namedCurve: "P-256" },
        false,
        ["deriveKey"]
    );
}

async function importTheirPublicKey(b64) {
    const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    return crypto.subtle.importKey(
        "spki",
        raw.buffer,
        { name: "ECDH", namedCurve: "P-256" },
        false,
        []
    );
}

/**
 * Derive (and cache) the AES-256-GCM key shared with a specific contact.
 * @param {string} contactName        — for cache lookup
 * @param {string} theirPublicKeyB64  — contact's SPKI public key (base64)
 */
async function getDmKey(contactName, theirPublicKeyB64) {
    if (sharedKeyCache.has(contactName)) return sharedKeyCache.get(contactName);

    const myPriv = await loadMyPrivateKey();
    const theirPub = await importTheirPublicKey(theirPublicKeyB64);

    // Derive raw shared secret via ECDH
    const ecdhSecret = await crypto.subtle.deriveKey(
        { name: "ECDH", public: theirPub },
        myPriv,
        { name: "HKDF" },
        false,
        ["deriveKey"]
    );

    // Stretch with HKDF to get an AES-256-GCM key
    const aesKey = await crypto.subtle.deriveKey(
        {
            name: "HKDF",
            hash: "SHA-256",
            salt: new Uint8Array(32),          // deterministic salt
            info: new TextEncoder().encode("chat-e2e-dm"),
        },
        ecdhSecret,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );

    sharedKeyCache.set(contactName, aesKey);
    return aesKey;
}

// ─── Encrypt / Decrypt ───────────────────────────────────────────────────────

/**
 * Encrypt a plaintext message for a DM recipient.
 *
 * @param {string} plaintext           — the message text
 * @param {string} contactName         — recipient's username (for key cache)
 * @param {string} theirPublicKeyB64   — recipient's SPKI public key (base64)
 * @returns {string} JSON string  { iv: base64, ct: base64 }
 */
export async function encryptMessage(plaintext, contactName, theirPublicKeyB64) {
    if (!theirPublicKeyB64) {
        // Recipient has no public key yet — send plaintext (graceful degradation)
        return plaintext;
    }
    const key = await getDmKey(contactName, theirPublicKeyB64);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        new TextEncoder().encode(plaintext)
    );
    return JSON.stringify({
        iv: btoa(String.fromCharCode(...iv)),
        ct: btoa(String.fromCharCode(...new Uint8Array(ct))),
    });
}

/**
 * Decrypt a DM message received from a contact.
 *
 * @param {string} encryptedJson   — JSON string { iv, ct } produced by encryptMessage
 * @param {string} contactName     — sender's username (for key cache)
 * @param {string} theirPublicKeyB64 — sender's SPKI public key (base64)
 * @returns {string} decrypted plaintext, or the raw input if it cannot be decrypted
 */
export async function decryptMessage(encryptedJson, contactName, theirPublicKeyB64) {
    if (!theirPublicKeyB64 || !encryptedJson) return encryptedJson || "";
    try {
        const { iv, ct } = JSON.parse(encryptedJson);
        const key = await getDmKey(contactName, theirPublicKeyB64);
        const plain = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: Uint8Array.from(atob(iv), c => c.charCodeAt(0)) },
            key,
            Uint8Array.from(atob(ct), c => c.charCodeAt(0))
        );
        return new TextDecoder().decode(plain);
    } catch {
        // Not encrypted (legacy) or wrong key — return as-is
        return encryptedJson;
    }
}

/** Clear the cached shared keys (call on logout / username change). */
export function clearKeyCache() {
    sharedKeyCache.clear();
}
