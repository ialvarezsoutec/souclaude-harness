#!/usr/bin/env python3
"""Render a readable Markdown security report as a dependency-free PDF.

Usage:
    python3 render_security_report.py input.md output.pdf

The renderer intentionally supports a practical Markdown subset used by the
security report template: headings, paragraphs, bullets, numbered lists,
blockquotes, fenced code blocks, horizontal rules, and pipe tables.
"""

from __future__ import annotations

import re
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, List, Sequence, Tuple

PAGE_WIDTH = 595.28  # A4 points
PAGE_HEIGHT = 841.89
MARGIN_LEFT = 52.0
MARGIN_RIGHT = 52.0
MARGIN_TOP = 54.0
MARGIN_BOTTOM = 48.0
CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT


@dataclass(frozen=True)
class Style:
    font: str
    size: float
    leading: float
    space_before: float = 0.0
    space_after: float = 0.0
    indent: float = 0.0


STYLES = {
    "title": Style("F2", 20, 25, 0, 16),
    "h2": Style("F2", 15, 19, 12, 8),
    "h3": Style("F2", 12, 16, 9, 5),
    "h4": Style("F2", 10.5, 14, 7, 4),
    "body": Style("F1", 9.5, 13, 0, 6),
    "bullet": Style("F1", 9.5, 13, 0, 3, 14),
    "quote": Style("F4", 9.2, 13, 3, 6, 16),
    "code": Style("F3", 8.2, 10.5, 4, 7, 10),
    "table": Style("F1", 7.8, 10, 3, 6),
    "small": Style("F1", 7.5, 9),
}


@dataclass
class DrawLine:
    text: str
    x: float
    y: float
    font: str
    size: float


@dataclass
class Rule:
    y: float


class PdfLayout:
    def __init__(self) -> None:
        self.pages: List[List[object]] = [[]]
        self.page_no = 1
        self.y = PAGE_HEIGHT - MARGIN_TOP

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
        self.current.append(Rule(self.y - 2))
        self.y -= 9

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
        lines = wrap_text(prefix + text, style.size, width, style.font)
        if not lines:
            lines = [""]
        total = len(lines) * style.leading + style.space_after
        self.ensure(total)
        for idx, line in enumerate(lines):
            draw_x = x if idx == 0 else x + hanging
            self.current.append(DrawLine(line, draw_x, self.y, style.font, style.size))
            self.y -= style.leading
        self.y -= style.space_after

    def add_code(self, lines: Sequence[str]) -> None:
        style = STYLES["code"]
        self.space(style.space_before)
        for raw in lines or [""]:
            wrapped = wrap_text(raw.expandtabs(4), style.size, CONTENT_WIDTH - 20, style.font)
            for line in wrapped or [""]:
                self.ensure(style.leading)
                self.current.append(
                    DrawLine(line, MARGIN_LEFT + style.indent, self.y, style.font, style.size)
                )
                self.y -= style.leading
        self.y -= style.space_after

    def add_table(self, rows: Sequence[Sequence[str]]) -> None:
        if not rows:
            return
        style = STYLES["table"]
        cols = max(len(row) for row in rows)
        normalized = [list(row) + [""] * (cols - len(row)) for row in rows]
        widths = calculate_column_widths(normalized, CONTENT_WIDTH, style.size)
        self.space(style.space_before)
        for row_idx, row in enumerate(normalized):
            cell_lines = [wrap_text(cell, style.size, widths[i] - 8, style.font) or [""] for i, cell in enumerate(row)]
            row_lines = max(len(c) for c in cell_lines)
            row_height = row_lines * style.leading + 5
            self.ensure(row_height + (4 if row_idx == 0 else 0))
            x = MARGIN_LEFT
            font = "F2" if row_idx == 0 else style.font
            for col_idx, lines in enumerate(cell_lines):
                for line_idx, line in enumerate(lines):
                    self.current.append(
                        DrawLine(
                            line,
                            x + 3,
                            self.y - (line_idx * style.leading),
                            font,
                            style.size,
                        )
                    )
                x += widths[col_idx]
            self.y -= row_height
            self.current.append(Rule(self.y + 2))
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


def display_width(text: str, size: float, font: str) -> float:
    factor = 0.52
    if font == "F3":
        factor = 0.60
    elif font == "F2":
        factor = 0.55
    return len(text) * size * factor


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


def calculate_column_widths(rows: Sequence[Sequence[str]], total: float, size: float) -> List[float]:
    cols = len(rows[0])
    raw: List[float] = []
    for i in range(cols):
        longest = max((min(display_width(clean_inline(row[i]), size, "F1") + 12, 180) for row in rows), default=60)
        raw.append(max(55, longest))
    scale = min(1.0, total / sum(raw))
    widths = [w * scale for w in raw]
    if sum(widths) < total:
        extra = (total - sum(widths)) / cols
        widths = [w + extra for w in widths]
    return widths


def is_table_separator(line: str) -> bool:
    cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
    return bool(cells) and all(re.fullmatch(r":?-{3,}:?", cell or "") for cell in cells)


def parse_markdown(text: str) -> List[Tuple[str, object]]:
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
            blocks.append(("quote", quote.group(1)))
            i += 1
            continue
        paragraph.append(stripped)
        i += 1

    flush_paragraph()
    if in_code:
        blocks.append(("code", code_lines))
    return blocks


def layout_markdown(blocks: Iterable[Tuple[str, object]]) -> PdfLayout:
    layout = PdfLayout()
    for kind, payload in blocks:
        if kind == "h1":
            layout.add_wrapped(str(payload), STYLES["title"])
        elif kind == "h2":
            if layout.y < MARGIN_BOTTOM + 95:
                layout.new_page()
            layout.add_wrapped(str(payload), STYLES["h2"])
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
        elif kind == "quote":
            layout.add_wrapped(str(payload), STYLES["quote"], prefix="| ", hanging=5)
        elif kind == "code":
            layout.add_code(payload)  # type: ignore[arg-type]
        elif kind == "table":
            layout.add_table(payload)  # type: ignore[arg-type]
        elif kind == "rule":
            layout.add_rule()
    return layout


def pdf_escape(text: str) -> bytes:
    replacements = {
        "\u2018": "'",
        "\u2019": "'",
        "\u201c": '"',
        "\u201d": '"',
        "\u2013": "-",
        "\u2014": "-",
        "\u2026": "...",
        "\u2022": "•",
        "\u00a0": " ",
    }
    for source, target in replacements.items():
        text = text.replace(source, target)
    encoded = text.encode("cp1252", errors="replace")
    return encoded.replace(b"\\", b"\\\\").replace(b"(", b"\\(").replace(b")", b"\\)")


def build_page_stream(items: Sequence[object], page_number: int, page_count: int) -> bytes:
    parts: List[bytes] = []
    for item in items:
        if isinstance(item, DrawLine):
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
            parts.append(
                b"0.72 G 0.5 w %.2f %.2f m %.2f %.2f l S\n"
                % (MARGIN_LEFT, item.y, PAGE_WIDTH - MARGIN_RIGHT, item.y)
            )
    footer = f"Security review evidence  |  Page {page_number} of {page_count}"
    parts.append(
        b"BT /F1 7 Tf 1 0 0 1 %.2f 24 Tm (%s) Tj ET\n"
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
