# 📱 BERBER DEFTERİ — YAYINLAMA REHBERİ
## Yazılım bilmeyenler için detaylı adım adım (Her tuş tarifi ile)

---

## ⏱️ Toplam Süre: ~15 dakika
## 📋 Gerekli hesaplar: Supabase (mevcut), GitHub (mevcut), Vercel (mevcut)

---

# 🟢 ADIM 1: SUPABASE VERİTABANINI GÜNCELLEME (3-4 dakika)

## Neden yapıyoruz?
Yeni özellikler için yeni sütunlar eklemek. Eski verileriniz saklanır, hiçbir şey silinmez.

---

## 1.1) Supabase'e gir
**Tarayıcıda (Chrome, Firefox vb.) şunu yaz:** `supabase.com`

Ne göreceksin:
- Beyaz/siyah sayfa → en üstte mavi "Sign In" butonu

**Tıkla:** "Sign In" (sağ üst köşede)

---

## 1.2) Giriş yap
Açılan sayfada:
- **Email kutusuna** sen kur olan email yazı (örn: `aliahmetemin@gmail.com`)
- **Şifre kutusuna** senin şifreni yazı

**Tıkla:** Sağ altta "Sign in" butonu (mavi)

Ne görmelisin: "Loading..." yazısı → 3-5 saniye bekle → sol menüde "Projects" yazısı görünmeli

---

## 1.3) Projeyi bul
Sol menüde "Projects" başlığının altında **"berber-defteri"** yazılı kare göreceksin.

**Tıkla:** "berber-defteri" projesine

Ne görmelisin: Mavi başlık "berber-defteri", altında yüzlerce ayar. Sol menü açılır.

---

## 1.4) SQL Editor'e git
Sol menüde aşağı kaydır (scroll):
- "SQL Editor" yazısı göreceksin (klavye simgesiyle)

**Tıkla:** "SQL Editor"

Ne görmelisin: Boş bir metin kutusu (beyaz, çok büyük) ortada. Üstünde mavi buton "New query".

---

## 1.5) Yeni sorgu oluştur
**Tıkla:** "New query" butonu (mavi, sağ üst)

Ne görmelisin: Boş beyaz metin kutusu, imlec yanıp sönsün (yazıya hazır)

---

## 1.6) Kodu yapıştır
Şu dosyada yazılı kodu kopyalayacaksın: **`schema.sql`**

📁 Paketinde bulabilirsin → kopyala (Ctrl+A tüm kodu seçer, Ctrl+C kopyalar)

**Yapıştır:** Beyaz kutuya (Ctrl+V)

Ne görmelisin: Çok satırlı SQL komutları. Korkmayın, görmek normal 😊

---

## 1.7) Çalıştır
Sağ üstte büyük **"Run"** butonu göreceksin (mavi arka, beyaz yazı).

**Tıkla:** "Run"

⏳ **15-30 saniye bekle**

Ne görmelisin: Sağda yeşil mesaj "Success!" veya altında tablo görmek normal. Hata varsa kırmızı çizgi görürsün.

---

## ✅ ADIM 1 BITTI!
Veri tabanı güncellendi. Hiçbir şey kaybedilmedi, yeni sütunlar eklendi.

---

---

# 🟢 ADIM 2: GITHUB'A DOSYALARI YÜKLEME (5-6 dakika)

## Neden yapıyoruz?
Yeni kodları (9 dosya) GitHub'a yüklüyoruz. Vercel otomatik olarak oradan çekerek yayınlayacak.

---

## 2.1) GitHub'a gir
**Tarayıcıda şunu yaz:** `github.com`

Ne göreceksin: Siyah sayfa, en üstte "Sign in" butonu (beyaz yazı)

**Tıkla:** "Sign in"

---

## 2.2) Giriş yap
- **Username veya email** kutusuna senin GitHub kullanıcı adını / emailini yazı
- **Password** kutusuna şifreni yazı

**Tıkla:** Sağda "Sign in" butonu (yeşil)

⏳ **3 saniye bekle**

Ne görmelisin: Yukarıda "github.com/ahmeteminkos37-del" yazılı link göreceksin (adı değişebilir)

---

## 2.3) Depoyu bul
**Tıkla:** "berber-defteri" deposu (veya "sira-sende" — adından ara)

Ne görmelisin: Açılan sayfa — yukarıda "berber-defteri" yazısı, altında dosya listesi (index.html, package.json vb.)

---

## 2.4) Dosyaları yükle — KOLAY YÖNTEM
En kolay yol: **sürükle-bırak**

Bilgisayarında dosyaları bulabilir misin?
- Paket indirilmişse bilgisayarının indirilenler klasöründe "sira-sende-vercel" klasörü var
- Klasörü aç → içinde gördüğün dosyaları göreceksin

GitHub sayfasında (deposu açık durumda):
- Sayfanın ortası çevresinde **"Add file"** yazılı buton göreceksin (yeşil) veya sürükle-bırak alanı

**Yöntem 1 (Önerilir): Sürükle-bırak**
- Bilgisayarındaki "sira-sende-vercel" klasörünü aç
- GitHub sayfasına sürükle tüm dosya + klasörleri (icons klasörü dahil)
- Bırak
- Commit mesajını yaz (örn: "Yeni özellikler: PWA, grafikler, 404 çözümü")
- **"Commit changes"** butonu (yeşil) tıkla

⏳ **10-20 saniye bekle**

Ne görmelisin: Sayfa yenilenir, yeni dosyalar listede görünür

---

## 2.5) Dosyaları birebir yüklemek (sürükle-bırak çalışmazsa)
**Tıkla:** "Add file" → "Upload files"

