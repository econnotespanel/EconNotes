# EconNotes mobil uyum ve yenilik akışı

## Yapılacaklar

- Mobil üst menüyü yeniden düzenle: logo, menü düğmesi ve işlemler çakışmadan sığacak; açılır menü tam genişlikte ve okunaklı olacak.
- Mobil ana sayfa, çalışma ekranı ve giriş/kayıt formlarındaki yatay taşmaları; sıkışan kartları, butonları ve metinleri düzelt.
- Sürümü tek kaynaktan güncelle ve görünen tüm alanlarda `Versiyon v…` biçiminde göster.
- Giriş, kayıt ve şifre yenileme ekranlarının mavi bölümünde yalnızca tamamen beyaz logo kullan.
- Çalışma Stüdyosu’nu daha güçlü bir çalışma merkezi görünümüne taşı: öne çıkan üretim alanı, net ilerleme/istatistikler, mobil uyumlu filtreler ve daha nitelikli materyal kartları.
- Son girişinden en az 90 gün geçmiş kullanıcıyı girişte yenilikler turuna yönlendir; yeni kullanıcı turundan ayrı, güncel özellikleri tanıtan dönüş ekranı göster.
- Tur tamamlandığında aynı sürüm için yeniden açılmamasını sağla; son giriş zamanı güncellenmeden önce önceki tarihi güvenli biçimde değerlendir.

## Teknik ayrıntılar

- Mevcut `profiles.last_login` değeri oturum açılışında güncellenmeden önce saklanacak ve 90 günlük eşik için kullanılacak.
- Yenilik turu sürüm anahtarıyla tarayıcıda işaretlenecek; yönlendirme döngüsü oluşturmayacak.
- Mevcut tasarım tokenları, logo bileşeni ve uygulama bileşenleri korunacak; yeni bir arka uç tablosu gerekmeyecek.
- Değişiklikler telefon genişliklerinde ve masaüstünde canlı önizleme ile doğrulanacak.
