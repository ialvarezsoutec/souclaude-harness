#!/usr/bin/env python3
"""
Soutec — Convierte un archivo Markdown (.md) en un PDF corporativo Soutec.

Render 100% Python con ReportLab: NO depende de WeasyPrint ni de librerías
nativas del sistema (Pango/Cairo/GTK). Corre en cualquier máquina con Python:

    pip install reportlab pillow markdown

Usa fuentes internas de ReportLab (Helvetica/Courier), así que tampoco depende
de fuentes instaladas en la máquina.

Uso:
    python md_to_pdf.py ENTRADA.md [SALIDA.pdf] [opciones]

Opciones (sobre-escriben el front-matter y los defaults):
    --title / --header / --subtitle / --date / --author / --url
    --confidential | --no-cover | --no-toc | --no-backcover

Front-matter YAML-lite opcional al inicio del .md, entre '---':
    ---
    title: Informe de Arquitectura
    header: Informe de Arquitectura
    subtitle: Plataforma Edge AI
    date: Julio 2026
    confidential: true
    ---
"""
import argparse
import datetime
import html as html_mod
import os
import re
import sys
from html.parser import HTMLParser

import markdown
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_JUSTIFY, TA_LEFT, TA_CENTER
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table, TableStyle,
    Preformatted, PageBreak, Flowable, ListFlowable, ListItem, HRFlowable,
    NextPageTemplate, KeepTogether,
)
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.pdfgen import canvas

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.normpath(os.path.join(HERE, "..", "assets"))

# ---------- Paleta oficial Soutec ----------
CYAN    = colors.HexColor("#00A5BC")
BLUE    = colors.HexColor("#00688F")
DEEP    = colors.HexColor("#004F64")
CARBON  = colors.HexColor("#3D4543")
GREEN   = colors.HexColor("#47B45A")
YELLOW  = colors.HexColor("#F2D13F")
MAGENTA = colors.HexColor("#C81E54")
BODY    = colors.HexColor("#2C3331")
RULE    = colors.HexColor("#D8DDE0")
GREY    = colors.HexColor("#6B7472")
ZEBRA   = colors.HexColor("#F3F7F8")
CODEBG  = colors.HexColor("#F1F4F5")

PAGE_W, PAGE_H = letter
LM = RM = 2 * cm
TM = 2.15 * cm          # top del marco de contenido
BM = 1.9 * cm           # bottom del marco de contenido
CONTENT_W = PAGE_W - LM - RM

MESES_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
            "agosto", "septiembre", "octubre", "noviembre", "diciembre"]

CALLOUTS = {
    "nota": ("note", CYAN), "note": ("note", CYAN), "info": ("note", CYAN),
    "éxito": ("ok", GREEN), "exito": ("ok", GREEN), "ok": ("ok", GREEN), "listo": ("ok", GREEN),
    "advertencia": ("warn", YELLOW), "precaución": ("warn", YELLOW), "precaucion": ("warn", YELLOW),
    "atención": ("warn", YELLOW), "atencion": ("warn", YELLOW), "warning": ("warn", YELLOW),
    "peligro": ("danger", MAGENTA), "error": ("danger", MAGENTA), "crítico": ("danger", MAGENTA),
    "critico": ("danger", MAGENTA), "danger": ("danger", MAGENTA),
}

LOGO = os.path.join(ASSETS, "soutec_logo.png")
LOGO_WHITE = os.path.join(ASSETS, "soutec_logo_white.png")
ISOTIPO = os.path.join(ASSETS, "soutec_isotipo.png")

# Estado para el folio "Page X of Y" (páginas que llevan pie con número).
_FOLIO_PAGES = set()


# ============================================================
#  Front-matter y título
# ============================================================
def parse_front_matter(text):
    meta = {}
    m = re.match(r"^﻿?---\s*\n(.*?)\n---\s*\n?", text, re.DOTALL)
    if not m:
        return meta, text
    for line in m.group(1).splitlines():
        if not line.strip() or line.lstrip().startswith("#") or ":" not in line:
            continue
        key, _, val = line.partition(":")
        meta[key.strip().lower()] = val.strip().strip('"').strip("'")
    return meta, text[m.end():]


