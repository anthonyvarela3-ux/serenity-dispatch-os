(() => {
  'use strict';
  const key = STORE + '_payroll_hours_v1';
  const actions = {
    'Start shift': 'clock-in',
    'End shift': 'clock-out',
    'Reopen shift': 'reopen',
    'Correct shift time': 'correction',
  };
  const feedback = $('payrollExportStatus');
  const minute = value => Number.isInteger(value) && value >= 0 && value < 1440;
  const savedDate = day => day.serviceDate || localServiceDate();

  function read() {
    const items = JSON.parse(localStorage.getItem(key) || '[]');
    if (!Array.isArray(items)) throw Error('Payroll history could not be read.');
    return items;
  }

  function snapshot(items, day) {
    const date = savedDate(day);
    const shift = day.shift;
    if (day.clockMode === 'simulation' || date > localServiceDate() ||
        !minute(shift?.start) || items.some(event => event.date === date)) return;
    const end = minute(shift.end) ? shift.end : null;
    // An existing record has no reliable event timestamp. Preserve its clock values.
    items.push({id: 'existing-' + date + '-' + shift.start + '-' + end,
      date, action: 'existing', start: shift.start, end, at: null});
  }

  function record(before, label, undone = false) {
    const action = actions[label];
    const date = savedDate(state);
    if (!action || !usesDeviceTime() || date > localServiceDate()) return;
    if (before.shift.start === state.shift.start && before.shift.end === state.shift.end) return;
    try {
      const items = read();
      snapshot(items, before);
      const previousTime = items.reduce((latest, event) => Math.max(latest, event.at ?? 0), 0);
      items.push({id: crypto.randomUUID(), date, action: undone ? 'undo' : action,
        start: state.shift.start, end: state.shift.end, at: Math.max(Date.now(), previousTime + 1)});
      localStorage.setItem(key, JSON.stringify(items));
    } catch {
      feedback.textContent = 'Could not save this change to payroll history on this device.';
    }
  }

  $('exportPayrollHours').onclick = () => {
    try {
      const items = read();
      snapshot(items, state);
      const backup = localStorage.getItem(STORE + '_before_manifest');
      if (backup) {
        try {
          const previous = JSON.parse(backup)?.data;
          if (previous?.serviceDate) snapshot(items, previous);
        } catch {}
      }
      if (!items.length) {
        feedback.textContent = 'No recorded work hours are available to export.';
        return;
      }
      localStorage.setItem(key, JSON.stringify(items));
      download('Serenity_Payroll_Hours_' + localServiceDate() + '.json',
        JSON.stringify({format: 'serenity-payroll-1', events: items}), 'application/json');
      feedback.textContent = 'Hours exported. Import the file under Administration → Payroll.';
    } catch {
      feedback.textContent = 'Could not export payroll hours from this browser.';
    }
  };

  payrollHoursController = {record};
  try {
    const items = read();
    snapshot(items, state);
    localStorage.setItem(key, JSON.stringify(items));
  } catch {
    feedback.textContent = 'Payroll history is unavailable in this browser.';
  }
})();
