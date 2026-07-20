#!/usr/bin/env node
/* Valida la integridad de los 64 hexagramas: cuenta, unicidad de
 * combinaciones de trigramas, unicidad de patrones de bits, y
 * numeración 1-64 sin huecos ni duplicados. Ejecutar con:
 *   node scripts/validate.js
 */
const path = require('path');
const { TRIGRAMS, HEXAGRAM_SEQUENCE } = require(path.join(__dirname, '..', 'data.js'));

let errors = [];

// 1. 64 entradas
if (HEXAGRAM_SEQUENCE.length !== 64) {
  errors.push(`Se esperaban 64 hexagramas, hay ${HEXAGRAM_SEQUENCE.length}.`);
}

// 2. numeración 1-64 sin huecos ni duplicados
const numbers = HEXAGRAM_SEQUENCE.map(h => h.n).sort((a, b) => a - b);
for (let i = 0; i < 64; i++) {
  if (numbers[i] !== i + 1) {
    errors.push(`Numeración incorrecta cerca de la posición ${i}: se encontró ${numbers[i]}, se esperaba ${i + 1}.`);
    break;
  }
}
const numSet = new Set(HEXAGRAM_SEQUENCE.map(h => h.n));
if (numSet.size !== HEXAGRAM_SEQUENCE.length) {
  errors.push('Hay números de hexagrama duplicados.');
}

// 3. trigramas válidos y combinaciones únicas
const trigramKeys = Object.keys(TRIGRAMS);
const comboSet = new Set();
const bitsSet = new Set();
const bitsToNumber = {};

for (const h of HEXAGRAM_SEQUENCE) {
  if (!trigramKeys.includes(h.lower) || !trigramKeys.includes(h.upper)) {
    errors.push(`Hexagrama ${h.n}: trigrama inválido (${h.lower}/${h.upper}).`);
    continue;
  }
  const combo = `${h.lower}-${h.upper}`;
  if (comboSet.has(combo)) {
    errors.push(`Hexagrama ${h.n}: combinación de trigramas duplicada (${combo}).`);
  }
  comboSet.add(combo);

  const bits = [...TRIGRAMS[h.lower].bits, ...TRIGRAMS[h.upper].bits];
  const bitsKey = bits.join('');
  if (bitsSet.has(bitsKey)) {
    errors.push(`Hexagrama ${h.n}: patrón de bits duplicado (${bitsKey}).`);
  }
  bitsSet.add(bitsKey);
  bitsToNumber[bitsKey] = h.n;
}

if (comboSet.size !== 64) {
  errors.push(`Se esperaban 64 combinaciones únicas de trigramas, hay ${comboSet.size}.`);
}
if (bitsSet.size !== 64) {
  errors.push(`Se esperaban 64 patrones de bits únicos, hay ${bitsSet.size}.`);
}

// 4. campos requeridos de texto original presentes
for (const h of HEXAGRAM_SEQUENCE) {
  if (!h.pinyin || !h.spanish || !Array.isArray(h.keywords) || h.keywords.length === 0 || !h.judgment || !h.image) {
    errors.push(`Hexagrama ${h.n}: faltan campos de texto.`);
  }
}

if (errors.length) {
  console.error(`VALIDACIÓN FALLIDA (${errors.length} error(es)):`);
  errors.forEach(e => console.error(' - ' + e));
  process.exit(1);
} else {
  console.log('OK: 64 hexagramas, combinaciones de trigramas únicas, patrones de bits únicos, numeración 1-64 completa y sin duplicados.');
  process.exit(0);
}
