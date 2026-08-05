// Dominio puro: formateo de texto, columnas y valores para el panel del monitor de tokens.
// Cero imports externos (ni node:*, ni paquetes). Produce texto plano, sin ANSI.
// El renderer aplica color después de truncar/rellenar — truncar sobre texto plano, colorear después.

// --- ancho ---

const REGEX_ANSI = /\x1b\[[0-9;]*m/g;

/** Code points combinantes/formato: ancho 0 (marcas diacríticas, ZWJ, VS16, BOM, etc). */
function esAnchoCero(cp) {
  return (
    (cp >= 0x0300 && cp <= 0x036f) ||
    (cp >= 0x200b && cp <= 0x200f) ||
    (cp >= 0x2060 && cp <= 0x206f) ||
    (cp >= 0xfe00 && cp <= 0xfe0f) ||
    cp === 0xfeff
  );
}

/** Code points "wide" (CJK, emoji, etc): ancho 2. Lista mínima suficiente, no exhaustiva. */
function esAnchoDoble(cp) {
  return (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0x303e) ||
    (cp >= 0x3041 && cp <= 0x33ff) ||
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0xa000 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe6f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f300 && cp <= 0x1f9ff) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  );
}

/** Ancho de un único code point (string de un solo carácter Unicode). */
function anchoDeCodePoint(ch) {
  const cp = ch.codePointAt(0);
  if (esAnchoCero(cp)) return 0;
  if (esAnchoDoble(cp)) return 2;
  return 1;
}

/** Ancho visual real de una cadena: ignora ANSI, cuenta celdas de terminal (no unidades UTF-16). */
export function anchoVisual(str) {
  if (typeof str !== 'string' || str.length === 0) return 0;
  const sinAnsi = str.replace(REGEX_ANSI, '');
  let ancho = 0;
  for (const ch of sinAnsi) {
    ancho += anchoDeCodePoint(ch);
  }
  return ancho;
}

/**
 * Trunca por ancho visual, dejando espacio para la elipsis dentro del presupuesto.
 * Nunca excede `ancho`. Si un carácter de ancho 2 no entra completo, corta antes
 * y rellena con un espacio para que el resultado dé el ancho exacto.
 */
export function truncar(str, ancho, { elipsis = '…' } = {}) {
  if (typeof str !== 'string') str = '';
  if (ancho <= 0) return '';

  const sinAnsi = str.replace(REGEX_ANSI, '');
  const anchoTotal = anchoVisual(sinAnsi);
  if (anchoTotal <= ancho) return sinAnsi;

  const anchoElipsis = anchoVisual(elipsis);

  if (ancho <= anchoElipsis) {
    // No hay presupuesto para contenido. Si la elipsis entra exacta (caso típico:
    // ancho 1, elipsis '…'), se devuelve sola; si no entra, se rellena con espacios
    // para no exceder `ancho`.
    return ancho === anchoElipsis ? elipsis : ' '.repeat(ancho);
  }

  const presupuesto = ancho - anchoElipsis;
  let acumulado = '';
  let anchoAcumulado = 0;
  for (const ch of sinAnsi) {
    const w = anchoDeCodePoint(ch);
    if (anchoAcumulado + w > presupuesto) {
      // Un carácter de ancho 2 no entra completo: se corta antes y se rellena con espacio.
      if (anchoAcumulado < presupuesto) {
        acumulado += ' '.repeat(presupuesto - anchoAcumulado);
        anchoAcumulado = presupuesto;
      }
      break;
    }
    acumulado += ch;
    anchoAcumulado += w;
  }
  return acumulado + elipsis;
}

/** Rellena a la derecha (texto + espacios) hasta `ancho` celdas visuales. */
export function rellenarDerecha(str, ancho) {
  if (typeof str !== 'string') str = '';
  const w = anchoVisual(str);
  if (w >= ancho) return str;
  return str + ' '.repeat(ancho - w);
}

/** Rellena a la izquierda (espacios + texto) hasta `ancho` celdas visuales. */
export function rellenarIzquierda(str, ancho) {
  if (typeof str !== 'string') str = '';
  const w = anchoVisual(str);
  if (w >= ancho) return str;
  return ' '.repeat(ancho - w) + str;
}

/**
 * Sanea texto de origen externo (títulos, ramas, nombres de proyecto) antes de
 * meterlo en una celda. Sin esto, un emoji o carácter de control corre la fila
 * y rompe la alineación de toda la tabla.
 */
