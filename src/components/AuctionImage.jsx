import { useState } from 'react';
import { FiImage } from 'react-icons/fi';
export default function AuctionImage({
  src,
  alt
}) {
  const [failedSrc, setFailedSrc] = useState(null);
  return failedSrc === src ? <div className="image-fallback" role="img" aria-label={`${alt}: image unavailable`}><FiImage aria-hidden="true" /><span>Image unavailable</span></div> : <img src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedSrc(src)} />;
}
