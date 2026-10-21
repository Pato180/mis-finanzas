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

  function upcomingOccurrences(rules, today, days, ymd) {
    const formatDate = ymd || defaultYmd;
    if (typeof today !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return [];
    const span = Number.isInteger(days) && days >= 0 ? days : 30;
    const startDate = new Date(today + 'T00:00:00');
    const endDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + span);
    const end = formatDate(endDate);
    const items = [];
    const push = (rule, date, category) => {
      if (date <= today || date > end) return;
      items.push({
        id: String(rule.id) + ':' + date,
        ruleId: rule.id,
        date,
        type: rule.type,
        amount: Number(rule.amount) || 0,
        description: String(rule.description || 'Movimiento fijo'),
        category: category || rule.category || '',
        sub: rule.sub || ''
      });
    };

    (Array.isArray(rules) ? rules : []).forEach(rule => {
      if (!rule || !['income', 'expense'].includes(rule.type)) return;

      if (rule.id === 'salary') {
        if (typeof rule.since !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(rule.since)) return;
        const posted = Array.isArray(rule.posted) ? rule.posted : [];
        const anchor = new Date(rule.since + 'T00:00:00');
        const lastMonth = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
        for (let month = new Date(anchor.getFullYear(), anchor.getMonth(), 1); month <= lastMonth; month = new Date(month.getFullYear(), month.getMonth() + 1, 1)) {
          const key = formatDate(month).slice(0, 7);
          const day = Math.min(Number(rule.since.slice(8)), 28);
          const date = key === rule.since.slice(0, 7) ? rule.since : key + '-' + String(day).padStart(2, '0');
          if (date >= rule.since && !posted.includes(key)) push(rule, date, 'Trabajo');
        }
        return;
      }

      if (typeof rule.start !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(rule.start)) return;
      if (rule.frequency === 'weekly') {
        const anchor = new Date(rule.start + 'T00:00:00');
        const elapsed = Math.floor((startDate - anchor) / 86400000);
        const first = Math.max(0, Math.floor(elapsed / 7) - 1);
        for (let k = first; k < first + 8; k++) {
          const date = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + 7 * k);
          const value = formatDate(date);
          if (value > end) break;
          push(rule, value);
        }
      } else if (rule.frequency === 'monthly') {
        const anchor = new Date(rule.start + 'T00:00:00');
        const monthDiff = (startDate.getFullYear() - anchor.getFullYear()) * 12 + startDate.getMonth() - anchor.getMonth();
        const first = Math.max(0, monthDiff - 1);
        for (let k = first; k < first + 5; k++) {
          const value = dateAtMonth(rule.start, k, formatDate);
          if (value > end) break;
          push(rule, value);
        }
      }
    });

    return items.sort((a, b) => a.date.localeCompare(b.date) || (a.type === b.type ? a.description.localeCompare(b.description, 'es') : a.type.localeCompare(b.type)));
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

  return { dateAtMonth, rescheduleRecurring, applyFixed, buildRecurringEdit, upcomingOccurrences };
});
