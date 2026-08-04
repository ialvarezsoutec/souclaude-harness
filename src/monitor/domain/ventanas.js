// Dominio puro: ventanas de tiempo sobre EventoDeUso (ver eventos.js).
// Nunca lee el reloj: el instante actual siempre entra por parametro `ahora`
// (epoch ms). Sin esto no hay forma de testear esto de forma determinista.

const MINUTO = 60_000
const HORA = 3_600_000
const DIA = 86_400_000

// "30m" -> 1_800_000, "24h" -> 86_400_000, "7d" -> 604_800_000, "all" -> Infinity.
// Entrada invalida, vacia o null -> null. Quien llama decide como reaccionar.
export function parsearDuracion(txt) {
  if (typeof txt !== 'string' || txt.trim() === '') return null
  if (txt === 'all') return Infinity

  const m = /^(\d+)(m|h|d)$/.exec(txt)
  if (!m) return null

  const n = Number(m[1])
  if (!Number.isFinite(n) || n <= 0) return null

  const factor = { m: MINUTO, h: HORA, d: DIA }[m[2]]
  return n * factor
}

// Construye la ventana [desde, hasta]. Si la etiqueta es "all" (o cualquier
// duracion infinita), desde queda en la epoca (0) para no perder eventos viejos.
export function construirVentana(etiqueta, ahora) {
  const duracion = parsearDuracion(etiqueta)
  if (duracion === null) {
    throw new Error(`Ventana invalida: "${etiqueta}". Usa 1h, 6h, 24h, 7d o all.`)
  }

  if (duracion === Infinity) {
    return { desde: 0, hasta: ahora, etiqueta: 'all' }
  }

  return { desde: ahora - duracion, hasta: ahora, etiqueta }
}

// Un evento con ts null no se puede ubicar en el tiempo, asi que queda fuera
// de cualquier ventana acotada. La excepcion es la ventana "all" (desde === 0):
// ahi sí entra, porque excluirlo de la vista de "todo" seria perder datos reales
// que existen, solo que sin marca de tiempo confiable.
export function dentroDe(ts, ventana) {
  if (ts === null) return ventana.desde === 0
  return ts >= ventana.desde && ts <= ventana.hasta
}

export function filtrarPorVentana(eventos, ventana) {
  return eventos.filter((evento) => dentroDe(evento.ts, ventana))
}

// Suma todos los tipos de token del evento: es volumen total movido, no costo.
// cache1h y cache5m son el desglose de cacheCreacion, no un token adicional;
// sumarlos ademas de cacheCreacion contaria esos tokens dos veces.
function totalTokensEvento(evento) {
  const uso = evento.uso
  return uso.entrada + uso.salida + uso.cacheCreacion + uso.cacheLectura
}

// Borde de hora local (minutos, segundos y ms en cero) del instante dado.
function inicioDeHora(ts) {
  const d = new Date(ts)
  d.setMinutes(0, 0, 0)
  return d.getTime()
}

// 24 buckets de una hora cada uno (o menos si la ventana es mas corta que 24h;
// nunca mas de 24, es para un sparkline de 24 celdas), alineados al comienzo de
// hora en horario local y terminando en la hora que contiene `ventana.hasta`.
// Los buckets vacios se devuelven igual con tokens: 0 -- un sparkline con huecos
// mentiria sobre la forma de la serie.
export function bucketsHorarios(eventos, ventana) {
  const hastaHoraInicio = inicioDeHora(ventana.hasta)
  const horasEnVentana =
    ventana.desde === 0 ? 24 : Math.ceil((ventana.hasta - ventana.desde) / HORA)
  const cantidad = Math.min(24, Math.max(1, horasEnVentana))

  const buckets = []
  for (let i = cantidad - 1; i >= 0; i--) {
    const inicio = hastaHoraInicio - i * HORA
    buckets.push({ hora: new Date(inicio).getHours(), inicio, tokens: 0, llamadas: 0 })
  }

  for (const evento of eventos) {
    // Sin ts no hay hora en la que ubicarlo: no entra a ningun bucket, aunque
    // la ventana sea "all" y el evento cuente en otras vistas agregadas.
    if (evento.ts === null || !dentroDe(evento.ts, ventana)) continue

    const bucket = buckets.find(
      (b) => evento.ts >= b.inicio && evento.ts < b.inicio + HORA,
    )
    if (!bucket) continue

    bucket.tokens += totalTokensEvento(evento)
    bucket.llamadas += 1
  }

  return buckets
}

// Tokens por minuto en los ultimos `minutos` minutos contados desde `ahora`.
// Misma regla de suma que bucketsHorarios (total de tokens, no solo costo).
export function ritmo(eventos, ahora, minutos = 5) {
  const desde = ahora - minutos * MINUTO
  let tokens = 0

  for (const evento of eventos) {
    if (evento.ts === null || evento.ts < desde || evento.ts > ahora) continue
    tokens += totalTokensEvento(evento)
  }

  return { tokensPorMin: minutos > 0 ? tokens / minutos : 0, ventanaMin: minutos }
}
