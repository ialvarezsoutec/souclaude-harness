---
name: harness-upgrade
description: Actualiza el harness CCEM de este repo (skills, comandos, templates SDD, settings) a la última versión publicada, sin pisar nada que hayas editado tú.
disable-model-invocation: true
---

# /harness-upgrade

Estado actual del harness:

```!
npx -y github:ialvarezsoutec/souclaude-harness#v1 status
```

## Qué hacer

1. Muéstrale al usuario el estado de arriba, en una línea: qué versión tiene, cuál
   hay disponible, y qué archivos editó él.

2. Corre el upgrade en seco primero. **Siempre en seco primero.**

   ```
   npx -y github:ialvarezsoutec/souclaude-harness#v1 upgrade --dry-run
   ```

3. Muéstrale el plan y **espera su OK**. No apliques nada sin confirmación (P5).

4. Con el OK, aplicá:

   ```
   npx -y github:ialvarezsoutec/souclaude-harness#v1 upgrade
   ```

5. Si el upgrade dejó archivos `.new`, es porque esos archivos los editaste tú y el
   harness **no los pisa**. Ofrecé revisar cada uno:

   ```
   git diff --no-index CLAUDE.md CLAUDE.md.new
   ```

   Ayúdalo a mergear lo que quiera incorporar, y después borrá el `.new`. Nunca
   copies el `.new` encima del original sin que él lo apruebe archivo por archivo.

## Qué NO hacer

- No corras `upgrade --force`. Pisa lo que el usuario escribió.
- No corras `--prune` salvo que él lo pida explícitamente: borra archivos.
- No edites `.claude/harness.json` a mano. Es el lockfile: lo gestiona el CLI.
