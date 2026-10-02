const DEFAULT_USERS = [
  { u: 'admin', password: 'admin123', role: 'ADMIN', name: 'Administrator', email: '' },
  { u: 'pamaplant', password: 'plant123', role: 'PAMA_PLANT', name: 'PAMA Plant', email: '' },
  { u: 'ut', password: 'ut123', role: 'UT', name: 'United Tractors', email: '' },
  { u: 'smpama', password: 'smpama123', role: 'SM_PAMA', name: 'SM PAMA', email: '' },
];

const ROLE_LABEL = { ADMIN: 'Admin', PAMA_PLANT: 'PAMA Plant', UT: 'United Tractors', SM_PAMA: 'SM PAMA' };
const STATUS_LABEL = { OPEN: 'Open', PROCESSING: 'Processing', CLOSED: 'Closed', REJECTED: 'Rejected' };
const TARGET_LABEL = { UT: 'United Tractors', SM_PAMA: 'SM PAMA', BOTH: 'UT & SM PAMA' };
const PRIORITY_LABEL = { LOW: 'Rendah', NORMAL: 'Normal', HIGH: 'Tinggi', URGENT: 'Urgent' };
const PRIORITY_ORDER = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 };
const CATS = ['Speedup', 'Preparation', 'Transaction', 'Claim', 'Other Operational'];

function safeRead(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    return fallback;
  }
}

const state = {
  session: safeRead('utpama_session', null),
  tickets: safeRead('utpama_tickets', []),
  users: safeRead('utpama_users', null) || DEFAULT_USERS.map(u => ({ ...u })),
  notifs: safeRead('utpama_notifs', []),
  view: 'tickets',
  detailId: null,
  error: '',
  success: '',
  search: '',
  filterStatus: '',
  filterCategory: '',
  filterPriority: '',
  filterTarget: '',
  sortKey: 'createdAt',
  sortDir: 'desc',
  supabase: null,
};

function makeDemoTickets() {
  const now = Date.now();
  const d = (offsetHours) => new Date(now - offsetHours * 60 * 60 * 1000).toISOString();

  return [
    {
      id: 'demo-1',
      no: 'TKT-0001',
      title: 'Akses material terbatas saat pengecekan unit',
      desc: 'Material untuk pemeliharaan unit sulit masuk ke area kerja karena proses picking belum selesai.',
      category: 'Preparation',
      priority: 'HIGH',
      targetParty: 'BOTH',
      evidence: 'Foto area picking dan timeline proses.',
      status: 'PROCESSING',
      createdAt: d(18),
      createdBy: 'pamaplant',
      createdByName: 'PAMA Plant',
      feedbacks: [
        { by: 'ut', byName: 'United Tractors', role: 'UT', message: 'Proses penyesuaian jadwal pengiriman material mulai dilakukan.', evidence: 'Update log 09:00', at: d(16) },
      ],
      part: { no: 'P-101', name: 'Filter Udara', qty: 2, unit: 'Unit 8A' },
    },
    {
      id: 'demo-2',
      no: 'TKT-0002',
      title: 'Request approval transaksi cepat untuk unit 2007',
      desc: 'Unit 2007 membutuhkan approval transaksi cepat agar pekerjaan tidak tertunda.',
      category: 'Transaction',
      priority: 'URGENT',
      targetParty: 'UT',
      evidence: 'E-mail approval dan checklist unit.',
      status: 'OPEN',
      createdAt: d(7),
      createdBy: 'smpama',
      createdByName: 'SM PAMA',
      feedbacks: [],
    },
    {
      id: 'demo-3',
      no: 'TKT-0003',
      title: 'Claim biaya kelebihan spare part',
      desc: 'Ada selisih item pada pengiriman spare part yang sudah diverifikasi namun belum di-claim.',
      category: 'Claim',
      priority: 'NORMAL',
      targetParty: 'SM_PAMA',
      evidence: 'Dokumen invoice dan foto paket.',
      status: 'CLOSED',
      createdAt: d(72),
      createdBy: 'ut',
      createdByName: 'United Tractors',
      feedbacks: [
        { by: 'smpama', byName: 'SM PAMA', role: 'SM_PAMA', message: 'Claim sudah diproses dan disetujui.', evidence: 'No claim: CLM-288', at: d(68) },
      ],
    }
  ];
}

