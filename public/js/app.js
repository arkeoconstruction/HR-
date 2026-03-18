/* RQL Construction HR — Frontend App */
'use strict';

// ── State ─────────────────────────────────────────────────────────────────────
let allEmployees = [];
let editingRowIndex = null;
let currentView = 'dashboard';

// ── DOM Refs ──────────────────────────────────────────────────────────────────
const loadingEl      = document.getElementById('loading');
const emptyStateEl   = document.getElementById('empty-state');
const tableWrapEl    = document.getElementById('table-wrap');
const tbodyEl        = document.getElementById('employee-tbody');
const searchInput    = document.getElementById('search-input');
const filterStatus   = document.getElementById('filter-status');
const filterType     = document.getElementById('filter-type');
const modalOverlay   = document.getElementById('modal-overlay');
const modalTitleEl   = document.getElementById('modal-title');
const employeeForm   = document.getElementById('employee-form');
const toastContainer = document.getElementById('toast-container');

// Stats
const statTotal        = document.getElementById('stat-total');
const statExpired      = document.getElementById('stat-expired');
const statExpiringSoon = document.getElementById('stat-expiring-soon');
const statActive       = document.getElementById('stat-active');

// Views
const viewDashboard  = document.getElementById('view-dashboard');
const viewReminders  = document.getElementById('view-reminders');
const remindersContent = document.getElementById('reminders-content');

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadEmployees();
  bindEvents();
});

function bindEvents() {
  document.getElementById('btn-add-employee').addEventListener('click', openAddModal);
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('btn-cancel').addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });
  employeeForm.addEventListener('submit', handleFormSubmit);
  searchInput.addEventListener('input', renderTable);
  filterStatus.addEventListener('change', renderTable);
  filterType.addEventListener('change', renderTable);

  document.getElementById('btn-run-reminders').addEventListener('click', triggerReminders);
  document.getElementById('btn-sync-calendar').addEventListener('click', syncCalendar);

  // Nav tabs
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => switchView(tab.dataset.view));
  });
}

// ── View Switching ────────────────────────────────────────────────────────────
function switchView(view) {
  currentView = view;
  document.querySelectorAll('.nav-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.view === view);
  });
  viewDashboard.classList.toggle('hidden', view !== 'dashboard');
  viewReminders.classList.toggle('hidden', view !== 'reminders');

  if (view === 'reminders') renderReminders();
}

// ── API helpers ───────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Unknown error');
  return data;
}

// ── Load Employees ────────────────────────────────────────────────────────────
async function loadEmployees() {
  showLoading(true);
  try {
    const data = await api('GET', '/api/employees');
    allEmployees = data.data || [];
    updateStats();
    renderTable();
    if (currentView === 'reminders') renderReminders();
  } catch (err) {
    toast(`Failed to load employees: ${err.message}`, 'error');
  } finally {
    showLoading(false);
  }
}

function showLoading(on) {
  loadingEl.classList.toggle('hidden', !on);
  if (on) {
    emptyStateEl.classList.add('hidden');
    tableWrapEl.classList.add('hidden');
  }
}

// ── Stats ─────────────────────────────────────────────────────────────────────
function updateStats() {
  const total   = allEmployees.length;
  const expired = allEmployees.filter(e => e.daysLeft !== null && e.daysLeft <= 0).length;
  const soon    = allEmployees.filter(e => e.daysLeft !== null && e.daysLeft > 0 && e.daysLeft <= 30).length;
  const active  = allEmployees.filter(e => e.daysLeft !== null && e.daysLeft > 30).length;

  statTotal.textContent        = total;
  statExpired.textContent      = expired;
  statExpiringSoon.textContent = soon;
  statActive.textContent       = active;
}

// ── Render Table ──────────────────────────────────────────────────────────────
function renderTable() {
  const query  = searchInput.value.trim().toLowerCase();
  const status = filterStatus.value;
  const type   = filterType.value;

  let filtered = allEmployees.filter(emp => {
    if (query) {
      const haystack = [emp.Name, emp.Role, emp.Email, emp.Phone, emp.Notes].join(' ').toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    if (type !== 'all' && emp.Type !== type) return false;
    if (status !== 'all') {
      const d = emp.daysLeft;
      if (status === 'expired'  && !(d !== null && d <= 0)) return false;
      if (status === 'critical' && !(d !== null && d > 0 && d <= 7)) return false;
      if (status === 'warning'  && !(d !== null && d > 7 && d <= 30)) return false;
      if (status === 'active'   && !(d !== null && d > 30)) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    tableWrapEl.classList.add('hidden');
    emptyStateEl.classList.remove('hidden');
  } else {
    emptyStateEl.classList.add('hidden');
    tableWrapEl.classList.remove('hidden');
  }

  tbodyEl.innerHTML = filtered.map(emp => renderRow(emp)).join('');

  tbodyEl.querySelectorAll('[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', () => openEditModal(parseInt(btn.dataset.row, 10)));
  });
  tbodyEl.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', () => confirmDelete(parseInt(btn.dataset.row, 10), btn.dataset.name, btn.dataset.end));
  });
}

