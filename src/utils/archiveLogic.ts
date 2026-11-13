import crypto from 'node:crypto';

export interface ExtractedIlgiReference {
  referencedDocNumber: string;
  normalizedRefDocNumber: string;
  referencedDate: string | null;
  originalIlgiText: string;
  pageOrSection: string;
}

export type DuplicateDecision =
  | { action: 'MUKERRER_AYNI_ICERIK'; existingDocumentId: number; reason: string }
  | { action: 'MUKERRER_DOSYA_HASH'; existingDocumentId: number; reason: string }
  | { action: 'REVIZYON_CAKISMA'; conflictingDocumentId: number; reason: string }
  | { action: 'YENI_BELGE'; reason: string };

export interface ExistingDocSummary {
  id: number;
  documentNumber: string | null;
  normalizedDocNumber: string | null;
  sha256Hash: string;
  title: string;
}

/**
 * Normalizes Turkish characters and case for tolerant search & matching.
 */
export function normalizeTurkishText(input: string | null | undefined): string {
  if (!input) return '';
  return input
    .replace(/İ/g, 'i')
    .replace(/I/g, 'i')
    .replace(/ı/g, 'i')
    .replace(/Ğ/g, 'g')
    .replace(/ğ/g, 'g')
    .replace(/Ü/g, 'u')
    .replace(/ü/g, 'u')
    .replace(/Ş/g, 's')
    .replace(/ş/g, 's')
    .replace(/Ö/g, 'o')
    .replace(/ö/g, 'o')
    .replace(/Ç/g, 'c')
    .replace(/ç/g, 'c')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Controlled normalization of official DHMİ document numbers.
 * Normalizes spaces, unicode dashes, and slashes while preserving structural separators
 * so distinct numbers (e.g. 2025/123 vs 2025/1234 or 2024/12-3 vs 2024/123) never collide.
 */
export function normalizeDocumentNumber(docNo: string | null | undefined): string {
  if (!docNo) return '';
  return docNo
    .trim()
    .replace(/İ/g, 'I')
    .replace(/ı/g, 'I')
    .toUpperCase()
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/[\\⁄∕]/g, '/')
    .replace(/\s*([/-])\s*/g, '$1')
    .replace(/\s+/g, '');
}

/**
 * Rule-based extraction of official document number from Turkish correspondence text.
 */
export function extractDocumentNumberFromText(text: string): {
  documentNumber: string | null;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  evidence: string | null;
} {
  if (!text) return { documentNumber: null, confidence: 'LOW', evidence: null };

  // Pattern 1: Explicit Sayı / Belge No header line
  const sayiLineRegex = /(?:Sayı|SAYI|Belge\s*No|BELGE\s*NO|Evrak\s*No)\s*[:：]\s*([^\r\n]+)/i;
  const sayiMatch = text.match(sayiLineRegex);
  if (sayiMatch && sayiMatch[1]) {
    const line = sayiMatch[1].trim();
    // Look for E-12345678-...-2025/12345 or 2025/12345 or E-123456
    const codeMatch = line.match(
      /(E-[A-Z0-9.-]+-\d{4}\/\d+|E-\d{5,15}|\d{4}\/\d{3,10}|B\.\d+(?:\.[A-Z0-9]+)+-\d{4}\/\d+)/i
    );
    if (codeMatch) {
      return {
        documentNumber: codeMatch[1].trim(),
        confidence: 'HIGH',
        evidence: sayiMatch[0].trim(),
      };
    }
  }

  // Pattern 2: Standalone official DHMİ number formats in header area (first 1200 chars)
  const headerSlice = text.slice(0, 1200);
  const directMatch = headerSlice.match(
    /\b(E-\d{6,12}-\d{3}\.\d{2}-\d{4}\/\d{3,8}|\d{4}\/\d{4,8}|E-\d{6,10})\b/i
  );
  if (directMatch) {
    return {
      documentNumber: directMatch[1].trim(),
      confidence: 'MEDIUM',
      evidence: directMatch[0].trim(),
    };
  }

  return { documentNumber: null, confidence: 'LOW', evidence: null };
}

