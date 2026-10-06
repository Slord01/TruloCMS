# Trulo CMS

Trulo GmbH'nin websitelerini tek superuser rolüyle yöneten CMS çalışma alanı.

## Yerel çalıştırma

Node.js 22.13 veya üzeri gerekir.

```sh
npm install
npm run admin:create
npm run dev
```

CMS: http://localhost:3002 · Backend: http://localhost:9000

`admin:create` kendi e-posta ve şifrenizi sorar. Hazır hesap veya varsayılan şifre bulunmaz. Şifre en az 12 karakter olmalıdır. Yerel CLI şifre girişini görünür olarak alır.

Yeni SQLite veritabanı `apps/cms-backend/data/trulo.sqlite` içinde oluşur. Eski veritabanına bağlanılmaz, örnek ürün/kategori/website oluşturulmaz. Veri ve oturum imzalama anahtarı git dışında tutulur. Bu dosya için yedekleme gerekir.

## Websiteler

Profil menüsü → **Add website** → **Sales Channels**. Website adı, domain, hosting sağlayıcısı, IP/CNAME hedefi ve template kimliği kaydedilir. Template kimliği şu aşamada bir kayıt alanıdır; otomatik template dağıtımı yapmaz.

Profil menüsünden website seçmek ayar ve içerik kapsamını değiştirir. Seçim tarayıcı sekmesine özeldir. **All**, websitelerin verilerini toplu ve salt okunur gösterir; düzenleme için bir website seçilir.

Website ayarları, ürünler, kategoriler, koleksiyonlar ve temel CMS içerikleri yeni backend'de website kimliğiyle saklanır. Marketplace satıcıları, impersonation ve seller hesabı oluşturma kaldırılmıştır. Kullanıcı yönetiminde yalnızca superuser oluşturulur.

## Hosting ve DNS

Sales Channels, hosting sağlayıcısının verdiği A/AAAA/CNAME hedefini ve domain sahipliği için TXT kaydını gösterir. Domaini hosting projesine bağlayıp HTTPS açmanız ve sayfada verilen doğrulama dosyasını hosting üzerinde yayınlamanız gerekir. **Verify DNS and HTTPS**; TXT sahipliğini, DNS hedefini, geçerli HTTPS bağlantısını ve bu dosyayı kontrol eder. Kaydetmek siteyi otomatik yayına almaz.

Mevcut beş domain ve hosting hesabı projeye verilmediğinden gerçek siteler kayıtlı veya yayınlanmış değildir. Hosting/DNS API bağlantısı, sertifika tedariki ve template deployment otomasyonu henüz eklenmemiştir. Proxied/flattened CNAME kayıtları sağlayıcıya özel entegrasyon gerektirir.

## Doğrulama ve sonraki geçiş

```sh
npm run test:cms
npm run build --workspace=@trulo/sellercentral
```

Eski ödeme, mail, marketplace ve diğer gelişmiş entegrasyon ekranlarının backend geçişi tamamlanmış değildir. Yeni backend desteklemediği eski işlemlerde açıkça `501` döner. Shopware senkronizasyonu, tüm eski ekranların veri sözleşmeleri ve üretim deployment'i sonraki işlerdir. `apps/shop` mevcut template çalışma alanıdır; yeni backend ile tam storefront/checkout entegrasyonu henüz yapılmamıştır.

Üretim mimarisi: uygulamalar Vercel'de, veritabanı Render PostgreSQL'de, public görseller Cloudflare R2'de çalışır. Mevcut Shopware siteleri Profihost'ta kalır. Backend `DATABASE_URL` ile PostgreSQL'e bağlanır; Vercel servis binding'lerinin `CMS_BACKEND_URL` değerini kendiniz ayarlamayın. Tarayıcılar aynı domain üzerindeki API proxy'sini kullanır. Yerel geliştirmede PostgreSQL bağlantısı verilmezse SQLite kullanılır; üretimde SQLite'a otomatik dönüş yapılmaz.

Görseller seçili website kapsamında imzalı bağlantıyla R2'ye yüklenir, backend'de doğrulanıp WebP olarak yayınlanır. Render/R2 hesap bağlantıları, domain ve ortam değişkenleri henüz canlıda kurulmadı. Ayrıntılı adımlar: [cloud deployment](docs/cloud-deployment.md); servis adresleri: [Vercel services](docs/vercel-services.md).

DNS kayıtları: [Cloudflare resmi dokümantasyonu](https://developers.cloudflare.com/dns/manage-dns-records/reference/dns-record-types/). SQLite çalışma zamanı: [Node.js dokümantasyonu](https://nodejs.org/download/release/v22.13.0/docs/api/sqlite.html).
