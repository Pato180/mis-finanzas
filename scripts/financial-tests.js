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

const recurrence = require(path.join(__dirname, '..', 'recurrence.js'));
const dateAtMonth = (anchor, offset) => recurrence.dateAtMonth(anchor, offset, ymd);
assert.equal(dateAtMonth('2026-01-31', 1), '2026-02-28', 'Enero 31 debe pasar a febrero 28.');
assert.equal(dateAtMonth('2024-01-31', 1), '2024-02-29', 'Debe respetar febrero en año bisiesto.');
assert.equal(dateAtMonth('2026-01-31', 2), '2026-03-31', 'La fecha ancla debe recuperarse en meses largos.');
assert.equal(dateAtMonth('2026-05-30', 1), '2026-06-30', 'No debe desbordar al mes siguiente.');

const monthlyState = {
  rec: [{ id: 'r-month', type: 'expense', amount: 40, description: 'Arriendo', frequency: 'monthly', start: '2026-01-31', last: '2026-04-30' }],
  tx: [
    { id: 'jan', type: 'expense', amount: 40, description: 'Arriendo', date: '2026-01-31', fixed: true, rid: 'r-month', category: 'Vivienda', reason: 'Casa', extraMeta: 'preservar' },
    { id: 'feb', type: 'expense', amount: 40, description: 'Arriendo', date: '2026-02-28', fixed: true, rid: 'r-month' },
    { id: 'mar', type: 'expense', amount: 40, description: 'Arriendo', date: '2026-03-31', fixed: true, rid: 'r-month' },
    { id: 'apr', type: 'expense', amount: 40, description: 'Arriendo', date: '2026-04-30', fixed: true, rid: 'r-month' }
  ]
};
const runReschedule = (state, previous, nextDate) => recurrence.rescheduleRecurring(state, previous, nextDate, ymd);
const editedMarch = { ...monthlyState.tx[2], date: '2026-03-30' };
runReschedule(monthlyState, monthlyState.tx[2], editedMarch.date);
monthlyState.tx[2] = editedMarch;
assert.equal(monthlyState.tx[3].date, '2026-04-30', 'Editar una ocurrencia mensual debe reprogramar la siguiente sin desbordar el mes.');
assert.equal(monthlyState.rec[0].start, '2026-01-30', 'El ancla de la periodicidad mensual debe ajustarse para futuras ocurrencias.');
assert.equal(monthlyState.rec[0].last, '2026-04-30', 'El último periodo aplicado debe mantenerse actualizado.');
assert.equal(monthlyState.tx[0].reason, 'Casa', 'Editar una ocurrencia no debe borrar el motivo histórico.');
assert.equal(monthlyState.tx[0].extraMeta, 'preservar', 'Los metadatos adicionales deben conservarse.');

const weeklyState = {
  rec: [{ id: 'r-week', type: 'income', amount: 15, description: 'Mesada', frequency: 'weekly', start: '2026-03-03', last: '2026-03-24' }],
  tx: [
    { id: 'w1', type: 'income', amount: 15, description: 'Mesada', date: '2026-03-03', fixed: true, rid: 'r-week' },
    { id: 'w2', type: 'income', amount: 15, description: 'Mesada', date: '2026-03-10', fixed: true, rid: 'r-week' },
    { id: 'w3', type: 'income', amount: 15, description: 'Mesada', date: '2026-03-17', fixed: true, rid: 'r-week' },
    { id: 'w4', type: 'income', amount: 15, description: 'Mesada', date: '2026-03-24', fixed: true, rid: 'r-week' }
  ]
};
const runWeeklyReschedule = (state, previous, nextDate) => recurrence.rescheduleRecurring(state, previous, nextDate, ymd);
const editedWeek = { ...weeklyState.tx[1], date: '2026-03-12' };
runWeeklyReschedule(weeklyState, weeklyState.tx[1], editedWeek.date);
weeklyState.tx[1] = editedWeek;
assert.equal(weeklyState.tx[2].date, '2026-03-19', 'Mover una ocurrencia semanal debe desplazar las siguientes por el mismo número de días.');
assert.equal(weeklyState.tx[3].date, '2026-03-26');
assert.equal(weeklyState.rec[0].start, '2026-03-05', 'El ancla semanal debe desplazarse con la ocurrencia editada.');