/**
 * Rule-based extraction of document date (DD.MM.YYYY or YYYY-MM-DD) from document text.
 */
export function extractDocumentDateFromText(text: string): string | null {
  if (!text) return null;
  const headerSlice = text.slice(0, 1500);
  const dateHeader = headerSlice.match(/(?:Tarih|TARİH)\s*[:：]\s*(\d{2}[./]\d{2}[./]\d{4})/i);
  if (dateHeader) {
    return dateHeader[1].replace(/\//g, '.');
  }
  const generalDate = headerSlice.match(/\b(\d{2}\.\d{2}\.20\d{2})\b/);
  if (generalDate) {
    return generalDate[1];
  }
  return null;
}

/**
 * Parses the official İLGİ section in Turkish correspondence and extracts structured references.
 */
export function parseIlgiReferences(text: string): ExtractedIlgiReference[] {
  if (!text) return [];
  const results: ExtractedIlgiReference[] = [];
  const lines = text.split(/\r?\n/);

  let inIlgiSection = false;
  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine) {
      if (inIlgiSection) {
        // Check if next non-empty line continues with b), c), etc.
        const nextLine = (lines[i + 1] || '').trim();
        if (!/^[a-zçğıöşü0-9]\s*[).:-]/i.test(nextLine)) {
          inIlgiSection = false;
        }
      }
      continue;
    }

    const ilgiStartMatch = rawLine.match(/^(?:İLGİ|İlgi|İlgiler|İLGİLER)\s*[:：]\s*(.*)$/);
    if (ilgiStartMatch) {
      inIlgiSection = true;
      const remainder = ilgiStartMatch[1].trim();
      if (remainder) {
        const parsed = parseSingleIlgiLine(remainder, `Sayfa 1 · Satır ${i + 1}`);
        if (parsed) results.push(parsed);
      }
      continue;
    }

    if (inIlgiSection) {
      // Stop if we hit main body salutation or new section header
      if (
        /^(?:GENEL MÜDÜRLÜĞÜNE|DAİRESİ BAŞKANLIĞINA|BAKANLIĞINA|KONU\s*:|Sayın\s)/i.test(rawLine)
      ) {
        inIlgiSection = false;
        continue;
      }

      const parsed = parseSingleIlgiLine(rawLine, `Sayfa 1 · Satır ${i + 1}`);
      if (parsed) {
        results.push(parsed);
      } else if (!/^[a-zçğıöşü0-9]\s*[).:-]/i.test(rawLine)) {
        inIlgiSection = false;
      }
    }
  }

  // Deduplicate by normalizedRefDocNumber
  const seen = new Set<string>();
  return results.filter((item) => {
    if (seen.has(item.normalizedRefDocNumber)) return false;
    seen.add(item.normalizedRefDocNumber);
    return true;
  });
}

function parseSingleIlgiLine(line: string, pageOrSection: string): ExtractedIlgiReference | null {
  // Extract date like 15.03.2023
  const dateMatch = line.match(/(\d{2}[./]\d{2}[./]20\d{2})/);
  const referencedDate = dateMatch ? dateMatch[1].replace(/\//g, '.') : null;

  // Extract official reference number patterns:
  // e.g. "E-123456 sayılı", "2024/8420 sayılı", "E-89451234-105.02-2024/1120 sayılı"
  const docNoPatterns = [
    /(?:ve\s+|sayılı\s+)(E-[A-Z0-9.-]+-\d{4}\/\d+|E-\d{4,15}|\d{4}\/\d{3,10})/i,
    /\b(E-[A-Z0-9.-]+-\d{4}\/\d+|E-\d{5,15}|\d{4}\/\d{3,10})\s*sayılı/i,
    /\b(E-\d{5,15}|\d{4}\/\d{3,10})\b/i,
  ];

  for (const pattern of docNoPatterns) {
    const match = line.match(pattern);
    if (match && match[1]) {
      const refNo = match[1].trim();
      // Ignore if it accidentally matched the year part of the date
      if (referencedDate && referencedDate.endsWith(refNo)) continue;
      return {
        referencedDocNumber: refNo,
        normalizedRefDocNumber: normalizeDocumentNumber(refNo),
        referencedDate,
        originalIlgiText: line.replace(/^[a-z0-9]\)\s*/i, '').trim(),
        pageOrSection,
      };
    }
  }

  return null;
}

