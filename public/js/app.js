/* RQL Construction HR — Frontend App */
'use strict';

// ── State ─────────────────────────────────────────────────────────────────────
let allEmployees = [];

// ── Utilities ─────────────────────────────────────────────────────────────────
function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res  = await fetch(path, opts);
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Unknown error');
  return data;
}

// ── Router ────────────────────────────────────────────────────────────────────
const PAGES = ['dashboard', 'reminders', 'add', 'edit'];

function showPage(name) {
  PAGES.forEach(p => {
    const el = document.getElementById(`page-${p}`);
    if (el) el.classList.toggle('hidden', p !== name);
  });
  // Highlight active nav link
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.toggle('active', link.dataset.page === name || (name === 'dashboard' && link.dataset.page === 'dashboard'));
  });
}

function route() {
  const path = window.location.pathname;

  if (path === '/' || path === '') {
    showPage('dashboard');
    loadDashboard();
  } else if (path === '/reminders') {
    showPage('reminders');
    loadReminders();
  } else if (path === '/add') {
    showPage('add');
    initAddForm();
  } else if (path.startsWith('/edit/')) {
    const id = path.replace('/edit/', '');
    showPage('edit');
    loadEditForm(id);
  } else {
    showPage('dashboard');
    loadDashboard();
  }
}

// Intercept link clicks for SPA navigation (only same-origin)
document.addEventListener('click', (e) => {
  const link = e.target.closest('a[href]');
  if (!link) return;
  const href = link.getAttribute('href');
  if (href && href.startsWith('/') && !href.startsWith('//')) {
    e.preventDefault();
    history.pushState({}, '', href);
    route();
  }
});

window.addEventListener('popstate', route);

// ── Dashboard ─────────────────────────────────────────────────────────────────
async function loadDashboard() {
  const loadingEl  = document.getElementById('loading');
  const emptyEl    = document.getElementById('empty-state');
  const tableWrap  = document.getElementById('table-wrap');

  loadingEl.classList.remove('hidden');
  emptyEl.classList.add('hidden');
  tableWrap.classList.add('hidden');

  try {
    const data = await api('GET', '/api/employees');
    allEmployees = data.data || [];
    updateStats();
    renderTable();
  } catch (err) {
    toast(`Failed to load employees: ${err.message}`, 'error');
  } finally {
    loadingEl.classList.add('hidden');
  }
}

function updateStats() {
  document.getElementById('stat-total').textContent        = allEmployees.length;
  document.getElementById('stat-expired').textContent      = allEmployees.filter(e => e.daysLeft !== null && e.daysLeft <= 0).length;
  document.getElementById('stat-expiring-soon').textContent= allEmployees.filter(e => e.daysLeft !== null && e.daysLeft > 0 && e.daysLeft <= 30).length;
  document.getElementById('stat-active').textContent       = allEmployees.filter(e => e.daysLeft !== null && e.daysLeft > 30).length;
}

