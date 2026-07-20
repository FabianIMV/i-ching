/* ============================================================
   I CHING — Lógica de la aplicación
   ============================================================ */

// --- Configuración del modelo Gemini (fácil de actualizar) ---
// Se prueban en orden: los alias "-latest" sobreviven a la baja de
// versiones fijas (ej. Google puede retirar "gemini-2.5-flash" para
// cuentas nuevas con un 404), y el "-lite" queda de última red de
// seguridad porque tiende a tener más cupo disponible.
const GEMINI_MODEL_CANDIDATES = [
  'gemini-flash-latest',
  'gemini-2.5-flash',
  'gemini-flash-lite-latest',
];
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// La clave de Gemini NUNCA se commitea ni se inyecta en el build: cada
// visitante ingresa la suya propia la primera vez y queda guardada solo
// en su navegador (localStorage), hasta que borre datos de sitio o la
// cambie manualmente. El sitio publicado no contiene ninguna clave.
const API_KEY_STORAGE_KEY = 'iching_gemini_api_key';

function getApiKey() {
  return (localStorage.getItem(API_KEY_STORAGE_KEY) || '').trim();
}

function setApiKey(key) {
  localStorage.setItem(API_KEY_STORAGE_KEY, key.trim());
}

function clearApiKey() {
  localStorage.removeItem(API_KEY_STORAGE_KEY);
}

const SYSTEM_PROMPT = `Eres un intérprete del I Ching riguroso y honesto. Reglas estrictas:

1. NEUTRALIDAD EN AMBAS DIRECCIONES. No adules ni edulcores: si el hexagrama o las líneas son adversos, dilo con claridad y explica qué pide la situación. Pero tampoco dramatices ni inventes adversidad donde no la hay. Un hexagrama neutro (p. ej. 52 Gèn, 15, 20, 52) se lee en su registro sereno por defecto. Rigor no significa sombrío: significa fiel a lo que dice la tirada.

2. NO PSICOANALICES AL CONSULTANTE. Interpreta el hexagrama, no a la persona. No infieras ni asumas su estado emocional (ansiedad, miedo, insatisfacción, desesperación, etc.) a partir de la pregunta. Una pregunta corta o directa NO implica angustia. Si la pregunta no declara un estado interno, no lo supongas ni construyas la lectura sobre esa suposición. Interpreta lo que la tirada muestra sobre la situación, no lo que imaginas sobre quien pregunta.

3. ESTRUCTURA de la respuesta, en este orden:
   (a) La situación presente según el hexagrama y sus dos trigramas (inferior = lo interno; superior = lo externo), aplicada a la pregunta.
   (b) El movimiento — qué dicen las líneas mutantes, que son el mensaje central. Si no hay líneas mutantes, indícalo: la situación es estable y se lee solo el hexagrama presente (esto es información neutral, no una advertencia).
   (c) Hacia dónde va, según el hexagrama de cambio (si existe).
   (d) Consejo concreto y accionable respecto a la pregunta.
   (e) Síntesis en una sola frase.

4. El I Ching describe estructura en movimiento, no predice eventos fijos. Habla de tendencias, de momentos oportunos o inoportunos, y de la actitud correcta ante la fase. No inventes resultados fijos ni fechas.

5. Si hay 4 o más líneas mutantes, indica que el campo está muy en movimiento y da peso también a las líneas que NO cambiaron, leídas en el hexagrama de cambio, priorizando la más baja de ellas.

6. REENCUADRE AL FINAL. Si la pregunta busca certeza absoluta sobre el futuro, pide una fecha o un evento fijo, o pregunta sobre lo que un tercero hará o siente, interpreta igual la tirada con normalidad y, SOLO AL FINAL (después de la síntesis), agrega una nota breve que reencuadre: señala que el I Ching no fija fechas ni eventos ni lee a terceros, y reorienta hacia lo que el consultante puede observar o hacer. No empieces la respuesta con esta nota ni la dejes eclipsar la interpretación.

7. Español claro y legible, denso pero no enredado. Usa **negritas** en lo clave. Párrafos cortos (mobile-first).

8. Responde EXCLUSIVAMENTE en español.`;

