import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  normalizeDocumentNumber,
  extractDocumentNumberFromText,
  extractDocumentDateFromText,
  parseIlgiReferences,
  evaluateDuplicateOrConflict,
  mergeAiAnalysisWithUserEdits,
  computeSemanticEmbedding,
  cosineSimilarity,
  scoreDocumentForSearch,
  generateBase32Secret,
  generateTotpCode,
  verifyTotpCode,
} from './archiveLogic';
import {
  validateTotpEncryptionKey,
  encryptWithAes256Gcm,
  decryptWithAes256Gcm,
  validateSessionSecret,
  verifyResendWebhookSignature,
  STANDARD_ROUTELLM_BASE_URL,
  validateRouteLlmConfig,
} from '../services/envAndIntegrations';

test('normalizeDocumentNumber normalizes whitespace, dashes, and slashes without colliding distinct numbers', () => {
  assert.equal(normalizeDocumentNumber(' 2025 / 12345 '), '2025/12345');
  assert.equal(normalizeDocumentNumber('e-89451234 – 105.02 / 2025-12345'), 'E-89451234-105.02/2025-12345');
  assert.notEqual(normalizeDocumentNumber('2025/123'), normalizeDocumentNumber('2025/1234'));
});

test('extractDocumentNumberFromText and extractDocumentDateFromText extract official DHMI headers accurately', () => {
  const sampleText = `T.C. ULAŞTIRMA VE ALTYAPI BAKANLIĞI
Devlet Hava Meydanları İşletmesi Genel Müdürlüğü
Sayı : E-89451234-105.02-2025/12345
Tarih: 12.03.2025
Konu : Ankara Esenboğa Havalimanı Mania Planı`;

  const extractedNo = extractDocumentNumberFromText(sampleText);
  assert.equal(extractedNo.documentNumber, 'E-89451234-105.02-2025/12345');
  assert.equal(extractedNo.confidence, 'HIGH');

  const extractedDate = extractDocumentDateFromText(sampleText);
  assert.equal(extractedDate, '12.03.2025');
});

test('parseIlgiReferences parses multi-line Turkish İLGİ references with dates and document numbers', () => {
  const sampleText = `Sayı: 2025/12345
Konu: Teknik Değerlendirme
İLGİ:
a) 15.03.2023 tarihli ve E-123456 sayılı yazımız.
b) 24.08.2024 tarihli ve 2024/8420 sayılı DHMİ Genel Müdürlüğü yazısı.

GENEL MÜDÜRLÜĞÜNE
İlgi (a) ve (b) kayıtlı yazılarımız ile...`;

  const refs = parseIlgiReferences(sampleText);
  assert.equal(refs.length, 2);
  assert.equal(refs[0].referencedDocNumber, 'E-123456');
  assert.equal(refs[0].referencedDate, '15.03.2023');
  assert.equal(refs[1].referencedDocNumber, '2024/8420');
  assert.equal(refs[1].referencedDate, '24.08.2024');
});

test('evaluateDuplicateOrConflict distinguishes identical duplicates from revision conflicts', () => {
  const existing = [
    {
      id: 10,
      documentNumber: '2025/12345',
      normalizedDocNumber: '2025/12345',
      sha256Hash: 'hash_abc_111',
      title: 'Esenboğa Mania Planı',
    },
  ];

  // Same doc number + same hash => duplicate source attachment
  const dup = evaluateDuplicateOrConflict('2025 / 12345', 'hash_abc_111', existing);
  assert.equal(dup.action, 'MUKERRER_AYNI_ICERIK');

  // Same doc number + different hash => revision conflict (must NOT overwrite or delete)
  const conflict = evaluateDuplicateOrConflict('2025/12345', 'hash_xyz_999', existing);
  assert.equal(conflict.action, 'REVIZYON_CAKISMA');

  // Different doc number + new hash => new document
  const fresh = evaluateDuplicateOrConflict('2025/99999', 'hash_new_777', existing);
  assert.equal(fresh.action, 'YENI_BELGE');
});

test('mergeAiAnalysisWithUserEdits protects user-modified fields during re-analysis', () => {
  const current = {
    title: 'Kullanıcı Tarafından Düzeltilmiş Başlık',
    shortDescription: 'Eski açıklama',
    airport: 'Ankara Esenboğa Havalimanı',
  };
  const aiNew = {
    title: 'AI Yeni Başlık Önerisi',
    shortDescription: 'AI Yeni Spesifik Açıklama',
    airport: 'Belirlenemedi',
  };

  const merged = mergeAiAnalysisWithUserEdits(current, aiNew, ['title', 'airport']);
  assert.equal(merged.title, 'Kullanıcı Tarafından Düzeltilmiş Başlık');
  assert.equal(merged.airport, 'Ankara Esenboğa Havalimanı');
  assert.equal(merged.shortDescription, 'AI Yeni Spesifik Açıklama');
});

