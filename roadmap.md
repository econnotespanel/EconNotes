# Roadmap

## Yönetici özel mesajları

- [x] Girişte okunmamış yönetici mesajını göster ve Destek Merkezi konuşmasına yönlendir
- [x] Yönetici özel mesajlarını Destek Merkezi’ne otomatik dahil et; 15 kural testi geçti
- [ ] Gerçek hesapla giriş → yönetici mesajı → Destek Merkezi akışını doğrula — önizlemede kullanıcı oturumu yok, oturum oluşturma isteği eşleşen hesap bulamadı

- [x] Referans logoyu tüm uygulama yüzeylerinde tutarlı hale getir
- [ ] Yönetici kontrollü şifre aktivasyon akışını güvenli biçimde ekle
- [ ] Günlük seri hatırlatma ve bildirim akışını ekle
- [ ] Notları geçici/kalıcı gizleme ve yeniden açma yönetimini ekle
- [ ] Kalıcı uzaklaştırmalarda IP tabanlı yeniden kayıt engelini ekle
- [ ] Puan/seri verisi görünürlüğünü güvenli liderlik RPC akışına taşı
- [ ] Güvenlik bulgularını kapat ve canlı önizlemeyi doğrula

## Mobil deneyim ve geri dönüş turu

- [ ] Mobil üst menü, sayfalar ve pencerelerdeki taşmaları düzelt
- [ ] Sürümü güncelle ve tüm alanlarda Versiyon etiketiyle göster
- [ ] Giriş ve kayıt ekranlarının mavi alanında tamamen beyaz logo göster
- [ ] Çalışma Stüdyosu görünümünü ve mobil kullanımını geliştir
- [ ] 90 gün sonra dönen kullanıcılar için yenilikler turu ekle
- [ ] Telefon ve masaüstü görünümlerini doğrula

## Veritabanı dayanıklılığı ve maliyet

- [x] Sunucu kurtarma talebini Lovable ekibine ilet — talep iletildi; kurtarma tamamlandığı doğrulanmadı
- [ ] Yedek geri yüklemesi sonrası pahalı sorguları ve disk kullanımını ölç — Lovable Cloud erişilemez olduğu için engelli
- [ ] Mini geçişini maliyet onayıyla tamamla — sohbet içi geçiş aracı mevcut; önce Cloud kurtarma, ardından maliyet onayı gerekiyor
- [ ] Ölçülen darboğazları optimize et ve geçiş sonrası ölçümleri karşılaştır — veritabanı erişimi ve başlangıç ölçümü gerekiyor
