import crypto from 'node:crypto';
import { Request, Response, NextFunction } from 'express';
import { DecodedIdToken } from 'firebase-admin/auth';
import { adminAuth } from '../lib/firebase-admin.ts';
import { getOrCreateUser, getUserById, getUserByUsername } from '../db/users.ts';
import { validateSessionSecret } from '../services/envAndIntegrations.ts';

const EPHEMERAL_FALLBACK_SESSION_KEY = crypto
  .createHash('sha256')
  .update('dhmi-ephemeral-session-signing-key-256bit-fallback')
  .digest('hex');

function getActiveSessionSigningKey(): Buffer {
  const check = validateSessionSecret(process.env.SESSION_SECRET);
  if (check.valid && process.env.SESSION_SECRET) {
    return crypto.createHash('sha256').update(process.env.SESSION_SECRET.trim(), 'utf8').digest();
  }
  return Buffer.from(EPHEMERAL_FALLBACK_SESSION_KEY, 'hex');
}

export interface SessionUser {
  id: number;
  uid: string;
  username: string;
  displayName: string;
  email: string;
  role: 'ADMIN' | 'MEMBER';
  status: string;
}

export interface AuthRequest extends Request {
  user?: DecodedIdToken;
  archiveUser?: SessionUser;
}

export function createSignedSessionToken(user: SessionUser): string {
  const signingKey = getActiveSessionSigningKey();
  const payload = {
    id: user.id,
    uid: user.uid,
    username: user.username,
    displayName: user.displayName,
    email: user.email,
    role: user.role,
    iat: Date.now(),
    exp: Date.now() + 12 * 60 * 60 * 1000, // 12 hours
    jti: crypto.randomBytes(8).toString('hex'),
  };
  const dataB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', signingKey).update(dataB64).digest('base64url');
  return `${dataB64}.${sig}`;
}

export function verifySignedSessionToken(token: string): SessionUser | null {
  try {
    const [dataB64, sig] = token.split('.');
    if (!dataB64 || !sig) return null;
    const signingKey = getActiveSessionSigningKey();
    const expectedSig = crypto
      .createHmac('sha256', signingKey)
      .update(dataB64)
      .digest('base64url');
    const sigBuf = Buffer.from(sig, 'utf8');
    const expBuf = Buffer.from(expectedSig, 'utf8');
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }
    const payload = JSON.parse(Buffer.from(dataB64, 'base64url').toString('utf8'));
    if (!payload.exp || Date.now() > payload.exp) return null;
    return {
      id: payload.id,
      uid: payload.uid,
      username: payload.username,
      displayName: payload.displayName,
      email: payload.email,
      role: payload.role,
      status: 'ACTIVE',
    };
  } catch {
    return null;
  }
}

function parseCookieHeader(cookieHeader?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const pair of cookieHeader.split(';')) {
    const idx = pair.indexOf('=');
    if (idx > 0) {
      const k = pair.slice(0, idx).trim();
      const v = pair.slice(idx + 1).trim();
      out[k] = decodeURIComponent(v);
    }
  }
  return out;
}

export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    const cookies = parseCookieHeader(req.headers.cookie);
    const cookieToken = cookies['dhmi_session'];

    const bearerRaw =
      authHeader && authHeader.startsWith('Bearer ') ? authHeader.split('Bearer ')[1].trim() : null;

    const candidateSessionToken =
      bearerRaw && bearerRaw.startsWith('totp_session:')
        ? bearerRaw.slice('totp_session:'.length)
        : cookieToken;

    if (candidateSessionToken) {
      const verifiedSession = verifySignedSessionToken(candidateSessionToken);
      if (verifiedSession) {
        const dbUser = await getUserById(verifiedSession.id);
        if (!dbUser || dbUser.status !== 'ACTIVE') {
          return res.status(403).json({
            error: 'Kullanıcı hesabı devre dışı bırakılmış veya erişimi iptal edilmiştir.',
          });
        }
        req.archiveUser = {
          id: dbUser.id,
          uid: dbUser.uid,
          username: dbUser.username,
          displayName: dbUser.displayName,
          email: dbUser.email,
          role: dbUser.role === 'ADMIN' ? 'ADMIN' : 'MEMBER',
          status: dbUser.status,
        };
        return next();
      }
    }

    if (bearerRaw && !bearerRaw.startsWith('totp_session:')) {
      const decodedToken = await adminAuth.verifyIdToken(bearerRaw);
      req.user = decodedToken;
      const email = decodedToken.email || `${decodedToken.uid}@dhmi.gov.tr`;
      const existingSemih = await getUserByUsername('semih');
      const dbUser = await getOrCreateUser(
        decodedToken.uid,
        email,
        existingSemih ? undefined : 'semih',
        decodedToken.name || 'Semih Vatansever',
        existingSemih ? 'MEMBER' : 'ADMIN'
      );
      if (dbUser.status !== 'ACTIVE') {
        return res.status(403).json({
          error: 'Kullanıcı hesabı devre dışı bırakılmış veya erişimi iptal edilmiştir.',
        });
      }
      req.archiveUser = {
        id: dbUser.id,
        uid: dbUser.uid,
        username: dbUser.username,
        displayName: dbUser.displayName,
        email: dbUser.email,
        role: dbUser.role === 'ADMIN' ? 'ADMIN' : 'MEMBER',
        status: dbUser.status,
      };
      return next();
    }

    return res.status(401).json({
      error: 'Yetkisiz erişim: Lütfen kullanıcı adı ve Authenticator (TOTP) kodunuzla giriş yapın.',
    });
  } catch {
    return res.status(401).json({ error: 'Oturum doğrulanamadı veya süresi doldu.' });
  }
};

export const requireAdmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.archiveUser || req.archiveUser.role !== 'ADMIN') {
    return res.status(403).json({
      error: 'Bu işlem yalnızca ADMIN yetkisine sahip yöneticiler tarafından gerçekleştirilebilir.',
    });
  }
  return next();
};