function renderRow(emp) {
  const { badge } = getStatusInfo(emp.daysLeft);
  const start = formatDate(emp.ContractStart);
  const end   = formatDate(emp.ContractEnd);

  return `<tr>
    <td><strong>${esc(emp.Name)}</strong></td>
    <td>${esc(emp.Role)}</td>
    <td>${esc(emp.Type)}</td>
    <td>${esc(emp.Email)}</td>
    <td>${esc(emp.Phone)}</td>
    <td>${start}</td>
    <td>${end}</td>
    <td>${badge}</td>
    <td>${esc(emp.MissedDays) || '0'}</td>
    <td class="td-notes" title="${esc(emp.Notes)}">${esc(emp.Notes) || '<span style="color:#9ca3af">—</span>'}</td>
    <td>
      <div class="td-actions">
        <button class="btn btn-outline btn-icon" title="Edit" data-action="edit" data-row="${emp._rowIndex}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="btn btn-danger btn-icon" title="Delete" data-action="delete" data-row="${emp._rowIndex}" data-name="${esc(emp.Name)}" data-end="${esc(emp.ContractEnd)}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        </button>
      </div>
    </td>
  </tr>`;
}

function getStatusInfo(daysLeft) {
  if (daysLeft === null || daysLeft === undefined) {
    return { badge: '<span class="badge badge-unknown"><span class="badge-dot" style="background:#9ca3af"></span>No Date</span>' };
  }
  if (daysLeft <= 0) return {
    badge: '<span class="badge badge-expired"><span class="badge-dot" style="background:#dc2626"></span>Expired</span>',
  };
  if (daysLeft <= 7) return {
    badge: `<span class="badge badge-critical"><span class="badge-dot" style="background:#e11d48"></span>${daysLeft}d left</span>`,
  };
  if (daysLeft <= 30) return {
    badge: `<span class="badge badge-warning"><span class="badge-dot" style="background:#d97706"></span>${daysLeft}d left</span>`,
  };
  return {
    badge: `<span class="badge badge-active"><span class="badge-dot" style="background:#16a34a"></span>Active</span>`,
  };
}

// ── Reminders View ────────────────────────────────────────────────────────────
const REMINDER_THRESHOLDS = [
  { key: 'expired',  label: 'Expired',         cls: 'reminder-group--expired',  test: d => d !== null && d <= 0 },
  { key: 'critical', label: 'Critical — ≤ 7 days',  cls: 'reminder-group--critical', test: d => d !== null && d > 0 && d <= 7 },
  { key: 'warning',  label: 'Warning — ≤ 30 days',  cls: 'reminder-group--warning',  test: d => d !== null && d > 7 && d <= 30 },
  { key: 'upcoming', label: 'Upcoming — ≤ 60 days', cls: 'reminder-group--upcoming', test: d => d !== null && d > 30 && d <= 60 },
];

function renderReminders() {
  const groups = REMINDER_THRESHOLDS.map(t => ({
    ...t,
    employees: allEmployees.filter(e => t.test(e.daysLeft)),
  })).filter(g => g.employees.length > 0);

  if (groups.length === 0) {
    remindersContent.innerHTML = `
      <div class="reminder-empty" style="padding:60px 20px;text-align:center;color:var(--gray-400)">
        <svg style="width:48px;height:48px;margin:0 auto 12px;display:block" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
        <p style="font-size:16px;font-weight:600;color:var(--gray-600)">No upcoming contract reminders</p>
        <p style="margin-top:6px;font-size:14px">All contracts are active with more than 60 days remaining.</p>
      </div>`;
    return;
  }

  remindersContent.innerHTML = groups.map(g => `
    <div class="reminder-group ${g.cls}">
      <div class="reminder-group-header">
        <h3>${g.label}</h3>
        <span class="group-count">${g.employees.length}</span>
      </div>
      <div class="reminder-cards">
        ${g.employees.map(emp => renderReminderCard(emp)).join('')}
      </div>
    </div>`).join('');
}