/**
 * Evaluates duplicate and revision/conflict rules according to Section 10.3:
 * - Same doc number + same SHA-256 content => MUKERRER_AYNI_ICERIK
 * - Same doc number + different SHA-256 content => REVIZYON_CAKISMA (do NOT auto-merge or delete!)
 * - Missing doc number + same SHA-256 content => MUKERRER_DOSYA_HASH
 * - Otherwise => YENI_BELGE
 */
export function evaluateDuplicateOrConflict(
  incomingDocNumber: string | null | undefined,
  incomingSha256: string,
  existingDocs: ExistingDocSummary[]
): DuplicateDecision {
  const normalizedIncoming = normalizeDocumentNumber(incomingDocNumber);

  if (normalizedIncoming) {
    const sameNumberDocs = existingDocs.filter(
      (d) => d.normalizedDocNumber && d.normalizedDocNumber === normalizedIncoming
    );

    const exactSameHash = sameNumberDocs.find((d) => d.sha256Hash === incomingSha256);
    if (exactSameHash) {
      return {
        action: 'MUKERRER_AYNI_ICERIK',
        existingDocumentId: exactSameHash.id,
        reason: `Aynı belge numarası (${incomingDocNumber}) ve birebir aynı SHA-256 dosya özeti mevcut. Yeni kaynak mevcut belgeye bağlandı.`,
      };
    }

    if (sameNumberDocs.length > 0) {
      return {
        action: 'REVIZYON_CAKISMA',
        conflictingDocumentId: sameNumberDocs[0].id,
        reason: `Aynı belge numarası (${incomingDocNumber}) ile farklı içerikte dosya tespit edildi. Otomatik birleştirme yapılmadı; olası revizyon/çakışma olarak işaretlendi.`,
      };
    }
  }

  const hashMatch = existingDocs.find((d) => d.sha256Hash === incomingSha256);
  if (hashMatch) {
    return {
      action: 'MUKERRER_DOSYA_HASH',
      existingDocumentId: hashMatch.id,
      reason: `SHA-256 dosya özeti arşivdeki #${hashMatch.id} kaydıyla birebir eşleşti. Yeni kaynak mevcut belgeye eklendi.`,
    };
  }

  return {
    action: 'YENI_BELGE',
    reason: 'Benzersiz yeni arşiv belgesi.',
  };
}

/**
 * Preserves user-modified metadata fields when AI re-analyzes a document (Section 5.4 & 11.3).
 */
export function mergeAiAnalysisWithUserEdits<T extends Record<string, unknown>>(
  currentRecord: T,
  aiExtracted: Partial<T>,
  userModifiedFields: string[]
): T {
  const modifiedSet = new Set(userModifiedFields);
  const merged = { ...currentRecord };

  for (const [key, value] of Object.entries(aiExtracted)) {
    if (modifiedSet.has(key)) {
      // Never overwrite user-edited field
      continue;
    }
    if (value !== undefined && value !== null && value !== '') {
      (merged as Record<string, unknown>)[key] = value;
    }
  }
  return merged;
}

/**
 * Deterministic multilingual/Turkish aviation domain semantic embedding generator (24 dimensions).
 * Maps synonymous aviation, infrastructure, and regulatory concepts into shared vector dimensions
 * so queries like "Engel sınırlama yüzeyleri" semantically match "Mania planı" and "OLS".
 */
