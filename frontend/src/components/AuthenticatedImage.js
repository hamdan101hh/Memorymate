import { useEffect, useState } from "react";
import { fetchAuthenticatedImageUrl } from "../lib/authenticatedImage";

export default function AuthenticatedImage({ path, alt = "", className }) {
  const [src, setSrc] = useState(null);

  useEffect(() => {
    let blobUrl = null;
    let cancelled = false;
    if (!path) {
      setSrc(null);
      return undefined;
    }
    fetchAuthenticatedImageUrl(path)
      .then((url) => {
        if (cancelled) {
          if (url) URL.revokeObjectURL(url);
          return;
        }
        blobUrl = url;
        setSrc(url);
      })
      .catch(() => setSrc(null));
    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [path]);

  if (!src) return null;
  return <img src={src} alt={alt} className={className} />;
}
