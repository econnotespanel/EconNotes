import { useEffect, useState } from 'react';
import { signedNoteUrl } from '@/lib/storageUrl';

interface Props extends React.ImgHTMLAttributes<HTMLImageElement> {
  /** Veritabanında saklanan depo bağlantısı veya dosya yolu. */
  source?: string | null;
}

/** `notes` deposundaki özel dosyaları imzalı bağlantı ile gösteren görsel bileşeni. */
const SignedImage = ({ source, ...rest }: Props) => {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void signedNoteUrl(source).then((signed) => {
      if (active) setUrl(signed);
    });
    return () => { active = false; };
  }, [source]);

  if (!url) return <div className={rest.className} aria-hidden />;
  return <img {...rest} src={url} />;
};

export default SignedImage;