test('semantic embedding and hybrid search rank exact doc numbers first and link "Engel sınırlama yüzeyleri" to "mania"', () => {
  const embMania = computeSemanticEmbedding('Esenboğa Havalimanı mania planı ve yaklaşma yüzeyi analizi');
  const embOls = computeSemanticEmbedding('Engel sınırlama yüzeyleri (OLS) kriterleri');
  const sim = cosineSimilarity(embMania, embOls);
  assert.equal(sim > 0.7, true);

  const doc1 = {
    id: 1,
    documentNumber: '2025/12345',
    normalizedDocNumber: '2025/12345',
    title: 'Ankara Esenboğa Havalimanı Mania Planı Hakkında Teknik Değerlendirme',
    shortDescription: 'Mania kriterleri ve mania kotlarının incelenmesi.',
    airport: 'Ankara Esenboğa Havalimanı',
    projectName: 'Esenboğa Kuzey Yaklaşma Hattı',
    senderOrg: 'DHMİ Genel Müdürlüğü',
    relatedDepartment: 'İnşaat ve Emlak Dairesi Başkanlığı',
    keywords: ['MANİA', 'ESB'],
    extractedText: 'Esenboğa mania planı kapsamında kazuistik değerlendirme yapılmıştır.',
    ilgiNumbers: ['E-123456'],
    embedding: embMania,
  };

  // Semantic search for "Engel sınırlama yüzeyleri" matches doc1 even though literal phrase isn't in doc1
  const semanticHit = scoreDocumentForSearch(doc1, 'Engel sınırlama yüzeyleri');
  assert.equal(semanticHit.score > 50, true);
  assert.equal(semanticHit.isSemanticOnly, true);

  // Exact document number search gives massive priority boost (> 1000)
  const exactNoHit = scoreDocumentForSearch(doc1, '2025/12345');
  assert.equal(exactNoHit.score >= 1000, true);
});

test('RFC 6238 TOTP verification validates current code and blocks replay of used time window', () => {
  const secret = generateBase32Secret();
  const now = 1763050000000;
  const code = generateTotpCode(secret, now);

  const firstAttempt = verifyTotpCode(secret, code, null, now);
  assert.equal(firstAttempt.valid, true);
  assert.notEqual(firstAttempt.matchedWindow, null);

  // Replay attempt in the same 30s window must be rejected
  const replayAttempt = verifyTotpCode(secret, code, firstAttempt.matchedWindow, now);
  assert.equal(replayAttempt.valid, false);
});

test('validateTotpEncryptionKey enforces 32-byte hexadecimal key (64 hex chars) and AES-256-GCM authenticated encryption without leaking secrets', () => {
  const validHexKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const checkValid = validateTotpEncryptionKey(validHexKey);
  assert.equal(checkValid.valid, true);
  assert.equal(checkValid.keyBuffer?.length, 32);

  // Short or non-hex keys must fail and NEVER include the secret in errorMessage
  const invalidSecret = 'my_super_secret_non_hex_value_12345';
  const checkInvalid = validateTotpEncryptionKey(invalidSecret);
  assert.equal(checkInvalid.valid, false);
  assert.equal(checkInvalid.errorMessage?.includes(invalidSecret), false);

  // Authenticated encryption & tamper rejection
  const plainTotpSecret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
  const ciphertext = encryptWithAes256Gcm(plainTotpSecret, checkValid.keyBuffer!);
  const decrypted = decryptWithAes256Gcm(ciphertext, checkValid.keyBuffer!);
  assert.equal(decrypted, plainTotpSecret);

  // Tampering with ciphertext must fail GCM authentication tag verification
  const tampered = ciphertext.slice(0, -2) + (ciphertext.endsWith('a') ? 'b' : 'a');
  assert.throws(() => decryptWithAes256Gcm(tampered, checkValid.keyBuffer!));
});

test('validateSessionSecret and validateRouteLlmConfig enforce strict length/format and standard Abacus.AI base URL', () => {
  assert.equal(STANDARD_ROUTELLM_BASE_URL, 'https://routellm.abacus.ai/v1');

  const shortSession = 'short_secret_value';
  const sessionInvalid = validateSessionSecret(shortSession);
  assert.equal(sessionInvalid.valid, false);
  assert.equal(sessionInvalid.errorMessage?.includes(shortSession), false);

  const strongSession = 'a'.repeat(48);
  assert.equal(validateSessionSecret(strongSession).valid, true);

  const routeCfg = validateRouteLlmConfig(undefined, undefined);
  assert.equal(routeCfg.baseUrl, 'https://routellm.abacus.ai/v1');
  assert.equal(routeCfg.baseUrlValid, true);
});

test('verifyResendWebhookSignature verifies official Resend/Svix email.received HMAC-SHA256 signatures and rejects invalid signatures', () => {
  const secretRawBytes = Buffer.from('0123456789abcdef0123456789abcdef', 'utf8');
  const webhookSecret = `whsec_${secretRawBytes.toString('base64')}`;
  const svixId = 'msg_2p9Z8kL3mN4qR5sT6uV7wX8yZ';
  const nowSeconds = 1763050000;
  const svixTimestamp = String(nowSeconds);
  const rawBody = JSON.stringify({
    type: 'email.received',
    created_at: '2026-11-13T20:00:00.000Z',
    data: {
      email_id: '4ef9a417-02e9-4d39-ad75-9611e0fcc33c',
      from: 'DHMİ Genel Müdürlüğü <evrak@dhmi.gov.tr>',
      to: ['arsiv@dhmi-dokuman.resend.app'],
      subject: 'FW: Esenboğa Mania Planı Teknik Görüşü',
    },
  });

  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
  const validHmacBase64 = crypto
    .createHmac('sha256', secretRawBytes)
    .update(signedContent, 'utf8')
    .digest('base64');

  const okResult = verifyResendWebhookSignature({
    rawBody,
    svixId,
    svixTimestamp,
    svixSignature: `v1,${validHmacBase64}`,
    webhookSecret,
    nowSeconds,
  });
  assert.equal(okResult.valid, true);

  const badSigResult = verifyResendWebhookSignature({
    rawBody,
    svixId,
    svixTimestamp,
    svixSignature: 'v1,aW52YWxpZF9zaWduYXR1cmVfYmFzZTY0X3ZhbHVl',
    webhookSecret,
    nowSeconds,
  });
  assert.equal(badSigResult.valid, false);
});

