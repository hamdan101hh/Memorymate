import { isProtectedImagePath } from "../lib/authenticatedImage";
import AuthenticatedImage from "./AuthenticatedImage";

export default function AttachmentThumb({ item, compact = true }) {
  const path = item?.image_url;
  if (!isProtectedImagePath(path)) return null;
  return (
    <AuthenticatedImage
      path={path}
      alt=""
      className={compact ? "w-10 h-10 rounded-lg object-cover shrink-0" : "w-16 h-16 rounded-lg object-cover"}
    />
  );
}