const REFORMULATION_SYSTEM_PROMPT = `Eres un asistente que ayuda a plantear bien una pregunta antes de consultar el I Ching. Reglas estrictas:
1. El I Ching funciona mejor con preguntas abiertas sobre una situación, una actitud o un proceso — no con preguntas cerradas de sí/no, ni con pedidos de predicción certera de un evento futuro, ni con preguntas sobre lo que un tercero hará o siente.
2. Si la pregunta ya está bien planteada así, devuélvela EXACTAMENTE igual, sin cambiar una palabra.
3. Si no lo está, reformúlala conservando el tema y la intención original del consultante, pero abriéndola hacia la situación, la actitud correcta o lo que el consultante puede observar o hacer — nunca hacia una certeza sobre el futuro ni hacia el control de otra persona.
4. No agregues contexto, suposiciones ni detalles que el consultante no haya dado.
5. Responde EXCLUSIVAMENTE con la pregunta final (original o reformulada), en una sola línea, en español, sin comillas, sin explicación, sin texto adicional.`;

function buildReformulationPrompt(question) {
  return `${REFORMULATION_SYSTEM_PROMPT}\n\nPregunta original del consultante: "${question}"`;
}

async function requestReformulation(question) {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  const prompt = buildReformulationPrompt(question);
  for (const model of GEMINI_MODEL_CANDIDATES) {
    try {
      const text = await callGeminiModel(model, apiKey, prompt);
      return text.replace(/^["«]|["»]$/g, '').trim();
    } catch (err) {
      console.error(`Error al reformular con Gemini (${model}):`, err);
      if (err.kind === 'AUTH') return null; // clave inválida: no insistir
    }
  }
  return null; // todos los modelos fallaron: se sigue con la pregunta original, sin bloquear la consulta
}

// --- Índice bits -> hexagrama, construido a partir de data.js ---
const HEXAGRAMS = HEXAGRAM_SEQUENCE.map(h => {
  const bits = [...TRIGRAMS[h.lower].bits, ...TRIGRAMS[h.upper].bits];
  return { ...h, bits };
});

const BITS_INDEX = {};
HEXAGRAMS.forEach(h => { BITS_INDEX[h.bits.join('')] = h; });

function hexagramByBits(bits) {
  return BITS_INDEX[bits.join('')];
}

// Textos de interpretación por posición y polaridad de línea mutante.
const LINE_POSITION_MEANING = {
  1: 'el fundamento: lo que recién empieza a moverse, todavía bajo la superficie',
  2: 'el interior: la postura propia dentro de la situación, antes de mostrarse hacia afuera',
  3: 'el umbral: el punto de paso entre lo interno y lo externo, siempre inestable',
  4: 'la cercanía al poder: la posición junto a lo que decide, que exige tacto',
  5: 'el lugar del gobernante: el centro de la situación, donde se ejerce la responsabilidad mayor',
  6: 'la culminación: el punto donde algo se completa o se excede a sí mismo',
};

function lineMutationText(position, fromYang) {
  const posText = LINE_POSITION_MEANING[position];
  const moveText = fromYang
    ? 'una línea yang que envejece y se convierte en yin: pide soltar el empuje, dejar de forzar y permitir que la situación se asiente'
    : 'una línea yin que envejece y se convierte en yang: pide pasar de esperar a actuar, tomar la iniciativa que hasta ahora se había postergado';
  return `Línea ${position} — ${posText}. Aquí se mueve ${moveText}.`;
}

// ============================================================
// Estado de la aplicación
// ============================================================
const state = {
  question: '',          // pregunta finalmente usada para la tirada
  originalQuestion: '',  // pregunta tal como la escribió el consultante
  lines: [],       // [{ sum, value(6|7|8|9), yang(bool) }] de abajo hacia arriba
  present: null,   // hexagrama presente
  changing: null,  // hexagrama de cambio (o null)
  mutantPositions: [],
  interpretation: '',
  interpretationError: false,
};

// ============================================================
// Método de las tres monedas
// ============================================================
function tossCoin() {
  return Math.random() < 0.5 ? 2 : 3; // cruz=2, cara=3
}

