#!/usr/bin/env python3
"""Render a readable Markdown security report as a dependency-free PDF.

Usage:
    python3 render_security_report.py input.md output.pdf

The renderer intentionally supports a practical Markdown subset used by the
security report template: headings, paragraphs, bullets, numbered lists,
blockquotes, fenced code blocks, horizontal rules, pipe tables, HTML comments
(stripped, used as source-only guidance), inline bold (`**texto**` / `__texto__`,
e.g. bold lead-ins in bullets), and callouts (GitHub-style admonitions written
as `> [!TIPO] título` + body).

Styling uses the Soutec Group brand palette (soutec-design-colors): corporate
blues for headings, the cover band and its brand kicker; callouts and status
badges as tinted panels/pills carrying the semantic colors (green success,
yellow warning, magenta danger, cyan info); and a neutral carbon tone for body
text. Tables auto-badge known statuses (Sin hallazgos, PASSED, REMEDIATED,
PENDING…) and severities (Critical, High, Medium, Low, Informativo).
"""

from __future__ import annotations

import re
import sys
import unicodedata
from dataclasses import dataclass, field, replace
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, List, Optional, Sequence, Tuple

PAGE_WIDTH = 595.28  # A4 points
PAGE_HEIGHT = 841.89
MARGIN_LEFT = 52.0
MARGIN_RIGHT = 52.0
MARGIN_TOP = 54.0
MARGIN_BOTTOM = 48.0
CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT

RGB = Tuple[float, float, float]

# Paleta de marca Soutec (soutec-design-colors), valores 0-1 para operadores
# de color de PDF (rg/RG). No inventar tonos intermedios: los unicos derivados
# son los tintes de fondo (zebra, banda de portada), documentados donde se usan.
SOUTEC_CYAN: RGB = (0.0, 0.6471, 0.7373)      # #00A5BC - acento de marca
SOUTEC_BLUE: RGB = (0.0, 0.4078, 0.5608)      # #00688F - superficie corporativa
SOUTEC_DEEP: RGB = (0.0, 0.3098, 0.3922)      # #004F64 - fondo oscuro/estructural
SOUTEC_CARBON: RGB = (0.2392, 0.2706, 0.2627)  # #3D4543 - texto principal
SOUTEC_GREEN: RGB = (0.2784, 0.7059, 0.3529)   # #47B45A - success
SOUTEC_YELLOW: RGB = (0.9490, 0.8196, 0.2471)  # #F2D13F - warning
SOUTEC_MAGENTA: RGB = (0.7843, 0.1176, 0.3294)  # #C81E54 - danger
WHITE: RGB = (1.0, 1.0, 1.0)

def mix(color: RGB, base: RGB, amount: float) -> RGB:
    """Mezcla lineal color*amount + base*(1-amount). Sirve para derivar superficies
    claras (tintes de callouts y badges) sin inventar tonos a ojo: cada tinte es un color
    de marca a un porcentaje explicito sobre blanco. Nunca se usa como color de texto ni de
    dato, solo como fondo; el color "vivo" siempre es el hex exacto de la paleta."""
    return (
        color[0] * amount + base[0] * (1 - amount),
        color[1] * amount + base[1] * (1 - amount),
        color[2] * amount + base[2] * (1 - amount),
    )


# Neutros derivados solo para superficies (no son parte de la paleta de marca):
# gris de linea de tabla y tinte zebra muy claro con matiz azulado.
RULE_GRAY: RGB = (0.82, 0.85, 0.86)
ZEBRA_TINT: RGB = (0.93, 0.96, 0.97)

# Tintes de callout (color al N% sobre blanco): fondos amplios, van claros para no competir
# con el texto en carbon que llevan encima.
CYAN_TINT: RGB = mix(SOUTEC_CYAN, WHITE, 0.12)
DEEP_TINT: RGB = mix(SOUTEC_DEEP, WHITE, 0.10)
GREEN_TINT: RGB = mix(SOUTEC_GREEN, WHITE, 0.14)
YELLOW_TINT: RGB = mix(SOUTEC_YELLOW, WHITE, 0.22)
MAGENTA_TINT: RGB = mix(SOUTEC_MAGENTA, WHITE, 0.10)
CARBON_TINT: RGB = mix(SOUTEC_CARBON, WHITE, 0.10)

# Tintes de badge: mas saturados que los de callout. Un pill es pequeno y con el tinte
# claro de callout el color casi no se percibe; se sube el porcentaje de marca para que el
# estado/severidad se lea por color de un vistazo. El texto del pill sigue en carbon, que
# conserva contraste holgado (>=6:1) sobre todos estos fondos.
GREEN_BADGE: RGB = mix(SOUTEC_GREEN, WHITE, 0.30)
YELLOW_BADGE: RGB = mix(SOUTEC_YELLOW, WHITE, 0.50)
MAGENTA_BADGE: RGB = mix(SOUTEC_MAGENTA, WHITE, 0.26)
CYAN_BADGE: RGB = mix(SOUTEC_CYAN, WHITE, 0.30)
CARBON_BADGE: RGB = mix(SOUTEC_CARBON, WHITE, 0.24)

# Estados reconocidos -> marcador semantico. Incluye variantes en espanol usadas por la
# plantilla (el review nativo emite ingles; el informe para IT se redacta en espanol).
POSITIVE_STATUS = {
    "sin hallazgos", "passed", "remediated", "ready for it review",
    "remediado", "aprobado", "conforme",
    "listo para revision de it", "listo para revisión de it",
}
NEGATIVE_STATUS = {
    "open", "failed", "blocked", "not ready for it review",
    "abierto", "fallido", "bloqueado",
}
WARNING_STATUS = {
    "pending", "ready with conditions",
    "pendiente", "listo con condiciones",
}

# Severidades -> color. Critical y High comparten el rojo de peligro; Medium=warning,
# Low=info (cyan), Informativo=neutro. Cubre variantes ES/EN que aparecen en las tablas.
SEVERITY_DANGER = {"critical", "critico", "crítico", "high", "alta", "alto"}
SEVERITY_WARN = {"medium", "media", "medio"}
SEVERITY_INFO = {"low", "baja", "bajo"}
SEVERITY_NEUTRAL = {"informativo", "informativa", "informational", "info"}

