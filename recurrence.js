(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MisFinanzasRecurrence = api;
})(typeof globalThis !== 'undefined' ? globalThis : null, function () {
  'use strict';

  function defaultYmd(value) {
    const date = value instanceof Date ? value : new Date(value);
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  }

  function dateAtMonth(anchor, offset, ymd) {
    const formatDate = ymd || defaultYmd;
    const anchorDate = new Date(anchor + 'T00:00:00');
    const target = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + offset, 1);
    target.setDate(Math.min(anchorDate.getDate(), new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()));
    return formatDate(target);
  }

  function rescheduleRecurring(S, previous, nextDate, ymd) {
    const formatDate = ymd || defaultYmd;
    if (!previous || previous.date === nextDate) return;
    const rid = previous.rid || (previous.fixed && previous.description === 'Sueldo' && S.rec.some(item => item.id === 'salary') ? 'salary' : null);
    if (!rid) return;
    previous.rid = rid;
    const rule = S.rec.find(item => String(item.id) === String(rid));
    const field = rule && (rule.start ? 'start' : rule.since ? 'since' : null);
    if (!rule || !field) return;

    const oldDate = previous.date;
    const old = new Date(oldDate + 'T00:00:00');
    const next = new Date(nextDate + 'T00:00:00');
    const isSalary = rid === 'salary';
    const belongs = item => String(item.rid) === String(rid) || (isSalary && item.fixed && item.description === 'Sueldo');
    const later = S.tx.filter(item => belongs(item) && String(item.id) !== String(previous.id) && item.date > oldDate)
      .sort((a, b) => a.date.localeCompare(b.date));

    for (const item of later) {
      if (rule.frequency === 'weekly') {
        const days = Math.round((new Date(item.date + 'T00:00:00') - old) / 86400000);
        item.date = formatDate(new Date(next.getFullYear(), next.getMonth(), next.getDate() + Math.round(days / 7) * 7));
      } else {
        const itemDate = new Date(item.date + 'T00:00:00');
        const months = (itemDate.getFullYear() - old.getFullYear()) * 12 + itemDate.getMonth() - old.getMonth();
        const anchor = isSalary
          ? formatDate(new Date(next.getFullYear(), next.getMonth(), Math.min(next.getDate(), 28)))
          : nextDate;
        item.date = dateAtMonth(anchor, months, formatDate);
      }
    }

    if (rule.frequency === 'weekly') {
      const start = new Date(rule[field] + 'T00:00:00');
      start.setDate(start.getDate() + Math.round((next - old) / 86400000));
      rule[field] = formatDate(start);
    } else {
      const start = new Date(rule[field] + 'T00:00:00');
      const day = isSalary ? Math.min(next.getDate(), 28) : next.getDate();
      rule[field] = formatDate(new Date(start.getFullYear(), start.getMonth(), Math.min(day, new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate())));
    }

    const dates = S.tx.filter(belongs)
      .map(item => String(item.id) === String(previous.id) ? nextDate : item.date)
      .sort();
    if (field === 'start') rule.last = dates.length ? dates[dates.length - 1] : null;
  }

  function applyFixed(S, catFor, ymd, now) {
    const formatDate = ymd || defaultYmd;
    const today = formatDate(now || new Date());
    let count = 0;

    S.rec.forEach(rule => {
      if (rule.id === 'salary' || !rule.start) return;
      const year = +rule.start.slice(0, 4);
      const month = +rule.start.slice(5, 7) - 1;
      const day = +rule.start.slice(8);

      for (let k = 0; k < 400; k++) {
        const date = rule.frequency === 'weekly'
          ? new Date(year, month, day + 7 * k)
          : new Date(year, month + k, Math.min(day, new Date(year, month + k + 1, 0).getDate()));
        const dateString = formatDate(date);
        if (dateString > today) break;
        if (rule.last && dateString <= rule.last) continue;
        if (S.tx.some(item => String(item.rid) === String(rule.id) && item.date === dateString)) {
          rule.last = dateString;
          continue;
        }

        rule.last = dateString;
        count++;
        const transaction = {
          id: Date.now() + 'r' + rule.id + dateString,
          type: rule.type,
          amount: rule.amount,
          description: rule.description,
          ...(rule.category ? { category: rule.category, sub: rule.sub || '' } : catFor(rule.type, rule.description)),
          date: dateString,
          fixed: true,
          rid: rule.id
        };
        if (rule.reason) transaction.reason = rule.reason;
        S.tx.push(transaction);
      }
    });
    return count;
  }

  function buildRecurringEdit(rule, description, amount, frequency, start, originalFrequency, originalStart, today, ymd) {
    const formatDate = ymd || defaultYmd;
    if (!rule || rule.id === 'salary') return { error: 'No se puede editar esta regla fija.' };
    description = String(description || '').trim();
    amount = Number(amount);
    if (!description || !Number.isFinite(amount) || amount <= 0) return { error: 'Revisa la descripción y el monto.' };
    if (!['monthly', 'weekly'].includes(frequency)) return { error: 'Selecciona una periodicidad válida.' };
    if (typeof start !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(start) || formatDate(new Date(start + 'T00:00:00')) !== start) {
      return { error: 'Selecciona una fecha válida.' };
    }
    if (frequency !== originalFrequency && start === originalStart) start = today;
    return { description, amount, frequency, start };
  }

  return { dateAtMonth, rescheduleRecurring, applyFixed, buildRecurringEdit };
});
