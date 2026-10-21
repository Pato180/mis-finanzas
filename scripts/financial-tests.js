'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const reportMatch = html.match(/function report\(ym\)\{[\s\S]*?(?=\nconst fname=)/);
const histMatch = html.match(/function hist\(all,ym\)\{[\s\S]*?(?=\nasync function mkXlsx)/);

assert.ok(reportMatch, 'No se encontró la función report(ym) en index.html.');
assert.ok(histMatch, 'No se encontró la función hist(all, ym) en index.html.');

const sum = (items, type) => items
  .filter(item => item.type === type)
  .reduce((total, item) => total + item.amount, 0);
const ymd = value => {
  const date = value instanceof Date ? value : new Date(value);
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
};

const state = {
  profile: { id: 'test', username: 'Prueba', initialBalance: 100 },
  goals: [{ id: 'g1', title: 'Fondo de emergencia', target: 100 }],
  assets: [{ id: 'a1', name: 'Bicicleta', kind: 'Personal', amount: 80 }],
  liabs: [{ id: 'l1', name: 'Deuda', kind: 'Personal', amount: 25 }],
  tx: [
    { id: 't1', type: 'income', amount: 100, description: 'Pago', category: 'Trabajo', date: '2026-01-05' },
    { id: 't2', type: 'expense', amount: 30, description: 'Comida', category: 'Alimentación', date: '2026-01-08' },
    { id: 't3', type: 'save', amount: 20, description: 'Fondo de emergencia', category: 'Ahorro', goalId: 'g1', date: '2026-01-10' },
    { id: 't4', type: 'income', amount: 50, description: 'Pago', category: 'Trabajo', date: '2026-02-01' },
    { id: 't5', type: 'expense', amount: 15, description: 'Bus', category: 'Transporte', date: '2026-02-02' }
  ]
};

const runReport = new Function('S', 'sum', 'ymd', 'ym', reportMatch[0] + '\nreturn report(ym);');
const runHistory = new Function('S', 'sum', 'ymd', 'all', 'ym', histMatch[0] + '\nreturn hist(all, ym);');
const report = month => runReport(state, sum, ymd, month);
const history = (all, month) => runHistory(state, sum, ymd, all, month);

function compareMonth(month) {
  const current = report(month);
  const ledger = history(false, month);
  assert.equal(current.ini, ledger.ini, month + ': el saldo inicial difiere entre informes.');
  assert.equal(current.fin, ledger.fin, month + ': el saldo final difiere entre informes.');
  assert.equal(current.ti, ledger.ti, month + ': los ingresos difieren entre informes.');
  assert.equal(current.te, ledger.te, month + ': los egresos difieren entre informes.');
  assert.equal(current.ta, ledger.ta, month + ': los ahorros difieren entre informes.');
  assert.equal(ledger.months.at(-1).total, current.fin, month + ': el total mensual no coincide con el saldo final.');
  if (current.rows.length) {
    assert.equal(current.rows.at(-1).s, current.fin, month + ': el saldo de la última operación no coincide.');
    assert.equal(ledger.months.at(-1).rows.at(-1).s, current.fin, month + ': el libro contable no coincide con el saldo final.');
  }
  return current;
}

const january = compareMonth('2026-01');
assert.equal(january.ini, 100);
assert.equal(january.ti, 100);
assert.equal(january.te, 30);
assert.equal(january.ta, 20);
assert.equal(january.fin, 150);
assert.equal(january.goals[0].saved, 20);
assert.equal(january.goals[0].rest, 80);

const february = compareMonth('2026-02');
assert.equal(february.ini, 150, 'Febrero debe arrastrar el saldo final de enero.');
assert.equal(february.fin, 185);
assert.equal(february.act[0][1], 185, 'El efectivo disponible debe reflejar el saldo final.');
assert.equal(february.act[1][1], 20, 'Los ahorros deben figurar por separado del efectivo disponible.');
assert.equal(february.tA, 285, 'Los activos deben sumar efectivo, ahorros y activos registrados.');
assert.equal(february.tP, 25);
assert.equal(february.pn, 260);

const march = compareMonth('2026-03');
assert.equal(march.ti, 0);
assert.equal(march.te, 0);
assert.equal(march.ta, 0);
assert.equal(march.fin, 185, 'Un mes sin movimientos debe conservar el saldo anterior.');

const all = history(true, '2026-01');
assert.equal(all.ti, 150);
assert.equal(all.te, 45);
assert.equal(all.ta, 20);
assert.equal(all.fin, 185, 'El historial completo debe coincidir con el saldo acumulado.');

const backupMatch = html.match(/function normalizeBackupData\(d\)\{[\s\S]*?(?=\nconst backupProfile=)/);
assert.ok(backupMatch, 'No se encontró normalizeBackupData(d) en index.html.');
const cleanBudgets = items => Array.isArray(items) ? items.map((item, i) => ({
  id: String(item.id || ('b' + i)),
  category: item.category.trim(),
  amount: Number(item.amount)
})) : [];
const defaultMotifs = ['Almuerzo', 'Pasaje', 'Servicios básicos', 'Mesada'];
const normalizeBackup = new Function('ymd', 'DM', 'cleanBudgets', 'd', backupMatch[0] + '\nreturn normalizeBackupData(d);');
const validBackup = {
  v: 2,
  profile: { username: 'Prueba', initialBalance: '100', salary: '0', pin: 'no-debe-importarse' },
  tx: [{ id: 'tx1', type: 'income', amount: '25.50', date: '2026-01-05', description: 'Pago' }],
  rec: [], goals: [], motifs: ['Pago'], assets: [], liabs: [], cats: [],
  budgets: [{ id: 'b1', category: 'Alimentación', amount: '50' }]
};
const normalized = normalizeBackup(ymd, defaultMotifs, cleanBudgets, validBackup);
assert.ok(normalized.data, 'Un respaldo válido debe poder normalizarse.');
assert.equal(normalized.data.tx.length, 1);
assert.equal(normalized.data.tx[0].amount, 25.5, 'Los montos importados deben normalizarse a número.');
assert.equal(normalized.data.profile.initialBalance, 100);
assert.equal(normalized.data.profile.pin, undefined, 'El PIN nunca debe importarse desde el archivo.');
assert.equal(normalized.data.budgets[0].amount, 50);

const malformedBackup = {
  ...validBackup,
  tx: [
    validBackup.tx[0],
    { id: 'bad', type: 'expense', amount: 10, date: '2026-02-31', description: 'Fecha inválida' }
  ]
};
const rejected = normalizeBackup(ymd, defaultMotifs, cleanBudgets, malformedBackup);
assert.ok(rejected.error, 'Si un movimiento es inválido, se debe rechazar el respaldo completo.');
assert.match(rejected.error, /No se importó nada/);

const legacyBackup = normalizeBackup(ymd, defaultMotifs, cleanBudgets, { profile: { username: 'Perfil anterior' }, tx: [] });
assert.ok(legacyBackup.data, 'Los respaldos antiguos sin listas opcionales deben seguir siendo compatibles.');
assert.equal(legacyBackup.data.profile.initialBalance, 0);
assert.deepEqual(legacyBackup.data.motifs, defaultMotifs);

console.log('Pruebas correctas: consistencia contable y validación de respaldos completos sin descartar movimientos inválidos.');