MARKER_SIZE = 5.2
# Badge (pill) de estado/severidad: geometria compartida entre el dibujo y el calculo de
# anchos de columna, para que el texto reserve el espacio real que ocupa el badge.
CHIP_PAD_X = 5.0
CHIP_DOT = 3.6
CHIP_GAP = 3.6
CHIP_EXTRA = CHIP_PAD_X * 2 + CHIP_DOT + CHIP_GAP


@dataclass(frozen=True)
class Style:
    font: str
    size: float
    leading: float
    space_before: float = 0.0
    space_after: float = 0.0
    indent: float = 0.0
    color: RGB = SOUTEC_CARBON


STYLES = {
    "title": Style("F2", 20, 25, 0, 16, color=SOUTEC_DEEP),
    "cover_title": Style("F2", 20, 25, color=WHITE),
    "h2": Style("F2", 15, 19, 22, 4, color=SOUTEC_BLUE),
    "h3": Style("F2", 12, 16, 9, 5, color=SOUTEC_DEEP),
    "h4": Style("F2", 10.5, 14, 7, 4, color=SOUTEC_CARBON),
    "body": Style("F1", 9.5, 13, 0, 6),
    "bullet": Style("F1", 9.5, 13, 0, 3, 14),
    "quote": Style("F4", 9.2, 13, 3, 6, 16),
    "code": Style("F3", 8.2, 10.5, 4, 7, 10),
    "table": Style("F1", 7.8, 10, 3, 11.3),
    "small": Style("F1", 7.5, 9),
    "callout": Style("F1", 9.2, 13, 6, 9),
    "callout_label": Style("F2", 8.4, 11),
}

# Callouts (anotaciones destacadas). Sintaxis en el Markdown, estilo GitHub:
#   > [!TIPO] Titulo opcional
#   > Cuerpo del callout...
# El color vive en la barra de acento y el tinte de fondo; la etiqueta usa un color de
# marca con contraste suficiente sobre el tinte (deep/carbon/magenta), nunca cyan/verde
# claros como texto. Cada tupla: (etiqueta, barra, tinte, color de etiqueta).
CALLOUT_RE = re.compile(r"^\s*\[!(\w+)\]\s*(.*)$", re.IGNORECASE)
CALLOUT_TYPES = {
    "NOTE": ("Nota", SOUTEC_CYAN, CYAN_TINT, SOUTEC_DEEP),
    "NOTA": ("Nota", SOUTEC_CYAN, CYAN_TINT, SOUTEC_DEEP),
    "INFO": ("Nota", SOUTEC_CYAN, CYAN_TINT, SOUTEC_DEEP),
    "TIP": ("Recomendación", SOUTEC_CYAN, CYAN_TINT, SOUTEC_DEEP),
    "IMPORTANT": ("Importante", SOUTEC_DEEP, DEEP_TINT, SOUTEC_DEEP),
    "IMPORTANTE": ("Importante", SOUTEC_DEEP, DEEP_TINT, SOUTEC_DEEP),
    "SUCCESS": ("Conforme", SOUTEC_GREEN, GREEN_TINT, SOUTEC_DEEP),
    "CONFORME": ("Conforme", SOUTEC_GREEN, GREEN_TINT, SOUTEC_DEEP),
    "OK": ("Conforme", SOUTEC_GREEN, GREEN_TINT, SOUTEC_DEEP),
    "WARNING": ("Atención", SOUTEC_YELLOW, YELLOW_TINT, SOUTEC_CARBON),
    "ATENCION": ("Atención", SOUTEC_YELLOW, YELLOW_TINT, SOUTEC_CARBON),
    "ATENCIÓN": ("Atención", SOUTEC_YELLOW, YELLOW_TINT, SOUTEC_CARBON),
    "CAUTION": ("Atención", SOUTEC_YELLOW, YELLOW_TINT, SOUTEC_CARBON),
    "DANGER": ("Bloqueante", SOUTEC_MAGENTA, MAGENTA_TINT, SOUTEC_MAGENTA),
    "BLOQUEANTE": ("Bloqueante", SOUTEC_MAGENTA, MAGENTA_TINT, SOUTEC_MAGENTA),
}


@dataclass
class DrawLine:
    text: str
    x: float
    y: float
    font: str
    size: float
    color: RGB = SOUTEC_CARBON


@dataclass
class Rule:
    y: float
    color: RGB = RULE_GRAY
    width: float = 0.5
    x0: float = MARGIN_LEFT
    x1: float = PAGE_WIDTH - MARGIN_RIGHT


@dataclass
class FillRect:
    x: float
    y: float
    w: float
    h: float
    color: RGB


@dataclass
class RoundRect:
    x: float
    y: float
    w: float
    h: float
    r: float
    fill: Optional[RGB] = None
    stroke: Optional[RGB] = None
    line_width: float = 0.6


