# Photo Memory Attachments plan

## Current version (MVP)

Photo Memory Attachments work across Record Memory, Smart Day drafts, Meeting/Conversation Capture, reminders, and appointments.

- **Manual photo descriptions** — users describe what the photo shows; AI uses text + note/transcript.
- **No paid OCR or image understanding APIs** by default.
- **No Google Vision API, Google Photos API, or Google Images.**
- Draft attachments expire after **24 hours** if not saved with a memory, reminder, or appointment.
- Images served only via authenticated `GET /api/attachments/{id}` (legacy `/api/images/{id}` alias).

## Supported flows

| Flow | Attach before save | Thumbnail after save |
|------|-------------------|----------------------|
| Record Memory | Yes | Memory Book / Recent |
| Smart Day draft | Yes | Per save target |
| Meeting / Conversation Capture | Yes | Meeting note memory |
| Reminders | Yes | Reminder list |
| Appointments | Yes | Appointment card |

## Limits

- Max 3 images per item
- Max 5MB per image
- JPG, JPEG, PNG, WebP

## Safety wording

- **Medical/clinic:** “MemoryMate organizes your note. It does not provide medical advice.”
- **Crypto/business:** “This is a summary of your notes, not financial advice.”
- No diagnosis, treatment recommendations, or buy/sell suggestions.

## Storage (dev)

- Files: `backend/uploads/patient_images/{patient_id}/`
- Metadata: MongoDB `memory_image_attachments`
- Production: private object storage with signed URLs (TODO)

## Future optional image AI

- OCR / image understanding only after per-photo user confirmation
- Env-gated provider + usage caps
- Cost controls and separate usage logging
- Never auto-analyze uploads

## Privacy

- Permission checkbox before upload and before permanent save
- Role/patient scoping on all attachment endpoints
- No public image URLs
- User can remove draft images before save

## Deletion and export

- Draft delete: `DELETE /api/attachments/draft/{id}`
- Saved attachment export/deletion policy: TODO for production retention docs

## Explicitly not planned without approval

- Google Cloud Vision API
- Google Photos API
- Paid third-party OCR unless product-approved
