import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from './index.ts';
import { users } from './schema.ts';
import { generateBase32Secret, generateRecoveryCodes, hashToken } from '../utils/archiveLogic.ts';
import {
  decryptWithAes256Gcm,
  encryptWithAes256Gcm,
  validateTotpEncryptionKey,
} from '../services/envAndIntegrations.ts';

// Ephemeral fallback key used strictly when TOTP_ENCRYPTION_KEY is not yet configured in environment,
// so existing archive views do not crash on boot while reporting UNCONFIGURED in integration checks.
const FALLBACK_KEY_BUFFER = crypto
  .createHash('sha256')
  .update('dhmi-ephemeral-runtime-fallback-totp-key-32b')
  .digest();

export function getActiveTotpKeyBuffer(): {
  keyBuffer: Buffer;
  isConfigured32ByteHex: boolean;
  validationError: string | null;
} {
  const check = validateTotpEncryptionKey(process.env.TOTP_ENCRYPTION_KEY);
  if (check.valid && check.keyBuffer) {
    return {
      keyBuffer: check.keyBuffer,
      isConfigured32ByteHex: true,
      validationError: null,
    };
  }
  return {
    keyBuffer: FALLBACK_KEY_BUFFER,
    isConfigured32ByteHex: false,
    validationError: check.errorMessage,
  };
}

const LEGACY_SEED_KEY_BUFFER = crypto
  .createHash('sha256')
  .update('dhmi-totp-aes-256-gcm-master-key-2026')
  .digest();

export function encryptTotpSecret(plainSecret: string): string {
  const { keyBuffer } = getActiveTotpKeyBuffer();
  return encryptWithAes256Gcm(plainSecret, keyBuffer);
}

export function decryptTotpSecret(encryptedPayload: string | null | undefined): string | null {
  if (!encryptedPayload) return null;
  const { keyBuffer } = getActiveTotpKeyBuffer();
  for (const candidateKey of [keyBuffer, FALLBACK_KEY_BUFFER, LEGACY_SEED_KEY_BUFFER]) {
    try {
      return decryptWithAes256Gcm(encryptedPayload, candidateKey);
    } catch {
      // try next key candidate
    }
  }
  return null;
}

export async function getOrCreateUser(
  uid: string,
  email: string,
  preferredUsername?: string,
  preferredDisplayName?: string,
  preferredRole?: 'ADMIN' | 'MEMBER'
) {
  try {
    const fallbackUsername =
      preferredUsername ||
      email.split('@')[0].toLowerCase().replace(/[^a-z0-9._-]/g, '') ||
      `user_${uid.slice(0, 6)}`;
    const displayName = preferredDisplayName || fallbackUsername;

    const result = await db
      .insert(users)
      .values({
        uid,
        username: fallbackUsername,
        email,
        displayName,
        role: preferredRole || 'MEMBER',
        status: 'ACTIVE',
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email,
          lastLoginAt: new Date(),
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    throw new Error('Kullanıcı profili senkronize edilemedi.', { cause: error });
  }
}

export async function getUserByUsername(username: string) {
  try {
    const normalized = username.trim().toLowerCase();
    const rows = await db.select().from(users).where(eq(users.username, normalized));
    return rows[0] || null;
  } catch (error) {
    throw new Error('Kullanıcı sorgulanamadı.', { cause: error });
  }
}

export async function getUserById(id: number) {
  try {
    const rows = await db.select().from(users).where(eq(users.id, id));
    return rows[0] || null;
  } catch (error) {
    throw new Error('Kullanıcı bulunamadı.', { cause: error });
  }
}

export async function getAllUsers() {
  try {
    return await db.select().from(users);
  } catch (error) {
    throw new Error('Kullanıcı listesi alınamadı.', { cause: error });
  }
}

export async function createTeamUser(params: {
  username: string;
  displayName: string;
  role: 'ADMIN' | 'MEMBER';
  email?: string;
  autoVerifyForSeed?: boolean;
  fixedSecretForDemo?: string;
}) {
  try {
    const cleanUsername = params.username.trim().toLowerCase();
    const secret = params.fixedSecretForDemo || generateBase32Secret();
    const encryptedSecret = encryptTotpSecret(secret);
    const activationCode = `AKT-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const { plainCodes, hashedCodes } = generateRecoveryCodes(6);

    const inserted = await db
      .insert(users)
      .values({
        uid: `totp:${cleanUsername}`,
        username: cleanUsername,
        email: params.email || `${cleanUsername}@dhmi.gov.tr`,
        displayName: params.displayName.trim(),
        role: params.role,
        status: params.autoVerifyForSeed ? 'ACTIVE' : 'PENDING_ACTIVATION',
        totpSecretEncrypted: encryptedSecret,
        totpVerified: Boolean(params.autoVerifyForSeed),
        activationCodeHash: hashToken(activationCode),
        activationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        recoveryCodeHashesJson: JSON.stringify(hashedCodes),
      })
      .returning();

    return {
      user: inserted[0],
      plainSecret: secret,
      activationCode,
      recoveryCodes: plainCodes,
    };
  } catch (error) {
    throw new Error('Yeni ekip kullanıcısı oluşturulamadı.', { cause: error });
  }
}
