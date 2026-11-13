export interface ArchiveUser {
  id: number;
  uid: string;
  username: string;
  displayName: string;
  email: string;
  role: 'ADMIN' | 'MEMBER';
  status: string;
  totpVerified?: boolean;
  createdAt?: string;
  lastLoginAt?: string;
}

export interface DocumentSourceItem {
  id: number;
  documentId: number;
  sourceType: 'EMAIL' | 'DIRECT_UPLOAD';
  emailId?: number | null;
  uploadedByUsername?: string | null;
  sourceFilename: string;
  sourceFileSha256: string;
  emailSubject?: string | null;
  emailSender?: string | null;
  emailDate?: string | null;
  createdAt?: string;
}

export interface OutgoingIlgiItem {
  id: number;
  sourceDocumentId: number;
  targetDocumentId: number | null;
  referencedDocNumber: string;
  normalizedRefDocNumber: string;
  referencedDate: string | null;
  originalIlgiText: string;
  pageOrSection: string | null;
  relationType: 'DOGRUDAN_ILGI';
  matchStatus: 'ESLESTI' | 'ARSIVDE_BULUNAMADI' | 'BELIRSIZ_COKLU_ADAY' | 'MANUEL_DOGRULANDI';
  verificationStatus: 'OTOMATIK' | 'MANUEL_ONAYLI' | 'MANUEL_EKLENDI' | 'INCELEME_BEKLIYOR';
  targetTitle: string | null;
  targetDocNumber: string | null;
  targetDate: string | null;
}

export interface IncomingIlgiItem {
  id: number;
  sourceDocumentId: number;
  targetDocumentId: number | null;
  referencedDocNumber: string;
  referencedDate: string | null;
  originalIlgiText: string;
  pageOrSection: string | null;
  sourceTitle: string;
  sourceDocNumber: string | null;
  sourceDate: string | null;
}

export interface SemanticLinkItem {
  id: number;
  relatedDocumentId: number | null;
  relatedDocNumber: string;
  relatedTitle: string;
  relatedDate: string | null;
  similarityScore: number;
  reason: string;
}

export interface DocumentRecord {
  id: number;
  originalFilename: string;
  fileExtension: string;
  mimeType: string;
  fileSizeBytes: number;
  sha256Hash: string;
  storageKey: string;
  documentNumber: string | null;
  normalizedDocNumber: string | null;
  documentDate: string | null;
  title: string;
  shortDescription: string;
  detailedDescription: string | null;
  senderOrg: string | null;
  senderPerson: string | null;
  recipient: string | null;
  relatedDepartment: string | null;
  airport: string | null;
  cityLocation: string | null;
  projectName: string | null;
  documentType: string | null;
  subjectPurpose: string | null;
  pageCount: number | null;
  sourceType: 'EMAIL' | 'DIRECT_UPLOAD';
  sourceReliability: string;
  processingStatus: string;
  duplicateConflictStatus: 'TEKIL' | 'COKLU_KAYNAK' | 'REVIZYON_CAKISMA';
  keywords: string[];
  sources: DocumentSourceItem[];
  extractedText: string;
  ocrStatus: string;
  extractionMethod: string;
  outgoingIlgi: OutgoingIlgiItem[];
  incomingIlgi: IncomingIlgiItem[];
  semanticLinks: SemanticLinkItem[];
  userModifiedFields: string[];
  aiEvidence: Record<string, string>;
  searchScore?: number;
  matchReasons?: string[];
  isSemanticOnly?: boolean;
  isDeleted: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ResearchCitation {
  documentId: number;
  documentNumber: string;
  title: string;
  documentDate: string;
  airport: string;
  relatedDepartment: string;
  pageOrSection: string;
  excerpt: string;
}

export interface ResearchChronologyItem {
  documentId: number;
  date: string;
  documentNumber: string;
  title: string;
  department: string;
  summary: string;
  directIlgiRefs: string[];
  citedByDocs: string[];
  chronologyType: 'RESMI_ILGI_ZINCIRI' | 'KONU_TARIH_BENZERLIGI';
}

export interface ResearchComparisonRow {
  documentId: number;
  documentNumber: string;
  documentDate: string;
  airport: string;
  department: string;
  keyCriterion: string;
  conclusion: string;
}

export interface ResearchResponse {
  question: string;
  answer: string;
  citations: ResearchCitation[];
  chronology: ResearchChronologyItem[];
  comparisonRows: ResearchComparisonRow[];
  missingReferences: string[];
}
