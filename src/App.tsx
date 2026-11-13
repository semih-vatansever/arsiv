import React, { useEffect, useState, useCallback } from 'react';
import {
  Search,
  Upload,
  Sparkles,
  History,
  ShieldCheck,
  FileText,
  Download,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ExternalLink,
  Copy,
  Check,
  Lock,
  KeyRound,
  Mail,
  SlidersHorizontal,
  X,
  ArrowRight,
  GitBranch,
  Layers,
  Edit3,
  Trash2,
  RotateCcw,
  Plus,
  Server,
  Database,
  LogOut,
} from 'lucide-react';
import type {
  DocumentRecord as ArchiveDocument,
  ArchiveUser,
  ResearchResponse as AiResearchResponse,
} from './types/archive';

interface EnvValidationItem {
  name: string;
  configured: boolean;
  valid: boolean;
  expectedFormat: string;
  statusMessage: string;
}

interface IntegrationCheckResult {
  key: string;
  name: string;
  status: 'CONNECTED' | 'UNCONFIGURED' | 'INVALID_CONFIG' | 'CONNECTION_ERROR';
  summary: string;
  details: string;
  checkedAt: string;
}

interface LiveIntegrationReport {
  webhookEndpointUrl: string;
  sharedWebhookEndpointUrl: string;
  envValidations: EnvValidationItem[];
  integrations: IntegrationCheckResult[];
}

type NavTab = 'archive' | 'research' | 'upload' | 'history' | 'admin';

