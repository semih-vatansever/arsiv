import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db } from './index.ts';
import {
  aiLogs,
  auditLogs,
  documentChunks,
  documentReferences,
  documentSources,
  documents,
  documentTexts,
  emails,
  keywords,
  processingJobs,
  systemSettings,
  users,
} from './schema.ts';
import { eq } from 'drizzle-orm';
import { createTeamUser, decryptTotpSecret, encryptTotpSecret } from './users.ts';
import {
  computeSemanticEmbedding,
  generateBase32Secret,
  normalizeDocumentNumber,
  normalizeTurkishText,
} from '../utils/archiveLogic.ts';

export const DEMO_ADMIN_TOTP_SECRET = 'JBSWY3DPEHPK3PXP';
export const DEMO_SECOND_ADMIN_TOTP_SECRET = 'KRSXG5CTMVRXEZLU';

const STORAGE_DIR = path.resolve(process.cwd(), 'storage', 'documents');

export function ensureStorageDir() {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }
}

export async function seedInitialArchiveIfEmpty() {
  try {
    ensureStorageDir();
    const existingUsers = await db.select().from(users);

    let adminUserId = 1;
    if (existingUsers.length === 0) {
      const semih = await createTeamUser({
        username: 'semih',
        displayName: 'Semih Vatansever',
        role: 'ADMIN',
        email: 'semih.vatansever@dhmi.gov.tr',
        autoVerifyForSeed: true,
        fixedSecretForDemo: DEMO_ADMIN_TOTP_SECRET,
      });
      adminUserId = semih.user.id;

      await createTeamUser({
        username: 'burak',
        displayName: 'Burak Özdemir',
        role: 'ADMIN',
        email: 'burak.ozdemir@dhmi.gov.tr',
        autoVerifyForSeed: true,
        fixedSecretForDemo: DEMO_SECOND_ADMIN_TOTP_SECRET,
      });

      await createTeamUser({
        username: 'ayse',
        displayName: 'Ayşe Kaya',
        role: 'MEMBER',
        email: 'ayse.kaya@dhmi.gov.tr',
        autoVerifyForSeed: true,
        fixedSecretForDemo: DEMO_ADMIN_TOTP_SECRET,
      });

      await createTeamUser({
        username: 'mehmet',
        displayName: 'Mehmet Demir',
        role: 'MEMBER',
        email: 'mehmet.demir@dhmi.gov.tr',
        autoVerifyForSeed: false,
      });
    } else {
      adminUserId = existingUsers[0].id;
      for (const u of existingUsers) {
        if (!decryptTotpSecret(u.totpSecretEncrypted)) {
          const fallbackPlain =
            u.username === 'semih' || u.username === 'ayse'
              ? DEMO_ADMIN_TOTP_SECRET
              : u.username === 'burak'
                ? DEMO_SECOND_ADMIN_TOTP_SECRET
                : generateBase32Secret();
          await db
            .update(users)
            .set({ totpSecretEncrypted: encryptTotpSecret(fallbackPlain) })
            .where(eq(users.id, u.id));
        }
      }
    }

    const existingDocs = await db.select().from(documents);
    if (existingDocs.length > 0) {
      return;
    }

    // 1. Seed Inbound Forwarded Emails (Resend Inbound Email format)
    const insertedEmails = await db
      .insert(emails)
      .values([
        {
          sourceService: 'RESEND_INBOUND',
          sourceMessageId: 'resend_msg_20250312_esb_mania_01',
          originalMessageId: '<CAB9102-DHMI-2025-12345@dhmi.gov.tr>',
          actualSender: 'semih.vatansever@kurum.gov.tr',
          originalSender: 'insaat.emlak@dhmi.gov.tr (DHMİ Genel Müdürlüğü)',
          recipients: 'arsiv@dhmi-dokuman.resend.app',
          cc: 'seyrüsefer@dhmi.gov.tr; etud.proje@dhmi.gov.tr',
          subject: 'FW: Ankara Esenboğa Havalimanı Mania Planı ve Kuzey Yaklaşma Hattı Teknik Değerlendirmesi',
          sentAt: '12.03.2025 14:22',
          bodyText:
            '---------- Yönlendirilen İleti ----------\nGönderen: DHMİ Genel Müdürlüğü İnşaat ve Emlak Dairesi Başkanlığı <insaat.emlak@dhmi.gov.tr>\nTarih: 12 Mart 2025 11:05\nKonu: Ankara Esenboğa Havalimanı Mania Planı Hakkında Teknik Değerlendirme\n\nEklerde Ankara Esenboğa Havalimanı mania planına ilişkin teknik değerlendirme yazımız (2025/12345) ve koordinat cetveli sunulmaktadır.',
          forwardedByUser: 'semih',
          attachmentCount: 2,
          processingStatus: 'TAMAMLANDI',
          rawEmlStorageKey: 'eml/resend_msg_20250312_esb_mania_01.eml',
        },
        {
          sourceService: 'RESEND_INBOUND',
          sourceMessageId: 'resend_msg_20240824_esb_ols_02',
          originalMessageId: '<CAB8420-DHMI-2024-8420@dhmi.gov.tr>',
          actualSender: 'ayse.kaya@kurum.gov.tr',
          originalSender: 'seyrusefer@dhmi.gov.tr (DHMİ Hava Seyrüsefer Dairesi Başkanlığı)',
          recipients: 'arsiv@dhmi-dokuman.resend.app',
          cc: 'insaat.emlak@dhmi.gov.tr',
          subject: 'FW: Esenboğa 3. Pist Engel Sınırlama Yüzeyleri (OLS) Havacılık Analizi (2024/8420)',
          sentAt: '24.08.2024 16:40',
          bodyText:
            'Esenboğa Havalimanı 3. Pist ve Kuzey Yaklaşma Hattı kapsamında hazırlanan 24.08.2024 tarihli ve 2024/8420 sayılı Havacılık Analizi raporu ektedir.',
          forwardedByUser: 'ayse',
          attachmentCount: 1,
          processingStatus: 'TAMAMLANDI',
          rawEmlStorageKey: 'eml/resend_msg_20240824_esb_ols_02.eml',
        },
        {
          sourceService: 'RESEND_INBOUND',
          sourceMessageId: 'resend_msg_20250218_ayt_apron_03',
          originalMessageId: '<CAB10452-DHMI-2025-10452@dhmi.gov.tr>',
          actualSender: 'burak.ozdemir@kurum.gov.tr',
          originalSender: 'isletme.dairesi@dhmi.gov.tr (DHMİ İşletme Dairesi Başkanlığı)',
          recipients: 'arsiv@dhmi-dokuman.resend.app',
          cc: 'antalya.basmudurluk@dhmi.gov.tr',
          subject: 'FW: Antalya Havalimanı Yeni Doğu Apronu Genişletme Projesi Teknik Görüşü',
          sentAt: '18.02.2025 09:50',
          bodyText:
            'Antalya Havalimanı yeni doğu apronu genişletme projesi ve taksi yolu bağlantıları emniyet değerlendirmesi yazımız ekte yer almaktadır.',
          forwardedByUser: 'burak',
          attachmentCount: 1,
          processingStatus: 'TAMAMLANDI',
          rawEmlStorageKey: 'eml/resend_msg_20250218_ayt_apron_03.eml',
        },
      ])
      .returning();

    const emailEsb2025 = insertedEmails[0];
    const emailEsb2024 = insertedEmails[1];
    const emailAyt2025 = insertedEmails[2];

    // Seed 7 comprehensive DHMİ documents
    const seedDocsData = [
      {
        originalFilename: 'DHMI_2025_12345_Esenboga_Mania_Plani_Teknik_Degerlendirme.pdf',
        fileExtension: 'PDF',
        mimeType: 'application/pdf',
        fileSizeBytes: 2516582, // ~2.4 MB
        documentNumber: '2025/12345',
        documentDate: '12.03.2025',
        title: 'Ankara Esenboğa Havalimanı Mania Planı Hakkında Teknik Değerlendirme',
        shortDescription:
          'Esenboğa Havalimanı mania planına ilişkin teknik değerlendirme ve kuzey yaklaşma hattı engel sınırlama yüzeylerine (OLS) ait koordinat ile gabari kotlarının incelenmesi.',
        detailedDescription:
          'Ankara Esenboğa Havalimanı (LTAC) 03R/21L pisti kuzey yaklaşma yüzeyi ile iç yatay yüzey sınırları içerisinde kalan Çubuk ve Akyurt ilçeleri muhtelif parsellerdeki yapılaşma taleplerinin SHT-MANİA ve ICAO Annex 14 kriterlerine göre değerlendirilmesi. Belgede maksimum yapı gabari kotunun 998,50 m AMSL değerini aşmaması gerektiği ve kule vinç kullanımlarının ayrıca seyrüsefer analizine tabi tutulacağı belirtilmektedir.',
        senderOrg: 'DHMİ Genel Müdürlüğü',
        senderPerson: 'Dr. Müh. Kemalettin Arslan (Daire Başkanı)',
        recipient: 'Ankara Büyükşehir Belediyesi İmar ve Şehircilik Dairesi Başkanlığı',
        relatedDepartment: 'İnşaat ve Emlak Dairesi Başkanlığı',
        airport: 'Ankara Esenboğa Havalimanı',
        cityLocation: 'Ankara (Çubuk / Akyurt)',
        projectName: 'Esenboğa Mania Planı Revizyonu ve Kuzey Yaklaşma Hattı',
        documentType: 'Teknik Değerlendirme',
        subjectPurpose: 'Esenboğa Havalimanı mania planı kriterleri ve engel sınırlama yüzeyleri teknik görüşü',
        pageCount: 4,
        sourceType: 'EMAIL',
        sourceReliability: 'DOGRULANMIS',
        processingStatus: 'TAMAMLANDI',
        duplicateConflictStatus: 'COKLU_KAYNAK',
        ocrStatus: 'METIN_KATMANI_MEVCUT',
        extractionMethod: 'NATIVE_PDF_TEXT',
        keywords: ['MANİA', 'ESB', 'TEKNİK DEĞERLENDİRME', 'ENGEL SINIRLAMA YÜZEYLERİ'],
        emailId: emailEsb2025.id,
        extractedText: `T.C. ULAŞTIRMA VE ALTYAPI BAKANLIĞI
Devlet Hava Meydanları İşletmesi Genel Müdürlüğü
İnşaat ve Emlak Dairesi Başkanlığı

Sayı : 2025/12345
Tarih: 12.03.2025
Konu : Ankara Esenboğa Havalimanı Mania Planı Hakkında Teknik Değerlendirme

İLGİ:
a) 15.03.2023 tarihli ve E-123456 sayılı yazımız.
b) 24.08.2024 tarihli ve 2024/8420 sayılı DHMİ Hava Seyrüsefer Dairesi Başkanlığı yazısı.

ANKARA BÜYÜKŞEHİR BELEDİYESİ BAŞKANLIĞINA
(İmar ve Şehircilik Dairesi Başkanlığı)

İlgi (a) ve (b) kayıtlı yazılarımız ile Ankara Esenboğa Havalimanı (LTAC) master planı kapsamında 03R/21L ve yeni 3. pist kuzey yaklaşma koridorunda yer alan engel sınırlama yüzeyleri (OLS) koordinatları bildirilmiştir.

Yapılan teknik incelemede; Akyurt Sanayi Bölgesi kuzeybatı etabında planlanan tesislerin konik yüzey ve iç yatay yüzey izdüşümünde kaldığı, WGS-84 koordinat sisteminde 40°09'18"K - 33°01'44"D noktasında azami irtifa sınırının 998,50 metre (AMSL) olduğu tespit edilmiştir. Seyrüsefer yardımcı cihazlarının (ILS/DME ve SSR Radar) sinyal bütünlüğünün korunması amacıyla metal cepheli yüksek yapılaşmaya izin verilmemesi gerekmektedir.`,
      },
      {
        originalFilename: 'DHMI_2024_8420_Esenboga_3_Pist_OLS_Havacilik_Analizi.pdf',
        fileExtension: 'PDF',
        mimeType: 'application/pdf',
        fileSizeBytes: 4194304, // 4.0 MB
        documentNumber: '2024/8420',
        documentDate: '24.08.2024',
        title: 'Ankara Esenboğa Havalimanı 3. Pist ve Kuzey Yaklaşma Hattı Engel Sınırlama Yüzeyleri (OLS) Havacılık Analizi',
        shortDescription:
          'Esenboğa Havalimanı yeni 3. paralel pisti için PBN/RNAV aletli yaklaşma prosedürleri, mania kriterleri ve ILS kritik/hassas alan sınırlarını belirleyen kapsamlı havacılık analizi.',
        detailedDescription:
          'DHMİ Hava Seyrüsefer Dairesi Başkanlığı tarafından hazırlanan bu havacılık analizinde; Esenboğa Havalimanı 3. paralel pistinin CAT II/III aletli iniş sistemi (ILS) koruma yüzeyleri, PBN yaklaşma koridorları ve %1,6 tırmanma gradyanı hesaplamaları detaylandırılmıştır. 2023 yılı ilk etüt verilerine kıyasla eşik kotu 954,20 m olarak revize edilmiştir.',
        senderOrg: 'DHMİ Genel Müdürlüğü',
        senderPerson: 'Yüksel Çakır (Hava Seyrüsefer Dairesi Başkanı)',
        recipient: 'DHMİ İnşaat ve Emlak Dairesi Başkanlığı',
        relatedDepartment: 'Hava Seyrüsefer Dairesi Başkanlığı',
        airport: 'Ankara Esenboğa Havalimanı',
        cityLocation: 'Ankara (Çubuk)',
        projectName: 'Esenboğa 3. Paralel Pist ve PAT Sahaları Yapımı',
        documentType: 'Havacılık Analizi',
        subjectPurpose: 'Esenboğa 3. pist aletli yaklaşma yüzeyleri ve mania kriterleri havacılık analizi',
        pageCount: 9,
        sourceType: 'EMAIL',
        sourceReliability: 'DOGRULANMIS',
        processingStatus: 'TAMAMLANDI',
        duplicateConflictStatus: 'TEKIL',
        ocrStatus: 'METIN_KATMANI_MEVCUT',
        extractionMethod: 'NATIVE_PDF_TEXT',
        keywords: ['HAVACILIK ANALİZİ', 'ENGEL SINIRLAMA YÜZEYLERİ', 'PİST', 'SEYRÜSEFER', 'MANİA'],
        emailId: emailEsb2024.id,
        extractedText: `T.C. ULAŞTIRMA VE ALTYAPI BAKANLIĞI
Devlet Hava Meydanları İşletmesi Genel Müdürlüğü
Hava Seyrüsefer Dairesi Başkanlığı

Sayı : 2024/8420
Tarih: 24.08.2024
Konu : Ankara Esenboğa Havalimanı 3. Pist OLS ve PBN Havacılık Analizi

İLGİ:
a) 15.03.2023 tarihli ve E-123456 sayılı İnşaat ve Emlak Dairesi yazısı.

İNŞAAT VE EMLAK DAİRESİ BAŞKANLIĞINA

İlgi (a) yazınız ile talep edilen Ankara Esenboğa Havalimanı yeni 3. paralel pisti (3.750 m x 60 m) engel sınırlama yüzeyleri (OLS) ve aletli yaklaşma prosedürleri havacılık analizi tamamlanmıştır.
1. İç Yatay Yüzey: Pist referans noktasından 4.000 m yarıçaplı alanda +45 m (999,20 m AMSL) olarak uygulanacaktır.
2. Yaklaşma Yüzeyi: İlk 3.000 m kesimde %2,0 eğim, müteakip 3.600 m kesimde %2,5 eğim esas alınmıştır.
3. Pas Geçme (Missed Approach) Tırmanma Yüzeyi: %2,5 standart tırmanma gradyanına göre Çubuk Ovası kuzey kesiminde mania ihlali oluşturan doğal veya yapay engel bulunmadığı doğrulanmıştır.`,
      },
      {
        originalFilename: 'DHMI_2025_14890_Esenboga_Cevresi_Imar_Plani_ve_GES_Gorusu.docx',
        fileExtension: 'DOCX',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        fileSizeBytes: 1458120, // ~1.4 MB
        documentNumber: '2025/14890',
        documentDate: '04.04.2025',
        title: 'Esenboğa Havalimanı Çevresi 1/5000 Ölçekli İmar Planı Değişikliği ve GES Parlama Analizi Teknik Görüşü',
        shortDescription:
          'Ankara Esenboğa Havalimanı yaklaşma koridoru komşuluğunda planlanan Güneş Enerjisi Santrali (GES) ve imar planı değişikliğinin parlama (glint/glare) ile mania kriterleri açısından şartlı uygunluk görüşü.',
        detailedDescription:
          'Çubuk ilçesi Dumlupınar mahallesi 142 ada 8 parselde yapılması planlanan 12 MW kurulu güçlü Güneş Enerjisi Santrali (GES) projesine ait 1/5000 ölçekli Nazım İmar Planı teklifinin incelenmesi. 2025/12345 sayılı mania değerlendirmemiz ve 2024/8420 sayılı havacılık analizimiz doğrultusunda anti-reflektif kaplamalı panel kullanılması ve azami 982 m AMSL kotunun aşılmaması şartıyla uygun görüş verilmiştir.',
        senderOrg: 'DHMİ Genel Müdürlüğü',
        senderPerson: 'Dr. Müh. Kemalettin Arslan',
        recipient: 'Çevre, Şehircilik ve İklim Değişikliği İl Müdürlüğü (Ankara)',
        relatedDepartment: 'İnşaat ve Emlak Dairesi Başkanlığı',
        airport: 'Ankara Esenboğa Havalimanı',
        cityLocation: 'Ankara (Çubuk)',
        projectName: 'Çubuk GES İmar Planı ve Parlama Analizi',
        documentType: 'Teknik Görüş',
        subjectPurpose: 'Esenboğa yaklaşma hattı çevresi imar planı ve GES parlama analizi kurum görüşü',
        pageCount: 6,
        sourceType: 'DIRECT_UPLOAD',
        sourceReliability: 'DOGRULANMIS',
        processingStatus: 'TAMAMLANDI',
        duplicateConflictStatus: 'TEKIL',
        ocrStatus: 'METIN_KATMANI_MEVCUT',
        extractionMethod: 'OFFICE_PARSER',
        keywords: ['İMAR PLANI', 'MANİA', 'TEKNİK GÖRÜŞ', 'HAVACILIK ANALİZİ'],
        emailId: null,
        extractedText: `T.C. ULAŞTIRMA VE ALTYAPI BAKANLIĞI
Devlet Hava Meydanları İşletmesi Genel Müdürlüğü

Sayı : 2025/14890
Tarih: 04.04.2025
Konu : Esenboğa Havalimanı Çevresi İmar Planı Değişikliği ve GES Parlama Analizi Görüşü

İLGİ:
a) 24.08.2024 tarihli ve 2024/8420 sayılı Havacılık Analizi yazımız.
b) 12.03.2025 tarihli ve 2025/12345 sayılı Teknik Değerlendirme yazımız.

ANKARA ÇEVRE, ŞEHİRCİLİK VE İKLİM DEĞİŞİKLİĞİ İL MÜDÜRLÜĞÜNE

İlgi (a) ve (b) kayıtlı yazılarımız çerçevesinde Ankara Esenboğa Havalimanı yaklaşma yüzeyi izdüşümünde kalan 142 ada 8 parseldeki 1/5000 ölçekli Nazım İmar Planı ve Güneş Enerjisi Santrali (GES) teklifi incelenmiştir.
Hava trafik kontrol kulesi (TWR) ve son yaklaşmadaki hava araçları açısından yapılan optik parlama (glint & glare) simülasyonunda; panellerin 22° sabit güney eğimle ve anti-reflektif kaplamalı olarak tesis edilmesi, ayrıca paratoner dahil en yüksek noktanın 982,00 m AMSL kotunu geçmemesi kaydıyla imar planı değişikliğinde Kuruluşumuzca sakınca bulunmamaktadır.`,
      },
      {
        originalFilename: 'DHMI_2025_10452_Antalya_Dogu_Apron_Genisletme_Teknik_Gorus.pdf',
        fileExtension: 'PDF',
        mimeType: 'application/pdf',
        fileSizeBytes: 3355443, // 3.2 MB
        documentNumber: '2025/10452',
        documentDate: '18.02.2025',
        title: 'Antalya Havalimanı Yeni Doğu Apronu Genişletme Projesi ve Taksi Yolu Bağlantıları Operasyonel Emniyet Değerlendirmesi',
        shortDescription:
          'Antalya Havalimanı apron genişletme projesine ilişkin DHMİ teknik görüşü; mevcut paralel taksi yolu bağlantıları, Code E/F uçak park pozisyonları ve operasyonel emniyet koşullarını değerlendiriyor.',
        detailedDescription:
          'Antalya Havalimanı (LTAI) kapasite artırımı yatırımları kapsamında yeni Doğu Apronu (18 adet ilave uçak park pozisyonu) ile Bravo ve Charlie bağlantı taksi yollarının geometrik entegrasyonu incelenmiştir. 2023/6190 sayılı ön inceleme raporundaki PCN 95/R/B/W/T kaplama dayanım şartının sağlandığı ve inşaat süresince aktif PAT sahası güvenlik şeritlerinin korunması gerektiği vurgulanmıştır.',
        senderOrg: 'DHMİ Genel Müdürlüğü',
        senderPerson: 'Murat Soylu (İşletme Dairesi Başkanı)',
        recipient: 'Antalya Havalimanı Başmüdürlüğü',
        relatedDepartment: 'İşletme Dairesi Başkanlığı',
        airport: 'Antalya Havalimanı',
        cityLocation: 'Antalya',
        projectName: 'Antalya Havalimanı Doğu Apronu ve Taksi Yolu Genişletmesi',
        documentType: 'Teknik Görüş',
        subjectPurpose: 'Antalya Havalimanı apron genişletmesi ve taksi yolu operasyonel emniyet değerlendirmesi',
        pageCount: 7,
        sourceType: 'EMAIL',
        sourceReliability: 'DOGRULANMIS',
        processingStatus: 'TAMAMLANDI',
        duplicateConflictStatus: 'TEKIL',
        ocrStatus: 'METIN_KATMANI_MEVCUT',
        extractionMethod: 'NATIVE_PDF_TEXT',
        keywords: ['APRON', 'TAKSİ YOLU', 'TEKNİK GÖRÜŞ', 'PİST'],
        emailId: emailAyt2025.id,
        extractedText: `T.C. ULAŞTIRMA VE ALTYAPI BAKANLIĞI
Devlet Hava Meydanları İşletmesi Genel Müdürlüğü
İşletme Dairesi Başkanlığı

Sayı : 2025/10452
Tarih: 18.02.2025
Konu : Antalya Havalimanı Yeni Doğu Apronu Genişletme Projesi Teknik Görüşü

İLGİ:
a) 09.11.2023 tarihli ve 2023/6190 sayılı PAT Sahaları Ön İnceleme Raporu yazımız.

ANTALYA HAVALİMANI BAŞMÜDÜRLÜĞÜNE

İlgi (a) yazımız ile başlatılan Antalya Havalimanı (LTAI) Doğu Apronu genişletme projesi kapsamında; 6 adet ICAO Kod E (geniş gövde) ve 12 adet ICAO Kod C uçak park pozisyonunun mevcut paralel taksi yoluna bağlantıları incelenmiştir.
Taksi yolu merkez hattı ile apron taksi yolu arasındaki 76,5 m emniyet mesafesinin ICAO Annex 14 Cilt I kriterlerine tam uyumlu olduğu, pushback manevralarının aktif pist çıkışlarını etkilemeyeceği değerlendirilmiş olup projenin 2. etap uygulama safhasına geçilmesi uygun bulunmuştur.`,
      },
      {
        originalFilename: 'DHMI_2023_6190_Antalya_PAT_Sahalari_Kapasite_On_Inceleme.pdf',
        fileExtension: 'PDF',
        mimeType: 'application/pdf',
        fileSizeBytes: 5124000, // ~4.9 MB
        documentNumber: '2023/6190',
        documentDate: '09.11.2023',
        title: 'Antalya Havalimanı PAT Sahaları Kapasite Artırımı ve Taksi Yolu Geometrik Standartları Ön İnceleme Raporu',
        shortDescription:
          'Antalya Havalimanı PAT (Pist-Apron-Taksi Yolu) sahaları 2023-2030 master plan projeksiyonu kapsamında kaplama mukavemeti (PCN), drenaj altyapısı ve hızlı çıkış taksi yolu ihtiyaç analizi.',
        detailedDescription:
          '2023 yılında başlatılan Antalya Havalimanı genişletme etütlerinin temel referans belgesidir. Yaz sezonunda saatlik 75 uçak trafiği talebini karşılamak üzere Doğu Apronu genişletmesi ve iki adet yüksek hızlı çıkış taksi yolu (RET) yapılması önerilmiştir.',
        senderOrg: 'DHMİ Genel Müdürlüğü',
        senderPerson: 'Dr. Müh. Kemalettin Arslan',
        recipient: 'DHMİ İşletme Dairesi Başkanlığı',
        relatedDepartment: 'İnşaat ve Emlak Dairesi Başkanlığı',
        airport: 'Antalya Havalimanı',
        cityLocation: 'Antalya',
        projectName: 'Antalya Havalimanı Doğu Apronu ve Taksi Yolu Genişletmesi',
        documentType: 'Teknik Değerlendirme',
        subjectPurpose: 'Antalya PAT sahaları kapasite artırımı ve kaplama dayanımı ön incelemesi',
        pageCount: 11,
        sourceType: 'DIRECT_UPLOAD',
        sourceReliability: 'DOGRULANMIS',
        processingStatus: 'TAMAMLANDI',
        duplicateConflictStatus: 'TEKIL',
        ocrStatus: 'METIN_KATMANI_MEVCUT',
        extractionMethod: 'NATIVE_PDF_TEXT',
        keywords: ['APRON', 'PİST', 'TAKSİ YOLU', 'TEKNİK GÖRÜŞ'],
        emailId: null,
        extractedText: `T.C. ULAŞTIRMA VE ALTYAPI BAKANLIĞI
Devlet Hava Meydanları İşletmesi Genel Müdürlüğü
İnşaat ve Emlak Dairesi Başkanlığı

Sayı : 2023/6190
Tarih: 09.11.2023
Konu : Antalya Havalimanı PAT Sahaları Kapasite Artırımı Ön İnceleme Raporu

İŞLETME DAİRESİ BAŞKANLIĞINA

Antalya Havalimanı mevcut PAT sahalarının artan geniş gövde trafiğini karşılayabilmesi amacıyla hazırlanan 09.11.2023 tarihli Ön İnceleme Raporu ekte gönderilmektedir.
Raporda; Doğu Apronu beton kaplama kalınlığının 42 cm PQC olarak projelendirilmesi, PCN 95/R/B/W/T mukavemet değerinin sağlanması ve taksi yolu banket genişliklerinin ICAO Kod E uçaklarına göre 44 metreye çıkarılması öngörülmüştür.`,
      },
      {
        originalFilename: 'DHMI_2024_11205_Trabzon_Yeni_Pist_VOR_ILS_Seyrusefer_Analizi.xlsx',
        fileExtension: 'XLSX',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        fileSizeBytes: 942080, // ~920 KB
        documentNumber: '2024/11205',
        documentDate: '19.10.2024',
        title: 'Trabzon Havalimanı Yeni Deniz Dolgu Pist Projesi VOR/DME ve ILS Seyrüsefer Yardımcı Cihazları Frekans Etkileşim Analizi',
        shortDescription:
          'Trabzon Havalimanı deniz dolgusu üzerine planlanan yeni pist projesinde GP/LOC anten konumları, VOR/DME koruma sahaları (BRA) ve dalga kıran tahkimatının sinyal yansıma hesabı tablosu.',
        detailedDescription:
          'Elektronik Dairesi Başkanlığı tarafından hazırlanan mühendislik hesap tablosu ve teknik analiz belgesidir. Deniz dolgusu anroşman kotunun Glide Path (GP) sinyali üzerinde oluşturabileceği çoklu yansıma (multipath) etkileri incelenmiş, GP anteni önündeki 350 metrelik düzeltilmiş yansıma düzlemi toleransları belirlenmiştir.',
        senderOrg: 'DHMİ Genel Müdürlüğü',
        senderPerson: 'Sinan Karaca (Elektronik Dairesi Başkanı)',
        recipient: 'Altyapı Yatırımları Genel Müdürlüğü (AYGM)',
        relatedDepartment: 'Elektronik Dairesi Başkanlığı',
        airport: 'Trabzon Havalimanı',
        cityLocation: 'Trabzon',
        projectName: 'Trabzon Havalimanı Yeni Deniz Dolgu Pist Projesi',
        documentType: 'Havacılık Analizi',
        subjectPurpose: 'Trabzon yeni pist projesi ILS ve VOR/DME seyrüsefer cihazları sinyal koruma analizi',
        pageCount: 3,
        sourceType: 'DIRECT_UPLOAD',
        sourceReliability: 'DOGRULANMIS',
        processingStatus: 'TAMAMLANDI',
        duplicateConflictStatus: 'TEKIL',
        ocrStatus: 'METIN_KATMANI_MEVCUT',
        extractionMethod: 'OFFICE_PARSER',
        keywords: ['SEYRÜSEFER', 'PİST', 'HAVACILIK ANALİZİ', 'TEKNİK GÖRÜŞ'],
        emailId: null,
        extractedText: `T.C. ULAŞTIRMA VE ALTYAPI BAKANLIĞI
Devlet Hava Meydanları İşletmesi Genel Müdürlüğü
Elektronik Dairesi Başkanlığı

Sayı : 2024/11205
Tarih: 19.10.2024
Konu : Trabzon Havalimanı Yeni Pist Projesi VOR/DME ve ILS Frekans Etkileşim Analizi

ALTYAPI YATIRIMLARI GENEL MÜDÜRLÜĞÜNE

Trabzon Havalimanı (LTCG) mevcut 11/29 pistinin kuzeyinde deniz dolgusu üzerine projelendirilen 3.240 m uzunluğundaki yeni pist kapsamında; ILS Localizer (109.90 MHz), Glide Path (333.80 MHz) ve DVOR/DME (116.20 MHz) cihazlarının Bina Kısıtlama Alanı (BRA) analizleri tamamlanmıştır. Deniz koruma mendireği kret kotunun pist merkez hattı uzantısında +6,50 m kotunu aşmaması gerekmektedir.`,
      },
      {
        originalFilename: 'DHMI_2024_7310_Izmir_Adnan_Menderes_Bati_Apron_Mania_Taranmis.pdf',
        fileExtension: 'PDF',
        mimeType: 'application/pdf',
        fileSizeBytes: 6412800, // ~6.1 MB
        documentNumber: '2024/7310',
        documentDate: '14.06.2024',
        title: 'İzmir Adnan Menderes Havalimanı Batı Apronu Yüksek Aydınlatma Direkleri ve Geçiş Yüzeyi Mania Kriterleri İncelemesi',
        shortDescription:
          'İzmir Adnan Menderes Havalimanı batı kargo apronu aydınlatma direklerinin (28 m) 16R/34L pisti geçiş yüzeyi (%14,3 eğim) mania sınırlarına uygunluğunun taranmış saha rölöve tutanağıyla incelenmesi.',
        detailedDescription:
          'Taranmış PDF belgesinden Türkçe OCR motoru ile metin çıkarımı yapılmıştır. İzmir Adnan Menderes Havalimanı (LTBJ) batı kargo apronunda yenilenen 14 adet yüksek projektör direğinin tepe kotlarının (151,40 m AMSL) 16R/34L pisti geçiş yüzeyi altında kaldığı ve kırmızı ikaz armatürlerinin faal olduğu tespit edilmiştir.',
        senderOrg: 'DHMİ İzmir Adnan Menderes Havalimanı Başmüdürlüğü',
        senderPerson: 'Cengizhan Yıldırım (Başmüdür)',
        recipient: 'DHMİ Genel Müdürlüğü İnşaat ve Emlak Dairesi Başkanlığı',
        relatedDepartment: 'İnşaat ve Emlak Dairesi Başkanlığı',
        airport: 'İzmir Adnan Menderes Havalimanı',
        cityLocation: 'İzmir (Gaziemir)',
        projectName: 'Adnan Menderes Batı Kargo Apronu Aydınlatma Modernizasyonu',
        documentType: 'Teknik Değerlendirme',
        subjectPurpose: 'Batı apron aydınlatma direkleri geçiş yüzeyi mania kontrolü (Taranmış OCR Belgesi)',
        pageCount: 5,
        sourceType: 'DIRECT_UPLOAD',
        sourceReliability: 'YUKSEK_GUVEN',
        processingStatus: 'TAMAMLANDI',
        duplicateConflictStatus: 'TEKIL',
        ocrStatus: 'OCR_UYGULANDI',
        extractionMethod: 'TURKISH_OCR_ENGINE',
        keywords: ['MANİA', 'APRON', 'ENGEL SINIRLAMA YÜZEYLERİ', 'TEKNİK DEĞERLENDİRME'],
        emailId: null,
        extractedText: `[TÜRKÇE OCR ÇIKTISI — TARANMIŞ RESMÎ EVRAK]
T.C. DEVLET HAVA MEYDANLARI İŞLETMESİ GENEL MÜDÜRLÜĞÜ
İzmir Adnan Menderes Havalimanı Başmüdürlüğü

Sayı : 2024/7310
Tarih: 14.06.2024
Konu : Batı Apronu Yüksek Aydınlatma Direkleri Geçiş Yüzeyi Mania Kontrolü

İNŞAAT VE EMLAK DAİRESİ BAŞKANLIĞINA

İzmir Adnan Menderes Havalimanı (LTBJ) Batı Kargo Apronu sınırında tesis edilen 28 metre yüksekliğindeki 14 adet apron aydınlatma direğinin topoğrafik rölöve ölçümleri tamamlanmıştır. Direk tepe kotlarının en yüksek noktada 151,40 m AMSL olduğu, 16R/34L pisti %14,3 eğimli geçiş yüzeyi (Transitional Surface) mania sınır kotu olan 156,80 m AMSL değerinin 5,40 metre altında kaldığı tespit edilmiştir.`,
      },
    ];

    const insertedDocMap = new Map<string, number>();

    for (const item of seedDocsData) {
      const fileContentBuffer = Buffer.from(
        `%PDF-1.7 / DHMİ AKILLI DOKÜMAN ARŞİVİ ORİJİNAL BELGE KAYDI\nBelge No: ${item.documentNumber}\nTarih: ${item.documentDate}\nDosya: ${item.originalFilename}\n\n${item.extractedText}`,
        'utf8'
      );
      const sha256Hash = crypto.createHash('sha256').update(fileContentBuffer).digest('hex');
      const storageKey = `${sha256Hash.slice(0, 12)}_${item.originalFilename}`;
      const diskPath = path.join(STORAGE_DIR, storageKey);
      fs.writeFileSync(diskPath, fileContentBuffer);

      const normNo = normalizeDocumentNumber(item.documentNumber);
      const embedding = computeSemanticEmbedding(
        `${item.title} ${item.shortDescription} ${item.extractedText} ${item.keywords.join(' ')}`
      );

      const [insertedDoc] = await db
        .insert(documents)
        .values({
          originalFilename: item.originalFilename,
          fileExtension: item.fileExtension,
          mimeType: item.mimeType,
          fileSizeBytes: item.fileSizeBytes,
          sha256Hash,
          storageKey,
          fileContentBase64: fileContentBuffer.toString('base64'),
          documentNumber: item.documentNumber,
          normalizedDocNumber: normNo,
          documentDate: item.documentDate,
          title: item.title,
          shortDescription: item.shortDescription,
          detailedDescription: item.detailedDescription,
          senderOrg: item.senderOrg,
          senderPerson: item.senderPerson,
          recipient: item.recipient,
          relatedDepartment: item.relatedDepartment,
          airport: item.airport,
          cityLocation: item.cityLocation,
          projectName: item.projectName,
          documentType: item.documentType,
          subjectPurpose: item.subjectPurpose,
          pageCount: item.pageCount,
          sourceType: item.sourceType,
          sourceReliability: item.sourceReliability,
          processingStatus: item.processingStatus,
          duplicateConflictStatus: item.duplicateConflictStatus,
          userModifiedFieldsJson: '[]',
          aiEvidenceJson: JSON.stringify({
            belgeNoKaynagi: `Sayfa 1 Antet — Sayı: ${item.documentNumber}`,
            tarihKaynagi: `Sayfa 1 Antet — Tarih: ${item.documentDate}`,
            havalimaniKaynagi: `Sayfa 1 Metin Gövdesi (${item.airport})`,
            ocrDurumu: item.ocrStatus,
          }),
          uploadedByUserId: adminUserId,
        })
        .returning();

      insertedDocMap.set(normNo, insertedDoc.id);

      // Insert DocumentSource(s)
      await db.insert(documentSources).values({
        documentId: insertedDoc.id,
        sourceType: item.sourceType,
        emailId: item.emailId,
        uploadedByUsername: 'semih',
        sourceFilename: item.originalFilename,
        sourceFileSha256: sha256Hash,
        emailSubject:
          item.emailId === emailEsb2025.id
            ? emailEsb2025.subject
            : item.emailId === emailEsb2024.id
              ? emailEsb2024.subject
              : item.emailId === emailAyt2025.id
                ? emailAyt2025.subject
                : null,
        emailSender:
          item.emailId === emailEsb2025.id
            ? emailEsb2025.originalSender
            : item.emailId === emailEsb2024.id
              ? emailEsb2024.originalSender
              : item.emailId === emailAyt2025.id
                ? emailAyt2025.originalSender
                : null,
        emailDate: item.documentDate,
      });

      // For 2025/12345, add a second email source to demonstrate multi-email deduplication (Section 1 & 7.5)
      if (item.documentNumber === '2025/12345') {
        await db.insert(documentSources).values({
          documentId: insertedDoc.id,
          sourceType: 'EMAIL',
          emailId: emailEsb2025.id,
          uploadedByUsername: 'burak',
          sourceFilename: 'DHMI_2025_12345_Esenboga_Mania_Plani_Teknik_Degerlendirme.pdf',
          sourceFileSha256: sha256Hash,
          emailSubject: 'RE: Esenboğa Mania Planı Koordinat Cetveli ve Teknik Görüş (Mükerrer Forward)',
          emailSender: 'etud.proje@dhmi.gov.tr (Etüd ve Proje Müdürlüğü)',
          emailDate: '14.03.2025',
        });
      }

      // Insert DocumentText
      await db.insert(documentTexts).values({
        documentId: insertedDoc.id,
        extractedText: item.extractedText,
        ocrStatus: item.ocrStatus,
        extractionMethod: item.extractionMethod,
        pageMapJson: JSON.stringify([
          { page: 1, summary: 'Resmî Antet, Sayı, İLGİ ve Değerlendirme Özeti' },
          { page: 2, summary: 'Teknik Koordinatlar, Kot Hesapları ve Mania Sınırları' },
        ]),
        processingVersion: 1,
      });

      // Insert DocumentChunks with semantic embeddings
      await db.insert(documentChunks).values({
        documentId: insertedDoc.id,
        chunkIndex: 0,
        pageNumber: 1,
        sectionTitle: 'Sayfa 1 — Resmî Yazışma Gövdesi ve İLGİ Bölümü',
        chunkText: item.extractedText,
        normalizedSearchText: normalizeTurkishText(
          `${item.title} ${item.shortDescription} ${item.extractedText}`
        ),
        embeddingJson: JSON.stringify(embedding),
      });

      // Insert Keywords
      for (const kw of item.keywords) {
        await db.insert(keywords).values({
          documentId: insertedDoc.id,
          keyword: kw,
          normalizedKeyword: normalizeTurkishText(kw),
          source: 'AI',
        });
      }

      // Insert completed ProcessingJob
      await db.insert(processingJobs).values({
        documentId: insertedDoc.id,
        emailId: item.emailId,
        jobType: item.ocrStatus === 'OCR_UYGULANDI' ? 'OCR_CIKARIM' : 'BELGE_ANALIZ',
        currentStage: 'Tamamlandı (13/13 Aşama)',
        status: 'TAMAMLANDI',
        attempts: 1,
        completedAt: new Date(),
      });
    }

    // 2. Seed Official İLGİ References & Separate Semantic Links (Section 6)
    const id2025_12345 = insertedDocMap.get('2025/12345')!;
    const id2024_8420 = insertedDocMap.get('2024/8420')!;
    const id2025_14890 = insertedDocMap.get('2025/14890')!;
    const id2025_10452 = insertedDocMap.get('2025/10452')!;
    const id2023_6190 = insertedDocMap.get('2023/6190')!;
    const id2024_7310 = insertedDocMap.get('2024/7310')!;

    await db.insert(documentReferences).values([
      // Doc 2025/12345 -> missing doc E-123456 (demonstrates Section 6.3: Unresolved missing reference preserved!)
      {
        sourceDocumentId: id2025_12345,
        targetDocumentId: null,
        referencedDocNumber: 'E-123456',
        normalizedRefDocNumber: 'E-123456',
        referencedDate: '15.03.2023',
        originalIlgiText: '15.03.2023 tarihli ve E-123456 sayılı yazımız.',
        pageOrSection: 'Sayfa 1 · İLGİ (a)',
        relationType: 'DOGRUDAN_ILGI',
        matchStatus: 'ARSIVDE_BULUNAMADI',
        verificationStatus: 'OTOMATIK',
        similarityScore: 100,
      },
      // Doc 2025/12345 -> resolved doc 2024/8420 (demonstrates Section 6.4: Bidirectional official İLGİ!)
      {
        sourceDocumentId: id2025_12345,
        targetDocumentId: id2024_8420,
        referencedDocNumber: '2024/8420',
        normalizedRefDocNumber: '2024/8420',
        referencedDate: '24.08.2024',
        originalIlgiText: '24.08.2024 tarihli ve 2024/8420 sayılı DHMİ Hava Seyrüsefer Dairesi Başkanlığı yazısı.',
        pageOrSection: 'Sayfa 1 · İLGİ (b)',
        relationType: 'DOGRUDAN_ILGI',
        matchStatus: 'ESLESTI',
        verificationStatus: 'OTOMATIK',
        similarityScore: 100,
      },
      // Doc 2024/8420 -> missing doc E-123456
      {
        sourceDocumentId: id2024_8420,
        targetDocumentId: null,
        referencedDocNumber: 'E-123456',
        normalizedRefDocNumber: 'E-123456',
        referencedDate: '15.03.2023',
        originalIlgiText: '15.03.2023 tarihli ve E-123456 sayılı İnşaat ve Emlak Dairesi yazısı.',
        pageOrSection: 'Sayfa 1 · İLGİ (a)',
        relationType: 'DOGRUDAN_ILGI',
        matchStatus: 'ARSIVDE_BULUNAMADI',
        verificationStatus: 'OTOMATIK',
        similarityScore: 100,
      },
      // Doc 2025/14890 -> resolved doc 2024/8420
      {
        sourceDocumentId: id2025_14890,
        targetDocumentId: id2024_8420,
        referencedDocNumber: '2024/8420',
        normalizedRefDocNumber: '2024/8420',
        referencedDate: '24.08.2024',
        originalIlgiText: '24.08.2024 tarihli ve 2024/8420 sayılı Havacılık Analizi yazımız.',
        pageOrSection: 'Sayfa 1 · İLGİ (a)',
        relationType: 'DOGRUDAN_ILGI',
        matchStatus: 'ESLESTI',
        verificationStatus: 'OTOMATIK',
        similarityScore: 100,
      },
      // Doc 2025/14890 -> resolved doc 2025/12345
      {
        sourceDocumentId: id2025_14890,
        targetDocumentId: id2025_12345,
        referencedDocNumber: '2025/12345',
        normalizedRefDocNumber: '2025/12345',
        referencedDate: '12.03.2025',
        originalIlgiText: '12.03.2025 tarihli ve 2025/12345 sayılı Teknik Değerlendirme yazımız.',
        pageOrSection: 'Sayfa 1 · İLGİ (b)',
        relationType: 'DOGRUDAN_ILGI',
        matchStatus: 'ESLESTI',
        verificationStatus: 'MANUEL_ONAYLI',
        similarityScore: 100,
      },
      // Doc 2025/10452 -> resolved doc 2023/6190 (Antalya Apron chain)
      {
        sourceDocumentId: id2025_10452,
        targetDocumentId: id2023_6190,
        referencedDocNumber: '2023/6190',
        normalizedRefDocNumber: '2023/6190',
        referencedDate: '09.11.2023',
        originalIlgiText: '09.11.2023 tarihli ve 2023/6190 sayılı PAT Sahaları Ön İnceleme Raporu yazımız.',
        pageOrSection: 'Sayfa 1 · İLGİ (a)',
        relationType: 'DOGRUDAN_ILGI',
        matchStatus: 'ESLESTI',
        verificationStatus: 'OTOMATIK',
        similarityScore: 100,
      },
      // Distinct SEMANTIK_BENZERLIK relationship (never mixed with DOGRUDAN_ILGI!)
      {
        sourceDocumentId: id2025_12345,
        targetDocumentId: id2024_7310,
        referencedDocNumber: '2024/7310',
        normalizedRefDocNumber: '2024/7310',
        referencedDate: '14.06.2024',
        originalIlgiText: 'Semantik İçerik Benzerliği: Mania kriterleri ve engel sınırlama yüzeyleri (OLS) kot analizi',
        pageOrSection: 'Vektör Benzerliği (%86)',
        relationType: 'SEMANTIK_BENZERLIK',
        matchStatus: 'ESLESTI',
        verificationStatus: 'OTOMATIK',
        similarityScore: 86,
      },
    ]);

    // 3. Seed AI Usage & Cost Logs (Section 14.3)
    await db.insert(aiLogs).values([
      {
        taskType: 'METADATA_CIKARIMI',
        modelName: 'gpt-4o-mini (RouteLLM)',
        provider: 'Abacus.AI RouteLLM',
        inputTokens: 1420,
        outputTokens: 310,
        totalTokens: 1730,
        estimatedCostUsd: '0.00040',
        isEstimatedCost: true,
        durationMs: 640,
        status: 'BASARILI',
        documentId: id2025_12345,
      },
      {
        taskType: 'BASLIK_ACIKLAMA',
        modelName: 'route-llm (Auto Router)',
        provider: 'Abacus.AI RouteLLM',
        inputTokens: 1850,
        outputTokens: 280,
        totalTokens: 2130,
        estimatedCostUsd: '0.00108',
        isEstimatedCost: true,
        durationMs: 790,
        status: 'BASARILI',
        documentId: id2024_8420,
      },
      {
        taskType: 'ILGI_AYRISTIRMA',
        modelName: 'route-llm (Auto Router)',
        provider: 'Abacus.AI RouteLLM',
        inputTokens: 920,
        outputTokens: 195,
        totalTokens: 1115,
        estimatedCostUsd: '0.00060',
        isEstimatedCost: true,
        durationMs: 510,
        status: 'BASARILI',
        documentId: id2025_14890,
      },
      {
        taskType: 'COK_BELGELI_ARASTIRMA',
        modelName: 'claude-3-5-sonnet (RouteLLM)',
        provider: 'Abacus.AI RouteLLM',
        inputTokens: 3840,
        outputTokens: 890,
        totalTokens: 4730,
        estimatedCostUsd: '0.02487',
        isEstimatedCost: true,
        durationMs: 2140,
        status: 'BASARILI',
        documentId: null,
      },
    ]);

    // 4. Seed System Settings & Audit Logs
    await db.insert(systemSettings).values([
      {
        settingKey: 'monthly_ai_budget_usd',
        settingValue: '25.00',
        updatedByUsername: 'semih',
      },
      {
        settingKey: 'resend_inbound_address',
        settingValue: 'arsiv@dhmi-dokuman.resend.app',
        updatedByUsername: 'semih',
      },
      {
        settingKey: 'initial_setup_completed',
        settingValue: 'true',
        updatedByUsername: 'semih',
      },
      {
        settingKey: 'last_verified_backup_at',
        settingValue: '13.11.2026 09:30',
        updatedByUsername: 'semih',
      },
    ]);

    await db.insert(auditLogs).values([
      {
        userId: adminUserId,
        username: 'semih',
        actionType: 'ILK_YONETICI_KURULUMU',
        targetEntity: 'User',
        targetId: 'semih',
        details: 'İlk yönetici hesabı (Semih Vatansever) ve TOTP Authenticator eşleştirmesi tamamlandı; başlangıç kurulumu kalıcı olarak kapatıldı.',
        isSecurityEvent: true,
        ipAddress: '10.24.0.12',
      },
      {
        userId: adminUserId,
        username: 'semih',
        actionType: 'IKINCI_YONETICI_ATAMA',
        targetEntity: 'User',
        targetId: 'burak',
        details: 'Burak Özdemir (burak) ikinci yönetici (ADMIN) olarak yetkilendirildi.',
        isSecurityEvent: true,
        ipAddress: '10.24.0.12',
      },
      {
        userId: adminUserId,
        username: 'semih',
        actionType: 'EPOS_WEBHOOK_ALIMI',
        targetEntity: 'Email',
        targetId: 'resend_msg_20250312_esb_mania_01',
        details: 'Resend Inbound kriptografik imza doğrulandı; 2025/12345 sayılı Esenboğa Mania Planı belgesi kalıcı depolamaya kaydedildi.',
        isSecurityEvent: false,
        ipAddress: '10.24.0.1',
      },
    ]);
  } catch (error) {
    console.error('Error seeding initial archive:', error);
  }
}
