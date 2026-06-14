import { useEffect, useState } from "react";
import { ImageOff } from "lucide-react";
import { cn } from "../lib/utils";
import { fetchAuthenticatedImageUrl } from "../lib/authenticatedImage";

export default function AuthenticatedImage({ path, alt = "", className, fallbackClassName }) {
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let blobUrl = null;
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    setSrc(null);

    if (!path) {
      setLoading(false);
      return undefined;
    }

    fetchAuthenticatedImageUrl(path)
      .then((url) => {
        if (cancelled) {
          if (url) URL.revokeObjectURL(url);
          return;
        }
        if (!url) {
          setFailed(true);
          return;
        }
        blobUrl = url;
        setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [path]);

  if (failed) {
    return (
      <div
        className={cn("grid place-items-center bg-stone-100 text-stone-400", className, fallbackClassName)}
        data-testid="image-load-failed"
        role="img"
        aria-label={alt || "Image unavailable"}
      >
        <ImageOff className="w-5 h-5" aria-hidden="true" />
      </div>
    );
  }

  if (loading || !src) {
    return (
      <div
        className={cn("bg-stone-100 animate-pulse", className)}
        data-testid="image-loading"
        aria-hidden="true"
      />
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