export default function App() {
  const [user, setUser] = useState<ArchiveUser | null>(null);
  const [sessionToken, setSessionToken] = useState<string>(() => {
    return localStorage.getItem('dhmi_session_token') || '';
  });
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [demoHint, setDemoHint] = useState<{
    username: string;
    displayName: string;
    currentTotpCode: string;
    remainingSeconds: number;
  } | null>(null);

  // Login form state
  const [loginMode, setLoginMode] = useState<'totp' | 'recovery' | 'activate'>('totp');
  const [loginUsername, setLoginUsername] = useState<string>('semih');
  const [loginTotpCode, setLoginTotpCode] = useState<string>('');
  const [loginRecoveryCode, setLoginRecoveryCode] = useState<string>('');
  const [activationCodeInput, setActivationCodeInput] = useState<string>('');
  const [activationPreview, setActivationPreview] = useState<any | null>(null);
  const [loginError, setLoginError] = useState<string>('');

  // Navigation & UI state
  const [activeTab, setActiveTab] = useState<NavTab>('archive');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  // Archive & Filters state
  const [documents, setDocuments] = useState<ArchiveDocument[]>([]);
  const [totalArchiveCount, setTotalArchiveCount] = useState<number>(0);
  const [filteredCount, setFilteredCount] = useState<number>(0);
  const [docsLoading, setDocsLoading] = useState<boolean>(false);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedKeyword, setSelectedKeyword] = useState<string>('');
  const [airportFilter, setAirportFilter] = useState<string>('');
  const [departmentFilter, setDepartmentFilter] = useState<string>('');
  const [documentTypeFilter, setDocumentTypeFilter] = useState<string>('');
  const [fileExtensionFilter, setFileExtensionFilter] = useState<string>('');
  const [sourceTypeFilter, setSourceTypeFilter] = useState<string>('');
  const [includeDeleted, setIncludeDeleted] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<string>('relevance');
  const [showFiltersPanel, setShowFiltersPanel] = useState<boolean>(false);

  // Selected Document Drawer state
  const [selectedDoc, setSelectedDoc] = useState<ArchiveDocument | null>(null);
  const [drawerTab, setDrawerTab] = useState<'overview' | 'ilgi' | 'text' | 'sources'>('overview');
  const [editingMeta, setEditingMeta] = useState<boolean>(false);
  const [metaForm, setMetaForm] = useState<{
    title: string;
    shortDescription: string;
    documentNumber: string;
    documentDate: string;
    airport: string;
    relatedDepartment: string;
    projectName: string;
  }>({
    title: '',
    shortDescription: '',
    documentNumber: '',
    documentDate: '',
    airport: '',
    relatedDepartment: '',
    projectName: '',
  });
  const [newIlgiNumber, setNewIlgiNumber] = useState<string>('');
  const [newIlgiDate, setNewIlgiDate] = useState<string>('');

  // AI Research state
  const [researchQuestion, setResearchQuestion] = useState<string>(
    'Ankara Esenboğa Havalimanı mania planı ve engel sınırlama yüzeyleri (OLS) hakkındaki teknik değerlendirmeleri ve İLGİ zincirini özetle.'
  );
  const [researchAirport, setResearchAirport] = useState<string>('');
  const [researchLoading, setResearchLoading] = useState<boolean>(false);
  const [researchResult, setResearchResult] = useState<AiResearchResponse | null>(null);

  // Upload & Inbound state
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [customExtractedText, setCustomExtractedText] = useState<string>('');
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadResults, setUploadResults] = useState<any[]>([]);
  const [simMessageId, setSimMessageId] = useState<string>('msg_dhmi_2026_test_01');
  const [simSubject, setSimSubject] = useState<string>(
    'FW: Esenboğa Mania Planı Eksik İLGİ (E-123456) Tamamlama Yazısı'
  );
  const [simDocNumber, setSimDocNumber] = useState<string>('E-123456');
  const [simDocDate, setSimDocDate] = useState<string>('15.03.2023');

  // History state
  const [historyData, setHistoryData] = useState<any | null>(null);

  // Admin state
  const [adminData, setAdminData] = useState<any | null>(null);
  const [integrationReport, setIntegrationReport] = useState<LiveIntegrationReport | null>(null);
  const [checkingIntegrations, setCheckingIntegrations] = useState<boolean>(false);
  const [newUsername, setNewUsername] = useState<string>('');
  const [newDisplayName, setNewDisplayName] = useState<string>('');
  const [newUserRole, setNewUserRole] = useState<'MEMBER' | 'ADMIN'>('MEMBER');
  const [createdUserSetup, setCreatedUserSetup] = useState<any | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 4500);
  }, []);

  const authFetch = useCallback(
    async (url: string, options: RequestInit = {}) => {
      const headers = new Headers(options.headers || {});
      if (sessionToken) {
        headers.set('Authorization', `Bearer ${sessionToken}`);
      }
      return fetch(url, {
        ...options,
        headers,
      });
    },
    [sessionToken]
  );

  // Fetch auth status & support ?autostart=1
  useEffect(() => {
    let mounted = true;
    async function initAuth() {
      try {
        const statusRes = await fetch('/api/auth/status');
        if (statusRes.ok) {
          const statusJson = await statusRes.json();
          if (mounted && statusJson.demoHint) {
            setDemoHint(statusJson.demoHint);
            setLoginTotpCode(statusJson.demoHint.currentTotpCode || '');
          }
        }

        const params = new URLSearchParams(window.location.search);
        const isAutostart = params.get('autostart') === '1';

        if (sessionToken) {
          const meRes = await fetch('/api/auth/me', {
            headers: { Authorization: `Bearer ${sessionToken}` },
          });
          if (meRes.ok) {
            const meJson = await meRes.json();
            if (mounted && meJson.user) {
              setUser(meJson.user);
              setAuthLoading(false);
              return;
            }
          }
        }

        if (isAutostart) {
          const autoRes = await fetch('/api/auth/totp-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'semih', isAutostart: true }),
          });
          if (autoRes.ok) {
            const autoJson = await autoRes.json();
            if (mounted) {
              localStorage.setItem('dhmi_session_token', autoJson.sessionToken);
              setSessionToken(autoJson.sessionToken);
              setUser(autoJson.user);
              setAuthLoading(false);
              return;
            }
          }
        }
      } catch (e) {
        console.error('Auth init error:', e);
      } finally {
        if (mounted) setAuthLoading(false);
      }
    }
    initAuth();
    return () => {
      mounted = false;
    };
  }, [sessionToken]);

  const loadDocuments = useCallback(async () => {
    if (!user) return;
    setDocsLoading(true);
    try {
      const qs = new URLSearchParams();
      if (searchQuery.trim()) qs.set('q', searchQuery.trim());
      if (selectedKeyword) qs.set('keyword', selectedKeyword);
      if (airportFilter) qs.set('airport', airportFilter);
      if (departmentFilter) qs.set('department', departmentFilter);
      if (documentTypeFilter) qs.set('documentType', documentTypeFilter);
      if (fileExtensionFilter) qs.set('fileExtension', fileExtensionFilter);
      if (sourceTypeFilter) qs.set('sourceType', sourceTypeFilter);
      if (includeDeleted) qs.set('includeDeleted', 'true');
      if (sortBy) qs.set('sortBy', sortBy);

      const res = await authFetch(`/api/documents?${qs.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents || []);
        setTotalArchiveCount(data.totalArchiveCount || 0);
        setFilteredCount(data.filteredCount || 0);
      }
    } catch (e) {
      console.error('Failed to load documents:', e);
    } finally {
      setDocsLoading(false);
    }
  }, [
    user,
    searchQuery,
    selectedKeyword,
    airportFilter,
    departmentFilter,
    documentTypeFilter,
    fileExtensionFilter,
    sourceTypeFilter,
    includeDeleted,
    sortBy,
    authFetch,
  ]);

  useEffect(() => {
    if (user) {
      loadDocuments();
    }
  }, [user, loadDocuments]);

  const loadHistory = useCallback(async () => {
    if (!user) return;
    const res = await authFetch('/api/history');
    if (res.ok) {
      setHistoryData(await res.json());
    }
  }, [user, authFetch]);

  const loadAdminOverview = useCallback(async () => {
    if (!user || user.role !== 'ADMIN') return;
    const res = await authFetch('/api/admin/overview');
    if (res.ok) {
      const json = await res.json();
      setAdminData(json);
      if (json.liveIntegrationReport) {
        setIntegrationReport(json.liveIntegrationReport);
      }
    }
  }, [user, authFetch]);

  const runLiveIntegrationCheck = useCallback(async () => {
    if (!user) return;
    setCheckingIntegrations(true);
    try {
      const res = await authFetch('/api/admin/integrations-check');
      if (res.ok) {
        const report = await res.json();
        setIntegrationReport(report);
        showToast('Tüm entegrasyonlar ve ortam değişkenleri canlı olarak doğrulandı.');
      }
    } finally {
      setCheckingIntegrations(false);
    }
  }, [user, authFetch, showToast]);

  useEffect(() => {
    if (activeTab === 'history') loadHistory();
    if (activeTab === 'admin') loadAdminOverview();
  }, [activeTab, loadHistory, loadAdminOverview]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    try {
      const res = await fetch('/api/auth/totp-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: loginUsername,
          totpCode: loginMode === 'totp' ? loginTotpCode : undefined,
          recoveryCode: loginMode === 'recovery' ? loginRecoveryCode : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error || 'Kimlik doğrulama başarısız.');
        return;
      }
      localStorage.setItem('dhmi_session_token', data.sessionToken);
      setSessionToken(data.sessionToken);
      setUser(data.user);
      showToast(`Hoş geldiniz, ${data.user.displayName}`);
    } catch {
      setLoginError('Sunucu ile bağlantı kurulamadı.');
    }
  };

  const handleSwitchDemoUser = async (targetUsername: string) => {
    const res = await fetch('/api/auth/totp-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: targetUsername,
        totpCode: demoHint?.currentTotpCode || '000000',
        isAutostart: targetUsername === 'semih',
      }),
    });
    if (res.ok) {
      const data = await res.json();
      localStorage.setItem('dhmi_session_token', data.sessionToken);
      setSessionToken(data.sessionToken);
      setUser(data.user);
      if (data.user.role !== 'ADMIN' && activeTab === 'admin') {
        setActiveTab('archive');
      }
      showToast(`Aktif oturum değiştirildi: ${data.user.displayName} (${data.user.role})`);
    }
  };

  const handleOpenDocument = (doc: ArchiveDocument) => {
    setSelectedDoc(doc);
    setDrawerTab('overview');
    setEditingMeta(false);
    setMetaForm({
      title: doc.title,
      shortDescription: doc.shortDescription,
      documentNumber: doc.documentNumber || '',
      documentDate: doc.documentDate || '',
      airport: doc.airport || '',
      relatedDepartment: doc.relatedDepartment || '',
      projectName: doc.projectName || '',
    });
  };

  const handleNavigateToDocumentId = async (docId: number | null) => {
    if (!docId) return;
    const localFound = documents.find((d) => d.id === docId);
    if (localFound) {
      handleOpenDocument(localFound);
      return;
    }
    const res = await authFetch(`/api/documents/${docId}`);
    if (res.ok) {
      const data = await res.json();
      if (data.document) {
        handleOpenDocument(data.document);
      }
    }
  };

  const handleDownloadDocument = async (doc: ArchiveDocument, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const res = await authFetch(`/api/documents/${doc.id}/download`);
      if (!res.ok) {
        showToast('Dosya indirilemedi veya yetkiniz bulunmuyor.');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.originalFilename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast(`Orijinal dosya indirildi: ${doc.originalFilename}`);
    } catch {
      showToast('Dosya indirme sırasında hata oluştu.');
    }
  };

  const handleSaveMetadata = async () => {
    if (!selectedDoc) return;
    const res = await authFetch(`/api/documents/${selectedDoc.id}/metadata`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metaForm),
    });
    if (res.ok) {
      const data = await res.json();
      setSelectedDoc(data.document);
      setEditingMeta(false);
      loadDocuments();
      showToast('Metadata güncellendi ve kullanıcı düzeltmesi olarak korumaya alındı.');
    }
  };

  const handleReanalyzeDocument = async () => {
    if (!selectedDoc) return;
    const res = await authFetch(`/api/documents/${selectedDoc.id}/reanalyze`, {
      method: 'POST',
    });
    if (res.ok) {
      const data = await res.json();
      setSelectedDoc(data.document);
      loadDocuments();
      showToast(
        `AI yeniden analizi tamamlandı (${data.preservedUserFields?.length || 0} kullanıcı alanı korundu).`
      );
    }
  };

  const handleAddManualIlgi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDoc || !newIlgiNumber.trim()) return;
    const res = await authFetch(`/api/documents/${selectedDoc.id}/references`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        referencedDocNumber: newIlgiNumber.trim(),
        referencedDate: newIlgiDate.trim() || null,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      setSelectedDoc(data.document);
      setNewIlgiNumber('');
      setNewIlgiDate('');
      loadDocuments();
      showToast('İLGİ referansı eklendi ve arşiv genelinde eşleştirildi.');
    }
  };

  const handleSoftDelete = async (docId: number) => {
    const res = await authFetch(`/api/documents/${docId}/delete`, { method: 'POST' });
    if (res.ok) {
      setSelectedDoc(null);
      loadDocuments();
      showToast('Belge geri alınabilir olarak arşivden kaldırıldı.');
    }
  };

  const handleRestoreDocument = async (docId: number) => {
    const res = await authFetch(`/api/documents/${docId}/restore`, { method: 'POST' });
    if (res.ok) {
      setSelectedDoc(null);
      loadDocuments();
      showToast('Belge arşive geri yüklendi.');
    }
  };

  const handlePermanentDelete = async (docId: number) => {
    const res = await authFetch(`/api/documents/${docId}/permanent`, { method: 'DELETE' });
    if (res.ok) {
      setSelectedDoc(null);
      loadDocuments();
      showToast('Belge yönetici yetkisiyle kalıcı olarak silindi.');
    } else {
      const err = await res.json();
      showToast(err.error || 'Kalıcı silme yalnızca ADMIN yetkisiyle yapılabilir.');
    }
  };

  const handleRunResearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!researchQuestion.trim()) return;
    setResearchLoading(true);
    try {
      const res = await authFetch('/api/research/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: researchQuestion,
          airportFilter: researchAirport,
        }),
      });
      if (res.ok) {
        setResearchResult(await res.json());
      }
    } finally {
      setResearchLoading(false);
    }
  };

  const handleDirectUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFiles.length) return;
    setUploading(true);
    try {
      const formData = new FormData();
      uploadFiles.forEach((f) => formData.append('files', f));
      if (customExtractedText.trim()) {
        formData.append('customExtractedText', customExtractedText.trim());
      }
      const res = await authFetch('/api/documents/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setUploadResults(data.results || []);
        setUploadFiles([]);
        setCustomExtractedText('');
        loadDocuments();
        showToast('Dosyalar analiz edildi ve arşive kaydedildi.');
      } else {
        showToast(data.error || 'Yükleme hatası.');
      }
    } finally {
      setUploading(false);
    }
  };

  const handleSimulateInboundEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await authFetch('/api/inbound/resend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceMessageId: simMessageId.trim(),
        subject: simSubject.trim(),
        sentAt: simDocDate.trim(),
        bodyText: `Sayı: ${simDocNumber}\nTarih: ${simDocDate}\nKonu: ${simSubject}`,
        attachments: [
          {
            filename: `DHMI_Resmi_Yazi_${simDocNumber.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`,
            contentText: `T.C. ULAŞTIRMA VE ALTYAPI BAKANLIĞI\nDevlet Hava Meydanları İşletmesi Genel Müdürlüğü\nSayı: ${simDocNumber}\nTarih: ${simDocDate}\nKonu: Ankara Esenboğa Havalimanı İlk Mania Kriterleri ve OLS Görüşü\n\nAnkara Esenboğa Havalimanı kuzey yaklaşma koridoru mania planı kriterleri kapsamında 1052.50 m AMSL kot sınırı belirlenmiştir.`,
          },
        ],
      }),
    });
    const data = await res.json();
    if (res.ok) {
      loadDocuments();
      showToast(data.message);
    }
  };

  const handleCreateTeamUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newDisplayName.trim()) return;
    const res = await authFetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: newUsername.trim(),
        displayName: newDisplayName.trim(),
        role: newUserRole,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      setCreatedUserSetup(data.activationSetup);
      setNewUsername('');
      setNewDisplayName('');
      loadAdminOverview();
      showToast('Yeni ekip kullanıcısı ve tek kullanımlık QR kurulum anahtarı oluşturuldu.');
    } else {
      showToast(data.error || 'Kullanıcı oluşturulamadı.');
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedUrl(label);
    showToast(`${label} panoya kopyalandı.`);
    setTimeout(() => setCopiedUrl(null), 2500);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6">
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-6 shadow-sm flex items-center gap-3">
          <RefreshCw className="w-5 h-5 text-[#1D4ED8] animate-spin" />
          <span className="text-sm font-medium text-[#0F172A]">
            DHMİ Akıllı Doküman Arşivi güvenlik oturumu doğrulanıyor...
          </span>
        </div>
      </div>
    );
  }

  // ============================================================================
  // LOGIN VIEW (RFC 6238 TOTP & QR ACTIVATION)
  // ============================================================================
  if (!user) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-center items-center p-4">
        <div className="w-full max-w-md bg-white border border-[#E2E8F0] rounded-lg shadow-sm overflow-hidden">
          <div className="bg-[#0F172A] px-6 py-5 text-white">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-6 h-6 text-[#38BDF8]" />
              <div>
                <h1 className="text-lg font-bold tracking-tight">DHMİ Akıllı Doküman Arşivi</h1>
                <p className="text-xs text-slate-300 mt-0.5">
                  Kurumsal Yazışma, İLGİ Zinciri ve Teknik Belge Yönetim Sistemi
                </p>
              </div>
            </div>
          </div>

          <div className="p-6">
            <div className="flex border-b border-[#E2E8F0] mb-5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setLoginMode('totp')}
                className={`pb-2.5 px-3 border-b-2 transition-colors ${
                  loginMode === 'totp'
                    ? 'border-[#1D4ED8] text-[#1D4ED8]'
                    : 'border-transparent text-[#475569]'
                }`}
              >
                Authenticator (TOTP) Girişi
              </button>
              <button
                type="button"
                onClick={() => setLoginMode('recovery')}
                className={`pb-2.5 px-3 border-b-2 transition-colors ${
                  loginMode === 'recovery'
                    ? 'border-[#1D4ED8] text-[#1D4ED8]'
                    : 'border-transparent text-[#475569]'
                }`}
              >
                Kurtarma Kodu
              </button>
              <button
                type="button"
                onClick={() => setLoginMode('activate')}
                className={`pb-2.5 px-3 border-b-2 transition-colors ${
                  loginMode === 'activate'
                    ? 'border-[#1D4ED8] text-[#1D4ED8]'
                    : 'border-transparent text-[#475569]'
                }`}
              >
                İlk QR Eşleştirme
              </button>
            </div>

            {loginError && (
              <div className="mb-4 p-3 rounded bg-red-50 border border-red-200 text-xs text-[#DC2626] flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{loginError}</span>
              </div>
            )}

            {loginMode !== 'activate' ? (
              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                    Kullanıcı Adı
                  </label>
                  <input
                    type="text"
                    value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                    placeholder="Örn: semih, ayse"
                    className="w-full px-3 py-2 text-sm border border-[#CBD5E1] rounded focus:outline-none focus:border-[#1D4ED8]"
                  />
                </div>

                {loginMode === 'totp' ? (
                  <div>
                    <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                      6 Haneli Authenticator Kodu (RFC 6238)
                    </label>
                    <input
                      type="text"
                      maxLength={6}
                      value={loginTotpCode}
                      onChange={(e) => setLoginTotpCode(e.target.value)}
                      placeholder="000000"
                      className="w-full px-3 py-2 text-base font-mono tracking-widest border border-[#CBD5E1] rounded focus:outline-none focus:border-[#1D4ED8]"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                      Tek Kullanımlık Kurtarma Kodu
                    </label>
                    <input
                      type="text"
                      value={loginRecoveryCode}
                      onChange={(e) => setLoginRecoveryCode(e.target.value)}
                      placeholder="DHMI-XXXX-XXXX"
                      className="w-full px-3 py-2 text-sm font-mono border border-[#CBD5E1] rounded focus:outline-none focus:border-[#1D4ED8]"
                    />
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full py-2.5 px-4 bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-sm font-semibold rounded transition-colors flex items-center justify-center gap-2"
                >
                  <KeyRound className="w-4 h-4" />
                  <span>Güvenli Oturum Aç</span>
                </button>
              </form>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-[#475569]">
                  Yöneticinizden aldığınız tek kullanımlık etkinleştirme kodunu girerek QR kodunuzu
                  görüntüleyin.
                </p>
                <input
                  type="text"
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  placeholder="Kullanıcı adı (örn: mehmet)"
                  className="w-full px-3 py-2 text-sm border border-[#CBD5E1] rounded"
                />
                <input
                  type="text"
                  value={activationCodeInput}
                  onChange={(e) => setActivationCodeInput(e.target.value)}
                  placeholder="Etkinleştirme Kodu (AKT-...)"
                  className="w-full px-3 py-2 text-sm font-mono border border-[#CBD5E1] rounded"
                />
                <button
                  type="button"
                  onClick={async () => {
                    const r = await fetch('/api/auth/activate-preview', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        username: loginUsername,
                        activationCode: activationCodeInput,
                      }),
                    });
                    const j = await r.json();
                    if (r.ok) setActivationPreview(j);
                    else setLoginError(j.error || 'Etkinleştirme kodu doğrulanamadı.');
                  }}
                  className="w-full py-2 bg-[#0F172A] text-white text-xs font-semibold rounded"
                >
                  QR Eşleştirme Bilgilerini Getir
                </button>
                {activationPreview && (
                  <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded text-center space-y-2">
                    <img
                      src={activationPreview.qrDataUrl}
                      alt="TOTP QR"
                      className="w-36 h-36 mx-auto border border-[#E2E8F0] rounded"
                    />
                    <div className="text-xs font-mono text-[#0F172A]">
                      Anlık Doğrulama Kodu: <strong>{activationPreview.currentTestCode}</strong>
                    </div>
                  </div>
                )}
              </div>
            )}

            {demoHint && (
              <div className="mt-5 pt-4 border-t border-[#E2E8F0] bg-[#F8FAFC] -mx-6 -mb-6 p-4">
                <div className="flex items-center justify-between text-xs text-[#475569]">
                  <span>
                    Test Hesabı: <strong className="text-[#0F172A]">semih</strong> (Yönetici)
                  </span>
                  <span className="font-mono text-[#1D4ED8] font-semibold">
                    TOTP: {demoHint.currentTotpCode}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Unique filter options from archive
  const airportOptions = Array.from(
    new Set(documents.map((d) => d.airport).filter((x): x is string => Boolean(x)))
  );
  const departmentOptions = Array.from(
    new Set(documents.map((d) => d.relatedDepartment).filter((x): x is string => Boolean(x)))
  );
  const docTypeOptions = Array.from(
    new Set(documents.map((d) => d.documentType).filter((x): x is string => Boolean(x)))
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex flex-col">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-4 right-4 z-50 bg-[#0F172A] text-white px-4 py-3 rounded-lg shadow-lg border border-slate-700 flex items-center gap-2.5 text-xs font-medium max-w-md">
          <CheckCircle2 className="w-4 h-4 text-[#38BDF8] shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ====================================================================
          TOP NAVIGATION BAR (Section 3.2 - Compact Single Row 56px)
         ==================================================================== */}
      <header className="h-14 bg-[#0F172A] text-white border-b border-slate-800 px-4 lg:px-6 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded bg-[#1D4ED8] flex items-center justify-center font-bold text-xs tracking-wider">
              DHMİ
            </div>
            <div>
              <span className="font-bold text-sm tracking-tight">
                DHMİ Akıllı Doküman Arşivi
              </span>
              <span className="hidden xl:inline-block ml-2 text-[11px] text-slate-400 font-mono">
                RESMÎ YAZIŞMA &amp; İLGİ BELLEĞİ
              </span>
            </div>
          </div>

          <nav className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setActiveTab('archive')}
              className={`px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                activeTab === 'archive'
                  ? 'bg-[#1D4ED8] text-white'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Arşiv ({totalArchiveCount})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('research')}
              className={`px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                activeTab === 'research'
                  ? 'bg-[#1D4ED8] text-white'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>AI Research</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('upload')}
              className={`px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                activeTab === 'upload'
                  ? 'bg-[#1D4ED8] text-white'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Belge Yükle</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                activeTab === 'history'
                  ? 'bg-[#1D4ED8] text-white'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>İşlem Geçmişi</span>
            </button>

            {user.role === 'ADMIN' && (
              <button
                type="button"
                onClick={() => setActiveTab('admin')}
                className={`px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                  activeTab === 'admin'
                    ? 'bg-[#1D4ED8] text-white'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Yönetim</span>
              </button>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {/* Role Switcher for quick RBAC verification (ADMIN vs MEMBER) */}
          <div className="hidden md:flex items-center gap-1.5 bg-slate-800/90 border border-slate-700 rounded px-2.5 py-1 text-xs">
            <span className="text-slate-400">Oturum:</span>
            <span className="font-semibold text-white">{user.displayName}</span>
            <span
              className={`ml-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold ${
                user.role === 'ADMIN'
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              }`}
            >
              {user.role}
            </span>
            <button
              type="button"
              onClick={() =>
                handleSwitchDemoUser(user.username === 'semih' ? 'ayse' : 'semih')
              }
              className="ml-1.5 text-[11px] text-sky-300 hover:underline"
              title="Yetki kontrolünü test etmek için Yönetici (ADMIN) ve Ekip Üyesi (MEMBER) arasında geçiş yapın"
            >
              ({user.username === 'semih' ? 'Üye Görünümüne Geç' : 'Yöneticiye Geç'})
            </button>
          </div>

          <button
            type="button"
            onClick={async () => {
              await authFetch('/api/auth/logout', { method: 'POST' });
              localStorage.removeItem('dhmi_session_token');
              setSessionToken('');
              setUser(null);
            }}
            className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded"
            title="Güvenli Çıkış"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ====================================================================
          MAIN WORKSPACE CONTENT
         ==================================================================== */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 lg:px-6 py-5">
        {/* ==================================================================
            1. ARCHIVE VIEW (Hybrid Search + Filters + 3-Col Cards)
           ================================================================== */}
        {activeTab === 'archive' && (
          <div className="space-y-4">
            {/* Search & Action Bar */}
            <div className="bg-white border border-[#E2E8F0] rounded-lg p-3.5 shadow-xs">
              <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-[#475569] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Belge no (2025/12345), İLGİ no (E-123456), havalimanı, proje veya teknik kavram ('Engel sınırlama yüzeyleri') ara..."
                    className="w-full pl-10 pr-9 py-2 text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded focus:outline-none focus:bg-white focus:border-[#1D4ED8]"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#475569] hover:text-[#0F172A]"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowFiltersPanel((prev) => !prev)}
                    className={`px-3 py-2 text-xs font-semibold rounded border flex items-center gap-1.5 ${
                      showFiltersPanel ||
                      airportFilter ||
                      departmentFilter ||
                      documentTypeFilter ||
                      fileExtensionFilter ||
                      sourceTypeFilter
                        ? 'bg-[#EFF6FF] border-[#1D4ED8] text-[#1D4ED8]'
                        : 'bg-white border-[#CBD5E1] text-[#0F172A] hover:bg-[#F8FAFC]'
                    }`}
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    <span>Gelişmiş Filtreler</span>
                  </button>

                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="px-3 py-2 text-xs font-medium bg-white border border-[#CBD5E1] rounded text-[#0F172A]"
                  >
                    <option value="relevance">Sıralama: Alakalılık (Hibrit Skor)</option>
                    <option value="docDateDesc">Belge Tarihi (Yeniden Eskiye)</option>
                    <option value="docDateAsc">Belge Tarihi (Eskiden Yeniye)</option>
                    <option value="emailDateDesc">E-posta Tarihi (Yeniden Eskiye)</option>
                    <option value="docNumber">Resmî Belge Numarası</option>
                    <option value="filename">Dosya Adı (A-Z)</option>
                    <option value="fileType">Dosya Türü</option>
                  </select>

                  <label className="flex items-center gap-1.5 text-xs text-[#475569] px-2 py-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={includeDeleted}
                      onChange={(e) => setIncludeDeleted(e.target.checked)}
                      className="rounded border-[#CBD5E1]"
                    />
                    <span>Silinenleri Göster</span>
                  </label>
                </div>
              </div>

              {/* Quick Semantic / Official Search Presets */}
              <div className="mt-2.5 pt-2.5 border-t border-[#F1F5F9] flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[#475569] font-medium">Hızlı Sorgular:</span>
                  <button
                    type="button"
                    onClick={() => setSearchQuery('2025/12345')}
                    className="px-2 py-0.5 bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#0F172A] rounded font-mono text-[11px]"
                  >
                    2025/12345 (Tam Sayı)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSearchQuery('Engel sınırlama yüzeyleri')}
                    className="px-2 py-0.5 bg-[#EFF6FF] hover:bg-blue-100 text-[#1D4ED8] rounded text-[11px] font-medium"
                  >
                    Engel sınırlama yüzeyleri (Semantik → MANİA)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSearchQuery('E-123456')}
                    className="px-2 py-0.5 bg-amber-50 hover:bg-amber-100 text-[#D97706] rounded font-mono text-[11px]"
                  >
                    İLGİ: E-123456
                  </button>
                  {selectedKeyword && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#1D4ED8] text-white rounded text-[11px] font-semibold">
                      Etiket: {selectedKeyword}
                      <button type="button" onClick={() => setSelectedKeyword('')}>
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                </div>

                {/* Live Result Counter (Section 3.7) */}
                <div className="font-mono text-xs text-[#475569]">
                  Toplam <strong className="text-[#0F172A]">{totalArchiveCount}</strong> belge ·
                  Gösterilen: <strong className="text-[#1D4ED8]">{filteredCount}</strong>
                </div>
              </div>

              {/* Collapsible Advanced Filters */}
              {showFiltersPanel && (
                <div className="mt-3 pt-3 border-t border-[#E2E8F0] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                  <select
                    value={airportFilter}
                    onChange={(e) => setAirportFilter(e.target.value)}
                    className="px-2.5 py-1.5 text-xs border border-[#CBD5E1] rounded bg-[#F8FAFC]"
                  >
                    <option value="">Tüm Havalimanları</option>
                    {airportOptions.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>

                  <select
                    value={departmentFilter}
                    onChange={(e) => setDepartmentFilter(e.target.value)}
                    className="px-2.5 py-1.5 text-xs border border-[#CBD5E1] rounded bg-[#F8FAFC]"
                  >
                    <option value="">Tüm Daire Başkanlıkları / Birimler</option>
                    {departmentOptions.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>

                  <select
                    value={documentTypeFilter}
                    onChange={(e) => setDocumentTypeFilter(e.target.value)}
                    className="px-2.5 py-1.5 text-xs border border-[#CBD5E1] rounded bg-[#F8FAFC]"
                  >
                    <option value="">Tüm Belge Türleri</option>
                    {docTypeOptions.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>

                  <select
                    value={fileExtensionFilter}
                    onChange={(e) => setFileExtensionFilter(e.target.value)}
                    className="px-2.5 py-1.5 text-xs border border-[#CBD5E1] rounded bg-[#F8FAFC]"
                  >
                    <option value="">Tüm Dosya Uzantıları</option>
                    <option value="PDF">PDF</option>
                    <option value="DOCX">DOCX</option>
                    <option value="XLSX">XLSX</option>
                    <option value="TIFF">TIFF (OCR)</option>
                  </select>

                  <div className="flex items-center gap-2">
                    <select
                      value={sourceTypeFilter}
                      onChange={(e) => setSourceTypeFilter(e.target.value)}
                      className="flex-1 px-2.5 py-1.5 text-xs border border-[#CBD5E1] rounded bg-[#F8FAFC]"
                    >
                      <option value="">Tüm Kaynaklar</option>
                      <option value="EMAIL">E-posta Eki (Resend)</option>
                      <option value="DIRECT_UPLOAD">Doğrudan Yükleme</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        setAirportFilter('');
                        setDepartmentFilter('');
                        setDocumentTypeFilter('');
                        setFileExtensionFilter('');
                        setSourceTypeFilter('');
                        setSelectedKeyword('');
                        setSearchQuery('');
                      }}
                      className="px-2.5 py-1.5 text-xs text-[#DC2626] hover:bg-red-50 rounded border border-red-200"
                    >
                      Sıfırla
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 3-Column Document Card Grid (Section 4) */}
            {docsLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <div
                    key={n}
                    className="h-64 bg-white border border-[#E2E8F0] rounded-lg p-4 animate-pulse"
                  />
                ))}
              </div>
            ) : documents.length === 0 ? (
              <div className="bg-white border border-[#E2E8F0] rounded-lg p-10 text-center space-y-2">
                <FileText className="w-8 h-8 text-[#475569] mx-auto" />
                <div className="text-sm font-semibold text-[#0F172A]">
                  Arama ve filtre kriterlerinize uygun belge bulunamadı.
                </div>
                <p className="text-xs text-[#475569]">
                  Filtreleri temizleyerek tüm kurumsal arşivi görüntüleyebilirsiniz.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {documents.map((doc) => {
                  const statusBorderColor =
                    doc.duplicateConflictStatus === 'REVIZYON_CAKISMA' ||
                    doc.processingStatus === 'INCELEME_GEREKIYOR'
                      ? 'border-l-[#D97706]'
                      : doc.processingStatus === 'HATA'
                        ? 'border-l-[#DC2626]'
                        : 'border-l-[#16A34A]';

                  const visibleKeywords = doc.keywords.slice(0, 4);
                  const extraKeywordCount = Math.max(0, doc.keywords.length - 4);

                  return (
                    <article
                      key={doc.id}
                      onClick={() => handleOpenDocument(doc)}
                      className={`bg-white border border-[#E2E8F0] border-l-4 ${statusBorderColor} rounded-lg p-4 shadow-xs hover:shadow-md hover:border-slate-300 transition-all cursor-pointer flex flex-col justify-between gap-3`}
                    >
                      <div className="space-y-2.5">
                        {/* Top Metadata Row: File Badge, Official Doc Number, Date, Download */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="px-1.5 py-0.5 rounded bg-[#0F172A] text-white font-mono text-[11px] font-semibold">
                              {doc.fileExtension}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-[#F1F5F9] text-[#0F172A] font-mono text-xs font-semibold border border-[#E2E8F0]">
                              {doc.documentNumber || 'Belge No Belirlenemedi'}
                            </span>
                            {doc.ocrStatus === 'OCR_UYGULANDI' && (
                              <span className="px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 font-mono text-[10px] font-semibold">
                                OCR
                              </span>
                            )}
                            {doc.duplicateConflictStatus === 'COKLU_KAYNAK' && (
                              <span className="px-1.5 py-0.5 rounded bg-sky-50 text-[#0284C7] border border-sky-200 text-[10px] font-semibold">
                                Çoklu Kaynak ({doc.sources.length})
                              </span>
                            )}
                            {doc.duplicateConflictStatus === 'REVIZYON_CAKISMA' && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-50 text-[#D97706] border border-amber-200 text-[10px] font-semibold">
                                Olası Revizyon
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="font-mono text-xs text-[#475569]">
                              {doc.documentDate || 'Tarihsiz'}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => handleDownloadDocument(doc, e)}
                              className="p-1 rounded hover:bg-[#F1F5F9] text-[#475569] hover:text-[#1D4ED8]"
                              title={`Orijinal dosyayı indir (${doc.originalFilename})`}
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Semantic match indicator when matched purely via semantic vectors */}
                        {doc.isSemanticOnly && searchQuery.trim() && (
                          <div className="px-2 py-1 rounded bg-[#EFF6FF] border border-blue-200 text-[11px] text-[#1D4ED8] flex items-center gap-1.5">
                            <Sparkles className="w-3 h-3 shrink-0" />
                            <span>
                              Kavramsal / Semantik Eşleşme (Skor: {doc.searchScore})
                            </span>
                          </div>
                        )}

                        {/* Full Readable Title (Never truncated with ellipsis - Section 4.2) */}
                        <h2 className="text-[15px] font-semibold text-[#0F172A] leading-snug">
                          {doc.title}
                        </h2>

                        {/* Full Specific Short Description (Never truncated - Section 4.3) */}
                        <p className="text-[13px] text-[#475569] leading-relaxed">
                          {doc.shortDescription}
                        </p>
                      </div>

                      <div className="space-y-2.5 pt-2 border-t border-[#F1F5F9]">
                        {/* Airport & Department Context */}
                        <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] text-[#475569]">
                          <span className="font-medium text-[#0F172A]">
                            {doc.airport || 'Genel Havacılık Sahası'}
                          </span>
                          <span>{doc.relatedDepartment}</span>
                        </div>

                        {/* Up to 4 Keyword Tags + "+N" Indicator (Section 4.4) */}
                        <div className="flex flex-wrap items-center gap-1.5">
                          {visibleKeywords.map((kw) => (
                            <button
                              key={kw}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedKeyword(kw === selectedKeyword ? '' : kw);
                              }}
                              className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                                selectedKeyword === kw
                                  ? 'bg-[#1D4ED8] text-white'
                                  : 'bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#0F172A]'
                              }`}
                            >
                              #{kw}
                            </button>
                          ))}
                          {extraKeywordCount > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-[#F8FAFC] border border-[#E2E8F0] text-[11px] font-mono text-[#475569]">
                              +{extraKeywordCount}
                            </span>
                          )}
                        </div>

                        {/* Direct İLGİ References Summary on Card (Section 4.1) */}
                        {(doc.outgoingIlgi.length > 0 || doc.incomingIlgi.length > 0) && (
                          <div className="pt-1.5 border-t border-[#F1F5F9] flex flex-wrap items-center gap-1.5 text-[11px]">
                            <span className="font-semibold text-[#475569] flex items-center gap-1">
                              <GitBranch className="w-3 h-3 text-[#1D4ED8]" />
                              İLGİ:
                            </span>
                            {doc.outgoingIlgi.map((ref) => {
                              const isResolved =
                                ref.matchStatus === 'ESLESTI' ||
                                ref.matchStatus === 'MANUEL_DOGRULANDI';
                              return (
                                <button
                                  key={ref.id}
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (isResolved && ref.targetDocumentId) {
                                      handleNavigateToDocumentId(ref.targetDocumentId);
                                    } else {
                                      handleOpenDocument(doc);
                                      setDrawerTab('ilgi');
                                    }
                                  }}
                                  className={`px-1.5 py-0.5 rounded font-mono text-[11px] border ${
                                    isResolved
                                      ? 'bg-[#EFF6FF] border-blue-200 text-[#1D4ED8] hover:bg-blue-100'
                                      : 'bg-amber-50 border-amber-200 text-[#D97706]'
                                  }`}
                                  title={
                                    isResolved
                                      ? `${ref.referencedDocNumber} (${ref.referencedDate || ''}) — Belgeye git`
                                      : `${ref.referencedDocNumber} — ${ref.referencedDate || ''} — Arşivde bulunamadı`
                                  }
                                >
                                  {ref.referencedDocNumber}
                                  {!isResolved && ' (Eksik)'}
                                </button>
                              );
                            })}
                            {doc.incomingIlgi.length > 0 && (
                              <span className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded font-mono">
                                ← {doc.incomingIlgi.length} Atıf
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ==================================================================
            2. AI RESEARCH VIEW (RAG with Citations, Chronology & Missing İLGİ)
           ================================================================== */}
        {activeTab === 'research' && (
          <div className="space-y-5">
            <div className="bg-white border border-[#E2E8F0] rounded-lg p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-[#0F172A] flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#1D4ED8]" />
                    <span>AI Research — Kaynak Gösterimli Çok Belgeli Arşiv Araştırması</span>
                  </h2>
                  <p className="text-xs text-[#475569] mt-0.5">
                    Yalnızca arşivdeki gerçek belgelere, sayfa/bölüm kanıtlarına ve doğrulanmış
                    İLGİ zincirine dayanarak yanıt üretir; arşivde bulunmayan İLGİ kayıtlarını
                    açıkça raporlar.
                  </p>
                </div>
              </div>

              <form onSubmit={handleRunResearch} className="space-y-3">
                <div className="flex flex-col md:flex-row gap-3">
                  <input
                    type="text"
                    value={researchQuestion}
                    onChange={(e) => setResearchQuestion(e.target.value)}
                    placeholder="Araştırma sorunuzu yazın..."
                    className="flex-1 px-3.5 py-2.5 text-sm border border-[#CBD5E1] rounded bg-[#F8FAFC] focus:bg-white focus:outline-none focus:border-[#1D4ED8]"
                  />
                  <select
                    value={researchAirport}
                    onChange={(e) => setResearchAirport(e.target.value)}
                    className="px-3 py-2.5 text-xs border border-[#CBD5E1] rounded bg-white"
                  >
                    <option value="">Tüm Havalimanları</option>
                    {airportOptions.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    disabled={researchLoading}
                    className="px-5 py-2.5 bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-xs font-semibold rounded flex items-center gap-2 shrink-0"
                  >
                    {researchLoading ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    <span>Arşivi Analiz Et</span>
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() =>
                      setResearchQuestion(
                        'Ankara Esenboğa Havalimanı mania planı ve engel sınırlama yüzeyleri (OLS) hakkındaki teknik değerlendirmeleri ve İLGİ zincirini özetle.'
                      )
                    }
                    className="px-2.5 py-1 bg-[#F1F5F9] hover:bg-[#E2E8F0] rounded text-[#0F172A]"
                  >
                    Esenboğa Mania Planı &amp; İLGİ Zinciri
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setResearchQuestion(
                        'Antalya Havalimanı PAT sahaları PCN mukavemet değerleri ve ILS/DME frekans tahsisi yazışmalarını karşılaştır.'
                      )
                    }
                    className="px-2.5 py-1 bg-[#F1F5F9] hover:bg-[#E2E8F0] rounded text-[#0F172A]"
                  >
                    Antalya PAT Sahaları &amp; ILS Karşılaştırması
                  </button>
                </div>
              </form>
            </div>

            {researchResult && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Left 2 Columns: Grounded Synthesis & Chronological Timeline */}
                <div className="lg:col-span-2 space-y-5">
                  <div className="bg-white border border-[#E2E8F0] rounded-lg p-5 shadow-xs space-y-3">
                    <div className="text-xs font-mono uppercase tracking-wider text-[#1D4ED8] font-semibold">
                      KAYNAK DOĞRULAMALI ARAŞTIRMA YANITI
                    </div>
                    <div className="text-sm text-[#0F172A] leading-relaxed whitespace-pre-line">
                      {researchResult.answer}
                    </div>

                    {researchResult.missingReferences.length > 0 && (
                      <div className="mt-4 p-3.5 rounded bg-amber-50 border border-amber-200 space-y-1.5">
                        <div className="text-xs font-bold text-[#D97706] flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4" />
                          <span>
                            Arşivde Bulunmayan / Eksik İLGİ Kayıtları (Uydurulmamış Tespit)
                          </span>
                        </div>
                        <ul className="text-xs text-amber-900 space-y-1 font-mono">
                          {researchResult.missingReferences.map((m, idx) => (
                            <li key={idx}>• {m}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* Chronological Chain (Strictly separating Official İLGİ vs Topic/Date) */}
                  <div className="bg-white border border-[#E2E8F0] rounded-lg p-5 shadow-xs space-y-3">
                    <h3 className="text-sm font-bold text-[#0F172A]">
                      Kronolojik Yazışma Zinciri (Resmî İLGİ Bağlantısı vs Konu/Tarih Dizilimi)
                    </h3>
                    <div className="space-y-3">
                      {researchResult.chronology.map((item) => (
                        <div
                          key={item.documentId}
                          onClick={() => handleNavigateToDocumentId(item.documentId)}
                          className="p-3 rounded border border-[#E2E8F0] hover:border-[#1D4ED8] cursor-pointer bg-[#F8FAFC] space-y-1.5"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold text-[#1D4ED8]">
                                {item.documentNumber}
                              </span>
                              <span className="font-mono text-xs text-[#475569]">{item.date}</span>
                            </div>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                item.chronologyType === 'RESMI_ILGI_ZINCIRI'
                                  ? 'bg-blue-100 text-[#1D4ED8]'
                                  : 'bg-slate-200 text-[#475569]'
                              }`}
                            >
                              {item.chronologyType === 'RESMI_ILGI_ZINCIRI'
                                ? 'Doğrudan Resmî İLGİ Zinciri'
                                : 'Konu / Tarih Benzerliği'}
                            </span>
                          </div>
                          <div className="text-xs font-semibold text-[#0F172A]">{item.title}</div>
                          <div className="text-xs text-[#475569]">{item.summary}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right Column: Grounded Document Citations */}
                <div className="space-y-4">
                  <div className="bg-white border border-[#E2E8F0] rounded-lg p-4 shadow-xs space-y-3">
                    <h3 className="text-sm font-bold text-[#0F172A]">
                      Dayanak Arşiv Belgeleri ({researchResult.citations.length})
                    </h3>
                    <div className="space-y-2.5">
                      {researchResult.citations.map((cit) => (
                        <div
                          key={cit.documentId}
                          onClick={() => handleNavigateToDocumentId(cit.documentId)}
                          className="p-3 rounded border border-[#E2E8F0] hover:border-[#1D4ED8] cursor-pointer space-y-1.5"
                        >
                          <div className="flex items-center justify-between text-xs font-mono">
                            <span className="font-bold text-[#1D4ED8]">{cit.documentNumber}</span>
                            <span className="text-[#475569]">{cit.documentDate}</span>
                          </div>
                          <div className="text-xs font-semibold text-[#0F172A]">{cit.title}</div>
                          <div className="text-[11px] font-mono text-[#475569]">
                            {cit.pageOrSection}
                          </div>
                          <p className="text-[11px] text-[#475569] bg-[#F8FAFC] p-2 rounded border border-[#F1F5F9]">
                            “{cit.excerpt}...”
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ==================================================================
            3. UPLOAD & INBOUND EMAIL SIMULATOR VIEW
           ================================================================== */}
        {activeTab === 'upload' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Direct File Upload */}
            <div className="bg-white border border-[#E2E8F0] rounded-lg p-5 shadow-xs space-y-4">
              <div>
                <h2 className="text-base font-bold text-[#0F172A] flex items-center gap-2">
                  <Upload className="w-4 h-4 text-[#1D4ED8]" />
                  <span>Doğrudan Belge Yükleme (Çoklu Dosya &amp; Seçici OCR)</span>
                </h2>
                <p className="text-xs text-[#475569] mt-1">
                  PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, JPG, PNG, TIFF ve EML dosyaları (Maksimum
                  50 MB) desteklenir. SHA-256 özeti ile mükerrer ve revizyon kontrolü yapılır.
                </p>
              </div>

              <form onSubmit={handleDirectUpload} className="space-y-3">
                <input
                  type="file"
                  multiple
                  onChange={(e) =>
                    setUploadFiles(e.target.files ? Array.from(e.target.files) : [])
                  }
                  className="block w-full text-xs text-[#475569] file:mr-3 file:py-2 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-[#EFF6FF] file:text-[#1D4ED8] hover:file:bg-blue-100 border border-dashed border-[#CBD5E1] rounded p-4"
                />

                <div>
                  <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                    Opsiyonel Test / OCR Metin İçeriği (Belge No ve İLGİ Ayrıştırma Testi İçin)
                  </label>
                  <textarea
                    rows={4}
                    value={customExtractedText}
                    onChange={(e) => setCustomExtractedText(e.target.value)}
                    placeholder="Örn: Sayı: 2025/99881&#10;Tarih: 14.11.2026&#10;İLGİ: a) 12.03.2025 tarihli ve E-89451234-105.02-2025/12345 sayılı yazı."
                    className="w-full p-2.5 text-xs font-mono border border-[#CBD5E1] rounded bg-[#F8FAFC]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={uploading || uploadFiles.length === 0}
                  className="px-4 py-2 bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:opacity-50 text-white text-xs font-semibold rounded"
                >
                  {uploading ? 'İşleniyor...' : 'Seçili Dosyaları Arşive Yükle'}
                </button>
              </form>

              {uploadResults.length > 0 && (
                <div className="space-y-2 pt-3 border-t border-[#E2E8F0]">
                  {uploadResults.map((r, i) => (
                    <div
                      key={i}
                      className="p-2.5 rounded bg-[#F8FAFC] border border-[#E2E8F0] text-xs flex items-center justify-between"
                    >
                      <span>
                        <strong>{r.status}</strong>: {r.message}
                      </span>
                      {r.documentId && (
                        <button
                          type="button"
                          onClick={() => {
                            setActiveTab('archive');
                            handleNavigateToDocumentId(r.documentId);
                          }}
                          className="text-[#1D4ED8] font-semibold hover:underline"
                        >
                          Belgeyi Aç #{r.documentId}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Resend Inbound Email & Retroactive İLGİ Resolution Simulator */}
            <div className="bg-white border border-[#E2E8F0] rounded-lg p-5 shadow-xs space-y-4">
              <div>
                <h2 className="text-base font-bold text-[#0F172A] flex items-center gap-2">
                  <Mail className="w-4 h-4 text-[#1D4ED8]" />
                  <span>Gelen E-posta (Inbound) &amp; Geçmişe Dönük İLGİ Eşleştirme Testi</span>
                </h2>
                <p className="text-xs text-[#475569] mt-1">
                  Arşivde <strong>E-123456 — 15.03.2023 — Arşivde bulunamadı</strong> olarak
                  işaretlenmiş eksik İLGİ belgesini e-posta eki olarak gönderip geçmişe dönük
                  otomatik bağlantıyı ve Idempotency korumasını doğrulayın.
                </p>
              </div>

              <form onSubmit={handleSimulateInboundEmail} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                      Kaynak Mesaj ID (Idempotency Anahtarı)
                    </label>
                    <input
                      type="text"
                      value={simMessageId}
                      onChange={(e) => setSimMessageId(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs font-mono border border-[#CBD5E1] rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                      Ekteki Belge Numarası
                    </label>
                    <input
                      type="text"
                      value={simDocNumber}
                      onChange={(e) => setSimDocNumber(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs font-mono border border-[#CBD5E1] rounded"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                    E-posta Konusu
                  </label>
                  <input
                    type="text"
                    value={simSubject}
                    onChange={(e) => setSimSubject(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs border border-[#CBD5E1] rounded"
                  />
                </div>

                <button
                  type="submit"
                  className="px-4 py-2 bg-[#0F172A] hover:bg-slate-800 text-white text-xs font-semibold rounded"
                >
                  E-posta Ekini İşle ve Eksik İLGİ Bağlantısını Çözümle
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ==================================================================
            4. PROCESSING HISTORY VIEW
           ================================================================== */}
        {activeTab === 'history' && historyData && (
          <div className="space-y-5">
            <div className="bg-white border border-[#E2E8F0] rounded-lg p-5 shadow-xs">
              <h2 className="text-base font-bold text-[#0F172A] mb-3">
                13 Aşamalı Belge İşleme Kuyruğu ve Durum Geçmişi
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] text-[#475569] bg-[#F8FAFC]">
                      <th className="py-2.5 px-3 font-mono">İşlem ID</th>
                      <th className="py-2.5 px-3">Belge / Dosya</th>
                      <th className="py-2.5 px-3">İşlem Türü</th>
                      <th className="py-2.5 px-3">Aşama Durumu</th>
                      <th className="py-2.5 px-3">Durum</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {historyData.jobs?.map((job: any) => (
                      <tr key={job.id} className="hover:bg-[#F8FAFC]">
                        <td className="py-2.5 px-3 font-mono">#{job.id}</td>
                        <td className="py-2.5 px-3 font-medium">
                          {job.documentNumber ? `[${job.documentNumber}] ` : ''}
                          {job.documentTitle}
                        </td>
                        <td className="py-2.5 px-3 font-mono">{job.jobType}</td>
                        <td className="py-2.5 px-3 text-[#475569]">{job.currentStage}</td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded bg-emerald-50 text-[#16A34A] font-semibold">
                            {job.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ==================================================================
            5. ADMIN CONSOLE VIEW (Strictly ADMIN Role - Section 18)
           ================================================================== */}
        {activeTab === 'admin' && user.role === 'ADMIN' && (
          <div className="space-y-6">
            {/* LIVE INTEGRATIONS & ENVIRONMENT VALIDATION PANEL */}
            <div className="bg-white border border-[#E2E8F0] rounded-lg p-5 shadow-xs space-y-5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[#E2E8F0] pb-4">
                <div>
                  <h2 className="text-base font-bold text-[#0F172A] flex items-center gap-2">
                    <Server className="w-4 h-4 text-[#1D4ED8]" />
                    <span>
                      Üretim Entegrasyonları, Resend Webhook URL ve Ortam Değişkeni Doğrulaması
                    </span>
                  </h2>
                  <p className="text-xs text-[#475569] mt-0.5">
                    Bütün gizli anahtarlar yalnızca sunucu tarafında işlenir; hiçbir hata mesajında,
                    arayüzde veya log kaydında gizli anahtar değeri gösterilmez.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={runLiveIntegrationCheck}
                  disabled={checkingIntegrations}
                  className="px-3.5 py-2 bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-xs font-semibold rounded flex items-center gap-1.5 shrink-0"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${checkingIntegrations ? 'animate-spin' : ''}`}
                  />
                  <span>Canlı Bağlantıları Yeniden Doğrula</span>
                </button>
              </div>

              {integrationReport && (
                <>
                  {/* Resend Webhook Endpoint URLs Box */}
                  <div className="p-4 rounded-lg bg-[#F8FAFC] border border-[#CBD5E1] space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#0F172A] uppercase tracking-wider font-mono">
                        Resend Inbound Webhook Endpoint URL (Olay: email.received · İmza: Svix
                        HMAC-SHA256)
                      </span>
                      <span className="px-2 py-0.5 rounded bg-blue-100 text-[#1D4ED8] font-mono text-[11px] font-semibold">
                        POST /api/webhooks/resend
                      </span>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      <div className="p-2.5 bg-white border border-[#E2E8F0] rounded flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-[11px] text-[#475569] font-semibold">
                            Geliştirme / Aktif Sunucu Webhook URL:
                          </div>
                          <div className="font-mono text-xs text-[#0F172A] break-all">
                            {integrationReport.webhookEndpointUrl}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            copyToClipboard(integrationReport.webhookEndpointUrl, 'Aktif Webhook URL')
                          }
                          className="p-1.5 rounded border border-[#CBD5E1] hover:bg-[#F1F5F9] shrink-0"
                        >
                          {copiedUrl === 'Aktif Webhook URL' ? (
                            <Check className="w-3.5 h-3.5 text-[#16A34A]" />
                          ) : (
                            <Copy className="w-3.5 h-3.5 text-[#475569]" />
                          )}
                        </button>
                      </div>

                      <div className="p-2.5 bg-white border border-[#E2E8F0] rounded flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-[11px] text-[#475569] font-semibold">
                            Paylaşılan / Yayın (Production) Webhook URL:
                          </div>
                          <div className="font-mono text-xs text-[#0F172A] break-all">
                            {integrationReport.sharedWebhookEndpointUrl}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            copyToClipboard(
                              integrationReport.sharedWebhookEndpointUrl,
                              'Paylaşılan Webhook URL'
                            )
                          }
                          className="p-1.5 rounded border border-[#CBD5E1] hover:bg-[#F1F5F9] shrink-0"
                        >
                          {copiedUrl === 'Paylaşılan Webhook URL' ? (
                            <Check className="w-3.5 h-3.5 text-[#16A34A]" />
                          ) : (
                            <Copy className="w-3.5 h-3.5 text-[#475569]" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Individual Service Connection Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
                    {integrationReport.integrations.map((svc) => {
                      const isConnected = svc.status === 'CONNECTED';
                      const isError =
                        svc.status === 'CONNECTION_ERROR' || svc.status === 'INVALID_CONFIG';
                      return (
                        <div
                          key={svc.key}
                          className={`p-3.5 rounded-lg border border-l-4 bg-white space-y-1.5 ${
                            isConnected
                              ? 'border-[#E2E8F0] border-l-[#16A34A]'
                              : isError
                                ? 'border-[#E2E8F0] border-l-[#DC2626]'
                                : 'border-[#E2E8F0] border-l-[#D97706]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-[#0F172A]">{svc.name}</span>
                            <span
                              className={`px-2 py-0.5 rounded font-mono text-[10px] font-semibold ${
                                isConnected
                                  ? 'bg-emerald-50 text-[#16A34A]'
                                  : isError
                                    ? 'bg-red-50 text-[#DC2626]'
                                    : 'bg-amber-50 text-[#D97706]'
                              }`}
                            >
                              {svc.status}
                            </span>
                          </div>
                          <div className="text-xs font-semibold text-[#0F172A]">{svc.summary}</div>
                          <p className="text-[11px] text-[#475569] leading-relaxed">
                            {svc.details}
                          </p>
                        </div>
                      );
                    })}
                  </div>

                  {/* Environment Variables Format & Length Verification Table */}
                  <div className="overflow-x-auto border border-[#E2E8F0] rounded-lg">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#475569]">
                          <th className="py-2.5 px-3 font-mono">Ortam Değişkeni</th>
                          <th className="py-2.5 px-3">Beklenen Biçim / Uzunluk</th>
                          <th className="py-2.5 px-3">Durum</th>
                          <th className="py-2.5 px-3">Doğrulama Açıklaması (Gizli Değer Gösterilmez)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E2E8F0]">
                        {integrationReport.envValidations.map((env) => (
                          <tr key={env.name} className="hover:bg-[#F8FAFC]">
                            <td className="py-2.5 px-3 font-mono font-semibold text-[#0F172A]">
                              {env.name}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[11px] text-[#475569]">
                              {env.expectedFormat}
                            </td>
                            <td className="py-2.5 px-3">
                              <span
                                className={`px-2 py-0.5 rounded font-mono text-[10px] font-semibold ${
                                  env.valid
                                    ? 'bg-emerald-50 text-[#16A34A]'
                                    : env.configured
                                      ? 'bg-red-50 text-[#DC2626]'
                                      : 'bg-amber-50 text-[#D97706]'
                                }`}
                              >
                                {env.valid
                                  ? 'DOĞRULANDI'
                                  : env.configured
                                    ? 'GEÇERSİZ BİÇİM'
                                    : 'TANIMLANMAMIŞ'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-[#475569]">{env.statusMessage}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            {/* User & TOTP Management */}
            {adminData && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white border border-[#E2E8F0] rounded-lg p-5 shadow-xs space-y-4">
                  <h3 className="text-sm font-bold text-[#0F172A]">
                    Ekip Kullanıcıları ve Authenticator (TOTP) Durumu (Maksimum 2 ADMIN)
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-[#E2E8F0] text-[#475569] bg-[#F8FAFC]">
                          <th className="py-2 px-3">Kullanıcı</th>
                          <th className="py-2 px-3">Rol</th>
                          <th className="py-2 px-3">Durum</th>
                          <th className="py-2 px-3">TOTP Anahtarı</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E2E8F0]">
                        {adminData.users?.map((u: any) => (
                          <tr key={u.id}>
                            <td className="py-2.5 px-3">
                              <div className="font-semibold text-[#0F172A]">{u.displayName}</div>
                              <div className="font-mono text-[11px] text-[#475569]">
                                @{u.username}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 font-mono font-semibold">{u.role}</td>
                            <td className="py-2.5 px-3">
                              <span className="px-2 py-0.5 rounded bg-emerald-50 text-[#16A34A] font-mono text-[11px]">
                                {u.status}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[11px] text-[#475569]">
                              AES-256-GCM Şifreli (Gizli)
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="bg-white border border-[#E2E8F0] rounded-lg p-5 shadow-xs space-y-3">
                  <h3 className="text-sm font-bold text-[#0F172A]">Yeni Ekip Üyesi Ekle</h3>
                  <form onSubmit={handleCreateTeamUser} className="space-y-3">
                    <input
                      type="text"
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      placeholder="Kullanıcı adı (örn: kemal)"
                      className="w-full px-3 py-2 text-xs border border-[#CBD5E1] rounded"
                    />
                    <input
                      type="text"
                      value={newDisplayName}
                      onChange={(e) => setNewDisplayName(e.target.value)}
                      placeholder="Ad Soyad ve Unvan"
                      className="w-full px-3 py-2 text-xs border border-[#CBD5E1] rounded"
                    />
                    <select
                      value={newUserRole}
                      onChange={(e) => setNewUserRole(e.target.value as 'MEMBER' | 'ADMIN')}
                      className="w-full px-3 py-2 text-xs border border-[#CBD5E1] rounded bg-white"
                    >
                      <option value="MEMBER">Ekip Üyesi (MEMBER)</option>
                      <option value="ADMIN">Yönetici (ADMIN — Maks. 2)</option>
                    </select>
                    <button
                      type="submit"
                      className="w-full py-2 bg-[#1D4ED8] text-white text-xs font-semibold rounded"
                    >
                      Kullanıcı ve Tek Kullanımlık QR Oluştur
                    </button>
                  </form>

                  {createdUserSetup && (
                    <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded space-y-2 text-xs">
                      <div className="font-semibold text-[#0F172A]">
                        Tek Kullanımlık Etkinleştirme Kodu:{' '}
                        <span className="font-mono text-[#1D4ED8]">
                          {createdUserSetup.activationCode}
                        </span>
                      </div>
                      <img
                        src={createdUserSetup.qrDataUrl}
                        alt="Yeni Kullanıcı QR"
                        className="w-32 h-32 mx-auto border border-[#E2E8F0] rounded"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ====================================================================
          RIGHT-SIDE DOCUMENT DETAIL DRAWER (Section 5 & Section 6)
         ==================================================================== */}
      {selectedDoc && (
        <div className="fixed inset-0 z-40 bg-slate-900/40 flex justify-end">
          <div className="w-full max-w-2xl bg-white h-full shadow-2xl border-l border-[#E2E8F0] flex flex-col overflow-hidden">
            {/* Drawer Header */}
            <div className="px-6 py-4 bg-[#0F172A] text-white flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-[#1D4ED8] font-mono text-xs font-bold">
                    {selectedDoc.documentNumber || 'Numarasız Belge'}
                  </span>
                  <span className="font-mono text-xs text-slate-300">
                    {selectedDoc.documentDate}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-slate-800 font-mono text-[11px] text-slate-200">
                    {selectedDoc.fileExtension} · {selectedDoc.pageCount} Sayfa
                  </span>
                </div>
                <h2 className="text-base font-bold leading-snug">{selectedDoc.title}</h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDoc(null)}
                className="p-1.5 rounded hover:bg-slate-800 text-slate-300 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Primary Actions Bar (Section 5.2: Orijinal Dosyayı İndir) */}
            <div className="px-6 py-3 bg-[#F8FAFC] border-b border-[#E2E8F0] flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDownloadDocument(selectedDoc)}
                  className="px-3.5 py-1.5 bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-xs font-semibold rounded flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Orijinal Dosyayı İndir</span>
                </button>

                <button
                  type="button"
                  onClick={() => setEditingMeta((prev) => !prev)}
                  className="px-3 py-1.5 bg-white border border-[#CBD5E1] hover:bg-[#F1F5F9] text-xs font-semibold rounded flex items-center gap-1.5"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>{editingMeta ? 'Düzenlemeyi Kapat' : 'Metadata Düzenle'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleReanalyzeDocument}
                  className="px-3 py-1.5 bg-white border border-[#CBD5E1] hover:bg-[#F1F5F9] text-xs font-semibold rounded flex items-center gap-1.5"
                  title="Kullanıcı tarafından düzeltilen alanları ezmeden AI analizini yeniler"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>AI Yeniden Analiz</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                {!selectedDoc.isDeleted ? (
                  <button
                    type="button"
                    onClick={() => handleSoftDelete(selectedDoc.id)}
                    className="px-2.5 py-1.5 text-xs font-semibold text-[#D97706] hover:bg-amber-50 rounded border border-amber-200 flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Arşivden Kaldır</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleRestoreDocument(selectedDoc.id)}
                    className="px-2.5 py-1.5 text-xs font-semibold text-[#16A34A] hover:bg-emerald-50 rounded border border-emerald-200 flex items-center gap-1"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Geri Yükle</span>
                  </button>
                )}

                {user.role === 'ADMIN' && (
                  <button
                    type="button"
                    onClick={() => handlePermanentDelete(selectedDoc.id)}
                    className="px-2.5 py-1.5 text-xs font-semibold text-[#DC2626] hover:bg-red-50 rounded border border-red-200"
                  >
                    Kalıcı Sil (ADMIN)
                  </button>
                )}
              </div>
            </div>

            {/* Drawer Sub-tabs */}
            <div className="px-6 border-b border-[#E2E8F0] flex gap-4 text-xs font-semibold bg-white">
              <button
                type="button"
                onClick={() => setDrawerTab('overview')}
                className={`py-2.5 border-b-2 ${
                  drawerTab === 'overview'
                    ? 'border-[#1D4ED8] text-[#1D4ED8]'
                    : 'border-transparent text-[#475569]'
                }`}
              >
                Kurumsal Metadata &amp; Özet
              </button>
              <button
                type="button"
                onClick={() => setDrawerTab('ilgi')}
                className={`py-2.5 border-b-2 ${
                  drawerTab === 'ilgi'
                    ? 'border-[#1D4ED8] text-[#1D4ED8]'
                    : 'border-transparent text-[#475569]'
                }`}
              >
                İLGİ Zinciri ({selectedDoc.outgoingIlgi.length + selectedDoc.incomingIlgi.length}) &amp;
                Semantik ({selectedDoc.semanticLinks.length})
              </button>
              <button
                type="button"
                onClick={() => setDrawerTab('text')}
                className={`py-2.5 border-b-2 ${
                  drawerTab === 'text'
                    ? 'border-[#1D4ED8] text-[#1D4ED8]'
                    : 'border-transparent text-[#475569]'
                }`}
              >
                Çıkarılan Metin / OCR
              </button>
              <button
                type="button"
                onClick={() => setDrawerTab('sources')}
                className={`py-2.5 border-b-2 ${
                  drawerTab === 'sources'
                    ? 'border-[#1D4ED8] text-[#1D4ED8]'
                    : 'border-transparent text-[#475569]'
                }`}
              >
                Kaynak &amp; SHA-256 ({selectedDoc.sources.length})
              </button>
            </div>

            {/* Drawer Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {editingMeta ? (
                <div className="p-4 rounded-lg bg-[#F8FAFC] border border-[#CBD5E1] space-y-3">
                  <div className="text-xs font-bold text-[#1D4ED8]">
                    Metadata Düzenleme (Kaydedilen alanlar AI Yeniden Analiz sırasında korunur)
                  </div>
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold">Başlık</label>
                    <input
                      type="text"
                      value={metaForm.title}
                      onChange={(e) => setMetaForm({ ...metaForm, title: e.target.value })}
                      className="w-full px-3 py-1.5 text-xs border border-[#CBD5E1] rounded bg-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold">Kısa Teknik Açıklama</label>
                    <textarea
                      rows={2}
                      value={metaForm.shortDescription}
                      onChange={(e) =>
                        setMetaForm({ ...metaForm, shortDescription: e.target.value })
                      }
                      className="w-full px-3 py-1.5 text-xs border border-[#CBD5E1] rounded bg-white"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-xs font-semibold">Resmî Belge No</label>
                      <input
                        type="text"
                        value={metaForm.documentNumber}
                        onChange={(e) =>
                          setMetaForm({ ...metaForm, documentNumber: e.target.value })
                        }
                        className="w-full px-3 py-1.5 text-xs font-mono border border-[#CBD5E1] rounded bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold">Belge Tarihi</label>
                      <input
                        type="text"
                        value={metaForm.documentDate}
                        onChange={(e) =>
                          setMetaForm({ ...metaForm, documentDate: e.target.value })
                        }
                        className="w-full px-3 py-1.5 text-xs font-mono border border-[#CBD5E1] rounded bg-white"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveMetadata}
                    className="px-4 py-2 bg-[#1D4ED8] text-white text-xs font-semibold rounded"
                  >
                    Değişiklikleri Kaydet
                  </button>
                </div>
              ) : null}

              {drawerTab === 'overview' && (
                <div className="space-y-4">
                  <div className="p-3.5 rounded bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
                    <div className="text-xs font-bold text-[#0F172A]">Kapsamlı Teknik Özet</div>
                    <p className="text-xs text-[#475569] leading-relaxed">
                      {selectedDoc.detailedDescription || selectedDoc.shortDescription}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="p-3 rounded border border-[#E2E8F0]">
                      <div className="text-[#475569]">Gönderen Kurum / Birim</div>
                      <div className="font-semibold text-[#0F172A] mt-0.5">
                        {selectedDoc.senderOrg || 'Belirlenemedi'}
                      </div>
                    </div>
                    <div className="p-3 rounded border border-[#E2E8F0]">
                      <div className="text-[#475569]">Alıcı / Dağıtım</div>
                      <div className="font-semibold text-[#0F172A] mt-0.5">
                        {selectedDoc.recipient || 'Belirlenemedi'}
                      </div>
                    </div>
                    <div className="p-3 rounded border border-[#E2E8F0]">
                      <div className="text-[#475569]">İlgili Daire Başkanlığı</div>
                      <div className="font-semibold text-[#0F172A] mt-0.5">
                        {selectedDoc.relatedDepartment || 'Belirlenemedi'}
                      </div>
                    </div>
                    <div className="p-3 rounded border border-[#E2E8F0]">
                      <div className="text-[#475569]">Havalimanı / Saha</div>
                      <div className="font-semibold text-[#0F172A] mt-0.5">
                        {selectedDoc.airport || 'Belirlenemedi'}
                      </div>
                    </div>
                    <div className="p-3 rounded border border-[#E2E8F0]">
                      <div className="text-[#475569]">Proje / Konu</div>
                      <div className="font-semibold text-[#0F172A] mt-0.5">
                        {selectedDoc.projectName || 'Belirlenemedi'}
                      </div>
                    </div>
                    <div className="p-3 rounded border border-[#E2E8F0]">
                      <div className="text-[#475569]">Orijinal Dosya Adı</div>
                      <div className="font-mono font-semibold text-[#0F172A] mt-0.5 break-all">
                        {selectedDoc.originalFilename}
                      </div>
                    </div>
                  </div>

                  {selectedDoc.userModifiedFields.length > 0 && (
                    <div className="p-2.5 rounded bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
                      Kullanıcı tarafından doğrulanmış ve korunan alanlar:{' '}
                      <strong className="font-mono">
                        {selectedDoc.userModifiedFields.join(', ')}
                      </strong>
                    </div>
                  )}
                </div>
              )}

              {drawerTab === 'ilgi' && (
                <div className="space-y-5">
                  {/* 1. Outgoing Direct İLGİ References */}
                  <div className="space-y-2.5">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#1D4ED8] font-mono">
                      1. Bu Belgenin İLGİ Gösterdiği Resmî Yazılar ({selectedDoc.outgoingIlgi.length})
                    </h3>
                    {selectedDoc.outgoingIlgi.length === 0 ? (
                      <div className="text-xs text-[#475569] p-3 bg-[#F8FAFC] rounded border border-[#E2E8F0]">
                        Bu belgede dışarıya giden resmî İLGİ kaydı tespit edilmedi.
                      </div>
                    ) : (
                      selectedDoc.outgoingIlgi.map((ref) => {
                        const isResolved =
                          ref.matchStatus === 'ESLESTI' ||
                          ref.matchStatus === 'MANUEL_DOGRULANDI';
                        return (
                          <div
                            key={ref.id}
                            className={`p-3.5 rounded-lg border space-y-1.5 ${
                              isResolved
                                ? 'bg-[#EFF6FF]/60 border-blue-200'
                                : 'bg-amber-50/70 border-amber-200'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono text-xs font-bold text-[#0F172A]">
                                {ref.referencedDocNumber} — {ref.referencedDate || 'Tarih Belirsiz'}
                              </span>
                              {isResolved && ref.targetDocumentId ? (
                                <button
                                  type="button"
                                  onClick={() => handleNavigateToDocumentId(ref.targetDocumentId)}
                                  className="px-2.5 py-1 bg-[#1D4ED8] text-white text-[11px] font-semibold rounded flex items-center gap-1"
                                >
                                  <span>İLGİ Belgesine Git</span>
                                  <ArrowRight className="w-3 h-3" />
                                </button>
                              ) : (
                                <span className="px-2 py-0.5 rounded bg-amber-100 text-[#D97706] font-mono text-[11px] font-semibold">
                                  {ref.referencedDocNumber} — {ref.referencedDate || ''} — Arşivde
                                  bulunamadı
                                </span>
                              )}
                            </div>
                            {ref.targetTitle && (
                              <div className="text-xs font-semibold text-[#1D4ED8]">
                                Hedef Belge: {ref.targetTitle}
                              </div>
                            )}
                            <div className="text-[11px] text-[#475569] font-mono">
                              Metin Kanıtı ({ref.pageOrSection}): “{ref.originalIlgiText}”
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* 2. Incoming Direct İLGİ References ("Bu belgeye atıfta bulunan diğer belgeler") */}
                  <div className="space-y-2.5 pt-3 border-t border-[#E2E8F0]">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-700 font-mono">
                      2. Bu Belgeye İLGİ Gösteren (Atıfta Bulunan) Diğer Belgeler (
                      {selectedDoc.incomingIlgi.length})
                    </h3>
                    {selectedDoc.incomingIlgi.length === 0 ? (
                      <div className="text-xs text-[#475569] p-3 bg-[#F8FAFC] rounded border border-[#E2E8F0]">
                        Arşivde henüz bu belgeye İLGİ gösteren üst yazı bulunmuyor.
                      </div>
                    ) : (
                      selectedDoc.incomingIlgi.map((inc) => (
                        <div
                          key={inc.id}
                          onClick={() => handleNavigateToDocumentId(inc.sourceDocumentId)}
                          className="p-3.5 rounded-lg border border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50 cursor-pointer flex items-center justify-between gap-3"
                        >
                          <div>
                            <div className="font-mono text-xs font-bold text-emerald-950">
                              {inc.sourceDocNumber} ({inc.sourceDate})
                            </div>
                            <div className="text-xs font-semibold text-[#0F172A]">
                              {inc.sourceTitle}
                            </div>
                          </div>
                          <ArrowRight className="w-4 h-4 text-emerald-700 shrink-0" />
                        </div>
                      ))
                    )}
                  </div>

                  {/* 3. Semantically Similar Documents (Strictly separated from official İLGİ!) */}
                  <div className="space-y-2.5 pt-3 border-t border-[#E2E8F0]">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#475569] font-mono">
                      3. Semantik Olarak İlişkili Belgeler (Resmî İLGİ Değildir — Konu/Kavram
                      Benzerliği)
                    </h3>
                    {selectedDoc.semanticLinks.map((sem) => (
                      <div
                        key={sem.id}
                        onClick={() => handleNavigateToDocumentId(sem.relatedDocumentId)}
                        className="p-3 rounded border border-[#E2E8F0] hover:border-[#CBD5E1] cursor-pointer flex items-center justify-between"
                      >
                        <div>
                          <div className="text-xs font-semibold text-[#0F172A]">
                            [{sem.relatedDocNumber}] {sem.relatedTitle}
                          </div>
                          <div className="text-[11px] text-[#475569]">{sem.reason}</div>
                        </div>
                        <span className="font-mono text-xs font-bold text-[#1D4ED8]">
                          %{sem.similarityScore}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Manual İLGİ Addition Form */}
                  <form
                    onSubmit={handleAddManualIlgi}
                    className="p-3.5 rounded bg-[#F8FAFC] border border-[#E2E8F0] space-y-2.5"
                  >
                    <div className="text-xs font-bold text-[#0F172A]">
                      Manuel İLGİ Referansı Tanımla / Doğrula
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newIlgiNumber}
                        onChange={(e) => setNewIlgiNumber(e.target.value)}
                        placeholder="Belge Sayısı (Örn: E-123456)"
                        className="flex-1 px-2.5 py-1.5 text-xs font-mono border border-[#CBD5E1] rounded bg-white"
                      />
                      <input
                        type="text"
                        value={newIlgiDate}
                        onChange={(e) => setNewIlgiDate(e.target.value)}
                        placeholder="Tarih (15.03.2023)"
                        className="w-36 px-2.5 py-1.5 text-xs font-mono border border-[#CBD5E1] rounded bg-white"
                      />
                      <button
                        type="submit"
                        className="px-3 py-1.5 bg-[#0F172A] text-white text-xs font-semibold rounded"
                      >
                        Ekle
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {drawerTab === 'text' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs bg-[#F8FAFC] p-2.5 rounded border border-[#E2E8F0]">
                    <span>
                      Çıkarım Yöntemi: <strong className="font-mono">{selectedDoc.extractionMethod}</strong>
                    </span>
                    <span className="font-mono font-semibold text-[#1D4ED8]">
                      {selectedDoc.ocrStatus}
                    </span>
                  </div>
                  <pre className="p-4 rounded bg-[#0F172A] text-slate-100 font-mono text-xs whitespace-pre-wrap leading-relaxed overflow-x-auto">
                    {selectedDoc.extractedText}
                  </pre>
                </div>
              )}

              {drawerTab === 'sources' && (
                <div className="space-y-3">
                  <div className="p-3 rounded bg-[#F8FAFC] border border-[#E2E8F0] text-xs font-mono break-all">
                    SHA-256 Bütünlük Özeti: <strong>{selectedDoc.sha256Hash}</strong>
                  </div>
                  {selectedDoc.sources.map((src) => (
                    <div
                      key={src.id}
                      className="p-3.5 rounded border border-[#E2E8F0] space-y-1 text-xs"
                    >
                      <div className="font-semibold text-[#0F172A]">
                        Kaynak Türü: {src.sourceType} ({src.sourceFilename})
                      </div>
                      {src.emailSubject && (
                        <div className="text-[#475569]">E-posta Konusu: {src.emailSubject}</div>
                      )}
                      {src.emailSender && (
                        <div className="text-[#475569]">Gönderen: {src.emailSender}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