def truthy(v):
    return str(v).strip().lower() in ("true", "1", "yes", "si", "sí", "on")


def extract_title(body, meta):
    if meta.get("title"):
        return meta["title"], body
    lines = body.splitlines()
    for i, line in enumerate(lines):
        m = re.match(r"^#\s+(.*\S)\s*$", line)
        if m:
            title = m.group(1).strip()
            del lines[i]
            return title, "\n".join(lines)
    return "Documento", body


# ============================================================
#  Inline HTML -> markup de ReportLab
# ============================================================
def inline_to_rl(s):
    s = s.replace("<strong>", "<b>").replace("</strong>", "</b>")
    s = s.replace("<em>", "<i>").replace("</em>", "</i>")
    s = re.sub(r"<code>(.*?)</code>",
               r'<font face="Courier" color="#004F64">\1</font>', s, flags=re.DOTALL)
    s = re.sub(r'<a href="([^"]*)">(.*?)</a>',
               r'<font color="#00688F"><a href="\1">\2</a></font>', s, flags=re.DOTALL)
    s = re.sub(r"</?(span|sub|sup)[^>]*>", "", s)
    return s.strip()


# ============================================================
#  Parser de bloques (HTML de markdown -> lista de bloques)
# ============================================================
BLOCK = {"h1", "h2", "h3", "h4", "p", "ul", "ol", "li",
         "table", "thead", "tbody", "tr", "th", "td", "pre", "blockquote", "hr"}


