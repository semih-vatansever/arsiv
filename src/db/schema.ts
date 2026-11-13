import { relations } from 'drizzle-orm';
import { boolean, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  username: text('username').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name').notNull(),
  role: text('role').notNull().default('MEMBER'), // ADMIN | MEMBER
  status: text('status').notNull().default('ACTIVE'), // ACTIVE | PENDING_ACTIVATION | DISABLED | REVOKED
  totpSecretEncrypted: text('totp_secret_encrypted'),
  totpVerified: boolean('totp_verified').notNull().default(false),
  lastTotpWindow: integer('last_totp_window'),
  activationCodeHash: text('activation_code_hash'),
  activationExpiresAt: timestamp('activation_expires_at'),
  recoveryCodeHashesJson: text('recovery_code_hashes_json').notNull().default('[]'),
  failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
  lockedUntil: timestamp('locked_until'),
  createdAt: timestamp('created_at').defaultNow(),
  lastLoginAt: timestamp('last_login_at'),
});

export const emails = pgTable('emails', {
  id: serial('id').primaryKey(),
  sourceService: text('source_service').notNull().default('RESEND_INBOUND'),
  sourceMessageId: text('source_message_id').notNull().unique(),
  originalMessageId: text('original_message_id'),
  actualSender: text('actual_sender').notNull(),
  originalSender: text('original_sender'),
  recipients: text('recipients').notNull(),
  cc: text('cc'),
  subject: text('subject').notNull(),
  sentAt: text('sent_at'),
  receivedAt: timestamp('received_at').defaultNow(),
  bodyText: text('body_text'),
  forwardedByUser: text('forwarded_by_user'),
  attachmentCount: integer('attachment_count').notNull().default(0),
  processingStatus: text('processing_status').notNull().default('TAMAMLANDI'),
  rawEmlStorageKey: text('raw_eml_storage_key'),
});

