---
name: ccem-research
description: Framework de 7 criterios de CCEM para evaluar una herramienta antes de adoptarla — dependencias nuevas, MCP servers, librerías, CLIs, servicios externos. Aplicar cuando alguien propone instalar, agregar o adoptar algo nuevo, o cuando hay que elegir entre dos herramientas que hacen lo mismo. La constitución exige pasar por acá antes de sumar una dependencia.
---

# CCEM — Research

Antes de sumar cualquier herramienta al proyecto (dependencia, MCP server, CLI,
servicio), se responde esta grilla. **Por escrito, no de memoria.** Si la decisión
es significativa, el resultado va a un ADR (`/adr-new`).

## Los 7 criterios

**1. Problema real.**
¿Qué problema concreto resuelve, que hoy duele? Si la respuesta es "podría llegar a
servir", la respuesta es no (P7). Una herramienta especulativa es deuda que todavía
no sabes que tienes.

**2. Alternativa en la standard library.**
¿La standard library del lenguaje ya lo hace? ¿Un CLI que ya está instalado? La
constitución es explícita: preferir stdlib sobre dependencia externa. Una función de
15 líneas casi siempre gana a un paquete de 200 KB.

**3. Costo de contexto.**
Específico de trabajar con agentes, y el que más se olvida. Un MCP server inyecta la
definición de todas sus tools en **cada turno, para siempre**. Un CLI nativo cuesta
cero hasta que lo llamas. Ante capacidad equivalente, **el CLI le gana al MCP**.
Pregunta concreta: ¿cuántos tokens agrega esto a cada request del resto de tu vida?

**4. Salud del proyecto.**
Último release, issues abiertos vs cerrados, cantidad de mantenedores, releases en
los últimos 12 meses. Un paquete con un mantenedor y sin commits hace 2 años es un
incidente esperando fecha.

**5. Superficie de seguridad.**
¿Qué permisos pide? ¿Qué datos ve? ¿A dónde los manda? ¿Cuántas dependencias
transitivas arrastra? Cualquier cosa que toque secretos, credenciales o datos de
producción sube el listón: se justifica o no entra.

**6. Costo de salida.**
Si en 6 meses resulta ser la elección equivocada, ¿cuánto cuesta sacarla? Una
herramienta detrás de una interfaz propia se reemplaza. Una que se filtró en 40
archivos, no. **Preferí lo que se puede desinstalar.**

**7. Quién la mantiene acá.**
Adoptarla es adquirir una obligación: upgrades, breaking changes, el día que se
rompa en CI a las 6 PM. ¿Quién del equipo se hace cargo? Si nadie levanta la mano,
no se adopta.

## El output

Una recomendación, no un ensayo:

> **Herramienta**: X
> **Decisión**: adoptar / no adoptar / probar en spike acotado
> **Los 3 criterios que decidieron**: [cuáles y por qué]
> **Alternativa descartada**: [cuál y por qué]
> **Dueño**: [quién]

Si el resultado es "adoptar" y la decisión es significativa → ADR.

## Bandera roja

Si estás justificando una herramienta con "es el estándar de la industria" o "todo
el mundo la usa", no respondiste ninguno de los 7 criterios. Volvé a empezar.
