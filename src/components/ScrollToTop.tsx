import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Mobil ve masaüstü cihazlarda sayfalar arasında gezinirken
 * scroll pozisyonunun yeni sayfanın en tepesine pürüzsüz ve
 * stabil biçimde sıfırlanmasını sağlar.
 */
const ScrollToTop = () => {
  const { pathname, search } = useLocation();

  useEffect(() => {
    // Sayfa değiştiğinde anında en tepeye sar
    try {
      window.scrollTo({
        top: 0,
        left: 0,
        behavior: 'instant' as ScrollBehavior,
      });
    } catch {
      window.scrollTo(0, 0);
    }
  }, [pathname, search]);

  return null;
};

export default ScrollToTop;
