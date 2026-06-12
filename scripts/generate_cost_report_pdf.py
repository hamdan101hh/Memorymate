#!/usr/bin/env python3
"""Generate MemoryMate_Costs_And_Paid_Services_Report.pdf — no secrets."""
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak,
)

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "MemoryMate_Costs_And_Paid_Services_Report.pdf"

GREEN = colors.HexColor("#16a34a")
YELLOW = colors.HexColor("#ca8a04")
RED = colors.HexColor("#dc2626")
SKY = colors.HexColor("#0284c7")
LIGHT_BG = colors.HexColor("#f8fafc")
WARN_BG = colors.HexColor("#fef3c7")
DANGER_BG = colors.HexColor("#fee2e2")


def badge(text, color):
    return Paragraph(
        f'<font color="{color.hexval()}"><b>{text}</b></font>',
        ParagraphStyle("badge", fontSize=9, leading=11),
    )


def build_pdf():
    doc = SimpleDocTemplate(
        str(OUT), pagesize=letter,
        rightMargin=0.6 * inch, leftMargin=0.6 * inch,
        topMargin=0.55 * inch, bottomMargin=0.55 * inch,
    )
    styles = getSampleStyleSheet()
    title = ParagraphStyle("title", parent=styles["Title"], fontSize=22, spaceAfter=6, textColor=SKY)
    h1 = ParagraphStyle("h1", parent=styles["Heading1"], fontSize=14, spaceBefore=10, spaceAfter=6, textColor=SKY)
    h2 = ParagraphStyle("h2", parent=styles["Heading2"], fontSize=11, spaceBefore=8, spaceAfter=4)
    body = ParagraphStyle("body", parent=styles["Normal"], fontSize=9, leading=12, spaceAfter=6)
    small = ParagraphStyle("small", parent=body, fontSize=8, leading=10, textColor=colors.grey)

    story = []

    story.append(Paragraph("MemoryMate", title))
    story.append(Paragraph("Costs & Paid Services Report", h1))
    story.append(Paragraph("Simple guide for founders · No secrets in this document", small))
    story.append(Spacer(1, 0.15 * inch))

  # Summary box
    summary_data = [
        ["Current cost while testing locally", "Close to $0 if free/local tools only"],
        ["Risk level", "Low → Medium (real AI keys) → High (24/7 cloud STT / GCP paid products)"],
        ["Biggest danger", "Always-on transcription + accidental Google Cloud paid services"],
        ["Safest rule", "Do not enable paid services without approval"],
        ["Budget alert (Google Cloud)", "$1 recommended (warning only, not a hard cap)"],
    ]
    t = Table(summary_data, colWidths=[2.2 * inch, 4.5 * inch])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), LIGHT_BG),
        ("BOX", (0, 0), (-1, -1), 1, SKY),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.lightgrey),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(t)
    story.append(Spacer(1, 0.2 * inch))

    story.append(Paragraph("B. Services Used or Planned", h1))
    headers = ["Service", "Status", "Risk", "Free/Paid", "Control"]
    rows = [
        ["Google Calendar API", "Optional (OAuth)", "🟡", "Free at low volume", "Calendar API only; $1 alert"],
        ["Google OAuth / Meet", "Optional", "🟢", "Free with Calendar", "No extra GCP products"],
        ["Maps/Waze deep links", "Used now", "🟢", "Free URLs only", "Never add Places API"],
        ["MongoDB Atlas / local", "Used now", "🟡", "M0 free tier", "Monitor storage"],
        ["Vercel (frontend)", "Planned", "🟡", "Hobby free", "Stay on Hobby"],
        ["Render (backend)", "Planned", "🟡", "Free tier sleeps", "Free plan first"],
        ["AI text (Claude/OpenAI/Emergent)", "Optional keys", "🟡–🔴", "Paid per token", "DAILY_AI_COST_CAP_USD"],
        ["Cloud transcription (Whisper)", "Optional", "🔴", "Paid per minute", "Cap minutes/day"],
        ["Browser speech", "Used now", "🟢", "Free", "Prefer for light voice"],
        ["WhatsApp Meta API", "Code only", "🔴 if on", "Paid in prod", "Do not start"],
        ["WHOOP", "Planning only", "🟢", "Not live", "Disabled"],
        ["Web Push (VAPID)", "Optional", "🟢", "Free self-hosted", "Optional"],
        ["Email/Gmail API", "Not used", "🟢", "—", "—"],
        ["Cloud file storage", "Not used", "🟢", "—", "Temp files only"],
    ]
    data = [headers] + rows
    tbl = Table(data, colWidths=[1.5 * inch, 1.1 * inch, 0.45 * inch, 1.2 * inch, 2.0 * inch])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), SKY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 7),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT_BG]),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    story.append(tbl)
    story.append(Paragraph("Legend: 🟢 safe/free · 🟡 watch · 🔴 high danger", small))

    story.append(PageBreak())
    story.append(Paragraph("C. Google Cloud: What Can Charge Me?", h1))

    story.append(Paragraph("<b>Safe:</b> Calendar API, OAuth, Meet links via Calendar — normal startup use ≈ $0", body))
    danger_rows = [
        ["Compute Engine / VMs", "24/7 server bills"],
        ["Cloud Run (paid scale)", "Always-on compute"],
        ["BigQuery", "Warehouse costs"],
        ["Cloud Storage", "Storage + egress"],
        ["Vertex AI / Gemini", "Per-token AI"],
        ["Maps Platform / Places", "Per-request (NOT in MemoryMate code)"],
        ["Cloud SQL", "Managed DB"],
        ["Kubernetes", "Cluster fees"],
    ]
    d_tbl = Table([["Danger product", "Why"]] + danger_rows, colWidths=[2.5 * inch, 4.2 * inch])
    d_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), RED),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("BACKGROUND", (0, 1), (-1, -1), DANGER_BG),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(d_tbl)
    story.append(Spacer(1, 0.1 * inch))
    story.append(Paragraph(
        "<b>Google Cloud should ONLY have:</b> Calendar API · OAuth client · $1 budget alert",
        ParagraphStyle("warn", parent=body, backColor=WARN_BG, borderPadding=6),
    ))
    story.append(Paragraph(
        "<b>Do NOT enable:</b> Gemini, Vertex AI, Compute Engine, BigQuery, Cloud Run, "
        "Cloud Storage, Cloud SQL, Kubernetes, Maps Platform, Places API",
        body,
    ))
    story.append(Paragraph(
        "<b>Warning:</b> Budget alerts are warnings, not hard caps. Disable APIs to truly stop bills.",
        ParagraphStyle("warn2", parent=body, backColor=WARN_BG, borderPadding=6),
    ))

    story.append(Paragraph("D. Estimated Cost Per User / Month", h1))
    cost_rows = [
        ["Light user", "$0.05–$0.30", "Few AI chats; mostly typing"],
        ["Normal user", "$0.50–$2.00", "Daily assistant; ~10 min voice/day"],
        ["Heavy user", "$3–$10+", "Many AI actions; 30–60 min voice/day"],
        ["Always-on cloud STT", "$100+/user risk", "24/7 transcription — not affordable"],
    ]
    c_tbl = Table([["User type", "Est. cost/month", "Notes"]] + cost_rows, colWidths=[1.6 * inch, 1.4 * inch, 3.7 * inch])
    c_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), SKY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("BACKGROUND", (0, 4), (-1, 4), DANGER_BG),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(c_tbl)
    story.append(Paragraph("Voice/transcription is the biggest variable. Text AI is usually cheap.", body))

    story.append(Paragraph("E. Example: Transcription Math (placeholder $0.003/min)", h2))
    ex_rows = [
        ["10 min/day", "10 × 30 × $0.003", "$0.90/mo"],
        ["30 min/day", "30 × 30 × $0.003", "$2.70/mo"],
        ["60 min/day", "60 × 30 × $0.003", "$5.40/mo"],
        ["1440 min/day (24h)", "1440 × 30 × $0.003", "$129.60/mo"],
    ]
    e_tbl = Table([["Usage", "Formula", "Result"]] + ex_rows, colWidths=[1.8 * inch, 2.2 * inch, 1.5 * inch])
    e_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), YELLOW),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("BACKGROUND", (0, 4), (-1, 4), DANGER_BG),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(e_tbl)
    story.append(Paragraph("Replace placeholder price with real provider pricing before launch.", small))

    story.append(PageBreak())
    story.append(Paragraph("F. Free-Safe Design (Already in MemoryMate)", h1))
    safe_items = [
        "Maps/Waze = free deep links only (no paid Maps APIs)",
        "WHOOP = planning only · WhatsApp Business API not started",
        "Mic/location opt-in · visible pause/stop · no hidden recording",
        "AI draft requires confirmation before save",
        "Calendar: no edit/delete endpoints in code",
        "Chat clears after 24h unless saved · daily summary refreshes",
    ]
    for item in safe_items:
        story.append(Paragraph(f"• {item}", body))

    story.append(Paragraph("G. When Do You Need to Deposit Money?", h1))
    dep_rows = [
        ["Google Cloud", "No (avoid paid products)", "If paid GCP enabled", "$1 alert"],
        ["AI provider", "Only with real API key", "Drafts, assistant, summaries", "$5–$20 test + daily cap"],
        ["Transcription", "Only if cloud STT used", "Voice uploads / capture", "Cap minutes/user/day"],
        ["MongoDB", "No on M0", "If cluster upgraded", "Free tier first"],
        ["Render", "No on free plan", "Paid / always-on plan", "Free first"],
        ["Vercel", "No on Hobby", "Pro / high traffic", "Hobby first"],
        ["WhatsApp", "No — not started", "Production messaging", "Do not start"],
        ["WHOOP", "No — planning only", "Future API", "Legal review first"],
    ]
    dep_tbl = Table([["Service", "Deposit now?", "When", "Limit"]] + dep_rows, colWidths=[1.3 * inch, 1.5 * inch, 2.2 * inch, 1.8 * inch])
    dep_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), SKY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 7),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT_BG]),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    story.append(dep_tbl)

    story.append(Paragraph("H. Recommended Hard Caps in Code", h1))
    cap_rows = [
        ["AI actions/day", "Free: 5 · Plus: 50 · Family: 150"],
        ["Voice minutes/day", "Free: 5 · Plus: 30 · Family: 60"],
        ["Already in repo", "DAILY_AI_COST_CAP_USD default $0.50/patient/day"],
        ["Admin dashboard", "Show ai_usage est_cost · hard stop at cap (429)"],
    ]
    for r in cap_rows:
        story.append(Paragraph(f"• {r[0]}: {r[1]}", body))

    story.append(Paragraph("I. Red Flag Checklist (Before Launch)", h1))
    flags = [
        "Google Cloud $1 budget alert · Calendar API only",
        "No Maps/Places · No Compute Engine · No BigQuery",
        "No Vertex/Gemini paid use · .env not committed",
        "API keys not in frontend · AI spending cap set",
        "Transcription minute cap · MongoDB free tier",
        "Render/Vercel free or known price",
        "WhatsApp not started · WHOOP not live",
        "No hidden recording · user can pause/stop capture",
    ]
    for f in flags:
        story.append(Paragraph(f"☐ {f}", body))

    story.append(Spacer(1, 0.15 * inch))
    story.append(Paragraph(
        "<b>J. Final recommendation:</b> Keep local/free testing, use Google Calendar only if needed, "
        "keep WhatsApp/WHOOP disabled, cap AI and transcription, and do not enable Google paid services without approval.",
        ParagraphStyle("final", parent=body, backColor=colors.HexColor("#dcfce7"), borderPadding=8, fontSize=10),
    ))

    story.append(Spacer(1, 0.2 * inch))
    story.append(Paragraph(
        "Env var names documented in docs/MEMORYMATE_COSTS_AND_PAID_SERVICES_REPORT.md. "
        "No API keys, secrets, MongoDB URIs, or .env values in this PDF.",
        small,
    ))

    doc.build(story)
    print(f"Created {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    build_pdf()
