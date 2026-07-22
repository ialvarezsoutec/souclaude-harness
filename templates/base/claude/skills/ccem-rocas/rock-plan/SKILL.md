---
name: rock-plan
description: Paso 2 de la metodología de rocas. Convierte una roca (compromiso trimestral) en un plan escrito con 5-7 hitos que emiten IDs <PREFIJO>-H<n>. El agente propone; el dueño decide y pone las fechas. Valida las 7 reglas de construcción de hitos antes de dejar exportar a Ninety. Aplicar después de la reunión trimestral, antes de subir un solo hito a Ninety.
argument-hint: <PREFIJO> [--trimestre Q3Y26]
disable-model-invocation: true
---

# /rock-plan

Capa: **rocas** (trimestral / ejecutiva). No es CCEM: del spec hacia abajo manda CCEM.
Este comando produce los IDs de hito que CCEM después consume.

## 1. El agente propone, el dueño decide

**Un compromiso lo hace una persona, no un modelo.** Este comando ayuda a escribir el plan;
las fechas y el recorte los pone el dueño. Un agente que planifica sin restricciones produce
ficción bien formateada.

## 2. Las 6 entradas obligatorias

Sin las seis, **detente y pregunta**. No rellenes con supuestos.

1. Enunciado verificable de la roca (un estado a 90 días, no un nombre de proyecto).
2. Dueño único y fecha de cierre.
3. Punto de partida: qué existe hoy (repos, hardware, accesos, PoCs).
4. Restricciones reales: presupuesto, hardware, dependencias de terceros, disponibilidad real
   del dueño en %, ventanas no disponibles.
5. No-alcance explícito.
6. Definición de Done a los 90 días.

**Prueba del enunciado:** si no se puede escribir en pasado sin ambigüedad, la roca no está
definida y el Paso 2 no arranca. Mal: `Reachy`. Bien: `Reachy Mini operativo en recepción
atendiendo visitas en español con captura de lead, 5 días sin intervención`.

## 3. Salidas

- `Project-<PREFIJO>/roca_<TRIMESTRE>_<PREFIJO>.yaml` en el Vault, desde
  `00-System/templates/plantilla_apertura_roca.yaml`.
- **Los specs previstos por hito: sólo título y slug.** 1 a 3 por hito.

**Regla de guarda: en el Paso 2 se reservan títulos y slugs, nunca se escribe el spec.**
Redactar los specs el día uno es decidir el diseño con la peor información que se va a tener en
90 días. El spec se escribe con `/spec-new` cuando ese trabajo arranca. **El roadmap se
compromete; el diseño no.**

## 4. Las 7 reglas de construcción de hitos (E1)

Se validan **todas** antes de permitir la exportación a Ninety:

| # | Regla | Por qué |
|---|---|---|
| R1 | Entre 5 y 7 hitos | Menos: te enteras tarde. Más: el L10 se vuelve reunión de estatus |
| R2 | El primero cae en la semana 2 como máximo | Es la prueba de humo del plan |
| R3 | Máximo un hito en la última semana | El fracaso clásico es apilar cuatro al final |
| R4 | Ningún hueco mayor a 3 semanas | Sin señal intermedia no hay corrección de rumbo |
| R5 | Estado verificable, no actividad | Si el viernes no se responde sí/no sin conversar, no es un hito |
| R6 | Las fechas las pone el dueño | El agente propone hitos SIN fecha |
| R7 | El agente propone uno de más y marca cuál recortaría | Mete el descope en el plan, no en la semana 9 |

**R5 en detalle.** Ningún título empieza con verbo de actividad (investigar, avanzar, trabajar,
revisar, explorar, mejorar, continuar). Mal: `Investigar arquitectura de voz`. Bien: `ADR de
arquitectura de voz aprobado por IT`.

## 5. Checklist de validación antes de exportar (E1 + E4)

No exportes a medias. Si algo falla, **detente y pregunta**:

- [ ] `identidad.roca` escrito como estado verificable, no como sustantivo.
- [ ] `identidad.dueño` es una sola persona.
- [ ] `objetivo.estado_final` se lee en pasado sin ambigüedad.
- [ ] `objetivo.no_alcance` tiene al menos 1 entrada.
- [ ] `criterios` tiene entre 3 y 8 entradas, todas con `verificacion` no vacía.
- [ ] `hitos` tiene entre 5 y 7 entradas (R1).
- [ ] `hitos[0].fecha_plan` cae dentro de las primeras 2 semanas (R2).
- [ ] Como máximo 1 hito en la última semana (R3).
- [ ] Ningún hueco > 21 días entre hitos consecutivos (R4).
- [ ] Todos los hitos tienen `fecha_plan`, `responsable` y `criterios_aceptacion` (R5/R6).
- [ ] Ningún título de hito empieza con verbo de actividad (R5).
- [ ] `restricciones.disponibilidad_dueño` está declarada.
- [ ] `riesgos_apertura` tiene al menos 2 entradas con mitigación concreta.
- [ ] `descarte_planificado.minimo_irrenunciable` no está vacío (R7).
- [ ] `identidad.prefijo` existe en `00-System/id-registry.md` (no se inventa).
- [ ] Cada hito tiene entre 1 y 3 specs reservados, todos con slug, título y repo.
- [ ] Ningún spec viene escrito: en el Paso 2 sólo se reservan título y slug.
- [ ] `integracion.repos[].harness` declarado y `souclaude status` sale limpio.

## 6. IDs que emite este paso

| Objeto | Formato | Ejemplo |
|---|---|---|
| Roca | `<TRIMESTRE>-<PREFIJO>` | `Q3Y26-REA` |
| Hito | `<PREFIJO>-H<n>` | `REA-H3` |
| Riesgo de roca | `<PREFIJO>-R-<nn>` | `REA-R-01` |

Los specs (`specs/<ID-hito>-<slug>/`), ramas y tasks los emite CCEM más tarde, colgando del ID
de hito. **El prefijo no se inventa: se pide contra el registro.**

## 7. Compuerta

El plan se cierra en el Vault y **recién entonces** suben los hitos a Ninety, a mano. Los
Milestones de Ninety no se pueden borrar por API: subir un plan a medias sale caro. Deja
`ninety_rock_id`, `ninety_milestone_id` y `ultima_sincronizacion` vacíos en el YAML desde el
día uno.

## Reglas

- Alcance: de la roca al hito. Nada por debajo del hito (spec, plan, tasks, código).
- El agente nunca pone fechas ni decide el recorte. Propone; el dueño decide.
- Si el prefijo no está en el registro, para. No se inventa.