class PdfLayout:
    def __init__(self) -> None:
        self.pages: List[List[object]] = [[]]
        self.page_no = 1
        self.y = PAGE_HEIGHT - MARGIN_TOP
        self.cover_drawn = False

    @property
    def current(self) -> List[object]:
        return self.pages[-1]

    def new_page(self) -> None:
        self.pages.append([])
        self.page_no += 1
        self.y = PAGE_HEIGHT - MARGIN_TOP

    def ensure(self, height: float) -> None:
        if self.y - height < MARGIN_BOTTOM + 18:
            self.new_page()

    def space(self, amount: float) -> None:
        if amount <= 0:
            return
        self.ensure(amount)
        self.y -= amount

    def add_rule(self) -> None:
        self.ensure(8)
        self.current.append(Rule(self.y - 2, color=SOUTEC_CYAN, width=1.0))
        self.y -= 9

    def add_accent_bar(self, width: float = 60.0, height: float = 2.2, gap_before: float = 0.0, gap_after: float = 17.0) -> None:
        self.y += gap_before
        self.ensure(height + gap_after)
        self.current.append(FillRect(MARGIN_LEFT, self.y - height, width, height, SOUTEC_CYAN))
        self.y -= height + gap_after

    def add_cover(self, title: str) -> None:
        # Portada: banda deep a sangre con kicker de marca (cyan), titulo (blanco), un
        # acento cyan corto y un subtitulo tenue. El kicker y el subtitulo son texto de
        # marca fijo: este renderer es especifico del informe de seguridad Soutec.
        title_style = STYLES["cover_title"]
        lines = wrap_text(title, title_style.size, PAGE_WIDTH - 2 * MARGIN_LEFT, title_style.font) or [title]
        kicker = "SOUTEC GROUP   ·   EVIDENCIA DE SEGURIDAD PARA IT"
        subtitle = "Informe técnico de revisión de seguridad   ·   Generado el " + datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M UTC")
        pad_top = 38.0
        kicker_to_title = 21.0
        title_lead = title_style.leading
        title_to_accent = 12.0
        accent_h = 2.4
        accent_to_sub = 15.0
        pad_bottom = 17.0
        band_height = (
            pad_top + kicker_to_title + len(lines) * title_lead
            + title_to_accent + accent_h + accent_to_sub + pad_bottom
        )
        band_bottom = PAGE_HEIGHT - band_height
        self.current.append(FillRect(0, band_bottom, PAGE_WIDTH, band_height, SOUTEC_DEEP))
        self.current.append(FillRect(0, band_bottom - 4, PAGE_WIDTH, 4, SOUTEC_CYAN))
        y = PAGE_HEIGHT - pad_top
        self.current.append(DrawLine(kicker, MARGIN_LEFT, y, "F2", 8.5, SOUTEC_CYAN))
        y -= kicker_to_title
        for line in lines:
            self.current.append(DrawLine(line, MARGIN_LEFT, y, title_style.font, title_style.size, title_style.color))
            y -= title_lead
        y += title_lead  # el bucle bajo una linea de mas; volvemos a la ultima baseline
        y -= title_to_accent + accent_h
        self.current.append(FillRect(MARGIN_LEFT, y, 66, accent_h, SOUTEC_CYAN))
        y -= accent_to_sub
        self.current.append(DrawLine(subtitle, MARGIN_LEFT, y, "F1", 9.5, mix(WHITE, SOUTEC_DEEP, 0.82)))
        self.y = band_bottom - 4 - 24
        self.cover_drawn = True

    def add_callout(self, label: str, body: str, bar: RGB, tint: RGB, label_color: RGB) -> None:
        body_style = STYLES["callout"]
        label_style = STYLES["callout_label"]
        pad_x = 13.0
        pad_top = 8.0
        pad_bottom = 9.0
        bar_w = 3.5
        label_to_body = 4.0
        text_x = MARGIN_LEFT + pad_x
        text_w = CONTENT_WIDTH - 2 * pad_x
        body_lines = wrap_text(body, body_style.size, text_w, body_style.font) or [""]
        content_h = label_style.leading + label_to_body + len(body_lines) * body_style.leading
        box_h = pad_top + content_h + pad_bottom
        self.space(body_style.space_before)
        self.ensure(box_h + 4)
        top = self.y
        bottom = top - box_h
        self.current.append(RoundRect(MARGIN_LEFT, bottom, CONTENT_WIDTH, box_h, 4.5, fill=tint))
        self.current.append(RoundRect(MARGIN_LEFT + 4, bottom + 5, bar_w, box_h - 10, bar_w / 2, fill=bar))
        label_baseline = top - pad_top - label_style.size * 0.78
        self.current.append(
            DrawLine(label.upper(), text_x, label_baseline, label_style.font, label_style.size, label_color)
        )
        body_baseline = label_baseline - label_style.leading * 0.15 - label_to_body - body_style.size * 0.78
        for idx, line in enumerate(body_lines):
            self.current.append(
                DrawLine(line, text_x, body_baseline - idx * body_style.leading, body_style.font, body_style.size, body_style.color)
            )
        self.y = bottom - body_style.space_after

    def add_wrapped(
        self,
        text: str,
        style: Style,
        prefix: str = "",
        hanging: float = 0.0,
    ) -> None:
        self.space(style.space_before)
        x = MARGIN_LEFT + style.indent
        width = CONTENT_WIDTH - style.indent
        # Solo el texto con negrita inline pasa por el camino de runs; el resto conserva
        # exactamente el layout previo (una linea = un DrawLine con la fuente del estilo).
        if "**" in text or "__" in text:
            lines = wrap_runs(prefix, text, style.size, width, style.font)
        else:
            flat = wrap_text(prefix + text, style.size, width, style.font) or [""]
            lines = [[(line, style.font)] for line in flat]
        total = len(lines) * style.leading + style.space_after
        self.ensure(total)
        for idx, line in enumerate(lines):
            draw_x = x if idx == 0 else x + hanging
            cx = draw_x
            for frag, font in line:
                if frag:
                    self.current.append(DrawLine(frag, cx, self.y, font, style.size, style.color))
                cx += display_width(frag, style.size, font)
            self.y -= style.leading
        self.y -= style.space_after

    def add_quote(self, text: str, style: Style) -> None:
        self.space(style.space_before)
        x = MARGIN_LEFT + style.indent
        width = CONTENT_WIDTH - style.indent
        lines = wrap_text(text, style.size, width, style.font) or [""]
        total = len(lines) * style.leading + style.space_after
        self.ensure(total)
        bar_top = self.y + 3
        for line in lines:
            self.current.append(DrawLine(line, x, self.y, style.font, style.size, style.color))
            self.y -= style.leading
        bar_bottom = self.y + style.leading - 3
        self.current.append(FillRect(MARGIN_LEFT - 2, bar_bottom, 3, max(bar_top - bar_bottom, style.leading), SOUTEC_CYAN))
        self.y -= style.space_after

    def add_code(self, lines: Sequence[str]) -> None:
        style = STYLES["code"]
        self.space(style.space_before)
        for raw in lines or [""]:
            wrapped = wrap_text(raw.expandtabs(4), style.size, CONTENT_WIDTH - 20, style.font)
            for line in wrapped or [""]:
                self.ensure(style.leading)
                self.current.append(
                    DrawLine(line, MARGIN_LEFT + style.indent, self.y, style.font, style.size, style.color)
                )
                self.y -= style.leading
        self.y -= style.space_after

    def add_table(self, rows: Sequence[Sequence[str]]) -> None:
        if not rows:
            return
        cols = max(len(row) for row in rows)
        # Una tabla ancha (6+ columnas, p.ej. la de trazabilidad) no cabe comoda en A4
        # vertical al cuerpo normal: se reduce el tipo solo para esa tabla puntual, para
        # que tokens cortos como "REMEDIATED" + su marcador entren sin invadir el margen.
        style = STYLES["table"]
        if cols >= 6:
            style = replace(style, size=6.8, leading=8.8)
        normalized = [list(row) + [""] * (cols - len(row)) for row in rows]
        widths = calculate_column_widths(normalized, CONTENT_WIDTH, style.size)
        self.space(style.space_before)
        ascent = style.size * 0.74
        top_pad = 3.0
        bottom_pad = 3.0
        for row_idx, row in enumerate(normalized):
            # En celdas de estado el marcador va antes del texto, asi que se descuenta
            # su ancho del espacio de envoltura para que el texto no invada la columna.
            cell_lines = []
            for i, cell in enumerate(row):
                avail = widths[i] - 8
                if row_idx != 0:
                    avail -= chip_extra(cell)
                cell_lines.append(wrap_text(cell, style.size, max(avail, 16), style.font) or [""])
            row_lines = max(len(c) for c in cell_lines)
            row_height = row_lines * style.leading + top_pad + bottom_pad
            self.ensure(row_height)
            is_header = row_idx == 0

            row_top = self.y
            row_bottom = self.y - row_height
            if is_header:
                self.current.append(FillRect(MARGIN_LEFT, row_bottom, CONTENT_WIDTH, row_height, SOUTEC_DEEP))
            elif row_idx % 2 == 0:
                self.current.append(FillRect(MARGIN_LEFT, row_bottom, CONTENT_WIDTH, row_height, ZEBRA_TINT))

            first_baseline = row_top - top_pad - ascent
            x = MARGIN_LEFT
            font = "F2" if is_header else style.font
            text_color = WHITE if is_header else style.color
            for col_idx, lines in enumerate(cell_lines):
                cell_x = x + 3
                chip = None if is_header else chip_style(row[col_idx])
                if chip is not None and len(lines) == 1 and lines[0]:
                    # Badge (pill) para estado/severidad de una sola linea: fondo tinte,
                    # punto de color solido y texto en carbon (siempre legible).
                    dot_color, bg = chip
                    text = lines[0]
                    tw = display_width(text, style.size, font)
                    pill_h = style.size + 3.4
                    pill_w = CHIP_PAD_X * 2 + CHIP_DOT + CHIP_GAP + tw
                    pill_bottom = first_baseline - (pill_h - ascent) / 2
                    self.current.append(RoundRect(cell_x, pill_bottom, pill_w, pill_h, pill_h / 2, fill=bg))
                    dot_y = pill_bottom + (pill_h - CHIP_DOT) / 2
                    self.current.append(
                        RoundRect(cell_x + CHIP_PAD_X, dot_y, CHIP_DOT, CHIP_DOT, CHIP_DOT / 2, fill=dot_color)
                    )
                    self.current.append(
                        DrawLine(text, cell_x + CHIP_PAD_X + CHIP_DOT + CHIP_GAP, first_baseline, font, style.size, SOUTEC_CARBON)
                    )
                    x += widths[col_idx]
                    continue
                if chip is not None:
                    # Fallback multilinea: punto de color redondeado + texto sin pill,
                    # para que un estado largo no se parta dentro del badge.
                    dot_y = first_baseline + (style.size * 0.24) - (MARKER_SIZE / 2)
                    self.current.append(RoundRect(cell_x, dot_y, MARKER_SIZE, MARKER_SIZE, MARKER_SIZE / 2, fill=chip[0]))
                    cell_x += MARKER_SIZE + 4
                for line_idx, line in enumerate(lines):
                    self.current.append(
                        DrawLine(
                            line,
                            cell_x,
                            first_baseline - (line_idx * style.leading),
                            font,
                            style.size,
                            text_color,
                        )
                    )
                x += widths[col_idx]
            self.y = row_bottom
            rule_color = SOUTEC_CYAN if is_header else RULE_GRAY
            rule_width = 1.1 if is_header else 0.5
            self.current.append(Rule(row_bottom + 1, color=rule_color, width=rule_width))
        self.y -= style.space_after


