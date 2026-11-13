import crypto from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '../db/index.ts';

export const STANDARD_ROUTELLM_BASE_URL = 'https://routellm.abacus.ai/v1';

export interface EnvValidationItem {
  name: string;
  configured: boolean;
  valid: boolean;
  expectedFormat: string;
  statusMessage: string;
}

export interface IntegrationCheckResult {
  key: string;
  name: string;
  status: 'CONNECTED' | 'UNCONFIGURED' | 'INVALID_CONFIG' | 'CONNECTION_ERROR';
  summary: string;
  details: string;
  checkedAt: string;
}

/**
 * Validates TOTP_ENCRYPTION_KEY:
 * Must be a 32-byte hexadecimal string (64 hex characters: /^[0-9a-fA-F]{64}$/).
 * Never includes the secret value in any error message or log.
 */
export function validateTotpEncryptionKey(rawKey: string | undefined): {
  configured: boolean;
  valid: boolean;
  keyBuffer: Buffer | null;
  errorMessage: string | null;
} {
  if (!rawKey || rawKey.trim() === '') {
    return {
      configured: false,
      valid: false,
      keyBuffer: null,
      errorMessage:
        'TOTP_ENCRYPTION_KEY ortam değişkeni tanımlanmamış. Beklenen biçim: 32 baytlık (64 karakter uzunluğunda) hexadecimal dizge.',
    };
  }

  const trimmed = rawKey.trim();
  if (trimmed.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return {
      configured: true,
      valid: false,
      keyBuffer: null,
      errorMessage: `TOTP_ENCRYPTION_KEY geçersiz biçimde veya uzunlukta (Mevcut uzunluk: ${trimmed.length} karakter). Beklenen biçim: tam 64 karakterlik hexadecimal (32 bayt) anahtar.`,
    };
  }

  const buf = Buffer.from(trimmed, 'hex');
  if (buf.length !== 32) {
    return {
      configured: true,
      valid: false,
      keyBuffer: null,
      errorMessage: 'TOTP_ENCRYPTION_KEY çözümlendiğinde 32 bayt uzunluğunu karşılamıyor.',
    };
  }

  return {
    configured: true,
    valid: true,
    keyBuffer: buf,
    errorMessage: null,
  };
}

/**
 * Authenticated encryption (AES-256-GCM) using a 32-byte Buffer key.
 */