Açılan pencerede bilgisayarındaki dosyaları seç. Bir seferde maksimum 100 dosya. Bizim 9 dosya var, rahat gelir.

---

## ✅ ADIM 2 BITTI!
GitHub güncellendi, Vercel otu görmüştür bile.

---

---

# 🟢 ADIM 3: VERCEL'DE OTOMATIK YAYIN + KONTROL (3-4 dakika)

## Neden yapıyoruz?
GitHub'a yüklediğimiz dosyaları Vercel otomatik olarak bulmaz ve yayınlar — kontrol etmek için.

---

## 3.1) Vercel'e gir
**Tarayıcıda şunu yaz:** `vercel.com`

Ne göreceksin: Siyah/beyaz sayfa, "Sign in" butonu

**Tıkla:** "Sign in"

---

## 3.2) Giriş yap
- GitHub ile giriş yap (GitHub hesabını seçin)

⏳ **3-5 saniye bekle**

Ne görmelisin: "Dashboard" adlı sayfa, ortada "berber-defteri" projesi göreceksin

---

## 3.3) Projeyi aç
**Tıkla:** "berber-defteri" projesi

Ne görmelisin: Proje sayfası açılır. Üstte "Deployments" sekmesi var, aktif durumda.

---

## 3.4) Yayın takip et
"Deployments" bölümünde (en üstte) en son yayın görünür:
- **Siyah/gri simge + "Building"** → yapı devam ediyor (30 saniye–1 dakika)
- **Yeşil simge + "Ready"** → başarılı, canlıya geçti! ✅
- **Kırmızı simge + "Failed"** → hata olmuş 🔴

⏳ **1–2 dakika bekle**

Ne görmelisin: Yeşil "Ready" yazısı

---

## 3.5) URL'i kopyala
"Deployments" bölümünde yeşil "Ready" yazısının solunda link var.
Örn: `berber-defteri-rose.vercel.app`

**Tıkla:** Linke
veya

**Sağ tıkla → "Linki kopyala"**

---

## 3.6) Testi yap: API health kontrolü
Tarayıcı adres çubuğuna şunu yaz:
```
https://berber-defteri-rose.vercel.app/api/health
```

(Kendi linkin varsa onun sonuna `/api/health` ekle)

**Enter tuşuna bas**

⏳ **3 saniye bekle**

Ne görmelisin:
```json
{
  "ok": true,
  "service": "berber-defteri"
}
```

Bu yazı görürsen **404 ÇÖZÜLDÜ!** 🎉 Yayın başarılı!

---

## 3.7) Ana sayfayı aç
Tarayıcıya şunu yaz:
```
https://berber-defteri-rose.vercel.app
```

Ne görmelisin:
- Berber Defteri başlığı
- Yeni logo (defter + makas, lacivert-mavi)
- Dükkan aç / Giriş butonları

---

## 3.8) Admin şifresini değiştir (ÇOK ÖNEMLİ!)
Siteye gir → Sol menü (☰) → **"Yönetim"** tıkla

**Şifre sor açılır:** Varsayılan şifreyi yaz: `12345`

**Gir**

Ne görmelisin: Panelin üstünde **kırmızı uyarı kutusu:**
```
⚠️ Yönetici şifreni hâlâ varsayılan (12345). Aşağıdaki şifre alanından hemen değiştir!
```

Uyarının altında:
- **"Şifre Değiştir"** kutusuna **yeni güçlü şifre yaz** (örn: `Berberin2024!Güvenli`)
- Altında **"Şifreyi Kaydet"** butonu (mavi)

**Tıkla:** "Şifreyi Kaydet"

⏳ **3 saniye bekle**

Ne görmelisin: Yeşil mesaj "Şifre değiştirildi" + kırmızı uyarı kayboldu ✅

---

## ✅ ADIM 3 BITTI!
Vercel'de canlı, API çalışıyor, admin şifresi güvenli!

---

---

# 🟢 BONUS: SİTENİ TEST ET

Canlı sitede şunları dene (5 dakika):

### Test 1: Dükkan Aç
1. "Dükkânını Aç" butonu
2. Form — sadece 6 alan olmalı (eski 15 değil)
3. Güvenlik sorusu var mı?
4. Açılış başarılı mı?

### Test 2: Ayarlar
1. Panelde "Ayarlar"
2. Saat, fiyat, çalışan, Google linki burada mı?
3. Çalışan eklerken telefon zorunlu mu?

### Test 3: Grafik
1. Panelde "📊 istatistik"
2. "Kazanç Grafiği" kutusu var mı?
3. Günlük/Haftalık/Aylık sekmesi var mı?

### Test 4: Admin Videosu
1. Yönetim panelinde "📹 Tanıtım Videosu" kutusu var mı?
2. YouTube linki yazı, kaydet

### Test 5: Yedek Al
1. Yönetim panelinde "💾 Yedeği İndir" butonu var mı?
2. Basınca dosya mı inip iniyor?

---

# 🔴 HATA OLURSA

## Durum A: Vercel'de "Failed" (Kırmızı)
**Ekran görüntüsü al** (Shift+PrtScn), bana gönder. 99% bir dosya eksiktir.

## Durum B: `/api/health` → 404
**Ekran görüntüsü al**, bana gönder. vercel.json kontrol edeceğim.

## Durum C: Dükkan açarken hata
Mesaj tam ne yazıyor? Bana yaz, çözüm bulacağız.

---

# ✅ YAPILDI!

Başarıyla yayınladın! 🎉

**Sıradaki:** Gerçek berberleri davet etmeye başla.
- Linki / QR'ı WhatsApp'ta gönder
- Tanıtım sayfasını (PDF) yazdır
- Dükkan afişini yazdırıp camına as

Sorun olursa veya sorular varsa yazarsın, here buradayım! 💪