class BlockBuilder(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.blocks = []
        self.buf = None          # buffer inline activo (lista de str)
        self.cap = None          # 'p','h2','h3','h4','h1'
        self.in_pre = False
        self.pre_buf = []
        # listas
        self.list = None         # dict {'t':'ul'/'ol','items':[]}
        self.in_li = False
        # tablas
        self.table = None        # dict {'head':[], 'rows':[]}
        self.row = None
        self.in_head = False
        self.in_cell = False
        # blockquote
        self.in_quote = False
        self.quote_paras = []

    # -- utilidades --
    def _txt(self):
        return "".join(self.buf) if self.buf else ""

    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        if tag not in BLOCK:
            if self.buf is not None:
                if tag == "a":
                    self.buf.append(f'<a href="{d.get("href","")}">')
                elif tag == "br":
                    self.buf.append("<br/>")
                else:
                    self.buf.append(f"<{tag}>")
            return
        # --- bloques ---
        if tag in ("h1", "h2", "h3", "h4"):
            self.cap = tag
            self.buf = []
        elif tag == "p":
            if self.in_quote:
                self.buf = []
            elif self.in_li or self.in_cell:
                if self.buf is None:
                    self.buf = []
            else:
                self.cap = "p"
                self.buf = []
        elif tag in ("ul", "ol"):
            self.list = {"t": tag, "items": []}
        elif tag == "li":
            self.in_li = True
            self.buf = []
        elif tag == "table":
            self.table = {"head": [], "rows": []}
        elif tag == "thead":
            self.in_head = True
        elif tag == "tbody":
            self.in_head = False
        elif tag == "tr":
            self.row = []
        elif tag in ("th", "td"):
            self.in_cell = True
            self.buf = []
        elif tag == "pre":
            self.in_pre = True
            self.pre_buf = []
        elif tag == "blockquote":
            self.in_quote = True
            self.quote_paras = []
        elif tag == "hr":
            self.blocks.append({"t": "hr"})

    def handle_startendtag(self, tag, attrs):
        if tag == "br" and self.buf is not None:
            self.buf.append("<br/>")
        elif tag == "hr":
            self.blocks.append({"t": "hr"})

    def handle_endtag(self, tag):
        if tag not in BLOCK:
            if self.buf is not None and tag not in ("br",):
                self.buf.append(f"</{tag}>")
            return
        if tag in ("h1", "h2", "h3", "h4"):
            text = self._txt().strip()
            if tag == "h1":
                self.blocks.append({"t": "section", "title": inline_to_rl(text)})
            else:
                self.blocks.append({"t": "h", "level": int(tag[1]), "text": inline_to_rl(text)})
            self.buf = None
            self.cap = None
        elif tag == "p":
            if self.in_quote:
                self.quote_paras.append(self._txt().strip())
                self.buf = None
            elif self.in_li or self.in_cell:
                pass  # el texto sigue en el buffer de la celda/li
            elif self.cap == "p":
                self.blocks.append({"t": "p", "text": inline_to_rl(self._txt().strip())})
                self.buf = None
                self.cap = None
        elif tag == "li":
            self.list["items"].append(inline_to_rl(self._txt().strip()))
            self.in_li = False
            self.buf = None
        elif tag in ("ul", "ol"):
            if self.list:
                self.blocks.append({"t": "list", "ordered": self.list["t"] == "ol",
                                    "items": self.list["items"]})
            self.list = None
        elif tag in ("th", "td"):
            self.row.append(inline_to_rl(self._txt().strip()))
            self.in_cell = False
            self.buf = None
        elif tag == "tr":
            if self.in_head:
                self.table["head"] = self.row
            else:
                self.table["rows"].append(self.row)
            self.row = None
        elif tag == "table":
            self.blocks.append({"t": "table", **self.table})
            self.table = None
        elif tag == "pre":
            self.blocks.append({"t": "code", "text": "".join(self.pre_buf).rstrip("\n")})
            self.in_pre = False
        elif tag == "blockquote":
            for para in self.quote_paras:
                color, cleaned = parse_callout(para)
                self.blocks.append({"t": "callout", "color": color,
                                    "text": inline_to_rl(cleaned)})
            self.in_quote = False

    def handle_data(self, data):
        if self.in_pre:
            self.pre_buf.append(data)
        elif self.buf is not None:
            self.buf.append(html_mod.escape(data))


# Tipos de admonición estilo GitHub:  > [!NOTA] Título opcional
ADMON = {
    "nota": (CYAN, "Nota"), "note": (CYAN, "Nota"), "info": (CYAN, "Info"),
    "tip": (CYAN, "Tip"),
    "conforme": (GREEN, "Conforme"), "exito": (GREEN, "Éxito"), "éxito": (GREEN, "Éxito"),
    "ok": (GREEN, "OK"), "success": (GREEN, "Éxito"), "listo": (GREEN, "Listo"),
    "importante": (YELLOW, "Importante"), "important": (YELLOW, "Importante"),
    "advertencia": (YELLOW, "Advertencia"), "precaucion": (YELLOW, "Precaución"),
    "precaución": (YELLOW, "Precaución"), "atencion": (YELLOW, "Atención"),
    "atención": (YELLOW, "Atención"), "warning": (YELLOW, "Advertencia"),
    "caution": (YELLOW, "Precaución"),
    "peligro": (MAGENTA, "Peligro"), "error": (MAGENTA, "Error"),
    "critico": (MAGENTA, "Crítico"), "crítico": (MAGENTA, "Crítico"),
    "danger": (MAGENTA, "Peligro"),
}


def parse_callout(raw):
    """Devuelve (color, texto_raw_limpio) para un párrafo de blockquote.

    Soporta dos sintaxis de callout:
      1. GitHub:  [!NOTA] Título opcional  →  color + título en negrita.
      2. Negrita: **Nota:** ...            →  color por la palabra clave.
    """
    m = re.match(r"\s*\[!\s*([A-Za-zÀ-ÿ]+)\s*\][ \t]*(.*)", raw, re.DOTALL)
    if m:
        typ = m.group(1).lower()
        color, label = ADMON.get(typ, (CYAN, m.group(1).capitalize()))
        first, _, body = m.group(2).partition("\n")
        first, body = first.strip(), body.strip()
        title = first or label
        cleaned = f"<strong>{title}</strong>:\n{body}" if body else f"<strong>{title}</strong>"
        return color, cleaned
    wm = re.match(r"\s*<strong>\s*([^:<]+?)\s*:?\s*</strong>", raw)
    if wm:
        key = wm.group(1).strip().lower().rstrip(":")
        if key in CALLOUTS:
            return CALLOUTS[key][1], raw
    return CYAN, raw


# ============================================================
#  Estilos de párrafo
# ============================================================
def build_styles():
    S = {}
    # Cuerpo justificado con sangría SOLO en la primera línea; las líneas de
    # continuación quedan alineadas al margen izquierdo (a ras con los
    # encabezados), como en el documento guía.
    S["body"] = ParagraphStyle("body", fontName="Helvetica", fontSize=10.5, leading=15,
                               alignment=TA_JUSTIFY, textColor=BODY, spaceAfter=5,
                               leftIndent=0, firstLineIndent=0.9 * cm)
    S["body0"] = ParagraphStyle("body0", parent=S["body"], firstLineIndent=0.9 * cm)
    S["H2"] = ParagraphStyle("H2", fontName="Helvetica-Bold", fontSize=13, leading=16,
                             textColor=BLUE, spaceBefore=12, spaceAfter=5)
    S["H3"] = ParagraphStyle("H3", fontName="Helvetica-Bold", fontSize=11, leading=14,
                             textColor=BLUE, spaceBefore=9, spaceAfter=3)
    S["H4"] = ParagraphStyle("H4", fontName="Helvetica-Bold", fontSize=10.5, leading=13,
                             textColor=CARBON, spaceBefore=7, spaceAfter=2)
    S["li"] = ParagraphStyle("li", parent=S["body"], firstLineIndent=0, leftIndent=0,
                             spaceAfter=2, alignment=TA_JUSTIFY)
    S["cell"] = ParagraphStyle("cell", fontName="Helvetica", fontSize=9.5, leading=12,
                               textColor=BODY)
    S["cellh"] = ParagraphStyle("cellh", fontName="Helvetica-Bold", fontSize=9.5,
                                leading=12, textColor=colors.white)
    S["callout"] = ParagraphStyle("callout", fontName="Helvetica", fontSize=10, leading=13.5,
                                  textColor=CARBON)
    S["code"] = ParagraphStyle("code", fontName="Courier", fontSize=9, leading=12.5,
                               textColor=CARBON)
    S["toc0"] = ParagraphStyle("toc0", fontName="Helvetica", fontSize=10.5, leading=17,
                               textColor=CARBON)
    S["toc1"] = ParagraphStyle("toc1", fontName="Helvetica", fontSize=10.5, leading=15,
                               leftIndent=0.85 * cm, textColor=CARBON)
    S["toc2"] = ParagraphStyle("toc2", fontName="Helvetica", fontSize=10, leading=13,
                               leftIndent=1.7 * cm, textColor=colors.HexColor("#55605D"))
    S["toch"] = ParagraphStyle("toch", fontName="Helvetica-Bold", fontSize=17, leading=20,
                               textColor=BLUE, alignment=TA_CENTER, spaceAfter=16)
    return S


# ============================================================
#  Flowable: banner de sección numerado (paralelogramo cyan)
# ============================================================
class SectionBanner(Flowable):
    def __init__(self, number, title):
        super().__init__()
        self.number = number
        self.title = title
        self.key = f"sec{number}"
        self._h = 1.0 * cm
        self._pad_top = 0.55 * cm
        self._pad_bot = 0.32 * cm

    def wrap(self, availW, availH):
        self._availW = availW
        return (availW, self._h + self._pad_top + self._pad_bot)

    def draw(self):
        c = self.canv
        y = self._pad_bot
        h = self._h
        bw = 9.6 * cm
        skew = 0.68 * cm
        # El banner sangra hasta el borde izquierdo del papel (como el banner del
        # título): el flowable arranca en el margen LM, así que dibujamos desde -LM.
        # Un ÚNICO polígono (rect + punta) para que no haya costura.
        c.setFillColor(CYAN)
        p = c.beginPath()
        p.moveTo(-LM, y)
        p.lineTo(bw, y)
        p.lineTo(bw + skew, y + h)
        p.lineTo(-LM, y + h)
        p.close()
        c.drawPath(p, stroke=0, fill=1)
        c.setFillColor(colors.white)
        c.setFont("Helvetica-Bold", 14.5)
        ty = y + (h - 14.5) / 2 + 1.5
        c.drawString(0.5 * cm, ty, str(self.number))
        # el título puede traer markup mínimo; para el banner usamos texto plano
        c.drawString(1.75 * cm, ty, re.sub(r"<[^>]+>", "", self.title))


# ============================================================
#  Cromática de página (canvas) — banner, logo, pie, portada, contra
# ============================================================
def _draw_run_banner(c, header):
    h = 0.62 * cm
    y = PAGE_H - 0.95 * cm - h
    c.setFont("Helvetica-Bold", 9.5)
    tw = c.stringWidth(header, "Helvetica-Bold", 9.5)
    bw = max(6.4 * cm, LM + tw + 0.55 * cm)
    skew = 0.42 * cm
    # Banner como un ÚNICO polígono (rect + punta) para que no haya costura.
    c.setFillColor(CYAN)
    p = c.beginPath()
    p.moveTo(0, y)
    p.lineTo(bw, y)
    p.lineTo(bw + skew, y + h)
    p.lineTo(0, y + h)
    p.close()
    c.drawPath(p, stroke=0, fill=1)
    c.setFillColor(colors.white)
    c.drawString(LM, y + (h - 9.5) / 2 + 1.3, header)


def _draw_logo(c):
    w = 3.3 * cm
    hh = w * 51.0 / 279.0
    c.drawImage(LOGO, PAGE_W - RM - w, PAGE_H - 1.5 * cm, width=w, height=hh,
                mask="auto", preserveAspectRatio=True, anchor="nw")


def _draw_footer(c, copyright_txt):
    yline = BM - 0.5 * cm
    c.setStrokeColor(RULE)
    c.setLineWidth(0.6)
    c.line(LM, yline, PAGE_W - RM, yline)
    c.setFont("Helvetica", 8.5)
    c.setFillColor(GREY)
    c.drawString(LM, yline - 0.42 * cm, copyright_txt)


def _draw_folio(c, pageno, total):
    c.setFont("Helvetica", 8.5)
    c.setFillColor(GREY)
    c.drawRightString(PAGE_W - RM, BM - 0.92 * cm, f"Página {pageno} de {total}")


def make_cover_painter(header, title, subtitle, date_str, author, confidential):
    def paint(c, doc):
        _draw_run_banner(c, header)
        # isotipo grande, sangrando por la izquierda, con aire arriba y a la derecha
        iso_w = 21.5 * cm
        iso_h = iso_w * 1523.0 / 1757.0
        top_edge = PAGE_H - 2.45 * cm      # separación respecto al banner superior
        c.drawImage(ISOTIPO, -1.4 * cm, top_edge - iso_h, width=iso_w, height=iso_h,
                    mask="auto", preserveAspectRatio=True, anchor="nw")
        # bloque de título abajo a la derecha
        xr = PAGE_W - RM
        y = 5.6 * cm
        c.setFillColor(CARBON)
        c.setFont("Helvetica-Bold", 21)
        c.drawRightString(xr, y, title)
        y -= 0.75 * cm
        if subtitle:
            c.setFillColor(BLUE)
            c.setFont("Helvetica-Bold", 12.5)
            c.drawRightString(xr, y, subtitle)
            y -= 0.55 * cm
        lw = 4.6 * cm
        lh = lw * 51.0 / 279.0
        c.drawImage(LOGO, xr - lw, y - lh + 0.1 * cm, width=lw, height=lh,
                    mask="auto", preserveAspectRatio=True, anchor="nw")
        y -= (lh + 0.35 * cm)
        c.setFillColor(GREY)
        c.setFont("Helvetica", 10)
        c.drawRightString(xr, y, date_str)
        y -= 0.5 * cm
        if author:
            c.drawRightString(xr, y, author)
            y -= 0.5 * cm
        if confidential:
            c.setFont("Helvetica-Bold", 8.5)
            label = "CONFIDENCIAL"
            tw = c.stringWidth(label, "Helvetica-Bold", 8.5)
            bx0 = xr - tw - 0.5 * cm
            by0 = y - 0.5 * cm
            c.setStrokeColor(MAGENTA)
            c.setLineWidth(1)
            c.rect(bx0, by0, tw + 0.5 * cm, 0.55 * cm, stroke=1, fill=0)
            c.setFillColor(MAGENTA)
            c.drawString(bx0 + 0.25 * cm, by0 + 0.16 * cm, label)
    return paint


def make_toc_painter(header):
    def paint(c, doc):
        _draw_run_banner(c, header)
    return paint


def make_content_painter(header, copyright_txt):
    def paint(c, doc):
        _draw_run_banner(c, header)
        _draw_logo(c)
        _draw_footer(c, copyright_txt)
        _FOLIO_PAGES.add(c.getPageNumber())
    return paint


def make_backcover_painter(url, copyright_txt):
    def paint(c, doc):
        c.setFillColor(CYAN)
        c.rect(0, BM, PAGE_W, PAGE_H - BM, stroke=0, fill=1)
        lw = 6.4 * cm
        lh = lw * 51.0 / 279.0
        c.drawImage(LOGO_WHITE, (PAGE_W - lw) / 2, PAGE_H * 0.54, width=lw, height=lh,
                    mask="auto", preserveAspectRatio=True, anchor="nw")
        c.setFillColor(colors.white)
        c.setFont("Helvetica", 10.5)
        c.drawCentredString(PAGE_W / 2, BM + 2.4 * cm, url)
        _draw_footer(c, copyright_txt)
        _FOLIO_PAGES.add(c.getPageNumber())
    return paint


# ============================================================
#  Canvas que estampa el folio "Page X of Y" al final (2 pasadas)
# ============================================================
class FolioCanvas(canvas.Canvas):
    def __init__(self, *a, **k):
        super().__init__(*a, **k)
        self._saved = []

    def showPage(self):
        self._saved.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        total = len(self._saved)
        for state in self._saved:
            self.__dict__.update(state)
            if self._pageNumber in _FOLIO_PAGES:
                _draw_folio(self, self._pageNumber, total)
            canvas.Canvas.showPage(self)
        canvas.Canvas.save(self)


# ============================================================
#  DocTemplate con hook de TOC
# ============================================================
class SoutecDoc(BaseDocTemplate):
    def afterFlowable(self, flowable):
        if isinstance(flowable, SectionBanner):
            self.canv.bookmarkPage(flowable.key)
            txt = f"{flowable.number}&nbsp;&nbsp;{re.sub(r'<[^>]+>', '', flowable.title)}"
            self.notify("TOCEntry", (0, txt, self.page, flowable.key))
            self.canv.addOutlineEntry(re.sub(r"<[^>]+>", "", flowable.title),
                                      flowable.key, level=0)
        elif isinstance(flowable, Paragraph):
            name = flowable.style.name
            if name in ("H2", "H3"):
                lvl = 1 if name == "H2" else 2
                self.notify("TOCEntry", (lvl, flowable.getPlainText(), self.page))


# ============================================================
#  Construcción de flowables
# ============================================================
def blocks_to_flowables(blocks, S):
    story = []
    secnum = 0
    suppress_indent = True
    for b in blocks:
        t = b["t"]
        if t == "section":
            secnum += 1
            sp = Spacer(0, 0.35 * cm) if story else Spacer(0, 0)
            story.append(sp)
            story.append(SectionBanner(secnum, b["title"]))
            suppress_indent = True
        elif t == "h":
            style = {2: "H2", 3: "H3", 4: "H4"}.get(b["level"], "H4")
            story.append(Paragraph(b["text"], S[style]))
            suppress_indent = True
        elif t == "p":
            if not b["text"]:
                continue
            style = S["body0"] if suppress_indent else S["body"]
            story.append(Paragraph(b["text"], style))
            suppress_indent = False
        elif t == "list":
            items = [ListItem(Paragraph(it, S["li"]), value=None) for it in b["items"]]
            story.append(ListFlowable(
                [ListItem(Paragraph(it, S["li"])) for it in b["items"]],
                bulletType="1" if b["ordered"] else "bullet",
                bulletColor=BLUE, bulletFontName="Helvetica-Bold",
                leftIndent=0.9 * cm, bulletFontSize=9,
            ))
            suppress_indent = False
        elif t == "table":
            story.append(_make_table(b, S))
            suppress_indent = False
        elif t == "code":
            story.append(_make_code(b["text"], S))
            suppress_indent = False
        elif t == "callout":
            # Los blockquotes se renderizan como nota en texto plano (sin caja ni
            # color), como en los informes de referencia: el rótulo en negrita
            # ("Nota:", "NOTA:") queda inline dentro de un párrafo normal.
            style = S["body0"] if suppress_indent else S["body"]
            story.append(Paragraph(b["text"], style))
            suppress_indent = False
        elif t == "hr":
            story.append(Spacer(0, 0.15 * cm))
            story.append(HRFlowable(width="100%", thickness=0.8, color=RULE))
            story.append(Spacer(0, 0.15 * cm))
    return story


def _col_widths(head, rows, ncol):
    from reportlab.pdfbase.pdfmetrics import stringWidth
    maxw = [1.0] * ncol
    def measure(cells, fs, fn):
        for i, cell in enumerate(cells):
            if i >= ncol:
                continue
            plain = re.sub(r"<[^>]+>", "", cell)
            maxw[i] = max(maxw[i], stringWidth(plain, fn, fs))
    if head:
        measure(head, 9.5, "Helvetica-Bold")
    for r in rows:
        measure(r, 9.5, "Helvetica")
    pad = 12
    raw = [min(w + pad, CONTENT_W * 0.42) for w in maxw]
    total = sum(raw)
    if total <= CONTENT_W:
        extra = (CONTENT_W - total) / ncol
        return [w + extra for w in raw]
    scale = CONTENT_W / total
    return [w * scale for w in raw]


def _make_table(b, S):
    head = b.get("head") or []
    rows = b.get("rows") or []
    ncol = max([len(head)] + [len(r) for r in rows]) if (head or rows) else 1
    data = []
    if head:
        data.append([Paragraph(x, S["cellh"]) for x in head] + [""] * (ncol - len(head)))
    for r in rows:
        data.append([Paragraph(x, S["cell"]) for x in r] + [""] * (ncol - len(r)))
    colw = _col_widths(head, rows, ncol)
    tbl = Table(data, colWidths=colw, repeatRows=1 if head else 0)
    ts = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#DFE4E6")),
    ]
    start = 0
    if head:
        ts += [("BACKGROUND", (0, 0), (-1, 0), BLUE),
               ("LINEBELOW", (0, 0), (-1, 0), 0.5, colors.white)]
        start = 1
    for i in range(start, len(data)):
        if (i - start) % 2 == 1:
            ts.append(("BACKGROUND", (0, i), (-1, i), ZEBRA))
    tbl.setStyle(TableStyle(ts))
    return KeepTogether([Spacer(0, 0.1 * cm), tbl, Spacer(0, 0.2 * cm)]) if len(data) <= 6 else \
        _wrap_spaced(tbl)