class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : ['2026-04-30T12:00:00Z'])); }
}
const generatedState = {
  rec: [{ id: 'r-monthly', type: 'expense', amount: 20, description: 'Internet', category: 'Servicios', sub: 'Hogar', reason: 'Factura', frequency: 'monthly', start: '2026-01-31', last: null }],
  tx: []
};
const catFor = (type, description) => ({ category: 'Otros', sub: '' });
const runApplyFixed = (state, now) => () => recurrence.applyFixed(state, catFor, ymd, now);
const applyFixed = runApplyFixed(generatedState, new FixedDate());
assert.equal(applyFixed(), 4, 'Debe generar cada vencimiento mensual hasta la fecha de hoy.');
assert.deepEqual(generatedState.tx.map(item => item.date), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
assert.ok(generatedState.tx.every(item => item.rid === 'r-monthly' && item.fixed && item.reason === 'Factura'), 'Cada ocurrencia debe conservar vínculo y motivo.');
assert.equal(applyFixed(), 0, 'Aplicar dos veces no debe duplicar las mismas ocurrencias.');
assert.equal(new Set(generatedState.tx.map(item => item.id)).size, generatedState.tx.length, 'Cada ocurrencia debe tener un identificador único.');

const partiallyExisting = {
  rec: [{ id: 'r-partial', type: 'expense', amount: 10, description: 'Servicio', frequency: 'monthly', start: '2026-01-31', last: null }],
  tx: [{ id: 'existing-feb', type: 'expense', amount: 10, description: 'Servicio', date: '2026-02-28', fixed: true, rid: 'r-partial' }]
};
const applyWithExisting = runApplyFixed(partiallyExisting, new FixedDate());
assert.equal(applyWithExisting(), 3, 'Debe omitir una ocurrencia existente aunque el marcador last esté vacío.');
assert.equal(partiallyExisting.tx.filter(item => item.date === '2026-02-28').length, 1, 'No debe duplicar una ocurrencia ya registrada.');
assert.deepEqual(partiallyExisting.tx.map(item => item.date).sort(), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);

const upcoming = recurrence.upcomingOccurrences([
  { id: 'weekly', type: 'expense', amount: 12, description: 'Pasajes', frequency: 'weekly', start: '2026-10-12', category: 'Transporte' },
  { id: 'monthly', type: 'expense', amount: 40, description: 'Arriendo', frequency: 'monthly', start: '2026-10-12', category: 'Vivienda' },
  { id: 'salary', type: 'income', amount: 500, description: 'Sueldo', frequency: 'monthly', since: '2026-10-15', posted: ['2026-10'] },
  { id: 'old', type: 'expense', amount: 5, description: 'Antiguo', frequency: 'monthly', start: '2020-01-01' },
  { id: 'bad', type: 'expense', amount: 9, description: 'Sin periodicidad', start: '2026-10-22' }
], '2026-10-20', 30, ymd);
assert.deepEqual(upcoming.map(item => [item.description, item.date, item.type]), [
  ['Pasajes', '2026-10-26', 'expense'],
  ['Arriendo', '2026-11-12', 'expense'],
  ['Sueldo', '2026-11-15', 'income']
], 'Debe mostrar solo ocurrencias futuras válidas dentro de los próximos 30 días y omitir cobros ya registrados.');
assert.equal(upcoming[0].category, 'Transporte', 'Debe conservar la categoría para mostrarla en el resumen.');
assert.equal(recurrence.upcomingOccurrences([], '2026-10-20', 30, ymd).length, 0, 'Sin reglas no debe haber próximos pagos.');

const buildRecurringEdit = (...args) => recurrence.buildRecurringEdit(...args, ymd);
const ruleBefore = { id: 'r-edit', description: 'Internet', amount: 25, frequency: 'monthly', start: '2026-01-31', last: '2026-10-31', category: 'Servicios', reason: 'Factura', customMeta: 'mantener' };
const amountEdit = buildRecurringEdit(ruleBefore, 'Internet hogar', '30.50', 'monthly', '2026-01-31', 'monthly', '2026-01-31', '2026-10-20');
assert.deepEqual(amountEdit, { description: 'Internet hogar', amount: 30.5, frequency: 'monthly', start: '2026-01-31' }, 'Editar monto y descripción no debe mover la fecha ancla.');
const frequencyEdit = buildRecurringEdit(ruleBefore, 'Internet hogar', '30.50', 'weekly', '2026-01-31', 'monthly', '2026-01-31', '2026-10-20');
assert.deepEqual(frequencyEdit, { description: 'Internet hogar', amount: 30.5, frequency: 'weekly', start: '2026-10-20' }, 'Cambiar periodicidad debe iniciar desde hoy si el usuario no escoge otra fecha.');
const explicitStartEdit = buildRecurringEdit(ruleBefore, 'Internet hogar', 30.5, 'weekly', '2026-10-25', 'monthly', '2026-01-31', '2026-10-20');
assert.equal(explicitStartEdit.start, '2026-10-25', 'Debe respetar la fecha de inicio que el usuario elija.');
assert.ok(buildRecurringEdit(ruleBefore, 'Internet', 0, 'monthly', '2026-01-31', 'monthly', '2026-01-31', '2026-10-20').error, 'No debe aceptar montos cero.');
assert.ok(buildRecurringEdit(ruleBefore, 'Internet', 25, 'yearly', '2026-01-31', 'monthly', '2026-01-31', '2026-10-20').error, 'No debe aceptar periodicidades desconocidas.');
assert.equal(ruleBefore.customMeta, 'mantener', 'Preparar la edición no debe mutar ni descartar metadatos del objeto original.');
assert.equal(ruleBefore.last, '2026-10-31', 'Preparar la edición no debe alterar el historial aplicado.');

console.log('Pruebas correctas: cálculos, respaldos, fechas mensuales/semanales, fin de mes, años bisiestos, reprogramación, duplicados y edición segura de reglas recurrentes.');
