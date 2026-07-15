import { lt } from '../core/lockfile.js'
import { parseJson, stringifyJson } from '../core/jsonmerge.js'

// Transforms mecanicos que el diff-por-hash no puede expresar: remover o
// renombrar claves, mover archivos. El seed-merge solo AGREGA, asi que sin una
// migracion una clave invalida vivira para siempre.
//
// Es un array de funciones chicas a proposito. Nada de un DSL de migraciones.
export const migrations = [
  {
    id: 'v1-settings-drop-invalid-keys',
    to: '1.0.0',
    dest: '.claude/settings.json',
    describe:
      'settings.json: remueve claves que Claude Code ignora en silencio (effort, auto_confirm_destructive, display_tools, token_budget_warning)',
    transform(content) {
      const json = parseJson(content, '.claude/settings.json')
      if (json == null) return content

      // Estas cuatro nunca existieron en el schema de Claude Code. Estaban en el
      // Kit v0 y no hacian absolutamente nada.
      const INVALID = ['effort', 'auto_confirm_destructive', 'display_tools', 'token_budget_warning']

      let changed = false
      for (const key of INVALID) {
        if (key in json) {
          delete json[key]
          changed = true
        }
      }
      return changed ? stringifyJson(json) : content
    },
  },
]

// Devuelve las migraciones aplicables a `dest` para pasar de `fromVersion` al
// harness actual. Una migracion aplica si el repo esta por debajo de su `to`.
export function migrationsFor(dest, fromVersion) {
  return migrations.filter((m) => m.dest === dest && lt(fromVersion, m.to))
}
