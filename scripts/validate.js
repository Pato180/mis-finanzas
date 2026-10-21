'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');

function fail(message) {
  console.error('ERROR:', message);
  process.exitCode = 1;
}

function requireFile(relativePath) {
  if (!fs.existsSync(path.join(root, relativePath))) {
    fail(`Falta el archivo requerido: ${relativePath}`);
    return false;
  }
  return true;
}

const htmlPath = path.join(root, 'index.html');
const recurrencePath = path.join(root, 'recurrence.js');
const swPath = path.join(root, 'sw.js');
const manifestPath = path.join(root, 'manifest.webmanifest');

if (!requireFile('index.html') || !requireFile('recurrence.js') || !requireFile('sw.js') || !requireFile('manifest.webmanifest')) {
  process.exit(1);
}

const html = fs.readFileSync(htmlPath, 'utf8');
let manifest;

try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
} catch (error) {
  fail(`manifest.webmanifest no es JSON válido: ${error.message}`);
}

if (manifest) {
  if (!manifest.name || !manifest.start_url || !manifest.scope) {
    fail('El manifiesto debe definir name, start_url y scope.');
  }

  if (!Array.isArray(manifest.icons) || manifest.icons.length === 0) {
    fail('El manifiesto debe declarar al menos un icono.');
  } else {
    for (const icon of manifest.icons) {
      if (!icon.src || !requireFile(icon.src.replace(/^\.\//, ''))) continue;
      if (!icon.sizes || !icon.type) {
        fail(`El icono ${icon.src} debe declarar sizes y type.`);
      }
    }
  }
}

if (!/<link\s+rel=["']manifest["']\s+href=["']manifest\.webmanifest["']/i.test(html)) {
  fail('index.html no enlaza manifest.webmanifest.');
}

if (!/serviceWorker\.register\(\s*['"](?:\.\/)?sw\.js['"]\s*\)/.test(html)) {
  fail('index.html no registra el service worker sw.js.');
}

const recurrenceTag = '<script src="./recurrence.js"></script>';
if (!html.includes(recurrenceTag) || html.indexOf(recurrenceTag) > html.indexOf('<script>')) {
  fail('index.html debe cargar recurrence.js antes del JavaScript principal.');
}

const scriptBlocks = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  .filter(([, attributes, body]) => !/\bsrc\s*=/i.test(attributes) && body.trim());

if (scriptBlocks.length === 0) {
  fail('No se encontró ningún bloque JavaScript inline para validar.');
} else {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mis-finanzas-check-'));
  try {
    scriptBlocks.forEach(([, , body], index) => {
      const tempFile = path.join(tempDir, `inline-${index + 1}.js`);
      fs.writeFileSync(tempFile, body, 'utf8');
      const result = spawnSync(process.execPath, ['--check', tempFile], { encoding: 'utf8' });
      if (result.status !== 0) {
        fail(`Error de sintaxis en JavaScript inline (${index + 1}):\n${result.stderr || result.stdout}`);
      }
    });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

const coachRequirements = [
  [/function coachData\(\)/, 'index.html debe calcular los datos base del coach en una sola función.'],
  [/function tips\(pl,i,o\)/, 'index.html debe incluir el evaluador de reglas del coach.'],
  [/id=["']obIf["']/, 'El alta inicial debe preguntar la frecuencia de ingreso.'],
  [/id=["']pfIf["']/, 'El perfil debe permitir editar la frecuencia de ingreso.'],
  [/incomeFrequency/, 'La frecuencia de ingreso debe guardarse en el perfil.'],
  [/id=["']coachIncome["']/, 'El Resumen debe mostrar por separado el ingreso previsto.'],
  [/periodMoves<5/, 'El coach debe aplicar la prioridad de pocos movimientos al período actual.'],
  [/MisFinanzasRecurrence\\.upcomingOccurrences/, 'El coach debe calcular ingresos y gastos futuros desde las reglas recurrentes.']
];
for (const [pattern, message] of coachRequirements) {
  if (!pattern.test(html)) fail(message);
}

const sw = fs.readFileSync(swPath, 'utf8');
if (!/key\.startsWith\(['"]mis-finanzas-['"]\)\s*&&\s*key\s*!==\s*CACHE_NAME/.test(sw)) {
  fail('El service worker debe eliminar únicamente las cachés antiguas de Mis Finanzas, no las de otras aplicaciones.');
}
if (!/caches\.open\(CACHE_NAME\)\.then\(cache\s*=>\s*cache\.match\(req\)/.test(sw)) {
  fail('El service worker debe consultar la caché propia de Mis Finanzas para los recursos.');
}
const cacheMatch = sw.match(/const\s+FILES_TO_CACHE\s*=\s*\[([\s\S]*?)\]/);
if (!cacheMatch) {
  fail('No se pudo identificar FILES_TO_CACHE en sw.js.');
} else {
  const cachedPaths = [...cacheMatch[1].matchAll(/['"]([^'"]+)['"]/g)].map(match => match[1]);
  for (const cachedPath of cachedPaths) {
    const normalized = cachedPath.replace(/^\.\//, '');
    if (normalized && !requireFile(normalized)) {
      fail(`sw.js intenta precargar un archivo inexistente: ${cachedPath}`);
    }
  }
}

const recurrenceCheck = spawnSync(process.execPath, ['--check', recurrencePath], { encoding: 'utf8' });
if (recurrenceCheck.status !== 0) {
  fail(`Error de sintaxis en recurrence.js:\n${recurrenceCheck.stderr || recurrenceCheck.stdout}`);
}

const swCheck = spawnSync(process.execPath, ['--check', swPath], { encoding: 'utf8' });
if (swCheck.status !== 0) {
  fail(`Error de sintaxis en sw.js:\n${swCheck.stderr || swCheck.stdout}`);
}

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log('Validación correcta: JavaScript inline, sw.js, manifiesto, iconos y archivos precargados.');