function renderTable() {
  const query  = document.getElementById('search-input').value.trim().toLowerCase();
  const status = document.getElementById('filter-status').value;
  const type   = document.getElementById('filter-type').value;

  let filtered = allEmployees.filter(emp => {
    if (query) {
      const hay = [emp.name, emp.role, emp.email, emp.phone].join(' ').toLowerCase();
      if (!hay.includes(query)) return false;
    }
    if (type !== 'all' && emp.type !== type) return false;
    if (status !== 'all') {
      const d = emp.daysLeft;
      if (status === 'expired'  && !(d !== null && d <= 0))           return false;
      if (status === 'critical' && !(d !== null && d > 0 && d <= 7))  return false;
      if (status === 'warning'  && !(d !== null && d > 7 && d <= 30)) return false;
      if (status === 'active'   && !(d !== null && d > 30))           return false;
    }
    return true;
  });

  const emptyEl   = document.getElementById('empty-state');
  const tableWrap = document.getElementById('table-wrap');
  const tbody     = document.getElementById('employee-tbody');

  if (filtered.length === 0) {
    tableWrap.classList.add('hidden');
    emptyEl.classList.remove('hidden');
  } else {
    emptyEl.classList.add('hidden');
    tableWrap.classList.remove('hidden');
    tbody.innerHTML = filtered.map(renderRow).join('');

    tbody.querySelectorAll('[data-action="edit"]').forEach(btn =>
      btn.addEventListener('click', () => { history.pushState({}, '', `/edit/${btn.dataset.id}`); route(); })
    );
    tbody.querySelectorAll('[data-action="delete"]').forEach(btn =>
      btn.addEventListener('click', () => confirmDelete(btn.dataset.id, btn.dataset.name))
    );
  }
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
        <button class="btn btn-outline btn-icon" title="Edit" data-action="edit" data-id="${esc(emp.id)}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="btn btn-danger btn-icon" title="Delete" data-action="delete" data-id="${esc(emp.id)}" data-name="${esc(emp.name)}">
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

async function confirmDelete(id, name) {
  if (!confirm(`Delete ${name}? This cannot be undone.`)) return;
  try {
    await api('DELETE', `/api/employees/${id}`);
    toast(`${name} deleted`, 'success');
    await loadDashboard();
  } catch (err) {
    toast(`Delete failed: ${err.message}`, 'error');
  }
}

// Bind dashboard search/filter
function bindDashboardFilters() {
  const si = document.getElementById('search-input');
  const fs = document.getElementById('filter-status');
  const ft = document.getElementById('filter-type');
  if (si) si.addEventListener('input', renderTable);
  if (fs) fs.addEventListener('change', renderTable);
  if (ft) ft.addEventListener('change', renderTable);
}

// ── Reminders Page ────────────────────────────────────────────────────────────
async function loadReminders() {
  const loadingEl = document.getElementById('reminders-loading');
  const emptyEl   = document.getElementById('reminders-empty');
  const listEl    = document.getElementById('reminders-list');

  loadingEl.classList.remove('hidden');
  emptyEl.classList.add('hidden');
  listEl.innerHTML = '';

  try {
    const data = await api('GET', '/api/reminders');
    const employees = data.data || [];

    loadingEl.classList.add('hidden');

    if (employees.length === 0) {
      emptyEl.classList.remove('hidden');
      return;
    }

    // Group by threshold bucket
    const buckets = [
      { days: 0,  label: 'Expired / Expiring Today', cls: 'danger' },
      { days: 7,  label: 'Expiring within 7 days',   cls: 'danger' },
      { days: 14, label: 'Expiring within 14 days',  cls: 'warning' },
      { days: 21, label: 'Expiring within 21 days',  cls: 'warning' },
      { days: 30, label: 'Expiring within 30 days',  cls: 'warning' },
      { days: 60, label: 'Expiring within 60 days',  cls: 'info' },
    ];

    let html = '';
    for (const bucket of buckets) {
      const group = employees.filter(e => {
        if (bucket.days === 0)  return e.daysLeft <= 0;
        if (bucket.days === 7)  return e.daysLeft > 0 && e.daysLeft <= 7;
        if (bucket.days === 14) return e.daysLeft > 7 && e.daysLeft <= 14;
        if (bucket.days === 21) return e.daysLeft > 14 && e.daysLeft <= 21;
        if (bucket.days === 30) return e.daysLeft > 21 && e.daysLeft <= 30;
        return e.daysLeft > 30 && e.daysLeft <= 60;
      });
      if (group.length === 0) continue;

      html += `<div class="reminder-section">
        <div class="reminder-section-title ${bucket.cls}">${bucket.label} (${group.length})</div>`;
      for (const emp of group) {
        const dColor = emp.daysLeft <= 7 ? 'var(--danger)' : emp.daysLeft <= 30 ? 'var(--warning)' : 'var(--brand)';
        html += `<div class="reminder-card">
          <div class="reminder-card-info">
            <h4>${esc(emp.name)}</h4>
            <p>${esc(emp.role) || 'N/A'} &bull; ${esc(emp.type) || 'N/A'} &bull; Contract ends: ${formatDate(emp.contractEnd)}</p>
          </div>
          <div class="reminder-card-days" style="color:${dColor}">
            ${emp.daysLeft <= 0 ? 'EXPIRED' : emp.daysLeft + 'd'}
          </div>
        </div>`;
      }
      html += '</div>';
    }
    listEl.innerHTML = html;
  } catch (err) {
    loadingEl.classList.add('hidden');
    toast(`Failed to load reminders: ${err.message}`, 'error');
  }
}

// ── Add Employee Page ─────────────────────────────────────────────────────────
function initAddForm() {
  const form = document.getElementById('add-form');
  form.reset();
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = form.querySelector('[type="submit"]');
    btn.disabled = true;
    try {
      await api('POST', '/api/employees', {
        name:          document.getElementById('add-name').value.trim(),
        role:          document.getElementById('add-role').value.trim(),
        type:          document.getElementById('add-type').value,
        email:         document.getElementById('add-email').value.trim(),
        phone:         document.getElementById('add-phone').value.trim(),
        missedDays:    document.getElementById('add-missed').value || '0',
        contractStart: document.getElementById('add-start').value,
        contractEnd:   document.getElementById('add-end').value,
        notes:         document.getElementById('add-notes').value.trim(),
      });
      toast('Employee added successfully', 'success');
      history.pushState({}, '', '/');
      route();
    } catch (err) {
      toast(`Error: ${err.message}`, 'error');
    } finally {
      btn.disabled = false;
    }
  };
}

