import pc from 'picocolors'
import { isCI } from '../../ui.js'

// Este adaptador decide QUE puede dibujar el renderer: TTY, color, unicode,
// dimensiones. Reglas duras sobre los juegos de glifos:
// - Nada de emojis: el ancho varia entre Windows Terminal (2), VS Code (2) y
//   conhost legacy (1 o mojibake), y las secuencias ZWJ cuentan como 1 grafema
//   pero se renderizan con anchos distintos segun la fuente. Un emoji mal
//   medido corre toda la fila.
// - Nada de marco doble ni redondeado (╔ ═ ╭ ╰): el redondeado no existe en
//   varias fuentes de Windows y sale como caja vacia.
// - Nada de ✓ ✗ ● ○ ▶: todos ambiguous width.
// - Nada de braille (⠿): fuente-dependiente en Windows.

// Umbrales de ancho para decidir cuanto detalle entra en la fila.
const BREAKPOINT_WIDE = 100
const BREAKPOINT_NORMAL = 80

function detectUnicode() {
  if (process.env.SOUCLAUDE_ASCII === '1') return false
  if (process.env.WT_SESSION) return true // Windows Terminal
  if (process.env.TERM_PROGRAM === 'vscode') return true
  if (process.platform !== 'win32') return process.env.TERM !== 'dumb'
  // conhost legacy: sin WT_SESSION ni VS Code, postura conservadora.
  // Un panel ASCII feo es infinitamente mejor que uno con "Ôöî" en cada borde.
  return process.env.ConEmuANSI === 'ON'
}

function breakpointFor(cols) {
  if (cols >= BREAKPOINT_WIDE) return 'wide'
  if (cols >= BREAKPOINT_NORMAL) return 'normal'
  return 'narrow'
}

export function detectCaps({ overrides = {} } = {}) {
  const tty = process.stdout.isTTY === true
  const cols = process.stdout.columns ?? 80
  const rows = process.stdout.rows ?? 24

  const caps = {
    tty,
    color: pc.isColorSupported,
    unicode: detectUnicode(),
    cols,
    rows,
    ci: isCI(),
    breakpoint: breakpointFor(cols),
  }

  return { ...caps, ...overrides }
}

// Subconjunto seguro en Windows Terminal, VS Code, iTerm y gnome-terminal
// (U+2500-U+2524 para el marco).
export const UNICODE_CHARS = {
  frame: { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│', ml: '├', mr: '┤' },
  bar: { full: '█', half: '▓', empty: '░' },
  sparkline: ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'],
  // "en duda" usaba ◐, pero es ambiguous width: en una terminal con locale CJK
  // se renderiza a 2 celdas y desalinea la fila. Se prefiere alineacion
  // garantizada antes que un glifo bonito, asi que se reusa "~" tambien aca.
  status: { running: '>', unsure: '~', done: '.' },
  separator: '·',
  ellipsis: '…',
  arrow: '->',
}

export const ASCII_CHARS = {
  frame: { tl: '+', tr: '+', bl: '+', br: '+', h: '-', v: '|', ml: '+', mr: '+' },
  bar: { full: '#', half: '=', empty: '.' },
  sparkline: ['_', '.', '-', '~', '=', '+', '*', '#'],
  status: { running: '>', unsure: '~', done: '-' },
  separator: '-',
  ellipsis: '...',
  arrow: '->',
}

export function charsFor(caps) {
  return caps.unicode ? UNICODE_CHARS : ASCII_CHARS
}
