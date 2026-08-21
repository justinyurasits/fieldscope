const EXAMPLES = [
  "Electrician running conduit and terminating panels on the 3rd floor, some ladder work involved.",
  "Sub installing exterior scaffold for masonry repointing on a 4-story building.",
  "Excavation contractor digging an 8-foot utility trench along the north property line.",
  "Roofing crew doing edge and penetration work on a low-slope commercial roof."
];

const main = document.getElementById('main');
const badgeEl = document.getElementById('flag-badge');

async function api(path, options) {
  const res = await fetch('/api' + path, options);
  if (!res.ok) {
    let message = 'Request failed (' + res.status + ')';
    try {
      const body = await res.json();
      if (body.error) message = body.error;
    } catch (e) { /* ignore */ }
    throw new Error(message);
  }
  if (res.status === 204) return null;
  return res.json();
}

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function setActiveNav(route) {
  document.querySelectorAll('.nav-item').forEach((n) => {
    n.classList.toggle('active', n.getAttribute('data-route') === route);
  });
}

function fmtDate(str) {
  if (!str) return '—';
  const d = new Date(str);
  if (isNaN(d.getTime())) return str;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function fmtDateTime(str) {
  if (!str) return '—';
  return new Date(str).toLocaleString();
}

function isToday(str) {
  if (!str) return false;
  const d = new Date(str);
  const now = new Date();
  return d.toDateString() === now.toDateString();
}

function isOverdue(dueDate, completedAt) {
  if (completedAt) return false;
  if (!dueDate) return false;
  return new Date(dueDate) < new Date(new Date().toDateString());
}

function statusPill(status) {
  if (status === 'compliant') return `<span class="status-pill compliant">Compliant</span>`;
  if (status === 'flagged') return `<span class="status-pill flagged">Flagged</span>`;
  return `<span class="status-pill pending">No check yet</span>`;
}

async function refreshBadge() {
  try {
    const rows = await api('/dashboard');
    const total = rows.reduce((sum, r) => sum + Number(r.unresolved_flags || 0), 0);
    if (total > 0) {
      badgeEl.textContent = total;
      badgeEl.style.display = 'inline-flex';
    } else {
      badgeEl.style.display = 'none';
    }
  } catch (e) { /* ignore badge failures */ }
}

// ---------------- Dashboard ----------------

async function renderDashboard() {
  setActiveNav('dashboard');
  main.innerHTML = `
    <div class="page-head">
      <div>
        <h1>Dashboard</h1>
        <div class="sub">What needs attention today, then everything else.</div>
      </div>
      <a href="#/new" class="btn btn-primary">New protocol</a>
    </div>
    <div class="card"><div class="loading"><div class="spinner"></div>Loading protocols…</div></div>
  `;
  try {
    const rows = await api('/dashboard');
    if (rows.length === 0) {
      main.querySelector('.card').outerHTML = `
        <div class="card">
          <div class="empty-state">
            <h3>No active protocols</h3>
            <p>Generate the first one to start the pilot record.</p>
            <a href="#/new" class="btn btn-primary">New protocol</a>
          </div>
        </div>
      `;
      return;
    }

    const unresolvedFlags = rows.filter((r) => Number(r.unresolved_flags) > 0);
    const overdueReviews = rows.filter((r) =>
      !unresolvedFlags.includes(r) &&
      (isOverdue(r.initial_review_due, r.initial_review_completed_at) || isOverdue(r.ongoing_review_due, r.ongoing_review_completed_at))
    );
    const noCheckToday = rows.filter((r) =>
      !unresolvedFlags.includes(r) && !overdueReviews.includes(r) && !isToday(r.last_check_at)
    );
    const restOk = rows.filter((r) =>
      !unresolvedFlags.includes(r) && !overdueReviews.includes(r) && !noCheckToday.includes(r)
    );

    function section(title, list, note) {
      if (list.length === 0) return '';
      return `
        <div class="section-title" style="margin-top:22px;">${title} (${list.length})</div>
        <div class="card" style="padding:0;overflow:hidden;">
          <table>
            <thead><tr><th>Sub</th><th>Site</th><th>Trade</th><th>Task</th><th>Approval</th><th>Last check</th><th>Status</th></tr></thead>
            <tbody>
              ${list.map((r) => `
                <tr class="clickable" data-id="${r.protocol_id}">
                  <td>${r.sub_name}</td>
                  <td>${r.site_name}</td>
                  <td>${r.trade || '—'}</td>
                  <td style="max-width:200px;">${r.task_summary || ''}</td>
                  <td>${r.approval_status === 'approved' ? '<span class="status-pill compliant">Approved</span>' : '<span class="status-pill pending">Draft</span>'}</td>
                  <td>${r.last_check_at ? fmtDate(r.last_check_at) : '—'}</td>
                  <td>${statusPill(r.last_check_status)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    main.querySelector('.card').outerHTML = [
      section('Unresolved flags', unresolvedFlags),
      section('Overdue reviews', overdueReviews),
      section('No check yet today', noCheckToday),
      section('Compliant', restOk)
    ].join('') || `<div class="card"><div class="empty-state"><h3>Nothing to show</h3></div></div>`;

    main.querySelectorAll('tr.clickable').forEach((row) => {
      row.addEventListener('click', () => {
        window.location.hash = '#/protocol/' + row.getAttribute('data-id');
      });
    });
  } catch (err) {
    main.querySelector('.card').outerHTML = `<div class="error-box">Couldn't load the dashboard. ${err.message}</div>`;
  }
}

// ---------------- Subs ----------------

async function renderSubs() {
  setActiveNav('subs');
  main.innerHTML = `
    <div class="page-head"><div><h1>Subs</h1><div class="sub">Rollup across every protocol a sub has had.</div></div></div>
    <div class="card"><div class="loading"><div class="spinner"></div>Loading subs…</div></div>
  `;
  try {
    const subs = await api('/subs');
    if (subs.length === 0) {
      main.querySelector('.card').outerHTML = `<div class="card"><div class="empty-state"><h3>No subs yet</h3><p>Add one from the New protocol screen.</p></div></div>`;
      return;
    }
    main.querySelector('.card').outerHTML = `
      <div class="card" style="padding:0;overflow:hidden;">
        <table>
          <thead><tr><th>Sub</th><th>Trade</th><th>Protocols</th><th>Training</th><th>Flags (30d)</th><th>Unresolved</th></tr></thead>
          <tbody>
            ${subs.map((s) => `
              <tr class="clickable" data-id="${s.id}">
                <td>${s.name}</td>
                <td>${s.trade || '—'}</td>
                <td>${s.protocol_count}</td>
                <td>${s.training_done}/${s.training_total}</td>
                <td>${s.flags_30d}</td>
                <td>${Number(s.unresolved_flags) > 0 ? `<span class="status-pill flagged">${s.unresolved_flags}</span>` : '0'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
    main.querySelectorAll('tr.clickable').forEach((row) => {
      row.addEventListener('click', () => { window.location.hash = '#/sub/' + row.getAttribute('data-id'); });
    });
  } catch (err) {
    main.querySelector('.card').outerHTML = `<div class="error-box">Couldn't load subs. ${err.message}</div>`;
  }
}

async function renderSubDetail(id) {
  setActiveNav('subs');
  main.innerHTML = `<div class="card"><div class="loading"><div class="spinner"></div>Loading sub…</div></div>`;
  try {
    const sub = await api('/subs/' + id);
    main.innerHTML = `
      <div class="page-head">
        <div><h1>${sub.name}</h1><div class="sub">${sub.trade || ''}</div></div>
        <a href="#/subs" class="btn btn-ghost">Back to subs</a>
      </div>
      <div class="card">
        <div class="section-title">Protocols</div>
        <table>
          <thead><tr><th>Task</th><th>Site</th><th>Approval</th><th>Task status</th><th>Training</th><th>Last check</th></tr></thead>
          <tbody>
            ${sub.protocols.map((p) => `
              <tr class="clickable" data-id="${p.id}">
                <td style="max-width:220px;">${p.task_summary}</td>
                <td>${p.site_name}</td>
                <td>${p.approval_status === 'approved' ? '<span class="status-pill compliant">Approved</span>' : '<span class="status-pill pending">Draft</span>'}</td>
                <td>${p.task_status}</td>
                <td>${p.training_done}/${p.training_total}</td>
                <td>${p.last_check_at ? statusPill(p.last_check_status) : '—'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <div class="card">
        <div class="section-title">Recent photo checks (all protocols)</div>
        ${sub.recentChecks.length === 0 ? `<div class="sub">No checks yet.</div>` : sub.recentChecks.map((c) => `
          <div class="finding-row" style="border-bottom:1px solid var(--line);padding:10px 0;">
            ${statusPill(c.status)}
            <span style="flex:1;">${c.task_summary} — ${c.summary || ''}${c.status === 'flagged' && !c.resolved_at ? ' <strong>(unresolved)</strong>' : ''}</span>
            <span class="time">${fmtDateTime(c.created_at)}</span>
          </div>
        `).join('')}
      </div>
    `;
    main.querySelectorAll('tr.clickable').forEach((row) => {
      row.addEventListener('click', () => { window.location.hash = '#/protocol/' + row.getAttribute('data-id'); });
    });
  } catch (err) {
    main.innerHTML = `<div class="error-box">Couldn't load this sub. ${err.message}</div>`;
  }
}

// ---------------- New protocol ----------------

async function renderNewProtocol() {
  setActiveNav('new');
  main.innerHTML = `
    <div class="page-head">
      <div><h1>New protocol</h1><div class="sub">Describe the work. The protocol is scoped from there — no forms.</div></div>
    </div>
    <div class="card"><div class="loading"><div class="spinner"></div>Loading subs and sites…</div></div>
  `;

  let subs = [];
  let sites = [];
  try {
    [subs, sites] = await Promise.all([api('/subs'), api('/sites')]);
  } catch (err) {
    main.querySelector('.card').outerHTML = `<div class="error-box">Couldn't load subs/sites. ${err.message}</div>`;
    return;
  }

  main.querySelector('.card').outerHTML = `
    <div class="card">
      <div class="two-col" style="margin-bottom:20px;">
        <div>
          <label for="sub-select">Sub</label>
          <select id="sub-select">
            <option value="">Select a sub…</option>
            ${subs.map((s) => `<option value="${s.id}">${s.name}${s.trade ? ' — ' + s.trade : ''}</option>`).join('')}
          </select>
          <div class="inline-add">
            <input type="text" id="new-sub-name" placeholder="Add a new sub">
            <button class="btn btn-ghost btn-sm" id="add-sub-btn">Add</button>
          </div>
        </div>
        <div>
          <label for="site-select">Site</label>
          <select id="site-select">
            <option value="">Select a site…</option>
            ${sites.map((s) => `<option value="${s.id}">${s.name}</option>`).join('')}
          </select>
          <div class="inline-add">
            <input type="text" id="new-site-name" placeholder="Add a new site">
            <button class="btn btn-ghost btn-sm" id="add-site-btn">Add</button>
          </div>
        </div>
      </div>
      <div class="field">
        <label for="task-input">Task description</label>
        <textarea id="task-input" placeholder="e.g. Electrician running conduit and terminating panels on the 3rd floor..."></textarea>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px;">
        ${EXAMPLES.map((ex) => `<button class="btn btn-ghost btn-sm example-chip" data-example="${encodeURIComponent(ex)}">${ex.length > 44 ? ex.slice(0, 44) + '…' : ex}</button>`).join('')}
      </div>
      <button class="btn btn-primary" id="generate-btn">Generate protocol</button>
      <div id="generate-status"></div>
    </div>
  `;

  main.querySelectorAll('.example-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.getElementById('task-input').value = decodeURIComponent(chip.getAttribute('data-example'));
    });
  });

  document.getElementById('add-sub-btn').addEventListener('click', async () => {
    const input = document.getElementById('new-sub-name');
    if (!input.value.trim()) return;
    try {
      const sub = await api('/subs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: input.value.trim() }) });
      const select = document.getElementById('sub-select');
      select.appendChild(el(`<option value="${sub.id}">${sub.name}</option>`));
      select.value = sub.id;
      input.value = '';
    } catch (err) { alert("Couldn't add sub: " + err.message); }
  });

  document.getElementById('add-site-btn').addEventListener('click', async () => {
    const input = document.getElementById('new-site-name');
    if (!input.value.trim()) return;
    try {
      const site = await api('/sites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: input.value.trim() }) });
      const select = document.getElementById('site-select');
      select.appendChild(el(`<option value="${site.id}">${site.name}</option>`));
      select.value = site.id;
      input.value = '';
    } catch (err) { alert("Couldn't add site: " + err.message); }
  });

  document.getElementById('generate-btn').addEventListener('click', async () => {
    const subId = document.getElementById('sub-select').value;
    const siteId = document.getElementById('site-select').value;
    const taskDescription = document.getElementById('task-input').value.trim();
    const statusEl = document.getElementById('generate-status');

    if (!subId || !siteId || !taskDescription) {
      statusEl.innerHTML = `<div class="error-box">Select a sub, a site, and describe the task before generating.</div>`;
      return;
    }

    statusEl.innerHTML = `<div class="loading"><div class="spinner"></div>Retrieving relevant OSHA sections and scoping the protocol…</div>`;
    document.getElementById('generate-btn').disabled = true;

    try {
      const result = await api('/protocols', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subId, siteId, taskDescription })
      });
      window.location.hash = '#/protocol/' + result.id;
    } catch (err) {
      statusEl.innerHTML = `<div class="error-box">Couldn't generate a protocol. ${err.message}</div>`;
      document.getElementById('generate-btn').disabled = false;
    }
  });
}

// ---------------- Protocol detail ----------------

async function renderProtocolDetail(id) {
  setActiveNav('');
  main.innerHTML = `<div class="card"><div class="loading"><div class="spinner"></div>Loading protocol…</div></div>`;

  let protocol;
  try {
    protocol = await api('/protocols/' + id);
  } catch (err) {
    main.innerHTML = `<div class="error-box">Couldn't load this protocol. ${err.message}</div>`;
    return;
  }

  const initialReview = protocol.reviews.find((r) => r.review_type === 'initial');
  const ongoingReview = protocol.reviews.find((r) => r.review_type === 'ongoing');

  main.innerHTML = `
    <div class="page-head">
      <div>
        <h1>${protocol.sub_name} — ${protocol.site_name}</h1>
        <div class="sub">${protocol.trade || ''} · Task ${protocol.task_status === 'completed' ? 'completed' : 'active'}</div>
      </div>
      <a href="#/dashboard" class="btn btn-ghost">Back to dashboard</a>
    </div>

    ${protocol.approval_status === 'approved' ? `
      <div class="card" style="background:var(--green-tint);border-color:var(--green);margin-bottom:16px;padding:14px 18px;">
        <strong style="color:var(--green);">Approved</strong> <span style="color:var(--steel);">by ${protocol.approved_by} on ${fmtDate(protocol.approved_at)} — this is the official record.</span>
      </div>
    ` : `
      <div class="card" style="background:var(--amber-tint);border-color:var(--amber);margin-bottom:16px;padding:14px 18px;display:flex;justify-content:space-between;align-items:center;">
        <span style="color:var(--amber);"><strong>Draft</strong> — AI-generated. Not the official record until a qualified person reviews and approves it.</span>
        <button class="btn btn-primary btn-sm" id="approve-btn">Approve protocol</button>
      </div>
    `}

    <div class="card">
      <div class="protocol-head">
        <div class="label">${protocol.trade || 'Task'}</div>
        <h3>${protocol.task_summary}</h3>
      </div>
      <div class="subparts">
        ${protocol.applicable_subparts.map((s) => `<span class="cite-chip">${s.code} — ${s.title}</span>`).join('')}
      </div>
      <div class="two-col">
        <div class="col">
          <h4>Required PPE</h4>
          <ul>${protocol.required_ppe.map((x) => `<li>${x}</li>`).join('')}</ul>
        </div>
        <div class="col">
          <h4>Required equipment</h4>
          <ul>${protocol.required_equipment.map((x) => `<li>${x}</li>`).join('')}</ul>
        </div>
      </div>
      <h4 style="font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--steel-light);font-family:'IBM Plex Mono',monospace;font-weight:500;margin-bottom:10px;">Cited sections</h4>
      <table>
        <thead><tr><th>Section</th><th>Requirement</th></tr></thead>
        <tbody>
          ${protocol.cited_sections.map((c) => `<tr><td class="req-code">${c.code}</td><td><strong>${c.title}</strong> — ${c.requirement}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>

    <div class="card">
      <div class="section-title">Training curriculum</div>
      <div class="sub" style="margin-top:-6px;margin-bottom:14px;">Task-specific topics only — OSHA-10/30 outreach cards are tracked separately by Turner, not generated here.</div>
      <ul class="checklist" id="checklist">
        ${protocol.trainingItems.map((t) => `
          <li>
            <div class="checkbox ${t.completed ? 'checked' : ''}" data-toggle="${t.id}" data-completed="${t.completed}">${t.completed ? '✓' : ''}</div>
            <div style="flex:1;">
              <div class="item-text ${t.completed ? 'done' : ''}">${t.topic}</div>
              ${t.completed ? `<div style="font-size:12px;color:var(--steel-light);margin-top:2px;">Delivered by ${t.attested_by} — ${fmtDate(t.completed_at)}</div>` : ''}
            </div>
          </li>
        `).join('')}
      </ul>
    </div>

    <div class="card">
      <div class="section-title">Review cadence</div>
      <div class="cadence-grid">
        ${[['Initial review', initialReview], ['Ongoing review', ongoingReview]].map(([label, r]) => `
          <div class="cadence-card">
            <div class="k">${label}</div>
            <div class="v">${fmtDate(r.due_date)}</div>
            ${r.completed_at
              ? `<div style="font-size:12px;color:var(--green);margin-top:8px;">Completed by ${r.completed_by} — ${fmtDate(r.completed_at)}</div>`
              : `<button class="btn btn-ghost btn-sm" style="margin-top:10px;" data-complete-review="${r.id}">Mark complete</button>`}
          </div>
        `).join('')}
      </div>
    </div>

    <div class="card">
      <div class="section-title">Photo-based validation</div>
      <div class="sub" style="margin-top:-6px;margin-bottom:14px;">Upload one or more photos per check (e.g. a wide shot and a close-up) — evaluated together.</div>
      <div class="upload-zone" id="upload-zone">
        <div style="font-size:22px;">⤒</div>
        <p><strong>Click to upload jobsite photos</strong></p>
        <input type="file" id="photo-input" accept="image/*" multiple style="display:none;">
      </div>
      <div id="upload-status"></div>
      <div class="check-history" id="check-history">
        ${protocol.photoChecks.length === 0 ? `<div class="sub" style="padding:8px 0;">No photo checks yet.</div>` : protocol.photoChecks.map((c) => renderCheckRow(c)).join('')}
      </div>
    </div>
  `;

  const approveBtn = document.getElementById('approve-btn');
  if (approveBtn) {
    approveBtn.addEventListener('click', async () => {
      const name = prompt('Approving as (name and role):');
      if (!name || !name.trim()) return;
      try {
        await api('/protocols/' + id + '/approve', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ approvedBy: name.trim() }) });
        renderProtocolDetail(id);
      } catch (err) { alert("Couldn't approve: " + err.message); }
    });
  }

  main.querySelectorAll('[data-complete-review]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const name = prompt('Completing this review as (name and role):');
      if (!name || !name.trim()) return;
      try {
        await api('/reviews/' + btn.getAttribute('data-complete-review') + '/complete', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completedBy: name.trim() }) });
        renderProtocolDetail(id);
      } catch (err) { alert("Couldn't complete review: " + err.message); }
    });
  });

  main.querySelectorAll('[data-toggle]').forEach((box) => {
    box.addEventListener('click', async () => {
      const trainingId = box.getAttribute('data-toggle');
      const currentlyCompleted = box.getAttribute('data-completed') === 'true';
      const nowChecked = !currentlyCompleted;
      let attestedBy = null;
      if (nowChecked) {
        attestedBy = prompt('Delivered by (name and role):');
        if (!attestedBy || !attestedBy.trim()) return;
      }
      try {
        await api('/training-items/' + trainingId, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ completed: nowChecked, attestedBy })
        });
        renderProtocolDetail(id);
      } catch (err) { alert("Couldn't update training item: " + err.message); }
    });
  });

  const uploadZone = document.getElementById('upload-zone');
  const photoInput = document.getElementById('photo-input');
  uploadZone.addEventListener('click', () => photoInput.click());
  uploadZone.addEventListener('dragover', (e) => e.preventDefault());
  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length) uploadPhotos(id, e.dataTransfer.files);
  });
  photoInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length) uploadPhotos(id, e.target.files);
  });

  main.querySelectorAll('[data-resolve]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const name = prompt('Resolving as (name and role):');
      if (!name || !name.trim()) return;
      const note = prompt('Resolution note (what was corrected / verified):') || '';
      try {
        await api('/photo-checks/' + btn.getAttribute('data-resolve') + '/resolve', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ resolvedBy: name.trim(), note })
        });
        renderProtocolDetail(id);
        refreshBadge();
      } catch (err) { alert("Couldn't resolve: " + err.message); }
    });
  });
}

function renderCheckRow(c) {
  const findings = c.findings || [];
  const images = c.images || [];
  return `
    <div class="check-row">
      <div style="display:flex;gap:6px;flex:none;">
        ${images.map((img) => `<img src="data:${img.photo_mime};base64,${img.photo_data}" alt="Jobsite photo">`).join('')}
      </div>
      <div class="meta">
        <div class="top">
          ${statusPill(c.status)}
          <span class="time">${fmtDateTime(c.created_at)}</span>
        </div>
        <div style="font-size:13px;color:var(--steel);margin-bottom:6px;">${c.summary || ''}</div>
        ${findings.map((f) => `
          <div class="finding-row">
            <span class="badge ${f.observed}">${f.observed}</span>
            <span><strong>${f.item}</strong>${f.note ? ' — ' + f.note : ''}</span>
          </div>
        `).join('')}
        ${c.status === 'flagged' ? (
          c.resolved_at
            ? `<div style="font-size:12px;color:var(--green);margin-top:8px;">Resolved by ${c.resolved_by} — ${fmtDate(c.resolved_at)}${c.resolution_note ? ': ' + c.resolution_note : ''}</div>`
            : `<button class="btn btn-ghost btn-sm" style="margin-top:8px;" data-resolve="${c.id}">Resolve flag</button>`
        ) : ''}
      </div>
    </div>
  `;
}

async function uploadPhotos(protocolId, fileList) {
  const statusEl = document.getElementById('upload-status');
  statusEl.innerHTML = `<div class="loading"><div class="spinner"></div>Checking ${fileList.length > 1 ? 'photos' : 'photo'} against required PPE and equipment…</div>`;
  const formData = new FormData();
  Array.from(fileList).slice(0, 5).forEach((f) => formData.append('photos', f));
  try {
    await api('/protocols/' + protocolId + '/photo-checks', { method: 'POST', body: formData });
    statusEl.innerHTML = '';
    renderProtocolDetail(protocolId);
    refreshBadge();
  } catch (err) {
    statusEl.innerHTML = `<div class="error-box">Couldn't validate that check. ${err.message}</div>`;
  }
}

// ---------------- Router ----------------

function route() {
  refreshBadge();
  const hash = window.location.hash || '#/dashboard';
  if (hash === '#/new') {
    renderNewProtocol();
  } else if (hash === '#/subs') {
    renderSubs();
  } else if (hash.startsWith('#/sub/')) {
    renderSubDetail(hash.split('/')[2]);
  } else if (hash.startsWith('#/protocol/')) {
    renderProtocolDetail(hash.split('/')[2]);
  } else {
    renderDashboard();
  }
}

window.addEventListener('hashchange', route);
route();