// ── Edit Employee Page ────────────────────────────────────────────────────────
async function loadEditForm(id) {
  const loadingEl = document.getElementById('edit-loading');
  const cardEl    = document.getElementById('edit-form-card');

  loadingEl.classList.remove('hidden');
  cardEl.classList.add('hidden');

  try {
    const data = await api('GET', `/api/employees/${id}`);
    const emp  = data.data;

    document.getElementById('edit-id').value    = emp.id;
    document.getElementById('edit-name').value  = emp.name || '';
    document.getElementById('edit-role').value  = emp.role || '';
    document.getElementById('edit-type').value  = emp.type || '';
    document.getElementById('edit-email').value = emp.email || '';
    document.getElementById('edit-phone').value = emp.phone || '';
    document.getElementById('edit-missed').value= emp.missedDays || '0';
    document.getElementById('edit-start').value = toInputDate(emp.contractStart);
    document.getElementById('edit-end').value   = toInputDate(emp.contractEnd);
    document.getElementById('edit-notes').value = emp.notes || '';

    loadingEl.classList.add('hidden');
    cardEl.classList.remove('hidden');

    const form = document.getElementById('edit-form');
    form.onsubmit = async (e) => {
      e.preventDefault();
      const btn = form.querySelector('[type="submit"]');
      btn.disabled = true;
      try {
        await api('PUT', `/api/employees/${id}`, {
          name:          document.getElementById('edit-name').value.trim(),
          role:          document.getElementById('edit-role').value.trim(),
          type:          document.getElementById('edit-type').value,
          email:         document.getElementById('edit-email').value.trim(),
          phone:         document.getElementById('edit-phone').value.trim(),
          missedDays:    document.getElementById('edit-missed').value || '0',
          contractStart: document.getElementById('edit-start').value,
          contractEnd:   document.getElementById('edit-end').value,
          notes:         document.getElementById('edit-notes').value.trim(),
        });
        toast('Employee updated successfully', 'success');
        history.pushState({}, '', '/');
        route();
      } catch (err) {
        toast(`Error: ${err.message}`, 'error');
      } finally {
        btn.disabled = false;
      }
    };
  } catch (err) {
    loadingEl.classList.add('hidden');
    toast(`Failed to load employee: ${err.message}`, 'error');
    history.pushState({}, '', '/');
    route();
  }
}

// ── Header Actions ────────────────────────────────────────────────────────────
async function triggerReminders() {
  const btn = document.getElementById('btn-run-reminders');
  btn.disabled = true;
  btn.textContent = 'Sending…';
  try {
    const data  = await api('POST', '/api/reminders/run');
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
    const data  = await api('POST', '/api/calendar/sync');
    const count = data.result?.synced || 0;
    toast(`Calendar synced: ${count} event(s) verified`, 'success');
  } catch (err) {
    toast(`Sync error: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> Sync Calendar`;
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  bindDashboardFilters();
  document.getElementById('btn-run-reminders').addEventListener('click', triggerReminders);
  document.getElementById('btn-sync-calendar').addEventListener('click', syncCalendar);
  route();
});
