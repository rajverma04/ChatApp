import crypto from "crypto";

// ─── Key setup ───────────────────────────────────────────────────────────────
// ENCRYPTION_KEY must be a 64-char hex string (32 bytes) set in the environment.
// Used exclusively for server-side AES-256-GCM encryption of group messages.
const rawKey = process.env.ENCRYPTION_KEY;
if (!rawKey || rawKey.length < 64) {
    console.warn(
        "[encryption] ENCRYPTION_KEY is missing or too short — group messages will not be encrypted at rest."
    );
}

const KEY = rawKey ? Buffer.from(rawKey.slice(0, 64), "hex") : null;
const ALGORITHM = "aes-256-gcm";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Encrypt a plaintext string (group messages).
 * Returns a compact JSON string:  { iv, ct, tag }  — all base64.
 */
export function encryptText(plaintext) {
    if (!KEY || !plaintext) return plaintext; // graceful passthrough when key absent
    const iv = crypto.randomBytes(12); // 96-bit IV for GCM
    const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
    const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return JSON.stringify({
        iv: iv.toString("base64"),
        ct: ct.toString("base64"),
        tag: tag.toString("base64"),
    });
}

/**
 * Decrypt a ciphertext produced by encryptText().
 * Returns the original plaintext, or the input unchanged if not in expected format.
 */
export function decryptText(cipherJson) {
    if (!KEY || !cipherJson) return cipherJson;
    try {
        const { iv, ct, tag } = JSON.parse(cipherJson);
        const decipher = crypto.createDecipheriv(
            ALGORITHM,
            KEY,
            Buffer.from(iv, "base64")
        );
        decipher.setAuthTag(Buffer.from(tag, "base64"));
        const plain = Buffer.concat([
            decipher.update(Buffer.from(ct, "base64")),
            decipher.final(),
        ]);
        return plain.toString("utf8");
    } catch {
        // Not an encrypted payload (e.g. legacy plaintext message) — return as-is
        return cipherJson;
    }
}
