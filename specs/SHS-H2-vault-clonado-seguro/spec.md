# Spec Lite: el CLI clona el Vault de forma segura y con menos fricción

**Status**: implemented
**Owner**: Ignacio A
**Hito**: SHS-H2
**Creado**: 2026-08-04

> SDD Lite. Segundo spec del hito SHS-H2 (el primero fue
> [SHS-H2-cli-template-completo](../SHS-H2-cli-template-completo/spec.md)). Task IDs en
> bloque de 100 según el orden de reserva: arranca en T101.

---

## Contexto

`ensureVault()` ya clona el Vault — el hallazgo original ("el CLI no clona
automáticamente") estaba mal diagnosticado: sí clona, detrás de tres preguntas
encadenadas y nunca en `--yes`. El trabajo real es reducir esa fricción sin abrir un
agujero nuevo.

Y hay uno ya abierto, encontrado al revisar el código en detalle para este spec:
[src/core/vault.js:145-146](../../src/core/vault.js#L145-L146) resuelve la ruta de clonado
con `path.resolve(cwd, ruta)`. El prompt es *"¿Dónde clono el Vault?"* con el default
`../soubunker-vault` (afuera del repo, correcto) — pero si el usuario tipea cualquier
ruta relativa (`vault`, `./vault`, o simplemente confirma sin pensar tras haber borrado
el default), `path.resolve` la resuelve **relativa al propio repo del proyecto**. El
resultado: el Vault completo — otro repo git, con remoto propio, con la memoria de
**todos** los proyectos de la organización — clonado adentro del repo del proyecto que se
está instalando. Nada lo detecta ni lo impide hoy. El mismo riesgo existe en la rama
"ya tengo el Vault, dame la ruta" ([vault.js:134-142](../../src/core/vault.js#L134-L142))
si la ruta tipeada no existe y cae a `clonar()`.

Este es el goal 1 de este spec, no un detalle de implementación: es la razón por la que
el spec existe.

## Goals

En orden de prioridad:

1. **El Vault nunca se clona dentro del árbol del repo del proyecto**, sin importar qué
   ruta tipee el usuario en el prompt interactivo, ni qué valor reciba `--vault-path`
   combinado con clonado. Una ruta que resuelva a `cwd` o a cualquier descendiente de
   `cwd` se rechaza con un mensaje claro, y se vuelve a preguntar (interactivo) o se aborta
   el paso del Vault con warning (no interactivo) — nunca se clona igual.
2. Si `../soubunker-vault` (el sibling por defecto) ya existe y tiene `00-System/`, se
   conecta **sin preguntar nada** — hoy se pregunta igual aunque la detección sea trivial.
3. El camino interactivo se reduce a **una sola confirmación** cuando no hay Vault
   detectado: `Clonar <repo> en <ruta>? [Y/n]`, en vez de las dos preguntas encadenadas
   actuales ("¿tienes el Vault clonado?" → "¿dónde clono?").
4. Modo no interactivo con clonado explícito: `--vault-clone` habilita clonar incluso con
   `--yes`, para quien quiere automatizar el setup completo de un repo nuevo sin perder la
   protección de red/disco que `--yes` da por defecto en CI.

## Non-goals

- **No se crea `Project-<PREFIJO>/` en el Vault automáticamente.** Sembrar la carpeta del
  proyecto en el Vault implica escribir y pushear a un repo ajeno (protocolo de push
  directo a `main` de `progress/README.md`) — es trabajo de sincronización, no de
  bootstrap del CLI. Corresponde a S6 (sincronización del progreso al Vault), no a este
  spec.
- **No se cambia el formato de `.claude/vault.local.json`** ni la resolución de
  `VAULT_PATH`/`VAULT_REPO` ya existente.
- **No se toca el mensaje de `manualHint()`** — ya se corrigió en
  [SHS-H2-cli-template-completo/T004](../SHS-H2-cli-template-completo/tasks.md).
- **No se valida que la ruta de un Vault ya existente (`--vault-path` a un Vault que el
  usuario dice tener clonado) esté fuera del repo.** Ese caso no clona nada — el usuario
  señala algo que ya existe en su disco, fuera del control de este CLI. La validación de
  goal 1 aplica solo a destinos de **clonado** (donde el CLI sí decide qué escribir).

## Success criteria

- [x] Un test reproduce el escenario real: prompt de destino con una ruta relativa que cae
      dentro de `cwd`, y `ensureVault` la rechaza sin clonar nada ahí. (El prompt de ruta
      solo aparece si el usuario rechaza el destino sugerido — ver plan.md, corrección
      encontrada en T102.)
- [x] `--vault-path <ruta-dentro-del-repo> --vault-clone --yes` también se rechaza (mismo
      chequeo, camino no interactivo).
- [x] Con `../soubunker-vault` presente y válido junto al repo de prueba, `init --yes` lo
      conecta sin ninguna pregunta y sin el flag `--vault-clone`.
- [x] El camino interactivo sin Vault detectado hace **una sola** pregunta antes de
      clonar, no dos.
- [x] `npm test` sigue en verde total (289/289) y `verify --strict` limpio.

## Riesgos

- **La detección "ruta dentro de cwd" tiene que ser por path real, no por string.** Un
  symlink o una ruta con `..` que rodee y vuelva a caer adentro (`../repo/../repo/vault`)
  debe detectarse igual. Se resuelve con `path.relative` y chequeando que no empiece con
  `..` ni sea absoluto a otra unidad — el patrón estándar de "está contenido en".
- **No hay que romper el caso legítimo de un Vault ya clonado que, por decisión del
  usuario, vive dentro de un monorepo mayor que contiene tanto el proyecto como el
  Vault.** Por eso el goal 1 se acota a **cwd** (el repo del proyecto), no a "cualquier
  ancestro" — y solo aplica a clonado nuevo, no a conectar una ruta existente (ver
  non-goals).

## Open questions

Ninguna — a diferencia del primer spec de este hito, el diseño no depende de decisiones
de producto nuevas; es corregir el comportamiento ya especificado en `docs/vault-setup.md`
y `progress/README.md`.

---

## Checklist antes de avanzar a plan-lite

- [x] ¿Los goals son medibles, no aspiracionales?
- [x] ¿Los non-goals cubren la asunción más probable de un lector? (que este spec también
      resuelva la creación del Project-<PREFIJO> — no, es de S6)
- [x] ¿Sigue siendo un cambio de 4-8 horas? Sí: una función de validación de ruta, ajustar
      el flujo interactivo a menos preguntas, un flag nuevo, y tests.
