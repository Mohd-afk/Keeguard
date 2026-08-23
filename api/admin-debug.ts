import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Debug endpoint — shows env var presence without exposing secret values.
 * DELETE THIS FILE after debugging.
 * Access: GET /api/admin-debug
 */
export default function handler(_req: VercelRequest, res: VercelResponse) {
  const pk = process.env.FIREBASE_PRIVATE_KEY ?? '';

  const diagnosis = {
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID ? 'OK' : 'MISSING',
    FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL ? 'OK' : 'MISSING',
    FIREBASE_PRIVATE_KEY: pk ? 'PRESENT' : 'MISSING',
    // Show first/last 30 chars so we can see if it starts/ends correctly
    PRIVATE_KEY_STARTS_WITH: pk.slice(0, 40),
    PRIVATE_KEY_ENDS_WITH: pk.slice(-40),
    PRIVATE_KEY_LENGTH: pk.length,
    // Check if it contains literal backslash-n (bad) or real newlines (good)
    HAS_ESCAPED_NEWLINES: pk.includes('\\n'),
    HAS_REAL_NEWLINES: pk.includes('\n'),
    HAS_WRAPPING_QUOTES: pk.startsWith('"') || pk.startsWith("'"),
    NODE_VERSION: process.version,
  };

  return res.status(200).json(diagnosis);
}