const SEMANTIC_CONCEPT_CLUSTERS: string[][] = [
  ['mania', 'engel sinirlama yuzeyleri', 'ols', 'yaklasma yuzeyi', 'gecis yuzeyi', 'ic yatay yuzey', 'konik yuzey', 'kaziye', 'yukseklik siniri', 'vinç', 'ruzgar turbini', 'bina yuksekligi'],
  ['apron', 'ucak park', 'pat sahalari', 'kapasite', 'koruk', 'yer hizmetleri', 'pushback', 'park pozisyonu', 'de-icing'],
  ['pist', 'runway', 'taksi yolu', 'taxiway', 'hizli cikis', 'esik', 'threshold', 'kaplama', 'pcn', 'acn', 'banket', 'resa'],
  ['seyrusefer', 'cns', 'atm', 'vor', 'dme', 'ils', 'radar', 'ssr', 'frekans', 'hava trafik', 'kule', 'yaklasma kontrol', 'navigasyon', 'pbn', 'rnav'],
  ['imar plani', 'belediye', 'nazim imar', 'uygulama imar', 'parsel', 'ada', 'kentsel donusum', 'kamulastirma', 'emlak', 'mulkiyet', 'tapu'],
  ['teknik gorus', 'teknik degerlendirme', 'havacilik analizi', 'emniyet degerlendirmesi', 'uygunluk gorusu', 'kurum gorusu', 'onay', 'inceleme raporu'],
  ['esenboga', 'ankara', 'esb', 'ltac', 'cubuk', 'akyurt'],
  ['antalya', 'ayt', 'ltai', 'lara', 'aksu'],
  ['istanbul', 'iga', 'ltfm', 'ataturk', 'ltba', 'sabiha gokcen', 'saw', 'ltfj'],
  ['izmir', 'adnan menderes', 'adb', 'ltbj', 'gaziemir'],
  ['trabzon', 'tzx', 'ltcg', 'karadeniz', 'dolgu pist'],
  ['mugla', 'dalaman', 'dlm', 'ltbs', 'milas', 'bodrum', 'bjv', 'ltfe'],
  ['insaat', 'muhendislik', 'altyapi', 'ustyapi', 'ihale', 'kesif', 'metraj', 'santiye', 'genisletme', 'modernizasyon'],
  ['ced', 'cevre', 'gurultu', 'emisyon', 'hidroloji', 'drenaj', 'su basmani'],
  ['enerji', 'gunes enerjisi', 'ges', 'yansima', 'parlama', 'glint', 'glare', 'yuksek gerilim', 'enh'],
  ['guvenlik', 'emniyet', 'sms', 'icao', 'annex 14', 'shgm', 'sht-mania', 'sht-hes', 'sertifikasyon'],
];

export function computeSemanticEmbedding(text: string): number[] {
  const norm = normalizeTurkishText(text);
  const vec = new Array(SEMANTIC_CONCEPT_CLUSTERS.length).fill(0);

  for (let i = 0; i < SEMANTIC_CONCEPT_CLUSTERS.length; i++) {
    const terms = SEMANTIC_CONCEPT_CLUSTERS[i];
    let score = 0;
    for (const term of terms) {
      if (norm.includes(term)) {
        score += term.includes(' ') ? 2.0 : 1.2;
      }
    }
    vec[i] = score;
  }

  // L2 normalize vector
  const magnitude = Math.sqrt(vec.reduce((acc, v) => acc + v * v, 0));
  if (magnitude > 0) {
    return vec.map((v) => Number((v / magnitude).toFixed(4)));
  }
  return vec;
}

