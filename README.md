# I Ching — Oráculo

Un oráculo I Ching auténtico en español, mobile-first, sitio 100% estático
(HTML + CSS + JavaScript vanilla) publicado en GitHub Pages, con
interpretación generada por la API de Gemini.

## Qué incluye

- Los 64 hexagramas de la secuencia del Rey Wen, con trigramas, palabras
  clave y una síntesis original del Juicio y de la Imagen para cada uno
  (`data.js`). Las 6 líneas de cada hexagrama se derivan
  programáticamente combinando los bits de sus dos trigramas.
- Método tradicional de las tres monedas (cara=3, cruz=2), animado línea
  por línea, con las probabilidades correctas: 6 → 1/8, 7 → 3/8, 8 → 3/8,
  9 → 1/8.
- Detección de líneas mutantes, cálculo del hexagrama de cambio y
  síntesis original por posición y polaridad de cada línea mutante.
- Interpretación generada con Gemini (`gemini-2.5-flash`, configurable en
  `app.js` como `GEMINI_MODEL`), con instrucciones de sistema que evitan
  el sesgo optimista y piden una lectura estructurada. Si la llamada
  falla, se muestra una interpretación de respaldo generada localmente
  con los datos del hexagrama, nunca una lectura vacía.
- Exportación a Markdown (botón "Copiar en Markdown") con fecha, pregunta,
  hexagramas, líneas mutantes, interpretación completa y una sección
  final `## Verificación posterior` para completar después en tu
  bitácora.
- Script de validación de los datos: `node scripts/validate.js`
  (verifica 64 entradas, 64 combinaciones de trigramas únicas, 64
  patrones de bits únicos y numeración 1–64 sin huecos ni duplicados).

## Estructura del repo

```
index.html                   pantallas de la app
style.css                    estilos (estética de tinta china)
app.js                       lógica: tirada, cálculo, Gemini, export
data.js                      trigramas y los 64 hexagramas
scripts/validate.js          validación de integridad de los datos
.github/workflows/deploy.yml build + despliegue a GitHub Pages
```

## Configuración

### 1. Secret `GEMINI_API_KEY`

En el repositorio de GitHub: **Settings → Secrets and variables →
Actions → New repository secret**, con nombre `GEMINI_API_KEY` y tu
clave de la API de Gemini como valor. El workflow reemplaza el
placeholder `__GEMINI_API_KEY__` en `app.js` por el valor del secret al
momento de construir el sitio; la clave nunca se commitea al
repositorio.

### 2. Activar GitHub Pages

**Settings → Pages → Build and deployment → Source: GitHub Actions.**
Cada push a `main` dispara el workflow `deploy.yml`, que publica el
sitio automáticamente.

## ⚠️ Advertencia importante sobre la API key

Este es un sitio **estático**. La clave de Gemini se inyecta en el
JavaScript en tiempo de build y queda **visible en el código fuente del
sitio publicado** — cualquiera puede abrir las herramientas de
desarrollador del navegador y leerla. Esto es inherente a cualquier app
puramente estática que llama a una API desde el cliente.

**Debes restringir la key en Google AI Studio / Google Cloud Console por
referrer HTTP**, limitándola a tu dominio de GitHub Pages:

```
https://TU_USUARIO.github.io/*
```

Así, aunque la clave sea visible, no podrá usarse desde otro origen. Sin
esta restricción, cualquiera que copie la clave del código fuente podría
consumir tu cuota de la API de Gemini desde cualquier otro sitio.

## Desarrollo local

Al servir el sitio sin pasar por el workflow, `GEMINI_API_KEY` queda como
el placeholder `__GEMINI_API_KEY__` sin reemplazar, por lo que la app
usa automáticamente la interpretación de respaldo generada localmente
(sin llamar a Gemini). Para probar la integración real en local, puedes
reemplazar manualmente el placeholder en una copia de `app.js` (sin
commitear ese cambio).

```
python3 -m http.server 8000
# abre http://localhost:8000
```
