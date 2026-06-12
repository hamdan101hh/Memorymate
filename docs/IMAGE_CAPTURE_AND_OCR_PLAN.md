# Image capture and OCR plan

## Current implementation (MVP)

- Users attach photos during Record Memory and Meeting Capture review.
- Images are stored on the backend filesystem under `backend/uploads/patient_images/` (local dev).
- Metadata lives in MongoDB collection `memory_image_attachments`.
- Draft images expire after 24 hours if the memory/meeting note is not saved.
- Images are served only via authenticated `GET /api/images/{id}` — no public URLs.
- Manual image descriptions are included in AI memory enhancement and meeting summaries.
- No paid OCR or image understanding APIs are enabled by default.

## Limits

- Max 3 images per note/meeting.
- Max 5MB per image.
- Allowed types: JPG, JPEG, PNG, WebP.

## Production storage TODO

- Move file storage to a private object bucket with signed, short-lived URLs.
- Add background job to delete expired draft files and orphaned blobs.
- Document backup/retention policy for patient media.

## Future: OCR and image understanding

- Optional “Analyze image” after explicit user confirmation per photo.
- Only when an image AI provider is explicitly enabled via env flags and cost caps.
- Never auto-upload or auto-analyze images without confirmation.

## Cost controls

- No default paid Vision/OCR providers.
- Image AI must respect the same daily usage caps as text AI.
- Log image AI usage separately for monitoring.

## Privacy risks

- Photos may contain faces, documents, medical info, or financial data.
- Permission checkbox required before upload and before permanent save.
- Caregivers only see images for their linked patient (same scoping as memories).

## Explicitly not planned without approval

- Google Photos API
- Google Cloud Vision API
- Paid third-party OCR unless product-approved and env-gated

## User consent

- Upload requires “I have permission to save this photo.”
- Permanent save requires confirmation on the review step.
- Drafts are temporary (24h TTL) until the user saves the memory or meeting note.