export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA.length || !vecB.length || vecA.length !== vecB.length) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    magA += vecA[i] * vecA[i];
    magB += vecB[i] * vecB[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

export interface SearchableDocInput {
  id: number;
  documentNumber: string | null;
  normalizedDocNumber: string | null;
  title: string;
  shortDescription: string;
  detailedDescription?: string | null;
  airport?: string | null;
  projectName?: string | null;
  senderOrg?: string | null;
  relatedDepartment?: string | null;
  keywords: string[];
  extractedText: string;
  ilgiNumbers: string[];
  embedding: number[];
}

/**
 * Hybrid search ranker combining exact document number priority, full-text keyword matching,
 * and semantic similarity without letting semantic scores demote exact document number hits.
 */
export function scoreDocumentForSearch(
  doc: SearchableDocInput,
  rawQuery: string
): { score: number; matchReasons: string[]; isSemanticOnly: boolean } {
  const trimmed = rawQuery.trim();
  if (!trimmed) {
    return { score: 1, matchReasons: [], isSemanticOnly: false };
  }

  const matchReasons: string[] = [];
  let lexicalScore = 0;

  // 1. Check exact or normalized document number match (highest priority)
  const normQueryDocNo = normalizeDocumentNumber(trimmed);
  if (doc.normalizedDocNumber && normQueryDocNo.length >= 3) {
    if (doc.normalizedDocNumber === normQueryDocNo) {
      lexicalScore += 1000;
      matchReasons.push('Tam Belge Numarası Eşleşmesi');
    } else if (doc.normalizedDocNumber.includes(normQueryDocNo)) {
      lexicalScore += 350;
      matchReasons.push('Kısmi Belge Numarası Eşleşmesi');
    }
  }

  // Check İLGİ reference numbers
  for (const ilgiNo of doc.ilgiNumbers) {
    if (normalizeDocumentNumber(ilgiNo) === normQueryDocNo && normQueryDocNo.length >= 4) {
      lexicalScore += 400;
      matchReasons.push(`İLGİ Referansı Eşleşmesi (${ilgiNo})`);
    }
  }

  // 2. Tokenized Turkish-tolerant lexical search across fields
  const queryTokens = normalizeTurkishText(trimmed)
    .split(' ')
    .filter((t) => t.length >= 2);

  const normTitle = normalizeTurkishText(doc.title);
  const normShort = normalizeTurkishText(doc.shortDescription);
  const normDetailed = normalizeTurkishText(doc.detailedDescription);
  const normAirport = normalizeTurkishText(doc.airport);
  const normProject = normalizeTurkishText(doc.projectName);
  const normSender = normalizeTurkishText(doc.senderOrg);
  const normDept = normalizeTurkishText(doc.relatedDepartment);
  const normKeywords = doc.keywords.map((k) => normalizeTurkishText(k)).join(' ');
  const normFullText = normalizeTurkishText(doc.extractedText);

  let matchedTokensCount = 0;
  for (const token of queryTokens) {
    let tokenHit = false;
    const tokenDocNo = normalizeDocumentNumber(token);
    if (doc.normalizedDocNumber && tokenDocNo.length >= 4 && doc.normalizedDocNumber.includes(tokenDocNo)) {
      lexicalScore += 300;
      tokenHit = true;
    }
    if (normTitle.includes(token)) {
      lexicalScore += 45;
      tokenHit = true;
    }
    if (normKeywords.includes(token)) {
      lexicalScore += 40;
      tokenHit = true;
    }
    if (normAirport.includes(token) || normProject.includes(token)) {
      lexicalScore += 35;
      tokenHit = true;
    }
    if (normShort.includes(token) || normDetailed.includes(token)) {
      lexicalScore += 25;
      tokenHit = true;
    }
    if (normSender.includes(token) || normDept.includes(token)) {
      lexicalScore += 20;
      tokenHit = true;
    }
    if (normFullText.includes(token)) {
      lexicalScore += 15;
      tokenHit = true;
    }
    if (tokenHit) matchedTokensCount++;
  }

  if (queryTokens.length > 1 && matchedTokensCount === queryTokens.length) {
    lexicalScore += 80;
    matchReasons.push('Tüm Arama Terimleri Eşleşti');
  } else if (matchedTokensCount > 0 && matchReasons.length === 0) {
    matchReasons.push('Metin ve Metadata Eşleşmesi');
  }

  // 3. Semantic similarity score
  const queryEmbedding = computeSemanticEmbedding(trimmed);
  const sim = cosineSimilarity(queryEmbedding, doc.embedding);
  const semanticScore = sim >= 0.35 ? Math.round(sim * 95) : 0;

  if (semanticScore > 0 && lexicalScore === 0) {
    matchReasons.push(`Semantik Kavram İlişkisi (%${Math.round(sim * 100)})`);
  } else if (semanticScore >= 50 && lexicalScore > 0) {
    matchReasons.push('Hibrit (Tam Metin + Semantik)');
  }

  const totalScore = lexicalScore + semanticScore;
  return {
    score: totalScore,
    matchReasons,
    isSemanticOnly: lexicalScore === 0 && semanticScore > 0,
  };
}

/**
 * RFC 6238 TOTP (Google Authenticator / Microsoft Authenticator compatible) utilities.
 */
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateBase32Secret(byteLength = 20): string {
  const bytes = crypto.randomBytes(byteLength);
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

export function decodeBase32(base32: string): Buffer {
  const cleaned = base32.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < cleaned.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(cleaned[i]);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTotpCode(secretBase32: string, timestampMs = Date.now(), stepSeconds = 30): string {
  const counter = Math.floor(timestampMs / 1000 / stepSeconds);
  return generateHotpCode(secretBase32, counter);
}

export function generateHotpCode(secretBase32: string, counter: number): string {
  const key = decodeBase32(secretBase32);
  const buffer = Buffer.alloc(8);
  let tmp = counter;
  for (let i = 7; i >= 0; i--) {
    buffer[i] = tmp & 0xff;
    tmp = Math.floor(tmp / 256);
  }
  const hmac = crypto.createHmac('sha1', key).update(buffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    (((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff)) %
    1000000;
  return code.toString().padStart(6, '0');
}

export function verifyTotpCode(
  secretBase32: string,
  token: string,
  lastUsedWindow: number | null,
  timestampMs = Date.now(),
  windowTolerance = 1
): { valid: boolean; matchedWindow: number | null; reason?: string } {
  const cleanedToken = (token || '').trim().replace(/\s+/g, '');
  if (!/^\d{6}$/.test(cleanedToken)) {
    return { valid: false, matchedWindow: null, reason: 'Geçersiz 6 haneli kod formatı.' };
  }

  const currentWindow = Math.floor(timestampMs / 1000 / 30);
  for (let offset = -windowTolerance; offset <= windowTolerance; offset++) {
    const candidateWindow = currentWindow + offset;
    const expected = generateHotpCode(secretBase32, candidateWindow);
    if (expected === cleanedToken) {
      if (lastUsedWindow !== null && candidateWindow <= lastUsedWindow) {
        return {
          valid: false,
          matchedWindow: null,
          reason: 'Bu Authenticator kodu daha önce kullanıldı. Lütfen yeni üretilen kodu girin.',
        };
      }
      return { valid: true, matchedWindow: candidateWindow };
    }
  }

  return { valid: false, matchedWindow: null, reason: 'Authenticator kodu doğrulanamadı.' };
}

export function buildOtpAuthUri(username: string, secretBase32: string, issuer = 'DHMI Dokuman Arsivi'): string {
  const label = encodeURIComponent(`${issuer}:${username}`);
  const encodedIssuer = encodeURIComponent(issuer);
  return `otpauth://totp/${label}?secret=${secretBase32}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
}

export function generateRecoveryCodes(count = 6): { plainCodes: string[]; hashedCodes: string[] } {
  const plainCodes: string[] = [];
  const hashedCodes: string[] = [];
  for (let i = 0; i < count; i++) {
    const part1 = crypto.randomBytes(2).toString('hex').toUpperCase();
    const part2 = crypto.randomBytes(2).toString('hex').toUpperCase();
    const code = `DHMI-${part1}-${part2}`;
    plainCodes.push(code);
    hashedCodes.push(hashToken(code));
  }
  return { plainCodes, hashedCodes };
}

export function hashToken(token: string): string {
  return crypto
    .createHash('sha256')
    .update(token.trim().toUpperCase())
    .digest('hex');
}
