# Trulo CMS görevleri

İşaretli maddeler kodda tamamlandı. Bulut kaynaklarının oluşturulması, gerçek
hesaplarla bağlantı testi ve production deployment henüz tamamlanmadı.

## Tamamlanan geliştirmeler

- [x] Eski proje markalarını, örnek içerikleri ve eski API/ortam bağlantılarını temizle; yeni kurulumu boş veritabanıyla başlat.
- [x] Seller/superuser ayrımını kaldır; yalnızca superuser ile oturum ve yönetim sağla, menü renklerini eşitle.
- [x] Profil menüsüne website seçimi, All ve Add website seçeneklerini ekle.
- [x] Sales Channels ekranında website adı, domain, hosting, IP/CNAME ve template kimliğini kaydet.
- [x] Domain sahipliği, DNS hedefi ve HTTPS doğrulamasını ekle; doğrulama olmadan siteyi aktif sayma.
- [x] Ayarları ve temel CMS kayıtlarını website kapsamında sakla; All görünümünü salt okunur tut.
- [x] PostgreSQL adaptörü, versiyonlu migration, kalıcı oturum imzalama anahtarı ve TLS bağlantısını ekle.
- [x] Cloudflare R2 için imzalı görsel yükleme, gerçek dosya doğrulama, WebP dönüştürme ve website bazlı medya/klasör yönetimini ekle.
- [x] Beş Vercel servisini, public route prefix'lerini ve frontend → cms-backend binding'lerini yapılandır.
- [x] Dört uygulamanın production build'ini, backend testlerini, servis proxy testlerini ve CMS tarayıcı akışını doğrula.

## Render PostgreSQL kurulumu

- [ ] Render hesabında `trulo-cms-postgres` veritabanını oluştur; Frankfurt, PostgreSQL 17 ve başlangıç kapasitesini seç. Kök `render.yaml` dosyası başlangıç Blueprint'idir; ücretli kaynak oluşturur.
- [ ] External Database URL'yi Vercel'de server-only `DATABASE_URL` olarak kaydet; bağlantı şifresini sohbet veya Git içine koyma.
- [ ] Preview ve production için ayrı veritabanları oluştur ve ortam değişkenlerini doğru ortamlara ata.
- [ ] Bağlantı limiti, yedekleme, geri yükleme ve kapasite gereksinimlerini production öncesinde doğrula.

## Cloudflare R2 kurulumu

- [ ] Public CMS/ürün görselleri için `trulo-cms-media` bucket'ını oluştur; mevcut kodun desteklediği standart endpoint'i kullan.
- [ ] Bucket için yalnızca object read/write yetkili, bu bucket ile sınırlandırılmış API anahtarı oluştur.
- [ ] Sahip olunan bir medya alt alan adını bucket'a bağla ve HTTPS public adresini belirle.
- [ ] Vercel'e server-only `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` ve `R2_PUBLIC_BASE_URL` değerlerini ekle.
- [ ] `infrastructure/r2-cors.example.json` içindeki origin'i gerçek CMS adresiyle değiştir; gerekli preview origin'lerini açıkça ekle ve production'da localhost iznini kaldır.
- [ ] `staging/` prefix'i için bir günlük silme kuralı ekle; başlangıç dosyası `infrastructure/r2-lifecycle.example.json`.
- [ ] Tamamlanmadan kesilen yüklemelerin ve olası sahipsiz nesnelerin izlenmesi/temizlenmesi için operasyon sürecini belirle.
- [ ] Özel belgeler için ayrı private storage tasarla; public görsel bucket'ına fatura veya müşteri belgesi yükleme.

## Vercel deployment ve ilk yönetici

- [ ] Git'e girecek değişiklikleri gözden geçir, commit/push yap; Vercel'in kullanacağı branch'i belirle.
- [ ] Repository'yi kök dizinden Vercel'e import et; kök `vercel.json` ile multi-service kurulumu kullan.
- [ ] Servisleri ve public yolları kontrol et: `sellercentral` → `/`, `shop` → `/shop`, `affiliate` → `/affiliate`, `developer` → `/developer`; `cms-backend` internal kalır.
- [ ] Dört frontend'in `cms-backend` binding'ini doğrula; `CMS_BACKEND_URL` değerini elle tanımlama ve secret'lara `NEXT_PUBLIC_` prefix'i verme.
- [ ] Frankfurt function bölgesini ve shop için `/shop` dahil tam `NEXT_PUBLIC_SITE_URL` değerini yapılandır.
- [ ] Güvenilir yerel ortamda, Git'in takip etmediği `apps/cms-backend/.env` dosyasına aynı veritabanı bağlantısını ekleyip `npm run admin:create` ile ilk superuser'ı oluştur.
- [ ] Vercel hesabına giriş yaptıktan sonra Services destekleyen güncel CLI ile `vercel dev -L` entegrasyon kontrolünü tamamla.
- [ ] İlk preview deployment'ını gerçek Render ve R2 kaynaklarıyla çalıştır; migration ve backend bağlantısını doğrula.
- [ ] Giriş, iki website arasında veri ayrımı, All salt okunur görünümü, görsel yükleme/listeleme/silme ve yeniden deployment sonrası kalıcılığı canlı kaynaklarda test et.
- [ ] Testler geçince production deployment'ını al ve CMS domainini bağla.

## Beş website ve sonraki geliştirmeler

- [ ] Gerçek beş website'nin domain, hosting ve template bilgilerini Sales Channels'a kaydet.
- [ ] Website başına domain doğrulamasını tamamla; mevcut canlı Shopware domainlerini geçiş hazır olmadan yönlendirme.
- [ ] Shopware ürün/kategori/stok/sipariş senkronizasyonunun kapsamını belirle ve entegrasyonu geliştir.
- [ ] Yeni backend ile storefront, sepet, checkout ve ödeme akışlarını tamamla; mevcut shop template'i henüz tam çalışan satış sistemi değildir.
- [ ] Eski projeden kalan gelişmiş ekranların API sözleşmelerini yeni backend'e taşı veya kullanılmayacak ekranları kaldır; affiliate/developer entegrasyonları henüz bağlı değildir.
- [ ] Template kimliğini gerçek template seçimi ve website deployment akışına bağla; şu anda yalnızca kayıt alanıdır.
- [ ] Hosting/DNS sağlayıcı API'leri, sertifika ve template deployment otomasyonunu geliştir; website eklemek tek başına hosting oluşturmaz.
- [ ] Cloudflare proxied/flattened DNS kayıtları için sağlayıcıya uygun doğrulama desteğini değerlendir.
- [ ] Video, animasyonun korunması ve görsel dışı dosya yükleme ihtiyaçlarını ayrıca geliştir; mevcut yayınlama akışı statik WebP görseller içindir.

Kurulum ayrıntıları: [Cloud deployment](cloud-deployment.md).
Servisler ve routing: [Vercel services](vercel-services.md).