def clean_inline(text: str) -> str:
    text = re.sub(r"!\[([^\]]*)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r"\1 (\2)", text)
    text = re.sub(r"`([^`]+)`", r"\1", text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"\1", text)
    text = re.sub(r"__([^_]+)__", r"\1", text)
    text = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"\1", text)
    text = re.sub(r"(?<!_)_([^_]+)_(?!_)", r"\1", text)
    return text.strip()


def clean_markup(text: str) -> str:
    """Como clean_inline pero conserva **negrita**/__negrita__ y no recorta espacios.
    Se usa para trocear runs con formato inline: la negrita se maneja aparte en
    parse_inline_runs, y preservar los espacios en los bordes de cada run es lo que
    mantiene correcto el espaciado entre un tramo en negrita y el texto normal."""
    text = re.sub(r"!\[([^\]]*)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r"\1 (\2)", text)
    text = re.sub(r"`([^`]+)`", r"\1", text)
    text = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"\1", text)
    text = re.sub(r"(?<!_)_([^_]+)_(?!_)", r"\1", text)
    return text


def _afm_widths(spec: Sequence[Tuple[int, str]]) -> dict:
    table: dict = {}
    for width, chars in spec:
        for ch in chars:
            table[ch] = width
    return table


# Anchos AFM estandar (Adobe Core14), en 1/1000 de em. Permiten medir el texto con
# precision real en vez de un factor promedio: un factor unico sobreestima las
# minusculas (los parrafos cortaban antes del margen) y subestima las mayusculas
# ("REMEDIATED" se salia de su columna). F1/F4 comparten anchos (Helvetica y su
# oblicua); F2 es Helvetica-Bold; F3 (Courier) es monoespaciada.
HELVETICA_WIDTHS = _afm_widths([
    (278, " !,./:;I[\\]ft"),
    (191, "'"),
    (222, "ijl"),
    (260, "|"),
    (333, "()-`r"),
    (334, "{}"),
    (355, '"'),
    (389, "*"),
    (469, "^"),
    (500, "Jcksvxyz"),
    (556, "0123456789L_abdeghnopqu$#?"),
    (584, "+<=>~"),
    (611, "FTZ"),
    (667, "&ABEKPSVXY"),
    (722, "CDHNRUw"),
    (778, "GOQ"),
    (833, "Mm"),
    (889, "%"),
    (944, "W"),
    (1015, "@"),
])
HELVETICA_WIDTHS.update({"¿": 611, "¡": 333})  # ¿ ¡

