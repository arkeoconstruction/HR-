'use strict';

// ── State ──────────────────────────────────────────────────────────────────────
let allEmployees = [];
let editingId    = null;

// ── DOM Refs ───────────────────────────────────────────────────────────────────
const loadingEl       = document.getElementById('loading');
const emptyStateEl    = document.getElementById('empty-state');
const tableWrapEl     = document.getElementById('table-wrap');
const tbodyEl         = document.getElementById('employee-tbody');
const searchInput     = document.getElementById('search-input');
const filterStatus    = document.getElementById('filter-status');
const filterType      = document.getElementById('filter-type');
const modalOverlay    = document.getElementById('modal-overlay');
const modalTitleEl    = document.getElementById('modal-title');
const employeeForm    = document.getElementById('employee-form');
const toastContainer  = document.getElementById('toast-container');
const statTotal       = document.getElementById('stat-total');
const statExpired     = document.getElementById('stat-expired');
const statExpiringSoon= document.getElementById('stat-expiring-soon');
const statActive      = document.getElementById('stat-active');

// ── Init ───────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadEmployees();
  document.getElementById('btn-add-employee').addEventListener('click', openAddModal);
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('btn-cancel').addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });
  employeeForm.addEventListener('submit', handleFormSubmit);
  searchInput.addEventListener('input', renderTable);
  filterStatus.addEventListener('change', renderTable);
  filterType.addEventListener('change', renderTable);
});

// ── API helper ─────────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res  = await fetch(path, opts);
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Unknown error');
  return data;
}