function tossLine() {
  const coins = [tossCoin(), tossCoin(), tossCoin()];
  const sum = coins[0] + coins[1] + coins[2];
  // 6 = yin vieja (mutante), 7 = yang joven, 8 = yin joven, 9 = yang vieja (mutante)
  const yang = sum === 7 || sum === 9;
  const mutant = sum === 6 || sum === 9;
  return { coins, sum, yang, mutant };
}

// ============================================================
// Navegación entre pantallas
// ============================================================
const screens = {
  apikey: document.getElementById('screen-apikey'),
  home: document.getElementById('screen-home'),
  question: document.getElementById('screen-question'),
  refine: document.getElementById('screen-refine'),
  casting: document.getElementById('screen-casting'),
  result: document.getElementById('screen-result'),
};

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

// ============================================================
// Pantalla de clave de Gemini (primera visita o clave borrada)
// ============================================================
const apiKeyForm = document.getElementById('apikey-form');
const apiKeyInput = document.getElementById('apikey-input');
const apiKeyError = document.getElementById('apikey-error');

apiKeyForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const value = apiKeyInput.value.trim();
  if (!value) {
    apiKeyError.textContent = 'Ingresa una clave para continuar.';
    apiKeyError.style.display = '';
    return;
  }
  setApiKey(value);
  apiKeyError.style.display = 'none';
  apiKeyInput.value = '';
  showScreen('home');
});

document.getElementById('btn-change-apikey').addEventListener('click', () => {
  apiKeyInput.value = getApiKey();
  apiKeyError.style.display = 'none';
  showScreen('apikey');
});

document.getElementById('btn-clear-apikey').addEventListener('click', () => {
  clearApiKey();
  apiKeyInput.value = '';
  apiKeyError.style.display = 'none';
  showScreen('apikey');
});

function initialScreen() {
  return getApiKey() ? 'home' : 'apikey';
}

document.getElementById('btn-start').addEventListener('click', () => {
  showScreen('question');
  document.getElementById('question-input').focus();
});

document.getElementById('btn-new-consultation').addEventListener('click', resetToHome);

function resetToHome() {
  state.question = '';
  state.originalQuestion = '';
  state.lines = [];
  state.present = null;
  state.changing = null;
  state.mutantPositions = [];
  state.interpretation = '';
  state.interpretationError = false;
  document.getElementById('question-input').value = '';
  showScreen('home');
}

// ============================================================
// Pantalla de pregunta -> afinar pregunta (si hay clave) -> tirada
// ============================================================
const questionForm = document.getElementById('question-form');
questionForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('question-input');
  const value = input.value.trim();
  if (!value) {
    input.focus();
    return;
  }
  handleQuestionSubmitted(value);
});

async function handleQuestionSubmitted(value) {
  state.originalQuestion = value;
  state.question = value;

  const apiKey = getApiKey();
  if (!apiKey) {
    startCasting();
    return;
  }

  showScreen('refine');
  document.getElementById('refine-loading').style.display = '';
  document.getElementById('refine-content').style.display = 'none';

  const reformulated = await requestReformulation(value);

  if (!reformulated || reformulated.trim() === value.trim()) {
    // La pregunta ya estaba bien planteada, o no se pudo reformular: se continúa sin mostrar comparación.
    startCasting();
    return;
  }

  document.getElementById('refine-loading').style.display = 'none';
  document.getElementById('refine-content').style.display = '';
  document.getElementById('refine-original').textContent = `«${value}»`;
  document.getElementById('refine-note').textContent =
    'El I Ching se lee mejor con preguntas abiertas sobre una situación. Puedes editar esta versión antes de continuar.';
  document.getElementById('refine-reformulated').value = reformulated.trim();
}

document.getElementById('btn-use-reformulated').addEventListener('click', () => {
  const value = document.getElementById('refine-reformulated').value.trim();
  state.question = value || state.originalQuestion;
  startCasting();
});

document.getElementById('btn-use-original').addEventListener('click', () => {
  state.question = state.originalQuestion;
  startCasting();
});