HELVETICA_BOLD_WIDTHS = _afm_widths([
    (278, " ,.I\\ijl"),
    (238, "'"),
    (280, "|"),
    (333, "!()/:;-[]`ft"),
    (389, "*{}r"),
    (474, '"'),
    (500, "z"),
    (556, "0123456789J$#aceksvxy_"),
    (584, "+<=>^~"),
    (611, "?FLTZbdghnopqu"),
    (667, "ESVXY"),
    (722, "&ABCDHKNRU"),
    (778, "GOQw"),
    (833, "M"),
    (889, "%m"),
    (944, "W"),
    (975, "@"),
])
HELVETICA_BOLD_WIDTHS.update({"¿": 611, "¡": 333})  # ¿ ¡


def display_width(text: str, size: float, font: str) -> float:
    if font == "F3":  # Courier: monoespaciada, 600/1000
        return len(text) * size * 0.6
    table = HELVETICA_BOLD_WIDTHS if font == "F2" else HELVETICA_WIDTHS
    default = 611 if font == "F2" else 556
    total = 0
    for ch in text:
        width = table.get(ch)
        if width is None:
            # Acentos: mide por la letra base (á->a, ñ->n, í->i, ü->u...).
            base = unicodedata.normalize("NFD", ch)[:1]
            width = table.get(base, default)
        total += width
    return total * size / 1000.0


def split_long_token(token: str, size: float, max_width: float, font: str) -> List[str]:
    if display_width(token, size, font) <= max_width:
        return [token]
    result: List[str] = []
    current = ""
    for char in token:
        if current and display_width(current + char, size, font) > max_width:
            result.append(current)
            current = char
        else:
            current += char
    if current:
        result.append(current)
    return result


def wrap_text(text: str, size: float, max_width: float, font: str) -> List[str]:
    text = clean_inline(text)
    if text == "":
        return []
    tokens: List[str] = []
    for raw in re.split(r"\s+", text):
        tokens.extend(split_long_token(raw, size, max_width, font))
    lines: List[str] = []
    current = ""
    for token in tokens:
        candidate = token if not current else f"{current} {token}"
        if current and display_width(candidate, size, font) > max_width:
            lines.append(current)
            current = token
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines


# Negrita inline (**texto** / __texto__). El renderer aplana el resto del markup, pero la
# negrita si se dibuja: se trocea el texto en runs y se envuelve por fragmentos, cada uno
# con su fuente (F1 normal / F2 negrita). Un "fragmento de linea" es (texto, fuente).
Frag = Tuple[str, str]
INLINE_BOLD_RE = re.compile(r"\*\*(.+?)\*\*|__(.+?)__")


def parse_inline_runs(text: str) -> List[Tuple[str, bool]]:
    """Trocea el texto en runs (segmento, es_negrita) segun **...** / __...__."""
    runs: List[Tuple[str, bool]] = []
    pos = 0
    for m in INLINE_BOLD_RE.finditer(text):
        if m.start() > pos:
            runs.append((text[pos:m.start()], False))
        runs.append((m.group(1) if m.group(1) is not None else m.group(2), True))
        pos = m.end()
    if pos < len(text):
        runs.append((text[pos:], False))
    return [(clean_markup(seg), bold) for seg, bold in runs]


def _runs_to_words(prefix: str, runs: Sequence[Tuple[str, bool]], base_font: str) -> List[List[Frag]]:
    # Cada "palabra" es una lista de fragmentos (texto, fuente). Las palabras se separan
    # por espacios; un limite de run sin espacio funde fragmentos en la misma palabra, para
    # que "**APIs**:" quede pegado (negrita + ":" normal) sin espacio intermedio.
    seq: List[Frag] = []
    if prefix:
        seq.append((prefix, base_font))
    for seg, bold in runs:
        seq.append((seg, "F2" if bold else base_font))
    words: List[List[Frag]] = []
    cur: List[Frag] = []
    for seg, font in seq:
        for piece in re.split(r"(\s+)", seg):
            if piece == "":
                continue
            if piece.isspace():
                if cur:
                    words.append(cur)
                    cur = []
            else:
                cur.append((piece, font))
    if cur:
        words.append(cur)
    return words


def _word_width(word: Sequence[Frag], size: float) -> float:
    return sum(display_width(frag, size, font) for frag, font in word)


def _split_word_chars(word: Sequence[Frag], size: float, max_width: float) -> List[List[Frag]]:
    pieces: List[List[Frag]] = []
    cur: List[Frag] = []
    cur_w = 0.0
    for frag, font in word:
        for ch in frag:
            cw = display_width(ch, size, font)
            if cur and cur_w + cw > max_width:
                pieces.append(cur)
                cur = []
                cur_w = 0.0
            cur.append((ch, font))
            cur_w += cw
    if cur:
        pieces.append(cur)
    return pieces


def _merge_line(words: Sequence[Sequence[Frag]], base_font: str) -> List[Frag]:
    frags: List[Frag] = []
    for wi, word in enumerate(words):
        if wi > 0:
            frags.append((" ", base_font))
        frags.extend(word)
    merged: List[Frag] = []
    for frag, font in frags:
        if merged and merged[-1][1] == font:
            merged[-1] = (merged[-1][0] + frag, font)
        else:
            merged.append((frag, font))
    return merged


