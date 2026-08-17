/**
 * admin.js — powers admin.html. Talks only to /api/admin/* and /api/psalms/*.
 * No dependency on the public site's storage.js (admin data is server-side, not local).
 */

const AdminApp = {
  currentView: 'overview',
  psalmsCache: null,

  async init() {
    App.init(); // reuse theme bootstrapping from the main site
    this.wireLogin();
    this.wireNav();
    document.getElementById('logout-btn').addEventListener('click', () => this.logout());
    await this.checkSession();
  },

  async checkSession() {
    const res = await fetch('/api/admin/auth/session');
    const data = await res.json();
    if (data.authenticated) {
      this.showDashboard(data.username);
    } else {
      this.showLogin();
    }
  },

  showLogin() {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('admin-shell').style.display = 'none';
  },

  showDashboard(username) {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('admin-shell').style.display = 'grid';
    document.getElementById('admin-username').textContent = username;
    this.renderView('overview');
  },

  wireLogin() {
    const form = document.getElementById('login-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('username').value.trim();
      const password = document.getElementById('password').value;
      const errorEl = document.getElementById('login-error');
      errorEl.textContent = '';
      try {
        const res = await fetch('/api/admin/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });
        const data = await res.json();
        if (!res.ok) { errorEl.textContent = data.error || 'فشل تسجيل الدخول'; return; }
        this.showDashboard(data.username);
      } catch (err) {
        errorEl.textContent = 'تعذّر الاتصال بالخادم';
      }
    });
  },

  async logout() {
    await fetch('/api/admin/auth/logout', { method: 'POST' });
    location.reload();
  },

  wireNav() {
    document.getElementById('admin-nav').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-view]');
      if (!btn) return;
      document.querySelectorAll('#admin-nav button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      this.renderView(btn.dataset.view);
    });
  },

  async fetchPsalms(force = false) {
    if (this.psalmsCache && !force) return this.psalmsCache;
    const res = await fetch('/api/psalms');
    this.psalmsCache = await res.json();
    return this.psalmsCache;
  },

  async renderView(view) {
    this.currentView = view;
    const titles = {
      overview: 'نظرة عامة', psalms: 'المزامير والنصوص', audio: 'الصوت',
      settings: 'إعدادات الموقع', log: 'سجل التعديلات',
    };
    document.getElementById('view-title').textContent = titles[view] || '';
    const root = document.getElementById('admin-content');
    root.innerHTML = '<p style="color:var(--text-soft);">جارٍ التحميل…</p>';

    if (view === 'overview') return this.renderOverview(root);
    if (view === 'psalms') return this.renderPsalmsList(root);
    if (view === 'audio') return this.renderAudio(root);
    if (view === 'settings') return this.renderSettings(root);
    if (view === 'log') return this.renderLog(root);
  },

  /* ---------------- Overview ---------------- */
  async renderOverview(root) {
    const res = await fetch('/api/admin/stats');
    const stats = await res.json();
    root.innerHTML = `
      <div class="journey-grid" style="margin-bottom:2rem;">
        <div class="card journey-stat"><div class="num">${stats.totalPsalms}</div><div class="label">مزمورًا</div></div>
        <div class="card journey-stat"><div class="num">${stats.totalVerses}</div><div class="label">آية</div></div>
        <div class="card journey-stat"><div class="num">${stats.psalmsWithAudio}</div><div class="label">لها صوت</div></div>
        <div class="card journey-stat"><div class="num">${stats.totalEdits}</div><div class="label">تعديل مُسجَّل</div></div>
      </div>
      <div class="card">
        <h3 style="margin-bottom:0.5rem;">ملاحظة مهمة</h3>
        <p style="color:var(--text-soft); margin:0;">
          أى تعديل تعمله على نص آية بيتسجّل تلقائيًا فى "سجل التعديلات" مع النص القديم والجديد —
          عشان أى تصحيح يفضل شفاف وموثّق، ومينفعش حد (حتى أنت) يغيّر النص بصمت.
        </p>
      </div>
    `;
  },

  /* ---------------- Psalms & verse editing ---------------- */
  async renderPsalmsList(root) {
    const psalms = await this.fetchPsalms();
    root.innerHTML = `
      <input type="search" id="admin-psalm-search" placeholder="ابحث برقم أو عنوان المزمور…"
        style="width:100%; padding:0.75rem 1rem; margin-bottom:1rem; border-radius:8px; border:1px solid var(--line); background:var(--bg-elevated); color:var(--text); font-family:inherit;">
      <table class="admin-table">
        <thead><tr><th>رقم</th><th>العنوان</th><th>آيات</th><th>صوت</th><th></th></tr></thead>
        <tbody id="admin-psalm-rows"></tbody>
      </table>
    `;
    const drawRows = (list) => {
      document.getElementById('admin-psalm-rows').innerHTML = list.map(p => `
        <tr>
          <td>${p.number}</td>
          <td>${p.title}</td>
          <td>${p.verses.length}</td>
          <td>${p.audio ? '✓' : '—'}</td>
          <td><button class="btn btn-sm btn-secondary" data-edit="${p.number}">تعديل</button></td>
        </tr>`).join('');
      document.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => this.renderPsalmEditor(root, Number(b.dataset.edit))));
    };
    drawRows(psalms);
    document.getElementById('admin-psalm-search').addEventListener('input', (e) => {
      const q = e.target.value.trim();
      const filtered = q ? psalms.filter(p => String(p.number).includes(q) || p.title.includes(q)) : psalms;
      drawRows(filtered);
    });
  },

  async renderPsalmEditor(root, number) {
    const psalms = await this.fetchPsalms();
    const psalm = psalms.find(p => p.number === number);
    root.innerHTML = `
      <button class="btn btn-sm btn-secondary" id="back-to-list" style="margin-bottom:1.5rem;">→ رجوع للقائمة</button>
      <div class="card" style="margin-bottom:1.5rem;">
        <div class="admin-field"><label>العنوان</label><input type="text" id="edit-title" value="${escapeAttr(psalm.title)}"></div>
        <div class="admin-field"><label>المقدمة (إن وُجدت)</label><input type="text" id="edit-intro" value="${escapeAttr(psalm.introduction || '')}"></div>
        <button class="btn btn-primary btn-sm" id="save-meta-btn">حفظ العنوان والمقدمة</button>
      </div>
      <h3 style="margin-bottom:0.75rem;">الآيات (${psalm.verses.length})</h3>
      <div id="verse-editor-list"></div>
    `;
    document.getElementById('back-to-list').addEventListener('click', () => this.renderPsalmsList(root));
    document.getElementById('save-meta-btn').addEventListener('click', async () => {
      const title = document.getElementById('edit-title').value.trim();
      const introduction = document.getElementById('edit-intro').value.trim();
      const res = await fetch(`/api/psalms/${number}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, introduction }),
      });
      if (res.ok) { toast('تم الحفظ'); this.fetchPsalms(true); } else { toast('فشل الحفظ'); }
    });

    const listEl = document.getElementById('verse-editor-list');
    listEl.innerHTML = psalm.verses.map(v => `
      <div class="admin-verse-row" data-verse="${v.number}">
        <span class="vnum">${v.number}</span>
        <textarea data-original="${escapeAttr(v.text)}">${escapeHtml(v.text)}</textarea>
        <button class="btn btn-sm btn-primary save-verse-btn" disabled>حفظ</button>
      </div>`).join('');

    listEl.querySelectorAll('.admin-verse-row').forEach(row => {
      const vnum = Number(row.dataset.verse);
      const ta = row.querySelector('textarea');
      const saveBtn = row.querySelector('.save-verse-btn');
      ta.addEventListener('input', () => {
        const changed = ta.value !== ta.dataset.original;
        ta.classList.toggle('dirty', changed);
        saveBtn.disabled = !changed;
      });
      saveBtn.addEventListener('click', async () => {
        const newText = ta.value.trim();
        const oldText = ta.dataset.original;
        saveBtn.disabled = true;
        saveBtn.textContent = 'جارٍ الحفظ…';
        const res = await fetch(`/api/psalms/${number}/verses/${vnum}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: newText }),
        });
        saveBtn.textContent = 'حفظ';
        if (res.ok) {
          ta.dataset.original = newText;
          ta.classList.remove('dirty');
          this.fetchPsalms(true);
          toast(`تم حفظ الآية ${vnum} — التغيير مسجَّل فى سجل التعديلات`);
          const diff = document.createElement('div');
          diff.className = 'admin-diff';
          diff.innerHTML = `<span class="old-val">${escapeHtml(oldText)}</span><br><span class="new-val">${escapeHtml(newText)}</span>`;
          row.appendChild(diff);
          setTimeout(() => diff.remove(), 6000);
        } else {
          saveBtn.disabled = false;
          toast('فشل حفظ الآية');
        }
      });
    });
  },

  /* ---------------- Audio ---------------- */
  async renderAudio(root) {
    const psalms = await this.fetchPsalms();
    root.innerHTML = `
      <p style="color:var(--text-soft); margin-bottom:1.5rem;">اختر مزمورًا وارفع ملف mp3 له. الرفع بيستبدل أى ملف قديم لنفس المزمور.</p>
      <div style="display:flex; gap:0.75rem; align-items:center; margin-bottom:1.5rem;">
        <select id="audio-psalm-select" style="flex:1; padding:0.6rem; border-radius:8px; border:1px solid var(--line); background:var(--bg-elevated); color:var(--text);">
          ${psalms.map(p => `<option value="${p.number}">${p.number} — ${p.title} ${p.audio ? '(له صوت بالفعل)' : ''}</option>`).join('')}
        </select>
      </div>
      <div class="file-drop" id="audio-drop">اسحب ملف mp3 هنا أو اضغط للاختيار</div>
      <input type="file" id="audio-file-input" accept="audio/*" style="display:none;">
      <p id="audio-upload-status" style="color:var(--text-soft); margin-top:1rem;"></p>
      <button class="btn btn-secondary btn-sm" id="remove-audio-btn" style="margin-top:1rem;">حذف الصوت الحالى لهذا المزمور</button>
    `;
    const drop = document.getElementById('audio-drop');
    const input = document.getElementById('audio-file-input');
    const status = document.getElementById('audio-upload-status');
    const select = document.getElementById('audio-psalm-select');

    drop.addEventListener('click', () => input.click());
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('dragover'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
    drop.addEventListener('drop', (e) => {
      e.preventDefault(); drop.classList.remove('dragover');
      if (e.dataTransfer.files[0]) this.uploadAudio(select.value, e.dataTransfer.files[0], status);
    });
    input.addEventListener('change', () => {
      if (input.files[0]) this.uploadAudio(select.value, input.files[0], status);
    });
    document.getElementById('remove-audio-btn').addEventListener('click', async () => {
      const res = await fetch(`/api/admin/audio/${select.value}`, { method: 'DELETE' });
      if (res.ok) { toast('تم حذف الصوت'); this.fetchPsalms(true); this.renderAudio(root); }
      else toast('فشل الحذف');
    });
  },

  async uploadAudio(psalmNumber, file, statusEl) {
    statusEl.textContent = 'جارٍ الرفع…';
    const form = new FormData();
    form.append('audio', file);
    const res = await fetch(`/api/admin/audio/${psalmNumber}`, { method: 'POST', body: form });
    const data = await res.json();
    if (res.ok) {
      statusEl.textContent = `✓ تم ربط الصوت بالمزمور ${psalmNumber}`;
      this.fetchPsalms(true);
      toast('تم رفع الصوت بنجاح');
    } else {
      statusEl.textContent = `✗ ${data.error || 'فشل الرفع'}`;
    }
  },

  /* ---------------- Settings ---------------- */
  async renderSettings(root) {
    const res = await fetch('/api/settings');
    const s = await res.json();
    root.innerHTML = `
      <div class="card" style="margin-bottom:1.5rem;">
        <h3 style="margin-bottom:0.75rem;">رسالة إعلان فى الصفحة الرئيسية</h3>
        <textarea id="announcement-text" style="width:100%; min-height:5rem; padding:0.75rem; border-radius:8px; border:1px solid var(--line); background:var(--bg); color:var(--text); font-family:inherit;">${escapeHtml(s.announcement)}</textarea>
        <label style="display:flex; align-items:center; gap:0.5rem; margin-top:0.75rem;">
          <input type="checkbox" id="announcement-active" ${s.announcementActive ? 'checked' : ''}>
          إظهار الرسالة على الموقع
        </label>
        <button class="btn btn-primary btn-sm" id="save-settings-btn" style="margin-top:1rem;">حفظ</button>
      </div>
      <div class="card">
        <h3 style="margin-bottom:0.5rem;">وضع الصيانة</h3>
        <p style="color:var(--text-soft); font-size:0.9rem; margin-bottom:0.75rem;">تفعيله لا يوقف الموقع تلقائيًا حاليًا — علم متاح فى الإعدادات للاستخدام المستقبلى.</p>
        <label style="display:flex; align-items:center; gap:0.5rem;">
          <input type="checkbox" id="maintenance-mode" ${s.maintenanceMode ? 'checked' : ''}>
          تفعيل وضع الصيانة
        </label>
      </div>

      <div class="card" style="margin-top:1.5rem;">
        <h3 style="margin-bottom:0.75rem;">تغيير كلمة المرور</h3>
        <div class="admin-field"><label>كلمة المرور الحالية</label><input type="password" id="current-password" autocomplete="current-password"></div>
        <div class="admin-field"><label>كلمة المرور الجديدة (٨ خانات على الأقل)</label><input type="password" id="new-password" autocomplete="new-password"></div>
        <button class="btn btn-primary btn-sm" id="change-password-btn">تحديث كلمة المرور</button>
        <p class="admin-error" id="change-password-error" role="alert"></p>
      </div>
    `;
    document.getElementById('change-password-btn').addEventListener('click', async () => {
      const currentPassword = document.getElementById('current-password').value;
      const newPassword = document.getElementById('new-password').value;
      const errEl = document.getElementById('change-password-error');
      errEl.textContent = '';
      const res = await fetch('/api/admin/auth/change-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        toast('تم تحديث كلمة المرور بنجاح');
        document.getElementById('current-password').value = '';
        document.getElementById('new-password').value = '';
      } else {
        errEl.textContent = data.error || 'فشل التحديث';
      }
    });
    document.getElementById('save-settings-btn').addEventListener('click', async () => {
      const body = {
        announcement: document.getElementById('announcement-text').value,
        announcementActive: document.getElementById('announcement-active').checked,
        maintenanceMode: document.getElementById('maintenance-mode').checked,
      };
      const res2 = await fetch('/api/settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      toast(res2.ok ? 'تم حفظ الإعدادات' : 'فشل الحفظ');
    });
  },

  /* ---------------- Edit log ---------------- */
  async renderLog(root) {
    const res = await fetch('/api/admin/stats/edit-log');
    const log = await res.json();
    if (!log.length) {
      root.innerHTML = `<p style="color:var(--text-soft);">لا توجد تعديلات مسجَّلة بعد.</p>`;
      return;
    }
    root.innerHTML = `
      <table class="admin-table">
        <thead><tr><th>التاريخ</th><th>النوع</th><th>العنصر</th><th>بواسطة</th></tr></thead>
        <tbody>
          ${log.map(entry => `
            <tr>
              <td>${new Date(entry.at).toLocaleString('ar-EG')}</td>
              <td>${entry.entityType}</td>
              <td>${entry.entityId}</td>
              <td>${entry.adminUsername}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    `;
  },
};

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}
function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }

function toast(msg, ms = 2600) {
  let region = document.getElementById('toast-region');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  region.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 350); }, ms);
}

document.addEventListener('DOMContentLoaded', () => AdminApp.init());