// ── Load ───────────────────────────────────────────────────────────────────────
async function loadEmployees() {
  showLoading(true);
  try {
    const { data } = await api('GET', '/api/employees');
    allEmployees = data || [];
    updateStats();
    renderTable();
  } catch (err) {
    toast('Failed to load employees: ' + err.message, 'error');
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

// ── Stats ──────────────────────────────────────────────────────────────────────
function updateStats() {
  statTotal.textContent        = allEmployees.length;
  statExpired.textContent      = allEmployees.filter(e => e.daysLeft !== null && e.daysLeft <= 0).length;
  statExpiringSoon.textContent = allEmployees.filter(e => e.daysLeft !== null && e.daysLeft > 0 && e.daysLeft <= 30).length;
  statActive.textContent       = allEmployees.filter(e => e.daysLeft !== null && e.daysLeft > 30).length;
}

// ── Render Table ───────────────────────────────────────────────────────────────
function renderTable() {
  const query  = searchInput.value.trim().toLowerCase();
  const status = filterStatus.value;
  const type   = filterType.value;

  const filtered = allEmployees.filter(emp => {
    if (query) {
      const hay = [emp.name, emp.role, emp.email, emp.phone].join(' ').toLowerCase();
      if (!hay.includes(query)) return false;
    }
    if (type !== 'all' && emp.type !== type) return false;
    if (status !== 'all') {
      const d = emp.daysLeft;
      if (status === 'expired'  && !(d !== null && d <= 0))             return false;
      if (status === 'critical' && !(d !== null && d > 0 && d <= 7))    return false;
      if (status === 'warning'  && !(d !== null && d > 7 && d <= 30))   return false;
      if (status === 'active'   && !(d !== null && d > 30))             return false;
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

  tbodyEl.innerHTML = filtered.map(renderRow).join('');

  tbodyEl.querySelectorAll('[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', () => openEditModal(parseInt(btn.dataset.id, 10)));
  });
  tbodyEl.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', () => confirmDelete(parseInt(btn.dataset.id, 10), btn.dataset.name));
  });
}

function renderRow(emp) {
  const { badge } = getStatusInfo(emp.daysLeft);
  return `<tr>
    <td><strong>${esc(emp.name)}</strong></td>
    <td>${esc(emp.role)}</td>
    <td>${esc(emp.type)}</td>
    <td>${esc(emp.email)}</td>
    <td>${esc(emp.phone)}</td>
    <td>${formatDate(emp.contractStart)}</td>
    <td>${formatDate(emp.contractEnd)}</td>
    <td>${badge}</td>
    <td>${esc(emp.missedDays) || '0'}</td>
    <td>
      <div class="td-actions">
        <button class="btn btn-outline btn-icon" title="Edit" data-action="edit" data-id="${emp.id}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="btn btn-danger btn-icon" title="Delete" data-action="delete" data-id="${emp.id}" data-name="${esc(emp.name)}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        </button>
      </div>
    </td>
  </tr>`;
}

function getStatusInfo(daysLeft) {
  if (daysLeft === null || daysLeft === undefined)
    return { badge: '<span class="badge badge-unknown"><span class="badge-dot" style="background:#9ca3af"></span>No Date</span>' };
  if (daysLeft <= 0)
    return { badge: '<span class="badge badge-expired"><span class="badge-dot" style="background:#dc2626"></span>Expired</span>' };
  if (daysLeft <= 7)
    return { badge: `<span class="badge badge-critical"><span class="badge-dot" style="background:#e11d48"></span>${daysLeft}d left</span>` };
  if (daysLeft <= 30)
    return { badge: `<span class="badge badge-warning"><span class="badge-dot" style="background:#d97706"></span>${daysLeft}d left</span>` };
  return { badge: `<span class="badge badge-active"><span class="badge-dot" style="background:#16a34a"></span>Active</span>` };
}

// ── Modal ──────────────────────────────────────────────────────────────────────
function openAddModal() {
  editingId = null;
  modalTitleEl.textContent = 'Add Employee';
  document.getElementById('btn-save').textContent = 'Add Employee';
  employeeForm.reset();
  document.getElementById('form-id').value = '';
  modalOverlay.classList.remove('hidden');
}

function openEditModal(id) {
  const emp = allEmployees.find(e => e.id === id);
  if (!emp) return;
  editingId = id;
  modalTitleEl.textContent = 'Edit Employee';
  document.getElementById('btn-save').textContent = 'Save Changes';
  document.getElementById('form-id').value       = id;
  document.getElementById('form-name').value     = emp.name || '';
  document.getElementById('form-role').value     = emp.role || '';
  document.getElementById('form-type').value     = emp.type || '';
  document.getElementById('form-email').value    = emp.email || '';
  document.getElementById('form-phone').value    = emp.phone || '';
  document.getElementById('form-start').value    = toInputDate(emp.contractStart);
  document.getElementById('form-end').value      = toInputDate(emp.contractEnd);
  document.getElementById('form-missed').value   = emp.missedDays || '0';
  document.getElementById('form-notes').value    = emp.notes || '';
  modalOverlay.classList.remove('hidden');
}

function closeModal() {
  modalOverlay.classList.add('hidden');
  editingId = null;
}

async function handleFormSubmit(e) {
  e.preventDefault();
  const saveBtn = document.getElementById('btn-save');
  saveBtn.disabled = true;

  const employee = {
    name:          document.getElementById('form-name').value.trim(),
    role:          document.getElementById('form-role').value.trim(),
    type:          document.getElementById('form-type').value,
    email:         document.getElementById('form-email').value.trim(),
    phone:         document.getElementById('form-phone').value.trim(),
    contractStart: document.getElementById('form-start').value,
    contractEnd:   document.getElementById('form-end').value,
    missedDays:    parseInt(document.getElementById('form-missed').value, 10) || 0,
    notes:         document.getElementById('form-notes').value.trim(),
  };

  try {
    if (editingId) {
      await api('PUT', `/api/employees/${editingId}`, employee);
      toast('Employee updated', 'success');
    } else {
      await api('POST', '/api/employees', employee);
      toast('Employee added', 'success');
    }
    closeModal();
    await loadEmployees();
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  } finally {
    saveBtn.disabled = false;
  }
}

async function confirmDelete(id, name) {
  if (!confirm(`Delete ${name}? This cannot be undone.`)) return;
  try {
    await api('DELETE', `/api/employees/${id}`);
    toast(`${name} deleted`, 'success');
    await loadEmployees();
  } catch (err) {
    toast('Delete failed: ' + err.message, 'error');
  }
}

// ── Utilities ──────────────────────────────────────────────────────────────────
function esc(str) {
  if (!str && str !== 0) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatDate(str) {
  if (!str) return '<span style="color:#9ca3af">—</span>';
  try { return new Date(str).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return esc(str); }
}

function toInputDate(str) {
  if (!str) return '';
  try { return new Date(str).toISOString().split('T')[0]; }
  catch { return str; }
}

function toast(message, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  toastContainer.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}
