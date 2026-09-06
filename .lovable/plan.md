# EconNotes logo, üyelik onayı ve not görünürlüğü

## Yapılacaklar
- Gönderilen EconNotes görselini CDN varlığına dönüştürüp uygulamadaki eski ikon + yazı birleşimlerini kaldırmak; başlık, giriş, kayıt, ana sayfa, yan menü, karşılama ve diğer marka alanlarında görseli tek logo olarak kullanmak.
- Yeni profilleri varsayılan olarak “onay bekliyor” durumunda oluşturmak. Bekleyen veya reddedilen hesap giriş yaptığında oturumu hemen kapatıp anlaşılır durum mesajı göstermek.
- Yönetici paneline bekleyen üyelikleri onaylama/reddetme kontrolleri ve durum göstergeleri eklemek.
- Ders notlarına açık, geçici gizli ve kalıcı gizli durumlarını eklemek. Geçici gizlemede bitiş zamanı seçilebilecek; süre dolunca not kendiliğinden yeniden görünür olacak.
- Yönetici panelindeki not kartlarına gizle/aç kontrolleri ve görünürlük durumu eklemek.

## Güvenlik
- Gizli notları yalnızca ekrandan değil, veri erişim kurallarıyla da normal kullanıcılardan tamamen saklamak.
- Not parolası alanının genel veri sorgularından okunmasını engellemek; doğrulama yalnızca güvenli kontrol işlevi üzerinden devam edecek.
- Dosya yazma/silme izinlerini not sahibine bağlamak ve kullanıcıların kendilerine yönetici rolü verememesini kesin kuralla engellemek.

## Teknik ayrıntılar
- `profiles` kaydına üyelik durumu ve onay bilgileri eklenecek; mevcut kullanıcılar hizmet kesintisi yaşamaması için onaylı kabul edilecek.
- `notes` kaydına gizleme türü ve bitiş zamanı eklenecek; görünürlük süresi veritabanında uygulanacak.
- Logo görseli yeniden çizilmeyecek; yüklediğiniz dosyanın kendisi kullanılacak ve ayrı “EconNotes” metni gösterilmeyecek.
- Masaüstü ve mobil görünüm ile giriş/onay/not gizleme akışları doğrulanacak.