def wrap_runs(prefix: str, text: str, size: float, max_width: float, base_font: str) -> List[List[Frag]]:
    """Envuelve texto con negrita inline; cada linea es una lista de fragmentos (texto,
    fuente) ya fusionados por fuente. Solo se invoca cuando el texto trae ** o __."""
    runs = parse_inline_runs(text)
    words = _runs_to_words(prefix, runs, base_font)
    space_w = display_width(" ", size, base_font)
    lines: List[List[List[Frag]]] = []
    cur: List[List[Frag]] = []
    cur_w = 0.0
    for word in words:
        ww = _word_width(word, size)
        if ww > max_width:
            if cur:
                lines.append(cur)
                cur = []
                cur_w = 0.0
            for piece in _split_word_chars(word, size, max_width):
                lines.append([piece])
            continue
        if not cur:
            cur = [word]
            cur_w = ww
        elif cur_w + space_w + ww <= max_width:
            cur.append(word)
            cur_w += space_w + ww
        else:
            lines.append(cur)
            cur = [word]
            cur_w = ww
    if cur:
        lines.append(cur)
    return [_merge_line(w, base_font) for w in lines] or [[("", base_font)]]


def chip_style(cell_text: str) -> Optional[Tuple[RGB, RGB]]:
    """(color solido, color tinte) del badge si la celda es un estado o severidad
    conocidos; None en caso contrario. El color solido es el punto; el tinte, el fondo."""
    key = clean_inline(cell_text).strip().lower()
    if key in POSITIVE_STATUS:
        return (SOUTEC_GREEN, GREEN_BADGE)
    if key in NEGATIVE_STATUS:
        return (SOUTEC_MAGENTA, MAGENTA_BADGE)
    if key in WARNING_STATUS:
        return (SOUTEC_YELLOW, YELLOW_BADGE)
    if key in SEVERITY_DANGER:
        return (SOUTEC_MAGENTA, MAGENTA_BADGE)
    if key in SEVERITY_WARN:
        return (SOUTEC_YELLOW, YELLOW_BADGE)
    if key in SEVERITY_INFO:
        return (SOUTEC_CYAN, CYAN_BADGE)
    if key in SEVERITY_NEUTRAL:
        return (SOUTEC_CARBON, CARBON_BADGE)
    return None


def chip_extra(cell_text: str) -> float:
    """Ancho horizontal que reserva el badge si la celda es un estado/severidad conocido."""
    return CHIP_EXTRA if chip_style(cell_text) is not None else 0.0


def calculate_column_widths(rows: Sequence[Sequence[str]], total: float, size: float) -> List[float]:
    # Reparto en dos capas: primero un minimo por columna que protege la palabra mas
    # larga (para que un token corto como "REMEDIATED" nunca se parta letra a letra),
    # y luego el sobrante se distribuye hacia las columnas que mas contenido tienen.
    # Solo los tokens mas anchos que WORD_CAP (rutas de archivo largas) pueden partirse.
    cols = len(rows[0])
    word_cap = 84.0
    pad = 10.0
    min_w: List[float] = []
    pref_w: List[float] = []
    for i in range(cols):
        widest_word = 0.0
        widest_cell = 0.0
        for row in rows:
            cell = clean_inline(row[i])
            extra = chip_extra(cell)  # el badge va pegado al primer token
            widest_cell = max(widest_cell, display_width(cell, size, "F1") + extra)
            for token in re.split(r"\s+", cell):
                widest_word = max(widest_word, display_width(token, size, "F1") + extra)
        mn = max(38.0, min(widest_word + pad, word_cap))
        min_w.append(mn)
        pref_w.append(max(mn, min(widest_cell + pad, 190.0)))
    base = sum(min_w)
    if base >= total:
        scale = total / base
        return [w * scale for w in min_w]
    slack = [pref_w[i] - min_w[i] for i in range(cols)]
    slack_total = sum(slack)
    extra_space = total - base
    if slack_total <= 0:
        return [w + extra_space / cols for w in min_w]
    return [min_w[i] + extra_space * (slack[i] / slack_total) for i in range(cols)]


def is_table_separator(line: str) -> bool:
    cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
    return bool(cells) and all(re.fullmatch(r":?-{3,}:?", cell or "") for cell in cells)


def parse_markdown(text: str) -> List[Tuple[str, object]]:
    # Los comentarios HTML (<!-- ... -->) son guias en el Markdown fuente y no deben
    # aparecer en el PDF. Se quitan antes de trocear (soporta comentarios multilinea).
    text = re.sub(r"<!--.*?-->", "", text, flags=re.DOTALL)
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    blocks: List[Tuple[str, object]] = []
    paragraph: List[str] = []
    in_code = False
    code_lines: List[str] = []
    i = 0

    def flush_paragraph() -> None:
        nonlocal paragraph
        if paragraph:
            blocks.append(("paragraph", " ".join(part.strip() for part in paragraph if part.strip())))
            paragraph = []

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        if stripped.startswith("```"):
            flush_paragraph()
            if in_code:
                blocks.append(("code", code_lines[:]))
                code_lines.clear()
                in_code = False
            else:
                in_code = True
            i += 1
            continue
        if in_code:
            code_lines.append(line)
            i += 1
            continue
        if stripped == "":
            flush_paragraph()
            i += 1
            continue
        if re.fullmatch(r"-{3,}", stripped):
            flush_paragraph()
            blocks.append(("rule", None))
            i += 1
            continue
        heading = re.match(r"^(#{1,6})\s+(.+)$", stripped)
        if heading:
            flush_paragraph()
            blocks.append((f"h{len(heading.group(1))}", heading.group(2)))
            i += 1
            continue
        if "|" in line and i + 1 < len(lines) and is_table_separator(lines[i + 1]):
            flush_paragraph()
            rows: List[List[str]] = []
            rows.append([clean_inline(c.strip()) for c in line.strip().strip("|").split("|")])
            i += 2
            while i < len(lines) and "|" in lines[i] and lines[i].strip():
                rows.append([clean_inline(c.strip()) for c in lines[i].strip().strip("|").split("|")])
                i += 1
            blocks.append(("table", rows))
            continue
        bullet = re.match(r"^\s*[-*+]\s+(.+)$", line)
        if bullet:
            flush_paragraph()
            blocks.append(("bullet", bullet.group(1)))
            i += 1
            continue
        numbered = re.match(r"^\s*(\d+)\.\s+(.+)$", line)
        if numbered:
            flush_paragraph()
            blocks.append(("number", (numbered.group(1), numbered.group(2))))
            i += 1
            continue
        quote = re.match(r"^\s*>\s?(.*)$", line)
        if quote:
            flush_paragraph()
            qlines = [quote.group(1)]
            i += 1
            while i < len(lines):
                m = re.match(r"^\s*>\s?(.*)$", lines[i])
                if not m:
                    break
                qlines.append(m.group(1))
                i += 1
            blocks.append(("blockquote", qlines))
            continue
        paragraph.append(stripped)
        i += 1

    flush_paragraph()
    if in_code:
        blocks.append(("code", code_lines))
    return blocks