export function sanearCelda(str) {
  if (typeof str !== 'string') return '';
  return str
    .normalize('NFC')
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .replace(/\p{Extended_Pictographic}/gu, '·')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Símbolo/constante para que una celda absorba el ancho sobrante en `columnas`. */
export const RESTO = -1;

/**
 * Arma una fila de columnas con ancho visual total exacto `anchoTotal`.
 * `celdas`: [{ texto, ancho, alinear: 'i'|'d' }]. Una celda puede declarar `ancho: RESTO`
 * para absorber el espacio sobrante (tras separadores de 1 celda entre columnas).
 * Siempre devuelve exactamente `anchoTotal` de ancho visual.
 */
export function columnas(celdas, anchoTotal) {
  if (!Array.isArray(celdas) || celdas.length === 0 || anchoTotal <= 0) {
    return anchoTotal > 0 ? ' '.repeat(anchoTotal) : '';
  }

  const n = celdas.length;
  const anchoSeparadores = n - 1; // un espacio entre cada par de columnas
  const anchoDisponible = Math.max(0, anchoTotal - anchoSeparadores);

  const indiceResto = celdas.findIndex((c) => c.ancho === RESTO);
  const anchosFijos = celdas.reduce(
    (acc, c, i) => acc + (i === indiceResto ? 0 : Math.max(0, c.ancho || 0)),
    0
  );

  const anchos = celdas.map((c, i) => {
    if (i === indiceResto) {
      return Math.max(0, anchoDisponible - anchosFijos);
    }
    return Math.max(0, c.ancho || 0);
  });

  // Si la suma de anchos fijos ya excede el disponible, se recortan proporcionalmente
  // desde la última hacia la primera para no exceder el ancho total exacto.
  let suma = anchos.reduce((a, b) => a + b, 0);
  let idx = anchos.length - 1;
  while (suma > anchoDisponible && idx >= 0) {
    const exceso = suma - anchoDisponible;
    const recorte = Math.min(anchos[idx], exceso);
    anchos[idx] -= recorte;
    suma -= recorte;
    idx--;
  }

  const partes = celdas.map((c, i) => {
    const w = anchos[i];
    const texto = truncar(typeof c.texto === 'string' ? c.texto : '', w);
    return c.alinear === 'd' ? rellenarIzquierda(texto, w) : rellenarDerecha(texto, w);
  });

  let fila = partes.join(' ');
  const anchoFila = anchoVisual(fila);
  if (anchoFila < anchoTotal) {
    fila += ' '.repeat(anchoTotal - anchoFila);
  } else if (anchoFila > anchoTotal) {
    fila = truncar(fila, anchoTotal);
    const w2 = anchoVisual(fila);
    if (w2 < anchoTotal) fila += ' '.repeat(anchoTotal - w2);
  }
  return fila;
}

// --- graficos ---

/** Barra de progreso de `ancho` caracteres exactos. Clampea porcentaje a 0-100. Sin color. */
export function barra(porcentaje, ancho, { lleno = '█', vacio = '░' } = {}) {
  if (ancho <= 0) return '';
  const pct = Math.max(0, Math.min(100, porcentaje));
  const celdasLlenas = Math.round((pct / 100) * ancho);
  const llenas = Math.max(0, Math.min(ancho, celdasLlenas));
  return lleno.repeat(llenas) + vacio.repeat(ancho - llenas);
}

const BLOQUES = '▁▂▃▄▅▆▇█';
export const BLOQUES_ASCII = '_.-~=+*#';

/**
 * Sparkline normalizado contra el máximo de `valores`. Si el array está vacío o
 * el máximo es 0, devuelve la línea base (glifo mínimo repetido), nunca espacios.
 */
export function sparkline(valores, { glifos = BLOQUES } = {}) {
  if (!Array.isArray(valores) || valores.length === 0) return '';
  const base = glifos[0];
  const max = Math.max(...valores, 0);
  if (max === 0) return base.repeat(valores.length);

  const nGlifos = glifos.length;
  return valores
    .map((v) => {
      const val = Math.max(0, v || 0);
      const idx = Math.min(nGlifos - 1, Math.floor((val / max) * (nGlifos - 1)));
      return glifos[idx];
    })
    .join('');
}

// --- formateo de valores ---

/** 940 -> "940" | 14400 -> "14.4k" | 1240000 -> "1.24M". Nunca excede 6 caracteres. */
export function fmtTokens(n) {
  const v = Math.abs(n || 0);
  const signo = n < 0 ? '-' : '';
  if (v < 1000) return `${signo}${Math.round(v)}`;
  if (v < 1_000_000) {
    const k = v / 1000;
    const texto = k < 100 ? k.toFixed(1) : Math.round(k).toString();
    return `${signo}${texto}k`;
  }
  const m = v / 1_000_000;
  const texto = m < 10 ? m.toFixed(2) : m < 100 ? m.toFixed(1) : Math.round(m).toString();
  return `${signo}${texto}M`;
}

/**
 * 4.821 -> "$4.82" | 0.004 -> "$0.01" | 1240 -> "$1.24k". Bajo 1000 lleva 2 decimales,
 * salvo en el rango 100-999.999 donde con 2 decimales el resultado excedería el
 * contrato duro de 6 caracteres (ej. "$999.00" = 7); ahí se usa 1 decimal ("$999.0").
 */
export function fmtDinero(usd) {
  const v = Math.abs(usd || 0);
  const signo = usd < 0 ? '-' : '';
  if (v < 100) {
    // Redondeo estándar; 0.004 -> 0.00, pero valores >0 que redondean a 0 muestran el mínimo representable.
    let redondeado = Math.round(v * 100) / 100;
    if (redondeado === 0 && v > 0) redondeado = 0.01;
    return `${signo}$${redondeado.toFixed(2)}`;
  }
  if (v < 1000) {
    return `${signo}$${v.toFixed(1)}`;
  }
  // Escala por sufijo. Sin el salto a M/B, un monto grande devolvia cosas como
  // "$1000000k" (9 chars) y rompia el contrato de 6, que es lo que dimensiona
  // las columnas del panel.
  for (const [umbral, sufijo] of [[1e9, 'B'], [1e6, 'M'], [1e3, 'k']]) {
    if (v < umbral) continue;
    const n = v / umbral;
    const texto = n < 10 ? n.toFixed(2) : n < 100 ? n.toFixed(1) : Math.round(n).toString();
    return `${signo}$${texto}${sufijo}`;
  }
  return `${signo}$${v.toFixed(1)}`;
}

/** 58000 -> "58s" | 102000 -> "1m42s" | 3920000 -> "1h05m" | días -> "3d 11h". Nunca excede 6 chars. */
export function fmtDuracion(ms) {
  const totalSeg = Math.floor(Math.abs(ms || 0) / 1000);
  if (totalSeg < 60) return `${totalSeg}s`;

  const totalMin = Math.floor(totalSeg / 60);
  if (totalMin < 60) {
    const seg = totalSeg % 60;
    return `${totalMin}m${String(seg).padStart(2, '0')}s`;
  }

  const totalHoras = Math.floor(totalMin / 60);
  if (totalHoras < 24) {
    const min = totalMin % 60;
    return `${totalHoras}h${String(min).padStart(2, '0')}m`;
  }

  const dias = Math.floor(totalHoras / 24);
  const horas = totalHoras % 24;
  // "Nd Mh" solo entra en 6 chars hasta 99 dias. Mas alla se cae a solo dias, y
  // pasados los 5 digitos se satura: el ancho de la columna manda sobre la
  // precision de una duracion que en la practica nunca ocurre.
  if (dias < 100) return `${dias}d ${horas}h`;
  if (dias < 100000) return `${dias}d`;
  return '99999d';
}

/** "hace 3s" | "en 1h 12m" | "ahora". `ts` y `ahora` en ms epoch, deterministas por parámetro. */
export function fmtRelativo(ts, ahora, { prefijo = true } = {}) {
  const diffMs = ahora - ts;
  const pasado = diffMs >= 0;
  const absMs = Math.abs(diffMs);
  const seg = Math.floor(absMs / 1000);

  if (seg < 2) return 'ahora';

  let magnitud;
  if (seg < 60) {
    magnitud = `${seg}s`;
  } else {
    const min = Math.floor(seg / 60);
    if (min < 60) {
      magnitud = `${min}m`;
    } else {
      const horas = Math.floor(min / 60);
      const minResto = min % 60;
      magnitud = horas < 24 ? `${horas}h ${minResto}m` : `${Math.floor(horas / 24)}d ${horas % 24}h`;
    }
  }

  if (!prefijo) return magnitud;
  return pasado ? `hace ${magnitud}` : `en ${magnitud}`;
}

/**
 * Nivel de severidad por porcentaje, sin color (el renderer mapea nivel -> color).
 * La marca es redundancia no-cromática: mantiene el panel legible con NO_COLOR
 * y con daltonismo rojo-verde.
 */
export function severidad(porcentaje) {
  const pct = porcentaje;
  if (pct >= 95) return { nivel: 'critico', marca: '!!' };
  if (pct >= 85) return { nivel: 'alto', marca: '!!' };
  if (pct >= 60) return { nivel: 'aviso', marca: '!' };
  return { nivel: 'ok', marca: '' };
}
