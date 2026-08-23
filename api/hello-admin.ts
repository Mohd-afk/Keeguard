// api/hello-admin.ts — test endpoint using firebase-admin v11 default import
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    const adminModule = await import('firebase-admin');
    const admin = (adminModule as any).default ?? adminModule;

    if (!admin.apps.length) {
      let privateKey = process.env.FIREBASE_PRIVATE_KEY ?? '';
      privateKey = privateKey.trim().replace(/^["']|["']$/g, '').replace(/\\n/g, '\n');
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey,
        }),
      });
    }

    const result = await admin.auth().listUsers(1);
    return res.status(200).json({ success: true, message: 'firebase-admin v11 working', userCount: result.users.length });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message, errorCode: err.code, stack: err.stack?.split('\n').slice(0, 5) });
  }
}