def layout_markdown(blocks: Iterable[Tuple[str, object]]) -> PdfLayout:
    layout = PdfLayout()
    blocks = list(blocks)
    for idx, (kind, payload) in enumerate(blocks):
        if kind == "h1":
            if not layout.cover_drawn:
                layout.add_cover(str(payload))
            else:
                layout.add_wrapped(str(payload), STYLES["title"])
        elif kind == "h2":
            if layout.y < MARGIN_BOTTOM + 95:
                layout.new_page()
            h2 = STYLES["h2"]
            layout.add_wrapped(str(payload), h2)
            # Barra de acento pegada al titulo. add_wrapped baja una linea completa
            # (leading) mas space_after tras la ultima linea, lo que dejaba la barra
            # flotando muy abajo; la subimos para que quede ~0.65x del cap-height
            # bajo el texto del titulo. El hueco bajo la barra depende de que sigue:
            # una tabla arranca justo en el cursor (su banda no deja que el ascendente
            # absorba el gap), asi que recibe menos que un parrafo para que el espacio
            # se vea igual en ambos casos.
            next_kind = blocks[idx + 1][0] if idx + 1 < len(blocks) else None
            bar_gap_after = 9.0 if next_kind == "table" else 17.0
            layout.add_accent_bar(
                gap_before=h2.leading + h2.space_after - h2.size * 0.65,
                gap_after=bar_gap_after,
            )
        elif kind == "h3":
            layout.add_wrapped(str(payload), STYLES["h3"])
        elif kind in {"h4", "h5", "h6"}:
            layout.add_wrapped(str(payload), STYLES["h4"])
        elif kind == "paragraph":
            layout.add_wrapped(str(payload), STYLES["body"])
        elif kind == "bullet":
            layout.add_wrapped(str(payload), STYLES["bullet"], prefix="• ", hanging=10)
        elif kind == "number":
            number, text = payload  # type: ignore[misc]
            prefix = f"{number}. "
            layout.add_wrapped(str(text), STYLES["bullet"], prefix=prefix, hanging=12)
        elif kind == "blockquote":
            qlines = list(payload)  # type: ignore[arg-type]
            m = CALLOUT_RE.match(qlines[0]) if qlines else None
            spec = CALLOUT_TYPES.get(m.group(1).upper()) if m else None
            if m and spec:
                default_label, bar, tint, label_color = spec
                rest = m.group(2).strip()
                body_lines = qlines[1:]
                if rest and not body_lines:
                    title, body_src = default_label, [rest]
                else:
                    title, body_src = (rest or default_label), body_lines
                body = " ".join(s.strip() for s in body_src if s.strip())
                layout.add_callout(title, body, bar, tint, label_color)
            else:
                text = " ".join(s.strip() for s in qlines if s.strip())
                layout.add_quote(text, STYLES["quote"])
        elif kind == "code":
            layout.add_code(payload)  # type: ignore[arg-type]
        elif kind == "table":
            layout.add_table(payload)  # type: ignore[arg-type]
        elif kind == "rule":
            layout.add_rule()
    return layout


def pdf_escape(text: str) -> bytes:
    replacements = {
        "‘": "'",
        "’": "'",
        "“": '"',
        "”": '"',
        "–": "-",
        "—": "-",
        "…": "...",
        "•": "•",
        " ": " ",
    }
    for source, target in replacements.items():
        text = text.replace(source, target)
    encoded = text.encode("cp1252", errors="replace")
    return encoded.replace(b"\\", b"\\\\").replace(b"(", b"\\(").replace(b")", b"\\)")


def _color_op(color: RGB, stroke: bool = False) -> bytes:
    op = b"RG" if stroke else b"rg"
    return b"%.3f %.3f %.3f %s\n" % (color[0], color[1], color[2], op)


def _round_rect_path(item: "RoundRect") -> bytes:
    # Rectangulo de esquinas redondeadas via 4 curvas Bezier (el punto de esquina hace de
    # ambos puntos de control: aproximacion de cuarto de circulo suficiente para badges).
    rad = min(item.r, item.w / 2, item.h / 2)
    x0, y0 = item.x, item.y
    x1, y1 = item.x + item.w, item.y + item.h
    parts: List[bytes] = []
    if item.fill is not None:
        parts.append(_color_op(item.fill))
    if item.stroke is not None:
        parts.append(_color_op(item.stroke, stroke=True))
        parts.append(b"%.2f w\n" % item.line_width)
    parts.append(b"%.2f %.2f m\n" % (x0 + rad, y0))
    parts.append(b"%.2f %.2f l\n" % (x1 - rad, y0))
    parts.append(b"%.2f %.2f %.2f %.2f %.2f %.2f c\n" % (x1, y0, x1, y0, x1, y0 + rad))
    parts.append(b"%.2f %.2f l\n" % (x1, y1 - rad))
    parts.append(b"%.2f %.2f %.2f %.2f %.2f %.2f c\n" % (x1, y1, x1, y1, x1 - rad, y1))
    parts.append(b"%.2f %.2f l\n" % (x0 + rad, y1))
    parts.append(b"%.2f %.2f %.2f %.2f %.2f %.2f c\n" % (x0, y1, x0, y1, x0, y1 - rad))
    parts.append(b"%.2f %.2f l\n" % (x0, y0 + rad))
    parts.append(b"%.2f %.2f %.2f %.2f %.2f %.2f c\n" % (x0, y0, x0, y0, x0 + rad, y0))
    parts.append(b"h\n")
    if item.fill is not None and item.stroke is not None:
        parts.append(b"B\n")
    elif item.stroke is not None:
        parts.append(b"S\n")
    else:
        parts.append(b"f\n")
    return b"".join(parts)