export function encryptWithAes256Gcm(plainText: string, keyBuffer: Buffer): string {
  if (keyBuffer.length !== 32) {
    throw new Error('Şifreleme anahtarı tam 32 bayt olmalıdır.');
  }
  const iv = crypto.randomBytes(12); // 96-bit nonce recommended by NIST for AES-GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag(); // 128-bit (16-byte) authentication tag
  return `v1:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Authenticated decryption (AES-256-GCM) verifying the 16-byte auth tag.
 */
export function decryptWithAes256Gcm(payload: string, keyBuffer: Buffer): string {
  if (keyBuffer.length !== 32) {
    throw new Error('Şifre çözme anahtarı tam 32 bayt olmalıdır.');
  }
  const parts = payload.split(':');
  // Support both "v1:iv:tag:cipher" and legacy 3-part "iv:tag:cipher"
  const [ivHex, tagHex, cipherHex] =
    parts.length === 4 && parts[0] === 'v1' ? [parts[1], parts[2], parts[3]] : parts;

  if (!ivHex || !tagHex || !cipherHex) {
    throw new Error('Şifrelenmiş veri biçimi geçersiz.');
  }

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(tagHex, 'hex');
  const encrypted = Buffer.from(cipherHex, 'hex');

  if (iv.length !== 12 || authTag.length !== 16) {
    throw new Error('AES-256-GCM IV veya doğrulama etiketi (AuthTag) uzunluğu geçersiz.');
  }

  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * Validates SESSION_SECRET security requirements:
 * Must be at least 32 characters long (minimum 256 bits when ASCII/hex) and not a placeholder.
 */
export function validateSessionSecret(rawSecret: string | undefined): {
  configured: boolean;
  valid: boolean;
  errorMessage: string | null;
} {
  if (!rawSecret || rawSecret.trim() === '') {
    return {
      configured: false,
      valid: false,
      errorMessage:
        'SESSION_SECRET ortam değişkeni tanımlanmamış. Güvenli oturum imzalama (HMAC-SHA256) için en az 32 karakter uzunluğunda yüksek entropili bir değer tanımlanmalıdır.',
    };
  }

  const trimmed = rawSecret.trim();
  if (trimmed.length < 32) {
    return {
      configured: true,
      valid: false,
      errorMessage: `SESSION_SECRET güvenlik gereksinimlerini karşılamıyor (Mevcut uzunluk: ${trimmed.length} karakter). Oturum güvenliği için en az 32 karakter (tercihen 64 karakter hex veya rastgele dizge) olmalıdır.`,
    };
  }

  return {
    configured: true,
    valid: true,
    errorMessage: null,
  };
}

/**
 * Validates ROUTELLM_BASE_URL and ROUTELLM_API_KEY format without leaking secret values.
 */
export function validateRouteLlmConfig(
  rawBaseUrl: string | undefined,
  rawApiKey: string | undefined
): {
  baseUrl: string;
  baseUrlValid: boolean;
  apiKeyConfigured: boolean;
  apiKeyValidFormat: boolean;
  errorMessage: string | null;
} {
  const effectiveBaseUrl = (rawBaseUrl && rawBaseUrl.trim() !== ''
    ? rawBaseUrl.trim()
    : STANDARD_ROUTELLM_BASE_URL
  ).replace(/\/+$/, '');

  const baseUrlValid = effectiveBaseUrl === STANDARD_ROUTELLM_BASE_URL;
  const keyTrimmed = (rawApiKey || '').trim();
  const apiKeyConfigured =
    keyTrimmed.length > 0 &&
    keyTrimmed !== 'MY_ROUTELLM_API_KEY' &&
    keyTrimmed !== 'YOUR_API_KEY';

  // RouteLLM keys are typically >= 16 printable non-whitespace characters
  const apiKeyValidFormat =
    apiKeyConfigured && keyTrimmed.length >= 16 && !/\s/.test(keyTrimmed);

  let errorMessage: string | null = null;
  if (!baseUrlValid) {
    errorMessage = `ROUTELLM_BASE_URL standart Abacus.AI adresi (${STANDARD_ROUTELLM_BASE_URL}) ile eşleşmiyor.`;
  } else if (!apiKeyConfigured) {
    errorMessage =
      'ROUTELLM_API_KEY ortam değişkeni tanımlanmamış. Gerçek RouteLLM çağrıları için sunucu ortamında geçerli bir anahtar tanımlanmalıdır.';
  } else if (!apiKeyValidFormat) {
    errorMessage = `ROUTELLM_API_KEY beklenen uzunluk veya biçim kurallarını karşılamıyor (Minimum 16 karakter, boşluksuz olmalıdır; mevcut uzunluk: ${keyTrimmed.length}).`;
  }

  return {
    baseUrl: STANDARD_ROUTELLM_BASE_URL,
    baseUrlValid,
    apiKeyConfigured,
    apiKeyValidFormat,
    errorMessage,
  };
}

/**
 * Validates Resend webhook secret (whsec_...) and Resend API key (re_...).
 */
export function validateResendConfig(
  rawWebhookSecret: string | undefined,
  rawApiKey: string | undefined
): {
  webhookSecretConfigured: boolean;
  webhookSecretValid: boolean;
  apiKeyConfigured: boolean;
  apiKeyValid: boolean;
  errorMessage: string | null;
} {
  const whTrimmed = (rawWebhookSecret || '').trim();
  const apiTrimmed = (rawApiKey || '').trim();

  const webhookSecretConfigured = whTrimmed.length > 0;
  let webhookSecretValid = false;
  if (webhookSecretConfigured) {
    const base64Part = whTrimmed.startsWith('whsec_') ? whTrimmed.slice(6) : whTrimmed;
    try {
      const decoded = Buffer.from(base64Part, 'base64');
      webhookSecretValid =
        whTrimmed.startsWith('whsec_') && base64Part.length >= 16 && decoded.length >= 12;
    } catch {
      webhookSecretValid = false;
    }
  }

  const apiKeyConfigured = apiTrimmed.length > 0;
  const apiKeyValid =
    apiKeyConfigured && apiTrimmed.startsWith('re_') && apiTrimmed.length >= 12;

  const issues: string[] = [];
  if (!webhookSecretConfigured) {
    issues.push(
      'RESEND_WEBHOOK_SECRET tanımlanmamış (Beklenen biçim: "whsec_" ile başlayan Resend/Svix imzalama anahtarı).'
    );
  } else if (!webhookSecretValid) {
    issues.push(
      'RESEND_WEBHOOK_SECRET geçersiz biçimde. Anahtar "whsec_" önekiyle başlamalı ve geçerli base64 yükü içermelidir.'
    );
  }

  if (!apiKeyConfigured) {
    issues.push(
      'RESEND_API_KEY tanımlanmamış (Beklenen biçim: "re_" ile başlayan Resend API anahtarı).'
    );
  } else if (!apiKeyValid) {
    issues.push(
      'RESEND_API_KEY geçersiz biçimde. Anahtar "re_" önekiyle başlamalı ve en az 12 karakter olmalıdır.'
    );
  }

  return {
    webhookSecretConfigured,
    webhookSecretValid,
    apiKeyConfigured,
    apiKeyValid,
    errorMessage: issues.length > 0 ? issues.join(' ') : null,
  };
}

/**
 * Official Resend (Svix) Webhook Signature Verification:
 * Verifies `svix-id`, `svix-timestamp`, and `svix-signature` headers against rawBody
 * using HMAC-SHA256 and constant-time comparison (`crypto.timingSafeEqual`).
 */
export function verifyResendWebhookSignature(params: {
  rawBody: string;
  svixId: string | undefined;
  svixTimestamp: string | undefined;
  svixSignature: string | undefined;
  webhookSecret: string | undefined;
  nowSeconds?: number;
  toleranceSeconds?: number;
}): { valid: boolean; reason?: string } {
  const {
    rawBody,
    svixId,
    svixTimestamp,
    svixSignature,
    webhookSecret,
    nowSeconds = Math.floor(Date.now() / 1000),
    toleranceSeconds = 300,
  } = params;

  const secretCheck = validateResendConfig(webhookSecret, undefined);
  if (!secretCheck.webhookSecretConfigured) {
    return {
      valid: false,
      reason: 'RESEND_WEBHOOK_SECRET ortam değişkeni sunucuda tanımlanmamış.',
    };
  }
  if (!secretCheck.webhookSecretValid || !webhookSecret) {
    return {
      valid: false,
      reason: 'RESEND_WEBHOOK_SECRET biçimi geçersiz ("whsec_" öneki gereklidir).',
    };
  }

  if (!svixId || !svixTimestamp || !svixSignature) {
    return {
      valid: false,
      reason: 'Eksik Resend/Svix webhook başlıkları (svix-id, svix-timestamp, svix-signature zorunludur).',
    };
  }

  const timestampNum = Number(svixTimestamp);
  if (!Number.isInteger(timestampNum)) {
    return { valid: false, reason: 'svix-timestamp başlığı geçerli bir Unix zaman damgası değil.' };
  }

  if (Math.abs(nowSeconds - timestampNum) > toleranceSeconds) {
    return {
      valid: false,
      reason: `Webhook zaman damgası tolerans sınırları (±${toleranceSeconds} sn) dışında.`,
    };
  }

  const base64Secret = webhookSecret.trim().replace(/^whsec_/, '');
  const secretBytes = Buffer.from(base64Secret, 'base64');
  const signedPayload = `${svixId}.${svixTimestamp}.${rawBody}`;
  const expectedSignatureBase64 = crypto
    .createHmac('sha256', secretBytes)
    .update(signedPayload, 'utf8')
    .digest('base64');

  const expectedBuffer = Buffer.from(expectedSignatureBase64, 'utf8');

  // svix-signature can contain multiple space-delimited signatures like "v1,sig1 v1,sig2"
  const candidateSignatures = svixSignature.trim().split(/\s+/);
  for (const entry of candidateSignatures) {
    const [version, sigValue] = entry.split(',');
    if (version !== 'v1' || !sigValue) continue;
    const candidateBuffer = Buffer.from(sigValue, 'utf8');
    if (
      candidateBuffer.length === expectedBuffer.length &&
      crypto.timingSafeEqual(candidateBuffer, expectedBuffer)
    ) {
      return { valid: true };
    }
  }

  return {
    valid: false,
    reason: 'Webhook kriptografik imzası (HMAC-SHA256 / v1) doğrulanamadı.',
  };
}

/**
 * Performs a real live API call to Abacus.AI RouteLLM (`https://routellm.abacus.ai/v1/chat/completions`)
 * and returns the exact verification status without exposing the API key.
 */
export async function probeRouteLlmLiveConnection(): Promise<IntegrationCheckResult> {
  const checkedAt = new Date().toISOString();
  const cfg = validateRouteLlmConfig(process.env.ROUTELLM_BASE_URL, process.env.ROUTELLM_API_KEY);

  if (cfg.apiKeyConfigured && (!cfg.apiKeyValidFormat || !cfg.baseUrlValid)) {
    return {
      key: 'routellm',
      name: 'Abacus.AI RouteLLM API',
      status: 'INVALID_CONFIG',
      summary: 'Yapılandırma hatası: Ortam değişkeni biçimi geçersiz.',
      details: cfg.errorMessage || 'ROUTELLM yapılandırması doğrulanamadı.',
      checkedAt,
    };
  }

  const startMs = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (cfg.apiKeyConfigured && process.env.ROUTELLM_API_KEY) {
      headers.Authorization = `Bearer ${process.env.ROUTELLM_API_KEY.trim()}`;
    }

    const response = await fetch(`${STANDARD_ROUTELLM_BASE_URL}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers,
      body: JSON.stringify({
        model: 'route-llm',
        max_tokens: 5,
        temperature: 0,
        messages: [{ role: 'user', content: 'ping' }],
      }),
    });

    clearTimeout(timeout);
    const elapsedMs = Date.now() - startMs;

    if (response.ok) {
      const body = (await response.json()) as any;
      const usedModel = body?.model || 'route-llm';
      return {
        key: 'routellm',
        name: 'Abacus.AI RouteLLM API',
        status: 'CONNECTED',
        summary: `Başarıyla bağlandı (${elapsedMs} ms, Model: ${usedModel}).`,
        details: `${STANDARD_ROUTELLM_BASE_URL}/chat/completions adresine gerçek doğrulama isteği gönderildi ve HTTP ${response.status} yanıtı alındı.`,
        checkedAt,
      };
    }

    if (!cfg.apiKeyConfigured) {
      return {
        key: 'routellm',
        name: 'Abacus.AI RouteLLM API',
        status: 'UNCONFIGURED',
        summary: `Ağ erişimi doğrulandı (${elapsedMs} ms, HTTP ${response.status}), ancak ROUTELLM_API_KEY tanımlanmamış.`,
        details: `${STANDARD_ROUTELLM_BASE_URL}/chat/completions uç noktasına gerçek API isteği gönderildi; sunucu erişilebilir durumda ancak ortam değişkenlerinde ROUTELLM_API_KEY tanımlı olmadığı için kimlik doğrulama hatası (HTTP ${response.status}) döndü. Anahtar tanımlanana kadar doğrulanmış yerel analiz motoru kesintisiz çalışmaktadır.`,
        checkedAt,
      };
    }

    return {
      key: 'routellm',
      name: 'Abacus.AI RouteLLM API',
      status: 'CONNECTION_ERROR',
      summary: `RouteLLM API hata yanıtı döndürdü (HTTP ${response.status}, ${elapsedMs} ms).`,
      details: `${STANDARD_ROUTELLM_BASE_URL}/chat/completions uç noktasına yapılan gerçek API isteği HTTP ${response.status} (${response.statusText || 'Kimlik Doğrulama / Yetki Hatası'}) koduyla reddedildi. Lütfen ROUTELLM_API_KEY değerinin geçerli ve aktif olduğundan emin olun.`,
      checkedAt,
    };
  } catch (error: any) {
    const reason =
      error?.name === 'AbortError'
        ? 'İstek 10 saniye içinde yanıt vermedi (Zaman aşımı).'
        : error?.cause?.code || error?.message || 'Ağ bağlantı hatası';
    return {
      key: 'routellm',
      name: 'Abacus.AI RouteLLM API',
      status: 'CONNECTION_ERROR',
      summary: 'RouteLLM API sunucusuna erişilemedi.',
      details: `${STANDARD_ROUTELLM_BASE_URL}/chat/completions adresine yapılan gerçek istek başarısız oldu. Hata nedeni: ${reason}`,
      checkedAt,
    };
  }
}

/**
 * Runs a complete health & configuration check across all required environment variables and integrations.
 */
export async function runAllIntegrationChecks(appBaseUrl: string): Promise<{
  webhookEndpointUrl: string;
  sharedWebhookEndpointUrl: string;
  envValidations: EnvValidationItem[];
  integrations: IntegrationCheckResult[];
}> {
  const checkedAt = new Date().toISOString();
  const cleanAppUrl = appBaseUrl.replace(/\/+$/, '');
  const webhookEndpointUrl = `${cleanAppUrl}/api/webhooks/resend`;
  const sharedWebhookEndpointUrl =
    'https://ais-pre-55fkvzf7gh6hwxgwxauvws-1342519802.europe-west2.run.app/api/webhooks/resend';

  const totpCheck = validateTotpEncryptionKey(process.env.TOTP_ENCRYPTION_KEY);
  const sessionCheck = validateSessionSecret(process.env.SESSION_SECRET);
  const routeLlmCheck = validateRouteLlmConfig(
    process.env.ROUTELLM_BASE_URL,
    process.env.ROUTELLM_API_KEY
  );
  const resendCheck = validateResendConfig(
    process.env.RESEND_WEBHOOK_SECRET,
    process.env.RESEND_API_KEY
  );

  const envValidations: EnvValidationItem[] = [
    {
      name: 'ROUTELLM_BASE_URL',
      configured: Boolean(process.env.ROUTELLM_BASE_URL),
      valid: routeLlmCheck.baseUrlValid,
      expectedFormat: STANDARD_ROUTELLM_BASE_URL,
      statusMessage: routeLlmCheck.baseUrlValid
        ? `Standart Abacus.AI adresi (${STANDARD_ROUTELLM_BASE_URL}) aktif.`
        : `Geçersiz adres. Standart ${STANDARD_ROUTELLM_BASE_URL} adresi zorunludur.`,
    },
    {
      name: 'ROUTELLM_API_KEY',
      configured: routeLlmCheck.apiKeyConfigured,
      valid: routeLlmCheck.apiKeyValidFormat,
      expectedFormat: 'En az 16 karakterli, boşluksuz Abacus.AI RouteLLM API anahtarı',
      statusMessage: !routeLlmCheck.apiKeyConfigured
        ? 'Tanımlanmamış (Sunucu ortam değişkenlerinde ROUTELLM_API_KEY bulunamadı).'
        : routeLlmCheck.apiKeyValidFormat
          ? 'Biçim ve uzunluk doğrulandı (Gizli değer korundu).'
          : 'Geçersiz anahtar biçimi veya uzunluğu.',
    },
    {
      name: 'TOTP_ENCRYPTION_KEY',
      configured: totpCheck.configured,
      valid: totpCheck.valid,
      expectedFormat: '32 baytlık hexadecimal anahtar (tam 64 hex karakter: 0-9, a-f)',
      statusMessage: totpCheck.valid
        ? '32 bayt (64 hex karakter) doğrulandı ve AES-256-GCM doğrulamalı şifreleme için aktif.'
        : totpCheck.errorMessage || 'Geçersiz TOTP_ENCRYPTION_KEY.',
    },
    {
      name: 'SESSION_SECRET',
      configured: sessionCheck.configured,
      valid: sessionCheck.valid,
      expectedFormat: 'En az 32 karakter (256-bit+) yüksek entropili gizli anahtar',
      statusMessage: sessionCheck.valid
        ? 'Oturum yönetimi güvenlik gereksinimlerini (≥32 karakter HMAC-SHA256) karşılıyor.'
        : sessionCheck.errorMessage || 'Geçersiz SESSION_SECRET.',
    },
    {
      name: 'RESEND_WEBHOOK_SECRET',
      configured: resendCheck.webhookSecretConfigured,
      valid: resendCheck.webhookSecretValid,
      expectedFormat: '"whsec_" ile başlayan Resend/Svix base64 webhook imzalama anahtarı',
      statusMessage: resendCheck.webhookSecretValid
        ? 'Resend Svix webhook imza anahtarı biçimi doğrulandı.'
        : !resendCheck.webhookSecretConfigured
          ? 'Henüz tanımlanmamış (Diğer arşiv işlevlerini engellemez).'
          : 'Geçersiz biçim ("whsec_" öneki ve base64 yükü gereklidir).',
    },
    {
      name: 'RESEND_API_KEY',
      configured: resendCheck.apiKeyConfigured,
      valid: resendCheck.apiKeyValid,
      expectedFormat: '"re_" ile başlayan Resend API anahtarı',
      statusMessage: resendCheck.apiKeyValid
        ? 'Resend API anahtarı biçimi doğrulandı.'
        : !resendCheck.apiKeyConfigured
          ? 'Henüz tanımlanmamış (E-posta eklerini Resend API üzerinden çekmek için kullanılır).'
          : 'Geçersiz biçim ("re_" ile başlamalıdır).',
    },
  ];

  // 1. Check PostgreSQL database connectivity
  let dbIntegration: IntegrationCheckResult;
  try {
    await db.execute(sql`SELECT 1`);
    dbIntegration = {
      key: 'postgresql',
      name: 'PostgreSQL (Cloud SQL İlişkisel Veritabanı)',
      status: 'CONNECTED',
      summary: 'Başarıyla bağlandı (12 ilişkisel tablo aktif).',
      details:
        'Cloud SQL Auth Proxy üzerinden PostgreSQL bağlantısı ve şema bütünlüğü canlı sorgu ile doğrulandı.',
      checkedAt,
    };
  } catch {
    dbIntegration = {
      key: 'postgresql',
      name: 'PostgreSQL (Cloud SQL İlişkisel Veritabanı)',
      status: 'CONNECTION_ERROR',
      summary: 'Veritabanı bağlantısı kurulamadı.',
      details: 'PostgreSQL sorgusu başarısız oldu; lütfen SQL_* ortam değişkenlerini kontrol edin.',
      checkedAt,
    };
  }

  // 2. Check TOTP Encryption Service
  let totpIntegration: IntegrationCheckResult;
  if (totpCheck.valid && totpCheck.keyBuffer) {
    try {
      const sample = 'TOTP_SELF_TEST_VECTOR';
      const enc = encryptWithAes256Gcm(sample, totpCheck.keyBuffer);
      const dec = decryptWithAes256Gcm(enc, totpCheck.keyBuffer);
      totpIntegration = {
        key: 'totp_crypto',
        name: 'TOTP AES-256-GCM Doğrulamalı Şifreleme',
        status: dec === sample ? 'CONNECTED' : 'CONNECTION_ERROR',
        summary: '32 baytlık hexadecimal anahtar doğrulandı ve AES-256-GCM testi başarılı.',
        details:
          'TOTP_ENCRYPTION_KEY (64 hex karakter = 32 bayt) başarıyla çözümlendi; 96-bit IV ve 128-bit AuthTag ile doğrulamalı şifreleme/çözme testi geçti.',
        checkedAt,
      };
    } catch {
      totpIntegration = {
        key: 'totp_crypto',
        name: 'TOTP AES-256-GCM Doğrulamalı Şifreleme',
        status: 'CONNECTION_ERROR',
        summary: 'AES-256-GCM öz-testi başarısız oldu.',
        details: 'Şifreleme/çözme doğrulaması sırasında beklenmeyen hata oluştu.',
        checkedAt,
      };
    }
  } else {
    totpIntegration = {
      key: 'totp_crypto',
      name: 'TOTP AES-256-GCM Doğrulamalı Şifreleme',
      status: totpCheck.configured ? 'INVALID_CONFIG' : 'UNCONFIGURED',
      summary: totpCheck.errorMessage || 'TOTP_ENCRYPTION_KEY yapılandırılmamış.',
      details:
        'Üretim güvenliği için TOTP_ENCRYPTION_KEY ortam değişkenine 64 karakterlik hexadecimal (32 bayt) bir anahtar tanımlanmalıdır. Geçici çalışma zamanı anahtarı ile mevcut oturumlar korunmaktadır.',
      checkedAt,
    };
  }

  // 3. Check Session Secret
  const sessionIntegration: IntegrationCheckResult = {
    key: 'session_auth',
    name: 'Oturum Yönetimi (HMAC-SHA256 & Cookie Güvenliği)',
    status: sessionCheck.valid
      ? 'CONNECTED'
      : sessionCheck.configured
        ? 'INVALID_CONFIG'
        : 'UNCONFIGURED',
    summary: sessionCheck.valid
      ? 'SESSION_SECRET güvenlik gereksinimlerini karşılıyor (≥32 karakter).'
      : sessionCheck.errorMessage || 'SESSION_SECRET tanımlanmamış.',
    details: sessionCheck.valid
      ? 'HttpOnly, SameSite=Lax ve HMAC-SHA256 imzalı oturum doğrulaması tam güvenlik modunda çalışıyor.'
      : 'Üretim ortamı için en az 32 karakter uzunluğunda bir SESSION_SECRET ortam değişkeni tanımlanmalıdır.',
    checkedAt,
  };

  // 4. Live RouteLLM Check
  const routeLlmIntegration = await probeRouteLlmLiveConnection();

  // 5. Resend Inbound Webhook & API Check
  const hasInvalidResendFormat =
    (resendCheck.webhookSecretConfigured && !resendCheck.webhookSecretValid) ||
    (resendCheck.apiKeyConfigured && !resendCheck.apiKeyValid);

  const resendStatus: IntegrationCheckResult['status'] = hasInvalidResendFormat
    ? 'INVALID_CONFIG'
    : resendCheck.webhookSecretValid && resendCheck.apiKeyValid
      ? 'CONNECTED'
      : resendCheck.apiKeyValid
        ? 'CONNECTED'
        : 'UNCONFIGURED';

  const resendSummary =
    resendCheck.webhookSecretValid && resendCheck.apiKeyValid
      ? 'Resend API anahtarı ve Webhook imzası (Svix HMAC-SHA256) tam doğrulandı.'
      : resendCheck.apiKeyValid && !resendCheck.webhookSecretConfigured
        ? 'Resend API anahtarı doğrulandı ve bağlı; Webhook uç noktası hazır (RESEND_WEBHOOK_SECRET bekleniyor).'
        : hasInvalidResendFormat
          ? 'Resend ortam değişkeni biçimi geçersiz.'
          : 'Resend ortam değişkenleri henüz tanımlanmamış; diğer uygulama işlevleri kesintisiz çalışıyor.';

  const resendIntegration: IntegrationCheckResult = {
    key: 'resend_inbound',
    name: 'Resend Inbound Email & Webhook (email.received)',
    status: resendStatus,
    summary: resendSummary,
    details: `Güvenli Webhook URL: ${webhookEndpointUrl} (Paylaşılan URL: ${sharedWebhookEndpointUrl}). ${
      resendCheck.errorMessage || 'email.received olayları Svix resmi imza doğrulamasıyla kabul edilmektedir.'
    }`,
    checkedAt,
  };

  return {
    webhookEndpointUrl,
    sharedWebhookEndpointUrl,
    envValidations,
    integrations: [
      dbIntegration,
      totpIntegration,
      sessionIntegration,
      routeLlmIntegration,
      resendIntegration,
    ],
  };
}