function ensureDemoData() {
  if (!state.tickets || !state.tickets.length) {
    state.tickets = makeDemoTickets();
    saveLocalState();
  }
}

function saveLocalState() {
  localStorage.setItem('utpama_tickets', JSON.stringify(state.tickets));
  localStorage.setItem('utpama_users', JSON.stringify(state.users));
  localStorage.setItem('utpama_notifs', JSON.stringify(state.notifs));
}

function currentTheme() {
  return document.documentElement.getAttribute('data-theme') || 'light';
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('utpama_theme', theme);
}

function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  setTheme(next);
  render();
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function fmtDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtShortDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function userByUsername(username) {
  return state.users.find(u => u.u === username) || {};
}

function statusChip(status) {
  return `<span class="chip chip-${String(status).toLowerCase()}">${STATUS_LABEL[status] || status}</span>`;
}

function priorityChip(priority) {
  const p = priority || 'NORMAL';
  return `<span class="chip chip-pr-${String(p).toLowerCase()}">${PRIORITY_LABEL[p] || p}</span>`;
}

function initSupabase() {
  const cfg = window.SUPABASE_CONFIG || {};
  if (!cfg.enabled || !cfg.url || !cfg.anonKey || !window.supabase) return null;
  try {
    state.supabase = window.supabase.createClient(cfg.url, cfg.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    return state.supabase;
  } catch (error) {
    console.warn('Supabase init failed:', error);
    return null;
  }
}

async function syncToSupabaseIfAvailable() {
  if (!state.supabase) return;
  try {
    const { error: ticketError } = await state.supabase.from('tickets').upsert(
      state.tickets.map((ticket) => ({
        id: ticket.id,
        no: ticket.no,
        title: ticket.title,
        desc: ticket.desc,
        category: ticket.category,
        priority: ticket.priority || 'NORMAL',
        target_party: ticket.targetParty || 'BOTH',
        status: ticket.status || 'OPEN',
        evidence: ticket.evidence || '',
        created_at: ticket.createdAt,
        created_by: ticket.createdBy,
        created_by_name: ticket.createdByName,
        part: ticket.part || null,
        feedbacks: ticket.feedbacks || [],
        eta: ticket.eta || null,
        closed_at: ticket.closedAt || null,
        closed_by: ticket.closedBy || null,
        closed_by_name: ticket.closedByName || null,
      }))
    );
    if (ticketError) throw ticketError;

    const { error: userError } = await state.supabase.from('profiles').upsert(
      state.users.map((user) => ({
        id: user.u,
        username: user.u,
        password: user.password,
        role: user.role,
        name: user.name,
        email: user.email || '',
      }))
    );
    if (userError) throw userError;
  } catch (error) {
    console.warn('Supabase sync skipped:', error);
  }
}

function filteredTickets() {
  let list = state.tickets.filter((ticket) => {
    if (state.filterStatus && ticket.status !== state.filterStatus) return false;
    if (state.filterCategory && ticket.category !== state.filterCategory) return false;
    if (state.filterPriority && (ticket.priority || 'NORMAL') !== state.filterPriority) return false;
    if (state.filterTarget && ticket.targetParty !== state.filterTarget && ticket.targetParty !== 'BOTH') return false;
    if (state.search) {
      const q = state.search.toLowerCase();
      const hay = `${ticket.no || ''} ${ticket.title || ''} ${ticket.category || ''} ${ticket.desc || ''} ${ticket.part?.no || ''} ${ticket.part?.name || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  list = list.sort((a, b) => {
    let av, bv;
    if (state.sortKey === 'priority') {
      av = PRIORITY_ORDER[a.priority || 'NORMAL'];
      bv = PRIORITY_ORDER[b.priority || 'NORMAL'];
    } else if (state.sortKey === 'status') {
      av = a.status;
      bv = b.status;
    } else if (state.sortKey === 'no') {
      av = a.no || '';
      bv = b.no || '';
    } else {
      av = new Date(a.createdAt || 0).getTime();
      bv = new Date(b.createdAt || 0).getTime();
    }

    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return state.sortDir === 'asc' ? cmp : -cmp;
  });

  return list;
}

function exportCsv() {
  const rows = filteredTickets();
  const header = ['No. Tiket', 'Judul', 'Kategori', 'Prioritas', 'Status', 'Ditujukan', 'Dibuat Oleh', 'Tanggal'];
  const csv = [header.join(',')].concat(rows.map((ticket) => [
    ticket.no || '',
    `"${(ticket.title || '').replace(/"/g, '""')}"`,
    ticket.category || '',
    ticket.priority || 'NORMAL',
    ticket.status || '',
    TARGET_LABEL[ticket.targetParty] || ticket.targetParty || 'BOTH',
    ticket.createdByName || '',
    fmtShortDate(ticket.createdAt)
  ].join(','))).join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'ut-pama-tickets.csv';
  anchor.click();
  URL.revokeObjectURL(url);
  state.success = 'CSV berhasil diunduh.';
  render();
}

