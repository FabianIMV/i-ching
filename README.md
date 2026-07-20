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

## Cómo se maneja la API key de Gemini

Este proyecto **no usa un secret de repositorio ni inyecta ninguna clave
en el build**. En vez de eso, cada visitante ingresa su propia clave de
Gemini la primera vez que abre el sitio:

- Se pide en una pantalla inicial ("Tu clave de Gemini") antes de poder
  usar el oráculo con IA.
- La clave se guarda únicamente en el `localStorage` del navegador del
  visitante (`iching_gemini_api_key`), nunca se envía a ningún servidor
  propio ni queda escrita en el código fuente del sitio.
- Persiste entre sesiones mientras no se borren los datos del sitio
  (cookies/almacenamiento local) o se use "Borrar clave guardada" /
  "Cambiar clave de Gemini" desde la pantalla de inicio.
- Si no hay clave guardada o la llamada a Gemini falla (clave inválida,
  sin cuota, etc.), el oráculo sigue funcionando con una interpretación
  estructural generada localmente, sin IA.

Esto significa que **no necesitas configurar ningún secret en GitHub**
para publicar el sitio — el repositorio y el código publicado no
contienen ninguna clave.

### Recomendación de seguridad

Aunque la clave ya no viaja en el código fuente público, sigue viviendo
en el navegador de cada usuario y viaja en cada request a la API de
Gemini. Es buena práctica que cada quien restrinja su propia clave en
[Google AI Studio](https://aistudio.google.com/apikey) / Google Cloud
Console por referrer HTTP a este dominio:

```
https://TU_USUARIO.github.io/*
```

Así, si la clave llegara a filtrarse (por ejemplo, un equipo compartido
sin cerrar sesión), no podrá usarse desde otro origen.

## Activar GitHub Pages

**Settings → Pages → Build and deployment → Source: GitHub Actions.**
Cada push a `main` dispara el workflow `deploy.yml`, que publica el
sitio automáticamente. No hace falta configurar ningún secret.

## Desarrollo local

```
python3 -m http.server 8000
# abre http://localhost:8000
```

Al abrir el sitio localmente por primera vez, también te pedirá una
clave de Gemini; puedes pegar la tuya para probar la integración real, o
dejarla vacía y seguir usando la interpretación de respaldo local.