// ============================================================
// Animación de la tirada, línea por línea
// ============================================================
async function startCasting() {
  showScreen('casting');
  state.lines = [];
  const coinsEl = document.getElementById('coins-display');
  const hexEl = document.getElementById('casting-hexagram');
  const statusEl = document.getElementById('casting-status');
  hexEl.innerHTML = '';
  coinsEl.innerHTML = '';

  // 6 renglones vacíos, se llenan de abajo hacia arriba (se insertan al inicio)
  const lineSlots = [];
  for (let i = 0; i < 6; i++) {
    const slot = document.createElement('div');
    slot.className = 'cast-line-slot empty';
    hexEl.prepend(slot);
    lineSlots.push(slot);
  }

  for (let i = 0; i < 6; i++) {
    statusEl.textContent = `Lanzando línea ${i + 1} de 6…`;
    const coinFaces = [];
    coinsEl.innerHTML = '';
    for (let c = 0; c < 3; c++) {
      const coin = document.createElement('div');
      coin.className = 'coin flipping';
      coin.textContent = '';
      coinsEl.appendChild(coin);
      coinFaces.push(coin);
    }
    await sleep(550);

    const line = tossLine();
    state.lines.push(line);

    coinFaces.forEach((coin, idx) => {
      const value = line.coins[idx];
      coin.classList.remove('flipping');
      coin.classList.add(value === 3 ? 'heads' : 'tails');
      coin.textContent = value === 3 ? '陽' : '陰';
    });

    await sleep(300);

    const slot = lineSlots[i];
    slot.classList.remove('empty');
    slot.appendChild(renderLineEl(line.yang, line.mutant));
    await sleep(450);
  }

  statusEl.textContent = 'Tirada completa.';
  await sleep(500);
  finishCasting();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function renderLineEl(yang, mutant, small) {
  const wrap = document.createElement('div');
  wrap.className = 'hex-line' + (small ? ' small' : '') + (mutant ? ' mutant' : '');
  if (yang) {
    const bar = document.createElement('div');
    bar.className = 'bar solid';
    wrap.appendChild(bar);
  } else {
    const left = document.createElement('div');
    left.className = 'bar half';
    const right = document.createElement('div');
    right.className = 'bar half';
    wrap.appendChild(left);
    wrap.appendChild(right);
  }
  if (mutant) {
    const marker = document.createElement('span');
    marker.className = 'mutant-marker';
    marker.textContent = yang ? '○' : '✕';
    wrap.appendChild(marker);
  }
  return wrap;
}

// ============================================================
// Cierre de la tirada: calcular hexagramas y mostrar resultado
// ============================================================
function finishCasting() {
  const presentBits = state.lines.map(l => l.yang ? 1 : 0);
  state.present = hexagramByBits(presentBits);

  state.mutantPositions = [];
  state.lines.forEach((l, idx) => {
    if (l.mutant) state.mutantPositions.push(idx + 1);
  });

  if (state.mutantPositions.length > 0) {
    const changingBits = state.lines.map(l => {
      if (!l.mutant) return l.yang ? 1 : 0;
      return l.yang ? 0 : 1; // se invierte
    });
    state.changing = hexagramByBits(changingBits);
  } else {
    state.changing = null;
  }

  renderResult();
  showScreen('result');
  requestInterpretation();
}

// ============================================================
// Renderizado del resultado
// ============================================================
function hexHTMLBlock(lines, mutantPositions) {
  // lines: array de 6 {yang} de abajo hacia arriba
  const container = document.createElement('div');
  container.className = 'hex-block';
  for (let i = 5; i >= 0; i--) {
    const isMutant = mutantPositions.includes(i + 1);
    container.appendChild(renderLineEl(lines[i].yang, isMutant));
  }
  return container;
}

function renderResult() {
  const questionEl = document.getElementById('result-question');
  let html = `«${escapeHtml(state.question)}»`;
  if (state.originalQuestion && state.originalQuestion.trim() !== state.question.trim()) {
    html += `<span class="result-question-original">Pregunta original: «${escapeHtml(state.originalQuestion)}»</span>`;
  }
  questionEl.innerHTML = html;

  const presentWrap = document.getElementById('present-hexagram');
  presentWrap.innerHTML = '';
  presentWrap.appendChild(hexHTMLBlock(state.lines, state.mutantPositions));

  document.getElementById('present-title').textContent =
    `${state.present.n}. ${state.present.spanish}`;
  document.getElementById('present-pinyin').textContent = state.present.pinyin;
  document.getElementById('present-trigrams').textContent =
    `${TRIGRAMS[state.present.upper].spanish} sobre ${TRIGRAMS[state.present.lower].spanish}`;
  document.getElementById('present-keywords').textContent = state.present.keywords.join(' · ');
  document.getElementById('present-judgment').textContent = state.present.judgment;
  document.getElementById('present-image').textContent = state.present.image;

  // Líneas mutantes
  const mutantSection = document.getElementById('mutant-section');
  const mutantList = document.getElementById('mutant-list');
  mutantList.innerHTML = '';
  if (state.mutantPositions.length === 0) {
    mutantSection.classList.add('stable');
    mutantList.innerHTML = '<p class="stable-note">Situación estable: no hay líneas mutantes. Se lee solo el hexagrama presente.</p>';
  } else {
    mutantSection.classList.remove('stable');
    state.mutantPositions.forEach(pos => {
      const line = state.lines[pos - 1];
      const li = document.createElement('li');
      li.textContent = lineMutationText(pos, line.yang);
      mutantList.appendChild(li);
    });
  }

  // Hexagrama de cambio
  const changingSection = document.getElementById('changing-section');
  if (state.changing) {
    changingSection.style.display = '';
    const changingWrap = document.getElementById('changing-hexagram');
    changingWrap.innerHTML = '';
    const changedLines = state.lines.map(l => ({ yang: l.mutant ? !l.yang : l.yang }));
    changingWrap.appendChild(hexHTMLBlock(changedLines, []));
    document.getElementById('changing-title').textContent =
      `${state.changing.n}. ${state.changing.spanish}`;
    document.getElementById('changing-pinyin').textContent = state.changing.pinyin;
    document.getElementById('changing-trigrams').textContent =
      `${TRIGRAMS[state.changing.upper].spanish} sobre ${TRIGRAMS[state.changing.lower].spanish}`;
    document.getElementById('changing-keywords').textContent = state.changing.keywords.join(' · ');
    document.getElementById('changing-judgment').textContent = state.changing.judgment;
    document.getElementById('changing-image').textContent = state.changing.image;
  } else {
    changingSection.style.display = 'none';
  }
}

// ============================================================
// Interpretación estructural local de respaldo (sin Gemini)
// ============================================================
function localFallbackInterpretation() {
  const p = state.present;
  let text = `**Situación presente**\n\nEl hexagrama ${p.n}, ${p.spanish} (${p.pinyin}), combina ${TRIGRAMS[p.upper].spanish} arriba con ${TRIGRAMS[p.lower].spanish} abajo. ${p.judgment} ${p.image}\n\n`;

  if (state.mutantPositions.length === 0) {
    text += `**Movimiento**\n\nNo hay líneas mutantes: la situación es estable por ahora y conviene leerla tal como se presenta, sin anticipar un cambio de fondo.\n\n`;
  } else {
    text += `**Movimiento**\n\n`;
    state.mutantPositions.forEach(pos => {
      const line = state.lines[pos - 1];
      text += `${lineMutationText(pos, line.yang)}\n\n`;
    });
    if (state.mutantPositions.length >= 4) {
      text += `Con ${state.mutantPositions.length} líneas en movimiento, el campo está muy alterado: conviene dar tanto peso a lo que no cambió como a lo que sí.\n\n`;
    }
  }

  if (state.changing) {
    const c = state.changing;
    text += `**Hacia dónde va**\n\nEl movimiento conduce al hexagrama ${c.n}, ${c.spanish}. ${c.judgment}\n\n`;
  }

  text += `**Consejo**\n\nEsta es una lectura estructural de respaldo, generada localmente sin el modelo de interpretación. Vuelve a intentar la interpretación completa cuando puedas, y mientras tanto, considera la pregunta «${state.question}» a la luz de lo anterior: ¿qué pide el hexagrama que sueltes o que actives?\n\n**En una frase: la situación descrita por este hexagrama pide atención a su propia estructura antes que a un resultado fijo.**`;

  return text;
}

// ============================================================
// Llamada a Gemini
// ============================================================
function buildPrompt() {
  const p = state.present;
  const today = new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });

  let mutantText = 'Ninguna (hexagrama estable).';
  if (state.mutantPositions.length > 0) {
    mutantText = state.mutantPositions.map(pos => {
      const line = state.lines[pos - 1];
      return `- Posición ${pos} (${LINE_POSITION_MEANING[pos]}): ${line.yang ? 'yang viejo → yin' : 'yin viejo → yang'}.`;
    }).join('\n');
  }

  let changingText = 'No aplica: no hay líneas mutantes.';
  if (state.changing) {
    const c = state.changing;
    changingText = `Hexagrama ${c.n}, ${c.spanish} (${c.pinyin}) — trigramas ${TRIGRAMS[c.upper].spanish} arriba / ${TRIGRAMS[c.lower].spanish} abajo. Palabras clave: ${c.keywords.join(', ')}.`;
  }

  return `${SYSTEM_PROMPT}

---
DATOS DE LA CONSULTA

Fecha: ${today}
Pregunta del consultante: "${state.question}"

Hexagrama presente: ${p.n}, ${p.spanish} (${p.pinyin})
Trigramas: ${TRIGRAMS[p.upper].spanish} arriba / ${TRIGRAMS[p.lower].spanish} abajo
Palabras clave: ${p.keywords.join(', ')}

Líneas mutantes:
${mutantText}

Hexagrama de cambio: ${changingText}

Con estos datos, entrega la interpretación siguiendo exactamente la estructura pedida en las reglas.`;
}