function renderReminderCard(emp) {
  const initial = (emp.Name || '?').charAt(0).toUpperCase();
  const end = formatDate(emp.ContractEnd);
  const d = emp.daysLeft;
  let daysColor = 'var(--success)';
  if (d <= 0) daysColor = 'var(--danger)';
  else if (d <= 7) daysColor = '#e11d48';
  else if (d <= 30) daysColor = 'var(--warning)';
  else daysColor = 'var(--brand)';

  const daysLabel = d <= 0 ? 'EXPIRED' : `${d}d`;

  return `<div class="reminder-card">
    <div class="reminder-card-avatar">${esc(initial)}</div>
    <div class="reminder-card-info">
      <div class="reminder-card-name">${esc(emp.Name)}</div>
      <div class="reminder-card-meta">${esc(emp.Role) || '—'} &bull; ${esc(emp.Type) || '—'}</div>
      <div class="reminder-card-end">Contract ends: <strong>${end}</strong></div>
    </div>
    <div class="reminder-card-days" style="color:${daysColor}">${daysLabel}</div>
  </div>`;
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function openAddModal() {
  editingRowIndex = null;
  modalTitleEl.textContent = 'Add Employee';
  document.getElementById('btn-save').textContent = 'Add Employee';
  employeeForm.reset();
  document.getElementById('form-row-index').value = '';
  modalOverlay.classList.remove('hidden');
}

function openEditModal(rowIndex) {
  const emp = allEmployees.find(e => e._rowIndex === rowIndex);
  if (!emp) return;

  editingRowIndex = rowIndex;
  modalTitleEl.textContent = 'Edit Employee';
  document.getElementById('btn-save').textContent = 'Save Changes';
  document.getElementById('form-row-index').value = rowIndex;
  document.getElementById('form-name').value    = emp.Name || '';
  document.getElementById('form-role').value    = emp.Role || '';
  document.getElementById('form-type').value    = emp.Type || '';
  document.getElementById('form-email').value   = emp.Email || '';
  document.getElementById('form-phone').value   = emp.Phone || '';
  document.getElementById('form-start').value   = toInputDate(emp.ContractStart);
  document.getElementById('form-end').value     = toInputDate(emp.ContractEnd);
  document.getElementById('form-missed').value  = emp.MissedDays || '0';
  document.getElementById('form-notes').value   = emp.Notes || '';
  modalOverlay.classList.remove('hidden');
}

function closeModal() {
  modalOverlay.classList.add('hidden');
  editingRowIndex = null;
}

async function handleFormSubmit(e) {
  e.preventDefault();
  const saveBtn = document.getElementById('btn-save');
  saveBtn.disabled = true;

  const employee = {
    Name:          document.getElementById('form-name').value.trim(),
    Role:          document.getElementById('form-role').value.trim(),
    Type:          document.getElementById('form-type').value,
    Email:         document.getElementById('form-email').value.trim(),
    Phone:         document.getElementById('form-phone').value.trim(),
    ContractStart: document.getElementById('form-start').value,
    ContractEnd:   document.getElementById('form-end').value,
    MissedDays:    document.getElementById('form-missed').value || '0',
    Notes:         document.getElementById('form-notes').value.trim(),
  };

  try {
    if (editingRowIndex) {
      await api('PUT', `/api/employees/${editingRowIndex}`, employee);
      toast('Employee updated successfully', 'success');
    } else {
      await api('POST', '/api/employees', employee);
      toast('Employee added successfully', 'success');
    }
    closeModal();
    await loadEmployees();
  } catch (err) {
    toast(`Error: ${err.message}`, 'error');
  } finally {
    saveBtn.disabled = false;
  }
}

async function confirmDelete(rowIndex, name, contractEnd) {
  if (!confirm(`Delete ${name}? This cannot be undone.`)) return;
  try {
    await api('DELETE', `/api/employees/${rowIndex}`, { name, contractEnd });
    toast(`${name} deleted`, 'success');
    await loadEmployees();
  } catch (err) {
    toast(`Delete failed: ${err.message}`, 'error');
  }
}

// ── Actions ───────────────────────────────────────────────────────────────────
async function triggerReminders() {
  const btn = document.getElementById('btn-run-reminders');
  btn.disabled = true;
  btn.textContent = 'Sending…';
  try {
    const data = await api('POST', '/api/reminders/run');
    const count = data.result?.reminders?.length || 0;
    toast(`Reminders sent: ${count} email(s) dispatched`, 'success');
  } catch (err) {
    toast(`Reminder error: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 17H2a3 3 0 000 6h20a3 3 0 000-6z"/><path d="M12 3v14"/></svg> Send Reminders`;
  }
}

async function syncCalendar() {
  const btn = document.getElementById('btn-sync-calendar');
  btn.disabled = true;
  btn.textContent = 'Syncing…';
  try {
    const data = await api('POST', '/api/calendar/sync');
    const count = data.result?.synced || 0;
    toast(`Calendar synced: ${count} event(s) created/verified`, 'success');
  } catch (err) {
    toast(`Sync error: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> Sync Calendar`;
  }
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function toast(message, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  toastContainer.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(str) {
  if (!str) return '<span style="color:#9ca3af">—</span>';
  try {
    return new Date(str).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return esc(str);
  }
}

function toInputDate(str) {
  if (!str) return '';
  try {
    const d = new Date(str);
    return d.toISOString().split('T')[0];
  } catch {
    return str;
  }
}