function resetDemoData() {
  if (!confirm('Reset semua data demo dan isi ulang data default?')) return;
  state.tickets = makeDemoTickets();
  state.users = DEFAULT_USERS.map(u => ({ ...u }));
  saveLocalState();
  state.success = 'Data demo berhasil direset.';
  render();
}

function renderLogin() {
  return `
    <div class="login-shell">
      <div class="login-hero">
        <div class="hero-hazard"></div>
        <div class="hero-inner">
          <div class="hero-logos">
            <div class="hero-logo">UT</div>
            <div class="hero-x">×</div>
            <div class="hero-logo hero-logo-alt">PAMA</div>
          </div>
          <div class="wordmark">UT <span>×</span> PAMA</div>
          <div class="hero-sub">DISTRIK INDO</div>
          <p class="hero-tag">Sistem tiket operasional untuk dokumentasi, prioritas, dan tindak lanjut kebutuhan UT, PAMA Plant, dan SM PAMA.</p>
        </div>
      </div>
      <div class="login-panel">
        <div class="login-card">
          <h2>Masuk</h2>
          <div class="muted">Silakan login menggunakan akun yang tersedia.</div>
          ${state.error ? `<div class="alert error">${escapeHtml(state.error)}</div>` : ''}
          <div class="form-grid">
            <div class="field">
              <label>Username</label>
              <input id="loginUser" placeholder="Masukkan username" />
            </div>
            <div class="field">
              <label>Password</label>
              <input id="loginPass" type="password" placeholder="Masukkan password" />
            </div>
            <button class="btn btn-primary" id="loginBtn">Masuk</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderApp() {
  const ticketList = filteredTickets();
  const total = state.tickets.length;
  const open = state.tickets.filter(t => t.status === 'OPEN').length;
  const processing = state.tickets.filter(t => t.status === 'PROCESSING').length;
  const closed = state.tickets.filter(t => t.status === 'CLOSED').length;
  const rejected = state.tickets.filter(t => t.status === 'REJECTED').length;

  return `
    <div class="shell">
      <header class="topbar">
        <div class="brand">
          <div class="topbar-logo">UT</div>
          <div>
            <div class="brand-name">UT × PAMA</div>
            <small>Distrik INDO</small>
          </div>
        </div>
        <div class="top-right">
          <button class="btn btn-ghost theme-toggle" id="themeToggleBtn">${currentTheme() === 'dark' ? 'Light mode' : 'Dark mode'}</button>
          <div class="who">
            <div class="avatar">${(state.session.name || state.session.u || '?').charAt(0).toUpperCase()}</div>
            <div class="who-text">
              <strong>${escapeHtml(state.session.name || state.session.u)}</strong>
              <span class="role-chip">${ROLE_LABEL[state.session.role] || state.session.role}</span>
            </div>
          </div>
          <button class="btn btn-ghost logout-btn" id="logoutBtn">Keluar</button>
        </div>
      </header>

      <div class="body">
        <aside class="sidenav">
          <button class="nav-item ${state.view === 'tickets' ? 'active' : ''}" data-view="tickets">Daftar Tiket</button>
          ${state.session.role === 'PAMA_PLANT' ? `<button class="nav-item ${state.view === 'create' ? 'active' : ''}" data-view="create">Buat Tiket</button>` : ''}
          ${state.session.role === 'ADMIN' ? `<button class="nav-item ${state.view === 'summary' ? 'active' : ''}" data-view="summary">Ringkasan</button>` : ''}
          ${state.session.role === 'ADMIN' ? `<button class="nav-item ${state.view === 'users' ? 'active' : ''}" data-view="users">Kelola User</button>` : ''}
          <button class="nav-item ${state.view === 'profile' ? 'active' : ''}" data-view="profile">Profil</button>
        </aside>

        <main class="main">
          ${state.success ? `<div class="ok-banner"><span>${escapeHtml(state.success)}</span><button data-clear-alert="success">×</button></div>` : ''}
          ${state.error ? `<div class="err-banner"><span>${escapeHtml(state.error)}</span><button data-clear-alert="error">×</button></div>` : ''}

          ${state.view === 'tickets' ? `
            <div class="toolbar-panel">
              <div class="filter-bar">
                <input id="ticketSearch" value="${escapeHtml(state.search)}" placeholder="Cari tiket, judul, part, atau kategori..." />
                <select id="filterStatus">
                  <option value="">Semua status</option>
                  ${Object.keys(STATUS_LABEL).map(s => `<option value="${s}" ${state.filterStatus === s ? 'selected' : ''}>${STATUS_LABEL[s]}</option>`).join('')}
                </select>
                <select id="filterCategory">
                  <option value="">Semua kategori</option>
                  ${CATS.map(cat => `<option value="${cat}" ${state.filterCategory === cat ? 'selected' : ''}>${cat}</option>`).join('')}
                </select>
                <select id="filterPriority">
                  <option value="">Semua prioritas</option>
                  ${Object.keys(PRIORITY_LABEL).map(p => `<option value="${p}" ${state.filterPriority === p ? 'selected' : ''}>${PRIORITY_LABEL[p]}</option>`).join('')}
                </select>
                <select id="filterTarget">
                  <option value="">Semua tujuan</option>
                  <option value="UT" ${state.filterTarget === 'UT' ? 'selected' : ''}>United Tractors</option>
                  <option value="SM_PAMA" ${state.filterTarget === 'SM_PAMA' ? 'selected' : ''}>SM PAMA</option>
                  <option value="BOTH" ${state.filterTarget === 'BOTH' ? 'selected' : ''}>UT & SM PAMA</option>
                </select>
              </div>

              <div class="quick-actions">
                <button class="btn btn-ghost" id="exportCsvBtn">Export CSV</button>
                ${state.session.role === 'ADMIN' ? `<button class="btn btn-ghost" id="resetDemoBtn">Reset demo data</button>` : ''}
              </div>
            </div>

            <div class="mini-summary">
              <div class="mini-card"><strong>${total}</strong><span>Total</span></div>
              <div class="mini-card"><strong>${open}</strong><span>Open</span></div>
              <div class="mini-card"><strong>${processing}</strong><span>Processing</span></div>
              <div class="mini-card"><strong>${closed}</strong><span>Closed</span></div>
              <div class="mini-card"><strong>${rejected}</strong><span>Rejected</span></div>
            </div>

            ${ticketList.length ? `
              <table class="tlist">
                <thead>
                  <tr>
                    <th class="sortable" data-sort="no">No. tiket</th>
                    <th>Kategori</th>
                    <th>Prioritas</th>
                    <th>Judul</th>
                    <th>Ditujukan</th>
                    <th>Oleh</th>
                    <th class="sortable" data-sort="createdAt">Tanggal</th>
                    <th class="sortable" data-sort="status">Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${ticketList.map((ticket) => `
                    <tr class="trow ${ticket.status === 'CLOSED' ? 'row-closed' : ticket.status === 'REJECTED' ? 'row-rejected' : ''}" data-ticket-id="${ticket.id}">
                      <td data-label="No. tiket">${escapeHtml(ticket.no || '-')}</td>
                      <td data-label="Kategori">${escapeHtml(ticket.category || '-')}</td>
                      <td data-label="Prioritas">${priorityChip(ticket.priority || 'NORMAL')}</td>
                      <td data-label="Judul">${escapeHtml(ticket.title || '-')}</td>
                      <td data-label="Ditujukan">${TARGET_LABEL[ticket.targetParty] || 'Keduanya'}</td>
                      <td data-label="Oleh">${escapeHtml(ticket.createdByName || '-')}</td>
                      <td data-label="Tanggal">${fmtDate(ticket.createdAt)}</td>
                      <td data-label="Status">${statusChip(ticket.status)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            ` : `<div class="empty">Belum ada tiket yang cocok dengan filter saat ini.</div>`}
          ` : ''}

          ${state.view === 'create' ? `
            <div class="create-card fb-form">
              <h3>Buat Tiket Baru</h3>
              <form id="createTicketForm">
                <div class="two-col">
                  <label>
                    Ditujukan kepada
                    <select id="cTarget">
                      <option value="BOTH">UT & SM PAMA</option>
                      <option value="UT">United Tractors</option>
                      <option value="SM_PAMA">SM PAMA</option>
                    </select>
                  </label>
                  <label>
                    Kategori
                    <select id="cCategory">
                      ${CATS.map(cat => `<option value="${cat}">${cat}</option>`).join('')}
                    </select>
                  </label>
                </div>

                <div class="two-col">
                  <label>
                    Prioritas
                    <select id="cPriority">
                      <option value="NORMAL">Normal</option>
                      <option value="LOW">Rendah</option>
                      <option value="HIGH">Tinggi</option>
                      <option value="URGENT">Urgent</option>
                    </select>
                  </label>
                  <label>
                    Judul tiket
                    <input id="cTitle" placeholder="Masukkan judul singkat" />
                  </label>
                </div>

                <label>
                  Deskripsi
                  <textarea id="cDesc" placeholder="Jelaskan masalah yang sedang terjadi..."></textarea>
                </label>

                <label>
                  Evidence / link pendukung
                  <input id="cEvidence" placeholder="Link foto, dokumen, atau catatan pendukung" />
                </label>

                <label style="display:flex;align-items:center;gap:10px;">
                  <input type="checkbox" id="needsPart" />
                  Ada kebutuhan spare part
                </label>

                <div id="partBlock" class="hidden" style="margin-top:12px;">
                  <div class="two-col">
                    <label>
                      Part Number
                      <input id="partNo" placeholder="Contoh: 123-ABC" />
                    </label>
                    <label>
                      Nama Part
                      <input id="partName" placeholder="Nama spare part" />
                    </label>
                  </div>
                  <div class="two-col">
                    <label>
                      Jumlah
                      <input id="partQty" type="number" min="1" value="1" />
                    </label>
                    <label>
                      Unit / No. Seri
                      <input id="partUnit" placeholder="Unit/No Seri" />
                    </label>
                  </div>
                </div>

                <div class="close-actions">
                  <button class="btn btn-primary" type="submit">Simpan Tiket</button>
                </div>
              </form>
            </div>
          ` : ''}

          ${state.view === 'summary' ? `
            <div class="summary-grid">
              <div class="sum-card"><span class="num">${total}</span>Total Tiket</div>
              <div class="sum-card"><span class="num">${open}</span>Open</div>
              <div class="sum-card"><span class="num">${processing}</span>Processing</div>
              <div class="sum-card"><span class="num">${closed}</span>Closed</div>
              <div class="sum-card"><span class="num">${rejected}</span>Rejected</div>
            </div>
            <div class="chart-card">
              <h3>Distribusi kategori</h3>
              <div style="display:flex;align-items:flex-end;gap:12px;height:160px;padding-top:18px;">
                ${CATS.map((cat) => {
                  const count = state.tickets.filter(t => t.category === cat).length;
                  const max = Math.max(1, ...CATS.map(c => state.tickets.filter(t => t.category === c).length));
                  const height = Math.max(16, (count / max) * 120);
                  return `
                    <div style="flex:1;text-align:center;">
                      <div style="height:${height}px; display:flex; align-items:flex-end; justify-content:center;">
                        <div style="width:100%; height:100%; background:linear-gradient(180deg,#ffc72c,#f0b719); border-radius:8px 8px 0 0; color:#1b1e23; font-weight:800; display:grid; place-items:start center; padding-top:8px;">${count}</div>
                      </div>
                      <div style="font-size:11px; color:#6b7280; margin-top:8px;">${cat}</div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          ` : ''}

          ${state.view === 'users' ? `
            <div class="panel-box">
              <h3>Kelola User</h3>
              <table class="tlist" style="margin-top:12px;">
                <thead>
                  <tr>
                    <th>Role</th>
                    <th>Username</th>
                    <th>Nama</th>
                    <th>Email</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  ${state.users.map((user) => `
                    <tr>
                      <td>${ROLE_LABEL[user.role] || user.role}</td>
                      <td>${escapeHtml(user.u)}</td>
                      <td>${escapeHtml(user.name || '-')}</td>
                      <td>${escapeHtml(user.email || '-')}</td>
                      <td><button class="btn btn-ghost reset-user" data-user="${escapeHtml(user.u)}">Reset password</button></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          ` : ''}

          ${state.view === 'profile' ? `
            <div class="create-card fb-form">
              <h3>Profil Saya</h3>
              <form id="profileForm">
                <label>
                  Nama lengkap
                  <input id="profileName" value="${escapeHtml(state.session.name || '')}" />
                </label>

                <label style="margin-top:12px;">
                  Email
                  <input id="profileEmail" value="${escapeHtml(userByUsername(state.session.u).email || '')}" />
                </label>

                <div style="margin-top:18px;">
                  <h4>Ganti Password</h4>
                  <label>
                    Password saat ini
                    <input id="oldPass" type="password" />
                  </label>
                  <label style="margin-top:12px;">
                    Password baru
                    <input id="newPass" type="password" />
                  </label>
                </div>

                <div class="close-actions">
                  <button class="btn btn-primary" type="submit">Simpan Perubahan</button>
                </div>
              </form>
            </div>
          ` : ''}
        </main>
      </div>
    </div>
  `;
}

function renderDetail() {
  if (!state.detailId) return '';
  const ticket = state.tickets.find(t => t.id === state.detailId);
  if (!ticket) return '';

  const canFeedback = (state.session.role === 'UT' || state.session.role === 'SM_PAMA') && !['CLOSED', 'REJECTED'].includes(ticket.status);
  const canClose = state.session.role === 'UT' && !['CLOSED', 'REJECTED'].includes(ticket.status);

  return `
    <div class="overlay">
      <div class="drawer">
        <div class="drawer-head">
          <div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
              <span class="chip chip-open">${escapeHtml(ticket.no || '-')}</span>
              <span class="chip chip-pr-${String(ticket.priority || 'NORMAL').toLowerCase()}">${PRIORITY_LABEL[ticket.priority || 'NORMAL']}</span>
              ${statusChip(ticket.status)}
            </div>
            <h3 style="margin-top:14px;">${escapeHtml(ticket.title || '-')}</h3>
          </div>
          <button class="icon-btn" id="closeDetail">✕</button>
        </div>

        <p class="desc">${escapeHtml(ticket.desc || '-')}</p>

        ${ticket.evidence ? `<div class="evidence-block"><strong>Evidence:</strong> <span class="evidence">${escapeHtml(ticket.evidence)}</span></div>` : ''}

        ${ticket.part ? `
          <div class="part-card">
            <h4>Spare Part</h4>
            <table>
              <tr><td>Part Number</td><td>${escapeHtml(ticket.part.no || '-')}</td></tr>
              <tr><td>Nama Part</td><td>${escapeHtml(ticket.part.name || '-')}</td></tr>
              <tr><td>Jumlah</td><td>${escapeHtml(String(ticket.part.qty || '-'))}</td></tr>
              <tr><td>Unit / No. Seri</td><td>${escapeHtml(ticket.part.unit || '-')}</td></tr>
            </table>
          </div>
        ` : ''}

        <div>
          <h3>Timeline</h3>
          <div class="timeline">
            ${(ticket.feedbacks || []).length ? ticket.feedbacks.map((fb) => `
              <div class="tl-item">
                <div class="tl-head">
                  <strong>${escapeHtml(fb.byName || fb.by)}</strong>
                  <span>${ROLE_LABEL[fb.role] || fb.role}</span>
                </div>
                <div class="tl-head" style="margin-top:4px;">
                  <span>${fmtDate(fb.at)}</span>
                </div>
                <p>${escapeHtml(fb.message || '')}</p>
                ${fb.evidence ? `<p class="evidence">${escapeHtml(fb.evidence)}</p>` : ''}
              </div>
            `).join('') : `<div class="muted">Belum ada feedback.</div>`}
          </div>
        </div>

        ${canFeedback ? `
          <form id="feedbackForm" style="margin-top:18px;">
            <h3>Feedback</h3>
            <label>
              Pesan
              <textarea id="fbMessage" placeholder="Tulis update atau alasan progress..."></textarea>
            </label>
            <label style="margin-top:12px;">
              Evidence / Link
              <input id="fbEvidence" placeholder="Link atau catatan pendukung" />
            </label>
            <label style="margin-top:12px;">
              Estimasi selesai
              <input id="fbEta" type="date" />
            </label>
            <div class="close-actions">
              <button class="btn btn-primary" type="submit">Kirim Feedback</button>
            </div>
          </form>
        ` : ''}

        ${canClose ? `
          <div class="close-actions">
            <button class="btn btn-success" id="closeTicketBtn">Tutup tiket</button>
            <button class="btn btn-danger" id="rejectTicketBtn">Tolak tiket</button>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

function render() {
  const app = document.getElementById('app');
  if (!app) return;

  if (!state.session) {
    app.innerHTML = renderLogin();
    bindLogin();
    return;
  }

  app.innerHTML = renderApp() + renderDetail();
  bindApp();
}

function bindLogin() {
  const loginInput = document.getElementById('loginUser');
  const passInput = document.getElementById('loginPass');
  const loginBtn = document.getElementById('loginBtn');

  loginBtn?.addEventListener('click', performLogin);
  [loginInput, passInput].forEach((el) => {
    el?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') performLogin();
    });
  });

  function performLogin() {
    const username = loginInput.value.trim();
    const password = passInput.value;
    const found = state.users.find(u => u.u === username && u.password === password);

    if (!found) {
      state.error = 'Username atau password salah.';
      render();
      return;
    }

    state.session = { u: found.u, role: found.role, name: found.name };
    localStorage.setItem('utpama_session', JSON.stringify(state.session));
    state.error = '';
    render();
  }
}

function bindApp() {
  document.querySelectorAll('.nav-item').forEach((button) => {
    button.addEventListener('click', () => {
      state.view = button.dataset.view;
      state.error = '';
      state.success = '';
      render();
    });
  });

  document.querySelectorAll('[data-clear-alert]').forEach((button) => {
    button.addEventListener('click', () => {
      const type = button.dataset.clearAlert;
      if (type === 'success') state.success = '';
      if (type === 'error') state.error = '';
      render();
    });
  });

  document.getElementById('logoutBtn')?.addEventListener('click', () => {
    state.session = null;
    localStorage.removeItem('utpama_session');
    state.view = 'tickets';
    render();
  });

  document.getElementById('themeToggleBtn')?.addEventListener('click', toggleTheme);

  document.getElementById('exportCsvBtn')?.addEventListener('click', exportCsv);

  document.getElementById('resetDemoBtn')?.addEventListener('click', resetDemoData);

  document.getElementById('ticketSearch')?.addEventListener('input', (event) => {
    state.search = event.target.value;
    render();
  });

  document.getElementById('filterStatus')?.addEventListener('change', (event) => {
    state.filterStatus = event.target.value;
    render();
  });
  document.getElementById('filterCategory')?.addEventListener('change', (event) => {
    state.filterCategory = event.target.value;
    render();
  });
  document.getElementById('filterPriority')?.addEventListener('change', (event) => {
    state.filterPriority = event.target.value;
    render();
  });
  document.getElementById('filterTarget')?.addEventListener('change', (event) => {
    state.filterTarget = event.target.value;
    render();
  });

  document.querySelectorAll('[data-sort]').forEach((button) => {
    button.addEventListener('click', () => {
      const key = button.dataset.sort;
      if (state.sortKey === key) {
        state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortKey = key;
        state.sortDir = 'desc';
      }
      render();
    });
  });

  document.querySelectorAll('.trow').forEach((row) => {
    row.addEventListener('click', () => {
      state.detailId = row.dataset.ticketId;
      render();
    });
  });

  document.getElementById('closeDetail')?.addEventListener('click', () => {
    state.detailId = null;
    render();
  });

  document.getElementById('createTicketForm')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const title = document.getElementById('cTitle').value.trim();
    const desc = document.getElementById('cDesc').value.trim();
    const category = document.getElementById('cCategory').value;
    const targetParty = document.getElementById('cTarget').value;
    const priority = document.getElementById('cPriority').value;
    const evidence = document.getElementById('cEvidence').value.trim();
    const needsPart = document.getElementById('needsPart').checked;

    if (!title || !desc) {
      state.error = 'Judul dan deskripsi tiket harus diisi.';
      render();
      return;
    }

    const ticket = {
      id: 't-' + Date.now(),
      no: 'TKT-' + String(state.tickets.length + 1).padStart(4, '0'),
      title,
      desc,
      category,
      priority,
      targetParty,
      evidence,
      status: 'OPEN',
      createdAt: new Date().toISOString(),
      createdBy: state.session.u,
      createdByName: state.session.name,
      feedbacks: [],
      part: needsPart ? {
        no: document.getElementById('partNo').value.trim(),
        name: document.getElementById('partName').value.trim(),
        qty: Number(document.getElementById('partQty').value || 1),
        unit: document.getElementById('partUnit').value.trim(),
      } : null,
    };

    state.tickets.unshift(ticket);
    saveLocalState();
    syncToSupabaseIfAvailable();
    state.success = 'Tiket berhasil dibuat.';
    state.view = 'tickets';
    render();
  });

  document.getElementById('needsPart')?.addEventListener('change', (event) => {
    document.getElementById('partBlock').classList.toggle('hidden', !event.target.checked);
  });

  document.getElementById('feedbackForm')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const ticket = state.tickets.find(t => t.id === state.detailId);
    if (!ticket) return;

    const message = document.getElementById('fbMessage').value.trim();
    const evidence = document.getElementById('fbEvidence').value.trim();
    const eta = document.getElementById('fbEta').value;

    if (!message) {
      state.error = 'Feedback tidak boleh kosong.';
      render();
      return;
    }

    ticket.feedbacks = [...(ticket.feedbacks || []), {
      by: state.session.u,
      byName: state.session.name,
      role: state.session.role,
      message,
      evidence,
      at: new Date().toISOString(),
    }];
    ticket.status = 'PROCESSING';
    if (eta) ticket.eta = eta;

    saveLocalState();
    syncToSupabaseIfAvailable();
    state.success = 'Feedback berhasil dikirim.';
    render();
  });

  document.getElementById('closeTicketBtn')?.addEventListener('click', () => {
    const ticket = state.tickets.find(t => t.id === state.detailId);
    if (!ticket) return;

    ticket.status = 'CLOSED';
    ticket.closedAt = new Date().toISOString();
    ticket.closedBy = state.session.u;
    ticket.closedByName = state.session.name;

    saveLocalState();
    syncToSupabaseIfAvailable();
    state.success = 'Tiket berhasil ditutup.';
    state.detailId = null;
    render();
  });

  document.getElementById('rejectTicketBtn')?.addEventListener('click', () => {
    const ticket = state.tickets.find(t => t.id === state.detailId);
    if (!ticket) return;

    ticket.status = 'REJECTED';
    ticket.closedAt = new Date().toISOString();
    ticket.closedBy = state.session.u;
    ticket.closedByName = state.session.name;

    saveLocalState();
    syncToSupabaseIfAvailable();
    state.success = 'Tiket berhasil ditolak.';
    state.detailId = null;
    render();
  });

  document.getElementById('profileForm')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const me = state.users.find(u => u.u === state.session.u);
    const oldPass = document.getElementById('oldPass').value;
    const newPass = document.getElementById('newPass').value;
    const profileName = document.getElementById('profileName').value.trim();
    const profileEmail = document.getElementById('profileEmail').value.trim();

    if (newPass && me.password !== oldPass) {
      state.error = 'Password saat ini salah.';
      render();
      return;
    }

    if (profileName) me.name = profileName;
    if (profileEmail !== undefined) me.email = profileEmail;
    if (newPass) me.password = newPass;

    state.session.name = profileName || state.session.name;
    saveLocalState();
    syncToSupabaseIfAvailable();
    state.success = 'Profil berhasil diperbarui.';
    render();
  });

  document.querySelectorAll('.reset-user').forEach((button) => {
    button.addEventListener('click', () => {
      const username = button.dataset.user;
      const newPass = prompt('Masukkan password baru untuk ' + username);
      if (!newPass) return;
      const user = state.users.find(u => u.u === username);
      if (!user) return;
      user.password = newPass;
      saveLocalState();
      syncToSupabaseIfAvailable();
      state.success = 'Password berhasil direset.';
      render();
    });
  });
}

function bootstrap() {
  const savedTheme = localStorage.getItem('utpama_theme');
  if (savedTheme) setTheme(savedTheme);
  ensureDemoData();
  initSupabase();
  render();
}

window.addEventListener('DOMContentLoaded', bootstrap);