def build_page_stream(items: Sequence[object], page_number: int, page_count: int) -> bytes:
    parts: List[bytes] = []
    for item in items:
        if isinstance(item, FillRect):
            parts.append(_color_op(item.color))
            parts.append(b"%.2f %.2f %.2f %.2f re f\n" % (item.x, item.y, item.w, item.h))
        elif isinstance(item, RoundRect):
            parts.append(_round_rect_path(item))
        elif isinstance(item, DrawLine):
            parts.append(_color_op(item.color))
            parts.append(
                b"BT /%s %.2f Tf 1 0 0 1 %.2f %.2f Tm (%s) Tj ET\n"
                % (
                    item.font.encode("ascii"),
                    item.size,
                    item.x,
                    item.y,
                    pdf_escape(item.text),
                )
            )
        elif isinstance(item, Rule):
            parts.append(_color_op(item.color, stroke=True))
            parts.append(
                b"%.2f w %.2f %.2f m %.2f %.2f l S\n"
                % (item.width, item.x0, item.y, item.x1, item.y)
            )
    # Acento superior en paginas de contenido (la portada ya tiene su banda): linea gris
    # fina con un tramo cyan a la izquierda, en espejo con la regla del footer.
    if page_number > 1:
        parts.append(_color_op(RULE_GRAY, stroke=True))
        parts.append(
            b"0.6 w %.2f %.2f m %.2f %.2f l S\n"
            % (MARGIN_LEFT, PAGE_HEIGHT - 38, PAGE_WIDTH - MARGIN_RIGHT, PAGE_HEIGHT - 38)
        )
        parts.append(_color_op(SOUTEC_CYAN))
        parts.append(b"%.2f %.2f 30 2 re f\n" % (MARGIN_LEFT, PAGE_HEIGHT - 39))
    parts.append(_color_op(RULE_GRAY, stroke=True))
    parts.append(b"0.6 w %.2f 34 m %.2f 34 l S\n" % (MARGIN_LEFT, PAGE_WIDTH - MARGIN_RIGHT))
    footer = f"Evidencia de revision de seguridad  |  Pagina {page_number} de {page_count}"
    parts.append(_color_op(SOUTEC_CARBON))
    parts.append(
        b"BT /F1 7 Tf 1 0 0 1 %.2f 22 Tm (%s) Tj ET\n"
        % (MARGIN_LEFT, pdf_escape(footer))
    )
    return b"".join(parts)


def build_pdf(layout: PdfLayout, title: str) -> bytes:
    objects: List[bytes] = []

    def add_object(body: bytes) -> int:
        objects.append(body)
        return len(objects)

    catalog_id = add_object(b"")
    pages_id = add_object(b"")
    font_regular = add_object(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")
    font_bold = add_object(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>")
    font_mono = add_object(b"<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>")
    font_italic = add_object(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>")

    page_ids: List[int] = []
    for page_no, items in enumerate(layout.pages, start=1):
        stream = build_page_stream(items, page_no, len(layout.pages))
        content_id = add_object(b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"endstream")
        page_body = (
            (
                "<< /Type /Page /Parent %d 0 R /MediaBox [0 0 %.2f %.2f] "
                "/Resources << /Font << /F1 %d 0 R /F2 %d 0 R /F3 %d 0 R /F4 %d 0 R >> >> "
                "/Contents %d 0 R >>"
            )
            % (
                pages_id,
                PAGE_WIDTH,
                PAGE_HEIGHT,
                font_regular,
                font_bold,
                font_mono,
                font_italic,
                content_id,
            )
        ).encode("ascii")
        page_id = add_object(page_body)
        page_ids.append(page_id)

    kids = " ".join(f"{pid} 0 R" for pid in page_ids)
    objects[pages_id - 1] = f"<< /Type /Pages /Kids [{kids}] /Count {len(page_ids)} >>".encode("ascii")
    objects[catalog_id - 1] = f"<< /Type /Catalog /Pages {pages_id} 0 R >>".encode("ascii")

    now = datetime.now(timezone.utc).strftime("D:%Y%m%d%H%M%SZ")
    info_id = add_object(
        b"<< /Title (%s) /Creator (Claude Code Security Approval Harness) /Producer (Dependency-free Python PDF renderer) /CreationDate (%s) >>"
        % (pdf_escape(title), now.encode("ascii"))
    )

    output = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for idx, obj in enumerate(objects, start=1):
        offsets.append(len(output))
        output.extend(f"{idx} 0 obj\n".encode("ascii"))
        output.extend(obj)
        output.extend(b"\nendobj\n")
    xref_offset = len(output)
    output.extend(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
    output.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        output.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
    output.extend(
        (
            f"trailer\n<< /Size {len(objects) + 1} /Root {catalog_id} 0 R /Info {info_id} 0 R >>\n"
            f"startxref\n{xref_offset}\n%%EOF\n"
        ).encode("ascii")
    )
    return bytes(output)


def extract_title(markdown: str, fallback: str) -> str:
    match = re.search(r"^#\s+(.+)$", markdown, flags=re.MULTILINE)
    return clean_inline(match.group(1)) if match else fallback


def main(argv: Sequence[str]) -> int:
    if len(argv) != 3:
        print("Usage: render_security_report.py input.md output.pdf", file=sys.stderr)
        return 2
    source = Path(argv[1]).expanduser().resolve()
    target = Path(argv[2]).expanduser().resolve()
    if not source.is_file():
        print(f"Input Markdown not found: {source}", file=sys.stderr)
        return 3
    if source.suffix.lower() not in {".md", ".markdown"}:
        print("Input must be a Markdown file.", file=sys.stderr)
        return 4
    if target.suffix.lower() != ".pdf":
        print("Output must use a .pdf extension.", file=sys.stderr)
        return 5
    markdown = source.read_text(encoding="utf-8")
    if not markdown.strip():
        print("Input Markdown is empty.", file=sys.stderr)
        return 6
    blocks = parse_markdown(markdown)
    layout = layout_markdown(blocks)
    pdf = build_pdf(layout, extract_title(markdown, source.stem))
    target.parent.mkdir(parents=True, exist_ok=True)
    temp = target.with_suffix(target.suffix + ".tmp")
    temp.write_bytes(pdf)
    if not pdf.startswith(b"%PDF-") or len(pdf) < 800:
        temp.unlink(missing_ok=True)
        print("Generated PDF failed validation.", file=sys.stderr)
        return 7
    temp.replace(target)
    print(f"Generated {target} ({len(pdf)} bytes, {len(layout.pages)} pages)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