export const documents = pgTable('documents', {
  id: serial('id').primaryKey(),
  originalFilename: text('original_filename').notNull(),
  fileExtension: text('file_extension').notNull(),
  mimeType: text('mime_type').notNull(),
  fileSizeBytes: integer('file_size_bytes').notNull(),
  sha256Hash: text('sha256_hash').notNull(),
  storageKey: text('storage_key').notNull(),
  fileContentBase64: text('file_content_base64'),
  documentNumber: text('document_number'),
  normalizedDocNumber: text('normalized_doc_number'),
  documentDate: text('document_date'),
  title: text('title').notNull(),
  shortDescription: text('short_description').notNull(),
  detailedDescription: text('detailed_description'),
  senderOrg: text('sender_org'),
  senderPerson: text('sender_person'),
  recipient: text('recipient'),
  relatedDepartment: text('related_department'),
  airport: text('airport'),
  cityLocation: text('city_location'),
  projectName: text('project_name'),
  documentType: text('document_type'),
  subjectPurpose: text('subject_purpose'),
  pageCount: integer('page_count'),
  sourceType: text('source_type').notNull().default('EMAIL'), // EMAIL | DIRECT_UPLOAD
  sourceReliability: text('source_reliability').notNull().default('DOGRULANMIS'),
  processingStatus: text('processing_status').notNull().default('TAMAMLANDI'),
  duplicateConflictStatus: text('duplicate_conflict_status').notNull().default('TEKIL'), // TEKIL | COKLU_KAYNAK | REVIZYON_CAKISMA
  userModifiedFieldsJson: text('user_modified_fields_json').notNull().default('[]'),
  aiEvidenceJson: text('ai_evidence_json').notNull().default('{}'),
  uploadedByUserId: integer('uploaded_by_user_id'),
  isDeleted: boolean('is_deleted').notNull().default(false),
  deletedAt: timestamp('deleted_at'),
  deletedByUserId: integer('deleted_by_user_id'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const documentSources = pgTable('document_sources', {
  id: serial('id').primaryKey(),
  documentId: integer('document_id')
    .references(() => documents.id)
    .notNull(),
  sourceType: text('source_type').notNull().default('EMAIL'),
  emailId: integer('email_id').references(() => emails.id),
  uploadedByUsername: text('uploaded_by_username'),
  sourceFilename: text('source_filename').notNull(),
  sourceFileSha256: text('source_file_sha256').notNull(),
  emailSubject: text('email_subject'),
  emailSender: text('email_sender'),
  emailDate: text('email_date'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const documentTexts = pgTable('document_texts', {
  id: serial('id').primaryKey(),
  documentId: integer('document_id')
    .references(() => documents.id)
    .notNull(),
  extractedText: text('extracted_text').notNull(),
  ocrStatus: text('ocr_status').notNull().default('METIN_KATMANI_MEVCUT'),
  extractionMethod: text('extraction_method').notNull().default('NATIVE_PDF_TEXT'),
  pageMapJson: text('page_map_json').notNull().default('[]'),
  processingVersion: integer('processing_version').notNull().default(1),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const documentChunks = pgTable('document_chunks', {
  id: serial('id').primaryKey(),
  documentId: integer('document_id')
    .references(() => documents.id)
    .notNull(),
  chunkIndex: integer('chunk_index').notNull(),
  pageNumber: integer('page_number'),
  sectionTitle: text('section_title'),
  chunkText: text('chunk_text').notNull(),
  normalizedSearchText: text('normalized_search_text').notNull(),
  embeddingJson: text('embedding_json').notNull().default('[]'),
});

export const keywords = pgTable('keywords', {
  id: serial('id').primaryKey(),
  documentId: integer('document_id')
    .references(() => documents.id)
    .notNull(),
  keyword: text('keyword').notNull(),
  normalizedKeyword: text('normalized_keyword').notNull(),
  source: text('source').notNull().default('AI'), // AI | RULE | USER
});

export const documentReferences = pgTable('document_references', {
  id: serial('id').primaryKey(),
  sourceDocumentId: integer('source_document_id')
    .references(() => documents.id)
    .notNull(),
  targetDocumentId: integer('target_document_id').references(() => documents.id),
  referencedDocNumber: text('referenced_doc_number').notNull(),
  normalizedRefDocNumber: text('normalized_ref_doc_number').notNull(),
  referencedDate: text('referenced_date'),
  originalIlgiText: text('original_ilgi_text').notNull(),
  pageOrSection: text('page_or_section'),
  relationType: text('relation_type').notNull().default('DOGRUDAN_ILGI'), // DOGRUDAN_ILGI | SEMANTIK_BENZERLIK
  matchStatus: text('match_status').notNull().default('ARSIVDE_BULUNAMADI'), // ESLESTI | ARSIVDE_BULUNAMADI | BELIRSIZ_COKLU_ADAY | MANUEL_DOGRULANDI
  verificationStatus: text('verification_status').notNull().default('OTOMATIK'), // OTOMATIK | MANUEL_ONAYLI | MANUEL_EKLENDI | INCELEME_BEKLIYOR
  similarityScore: integer('similarity_score').notNull().default(100),
  createdAt: timestamp('created_at').defaultNow(),
});

export const processingJobs = pgTable('processing_jobs', {
  id: serial('id').primaryKey(),
  documentId: integer('document_id').references(() => documents.id),
  emailId: integer('email_id').references(() => emails.id),
  jobType: text('job_type').notNull(),
  currentStage: text('current_stage').notNull(),
  status: text('status').notNull(),
  attempts: integer('attempts').notNull().default(1),
  errorMessage: text('error_message'),
  startedAt: timestamp('started_at').defaultNow(),
  completedAt: timestamp('completed_at'),
});

export const aiLogs = pgTable('ai_logs', {
  id: serial('id').primaryKey(),
  taskType: text('task_type').notNull(),
  modelName: text('model_name').notNull(),
  provider: text('provider').notNull().default('Abacus.AI RouteLLM'),
  inputTokens: integer('input_tokens').notNull(),
  outputTokens: integer('output_tokens').notNull(),
  totalTokens: integer('total_tokens').notNull(),
  estimatedCostUsd: text('estimated_cost_usd').notNull(),
  isEstimatedCost: boolean('is_estimated_cost').notNull().default(true),
  durationMs: integer('duration_ms').notNull(),
  status: text('status').notNull().default('BASARILI'),
  documentId: integer('document_id'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  userId: integer('user_id'),
  username: text('username').notNull(),
  actionType: text('action_type').notNull(),
  targetEntity: text('target_entity').notNull(),
  targetId: text('target_id'),
  details: text('details').notNull(),
  isSecurityEvent: boolean('is_security_event').notNull().default(false),
  ipAddress: text('ip_address'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const systemSettings = pgTable('system_settings', {
  id: serial('id').primaryKey(),
  settingKey: text('setting_key').notNull().unique(),
  settingValue: text('setting_value').notNull(),
  updatedByUsername: text('updated_by_username'),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const documentsRelations = relations(documents, ({ many }) => ({
  sources: many(documentSources),
  texts: many(documentTexts),
  chunks: many(documentChunks),
  keywords: many(keywords),
}));