def _wrap_spaced(fl):
    return fl


def _make_code(text, S):
    pre = Preformatted(text, S["code"])
    tbl = Table([[pre]], colWidths=[CONTENT_W])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), CODEBG),
        ("LINEBEFORE", (0, 0), (0, -1), 2.5, DEEP),
        ("BOX", (0, 0), (-1, -1), 0.6, RULE),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return KeepTogether([Spacer(0, 0.1 * cm), tbl, Spacer(0, 0.2 * cm)])


def _make_callout(text, color, S):
    para = Paragraph(text, S["callout"])
    tint = colors.Color(color.red, color.green, color.blue, alpha=0.12)
    tbl = Table([[para]], colWidths=[CONTENT_W])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), tint),
        ("LINEBEFORE", (0, 0), (0, -1), 3, color),
        ("LEFTPADDING", (0, 0), (-1, -1), 9),
        ("RIGHTPADDING", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return KeepTogether([Spacer(0, 0.12 * cm), tbl, Spacer(0, 0.18 * cm)])


# ============================================================
#  Render principal
# ============================================================
def render(md_path, out_path, args):
    global _FOLIO_PAGES
    _FOLIO_PAGES = set()

    with open(md_path, "r", encoding="utf-8") as f:
        raw = f.read()
    meta, body = parse_front_matter(raw)

    if args.title:
        title = args.title
    else:
        title, body = extract_title(body, meta)
    header = args.header or meta.get("header") or title
    subtitle = args.subtitle or meta.get("subtitle", "")
    author = args.author or meta.get("author", "")
    confidential = args.confidential or truthy(meta.get("confidential", ""))
    url = args.url or meta.get("url", "www.soutec-group.com")
    want_cover = not args.no_cover
    want_toc = not args.no_toc
    want_backcover = not args.no_backcover and not (
        "backcover" in meta and not truthy(meta.get("backcover", "true")))

    today = datetime.date.today()
    date_str = args.date or meta.get(
        "date", f"{today.day} de {MESES_ES[today.month-1]} de {today.year}")
    copyright_txt = meta.get("copyright") or \
        f"©{today.year} Soutec – Todos los Derechos Reservados"

    html = markdown.Markdown(extensions=[
        "tables", "fenced_code", "sane_lists", "attr_list", "md_in_html",
    ]).convert(body)
    bb = BlockBuilder()
    bb.feed(html)
    blocks = bb.blocks
    has_headings = any(b["t"] in ("section", "h") for b in blocks)

    S = build_styles()
    content_story = blocks_to_flowables(blocks, S)

    # --- Plantillas de página ---
    frame_cover = Frame(0, 0, PAGE_W, PAGE_H, id="cover",
                        leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    frame_content = Frame(LM, BM, CONTENT_W, PAGE_H - TM - BM, id="content",
                          leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    frame_toc = Frame(LM, BM, CONTENT_W, PAGE_H - TM - BM, id="toc",
                      leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)

    templates = [
        PageTemplate(id="cover", frames=[frame_cover],
                     onPage=make_cover_painter(header, title, subtitle, date_str,
                                               author, confidential)),
        PageTemplate(id="toc", frames=[frame_toc], onPage=make_toc_painter(header)),
        PageTemplate(id="content", frames=[frame_content],
                     onPage=make_content_painter(header, copyright_txt)),
        PageTemplate(id="backcover", frames=[frame_cover],
                     onPage=make_backcover_painter(url, copyright_txt)),
    ]

    doc = SoutecDoc(out_path, pagesize=letter, pageTemplates=templates,
                    title=title, author="Soutec")

    story = []
    first_template = "cover" if want_cover else ("toc" if (want_toc and has_headings) else "content")
    if want_cover:
        story.append(Spacer(0, 1))
        nxt = "toc" if (want_toc and has_headings) else "content"
        story.append(NextPageTemplate(nxt))
        story.append(PageBreak())
    if want_toc and has_headings:
        story.append(Paragraph("Índice de Contenidos", S["toch"]))
        toc = TableOfContents()
        toc.levelStyles = [S["toc0"], S["toc1"], S["toc2"]]
        toc.dotsMinLevel = 0
        story.append(toc)
        story.append(NextPageTemplate("content"))
        story.append(PageBreak())
    story += content_story
    if want_backcover:
        story.append(NextPageTemplate("backcover"))
        story.append(PageBreak())
        story.append(Spacer(0, 1))

    # arranca en la primera plantilla correcta
    doc._firstPageTemplateIndex = [t.id for t in templates].index(first_template)
    doc.multiBuild(story, canvasmaker=FolioCanvas)
    return out_path


def main():
    ap = argparse.ArgumentParser(description="Convierte Markdown a PDF corporativo Soutec (ReportLab).")
    ap.add_argument("input")
    ap.add_argument("output", nargs="?")
    ap.add_argument("--title")
    ap.add_argument("--header")
    ap.add_argument("--subtitle")
    ap.add_argument("--date")
    ap.add_argument("--author")
    ap.add_argument("--url")
    ap.add_argument("--confidential", action="store_true")
    ap.add_argument("--no-cover", action="store_true")
    ap.add_argument("--no-toc", action="store_true")
    ap.add_argument("--no-backcover", action="store_true")
    args = ap.parse_args()

    if not os.path.isfile(args.input):
        sys.exit(f"No existe el archivo: {args.input}")
    out = args.output or os.path.splitext(args.input)[0] + ".pdf"
    render(args.input, out, args)
    print(f"PDF generado: {out}")


if __name__ == "__main__":
    main()