async function callGeminiModel(model, apiKey, prompt) {
  const response = await fetch(`${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.6,
        topP: 0.9,
        maxOutputTokens: 2048,
      },
    }),
  });

  if (response.status === 400 || response.status === 403) {
    const err = new Error('AUTH');
    err.kind = 'AUTH';
    throw err;
  }
  if (!response.ok) {
    const err = new Error(`Gemini (${model}) respondió con estado ${response.status}`);
    err.kind = 'MODEL';
    throw err;
  }

  const data = await response.json();
  const parts = data && data.candidates && data.candidates[0] &&
    data.candidates[0].content && data.candidates[0].content.parts;
  const text = Array.isArray(parts) ? parts.map(p => p.text || '').join('') : '';

  if (!text.trim()) {
    const err = new Error('Respuesta vacía de Gemini');
    err.kind = 'MODEL';
    throw err;
  }
  return text;
}

async function requestInterpretation() {
  const box = document.getElementById('interpretation-box');
  const retryBtn = document.getElementById('btn-retry-interpretation');
  retryBtn.style.display = 'none';
  box.innerHTML = '<p class="loading">Consultando la interpretación…</p>';
  state.interpretationError = false;

  const apiKey = getApiKey();
  if (!apiKey) {
    state.interpretation = localFallbackInterpretation();
    state.interpretationError = true;
    renderInterpretation(true, false);
    return;
  }

  const prompt = buildPrompt();
  let lastErr = null;

  for (const model of GEMINI_MODEL_CANDIDATES) {
    try {
      const text = await callGeminiModel(model, apiKey, prompt);
      state.interpretation = text;
      state.interpretationError = false;
      renderInterpretation(false);
      return;
    } catch (err) {
      console.error(`Error al interpretar con Gemini (${model}):`, err);
      lastErr = err;
      if (err.kind === 'AUTH') break; // la clave está mal: no tiene sentido probar otros modelos
    }
  }

  state.interpretation = localFallbackInterpretation();
  state.interpretationError = true;
  renderInterpretation(true, lastErr && lastErr.kind === 'AUTH');
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderMarkdownText(md) {
  const escaped = escapeHtml(md);
  const withBold = escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  const paragraphs = withBold.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  return paragraphs.map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
}

function renderInterpretation(isFallback, isAuthError) {
  const box = document.getElementById('interpretation-box');
  const retryBtn = document.getElementById('btn-retry-interpretation');
  box.innerHTML = renderMarkdownText(state.interpretation);
  if (isFallback) {
    const notice = document.createElement('p');
    notice.className = 'fallback-notice';
    notice.textContent = isAuthError
      ? 'Gemini rechazó la clave guardada (inválida, sin permisos o sin cuota). Revisa o cambia tu clave desde "Cambiar clave" en el inicio. Mientras tanto, se muestra una lectura estructural de respaldo.'
      : 'No se pudo contactar la interpretación de Gemini. Se muestra una lectura estructural de respaldo generada localmente.';
    box.prepend(notice);
    retryBtn.style.display = '';
  } else {
    retryBtn.style.display = 'none';
  }
}

document.getElementById('btn-retry-interpretation').addEventListener('click', requestInterpretation);
document.getElementById('btn-new-interpretation').addEventListener('click', requestInterpretation);

// ============================================================
// Exportar a Markdown
// ============================================================
function linesMarkdown(lines, mutantPositions) {
  const rows = [];
  for (let i = 5; i >= 0; i--) {
    const l = lines[i];
    const isMutant = mutantPositions.includes(i + 1);
    let symbol = l.yang ? '─────────' : '───   ───';
    if (isMutant) symbol += l.yang ? '  ○ (mutante)' : '  ✕ (mutante)';
    rows.push(symbol);
  }
  return rows.join('\n');
}

function buildMarkdownExport() {
  const now = new Date();
  const dateStr = now.toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' });
  const p = state.present;

  let md = `# Consulta I Ching\n\n`;
  md += `**Fecha:** ${dateStr}\n\n`;
  if (state.originalQuestion && state.originalQuestion.trim() !== state.question.trim()) {
    md += `**Pregunta original:** ${state.originalQuestion}\n\n`;
    md += `**Pregunta usada en la consulta (reformulada):** ${state.question}\n\n`;
  } else {
    md += `**Pregunta:** ${state.question}\n\n`;
  }
  md += `## Hexagrama presente\n\n`;
  md += `${p.n}. ${p.spanish} (${p.pinyin}) — ${TRIGRAMS[p.upper].spanish} sobre ${TRIGRAMS[p.lower].spanish}\n\n`;
  md += '```\n' + linesMarkdown(state.lines, state.mutantPositions) + '\n```\n\n';
  md += `Palabras clave: ${p.keywords.join(', ')}\n\n`;
  md += `Juicio: ${p.judgment}\n\n`;
  md += `Imagen: ${p.image}\n\n`;

  md += `## Líneas mutantes\n\n`;
  if (state.mutantPositions.length === 0) {
    md += `Ninguna. Situación estable, se lee solo el hexagrama presente.\n\n`;
  } else {
    state.mutantPositions.forEach(pos => {
      const line = state.lines[pos - 1];
      md += `- ${lineMutationText(pos, line.yang)}\n`;
    });
    md += '\n';
  }

  if (state.changing) {
    const c = state.changing;
    md += `## Hexagrama de cambio\n\n`;
    md += `${c.n}. ${c.spanish} (${c.pinyin}) — ${TRIGRAMS[c.upper].spanish} sobre ${TRIGRAMS[c.lower].spanish}\n\n`;
    const changedLines = state.lines.map(l => ({ yang: l.mutant ? !l.yang : l.yang }));
    md += '```\n' + linesMarkdown(changedLines, []) + '\n```\n\n';
    md += `Palabras clave: ${c.keywords.join(', ')}\n\n`;
    md += `Juicio: ${c.judgment}\n\n`;
    md += `Imagen: ${c.image}\n\n`;
  }

  md += `## Interpretación\n\n`;
  md += `${state.interpretation}\n\n`;

  md += `## Verificación posterior\n\n`;
  md += `(Completar en la bitácora: qué ocurrió realmente, qué acertó y qué no)\n`;

  return md;
}

document.getElementById('btn-copy-markdown').addEventListener('click', async () => {
  const md = buildMarkdownExport();
  const btn = document.getElementById('btn-copy-markdown');
  try {
    await navigator.clipboard.writeText(md);
    const original = btn.textContent;
    btn.textContent = 'Copiado ✓';
    setTimeout(() => { btn.textContent = original; }, 1800);
  } catch (err) {
    console.error('No se pudo copiar al portapapeles:', err);
    window.prompt('Copia manualmente el texto:', md);
  }
});

// ============================================================
// Arranque: pide la clave si aún no está guardada en este navegador
// ============================================================
showScreen(initialScreen());
