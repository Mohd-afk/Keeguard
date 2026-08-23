// api/hello-admin.ts — minimal test endpoint using dynamic import
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const { initializeApp, cert, getApps, getApp } = await import('firebase-admin/app');
    const { getAuth } = await import('firebase-admin/auth');

    let app: any;
    if (getApps().length > 0) {
      app = getApp();
    } else {
      let privateKey = process.env.FIREBASE_PRIVATE_KEY ?? '';
      privateKey = privateKey.trim().replace(/^["']|["']$/g, '').replace(/\\n/g, '\n');
      app = initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey,
        }),
      });
    }

    const auth = getAuth(app);
    const result = await auth.listUsers(1);

    return res.status(200).json({
      success: true,
      message: 'Firebase Admin SDK loaded and working',
      userCount: result.users.length,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message,
      errorCode: err.code ?? null,
      errorType: err.constructor?.name ?? null,
      stack: err.stack?.split('\n').slice(0, 5),
    });
  }
}
