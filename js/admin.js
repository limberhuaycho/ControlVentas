/**
 * ============================================
 * ADMIN.JS - Panel de administración
 * ============================================
 * Admin verifica con Google + Firestore.
 * No redirige a login.html, se queda en admin.html.
 */

// ============================================
// BOTÓN PARA OCULTAR/MOSTRAR EL ADMIN PANEL
// ============================================
document.addEventListener('DOMContentLoaded', function () {
  const hideBtn = document.createElement('button');
  hideBtn.id = 'btnOcultarAdmin';
  hideBtn.title = 'Ocultar Panel Admin';
  hideBtn.innerHTML = '✕ Ocultar Panel';
  hideBtn.style.cssText = [
    'position:fixed',
    'top:14px',
    'right:14px',
    'z-index:99999',
    'background:#e74c3c',
    'color:#fff',
    'border:none',
    'border-radius:10px',
    'padding:9px 18px',
    'font-size:0.88rem',
    'font-weight:700',
    'cursor:pointer',
    'box-shadow:0 4px 16px rgba(0,0,0,0.18)',
    'letter-spacing:0.5px',
    'transition:opacity 0.2s'
  ].join(';');

  hideBtn.addEventListener('mouseenter', function () { this.style.opacity = '0.85'; });
  hideBtn.addEventListener('mouseleave', function () { this.style.opacity = '1'; });

  hideBtn.addEventListener('click', function () {
    const panel = document.getElementById('adminPanelSection');
    const login = document.getElementById('adminLoginSection');
    if (panel) panel.classList.add('hidden');
    if (login) login.classList.add('hidden');
    hideBtn.style.display = 'none';
  });

  document.body.appendChild(hideBtn);
});

// ============================================
// ADMIN GOOGLE LOGIN
// ============================================
async function handleAdminGoogleLogin() {
  const btn = document.getElementById('adminGoogleBtn');
  btn.innerHTML = '<div class="spinner spinner-sm" style="border-top-color:var(--primary);display:inline-block;"></div> Verificando...';
  btn.disabled = true;

  try {
    const result = await auth.signInWithPopup(googleProvider);
    const user = result.user;

    const isAdmin = await verificarAdmin(user.uid, user.email);

    if (isAdmin) {
      showToast('¡Bienvenido Administrador!', 'success');
      document.getElementById('loadingOverlay').style.display = 'none';
      document.getElementById('adminLoginSection').classList.add('hidden');
      document.getElementById('adminPanelSection').classList.remove('hidden');

      document.getElementById('adminName').textContent = user.displayName || 'Admin';
      document.getElementById('adminAvatar').textContent = (user.displayName || 'A').charAt(0).toUpperCase();

      loadAdminData();
    } else {
      showToast('❌ Este correo no tiene permisos de administrador: ' + user.email, 'error');
      await auth.signOut();
    }
  } catch (error) {
    console.error('Error admin login:', error);
    if (error.code !== 'auth/popup-closed-by-user') {
      showToast('Error al iniciar sesión', 'error');
    }
  } finally {
    btn.innerHTML = '<img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" style="width:20px;height:20px;"> Ingresar con Google';
    btn.disabled = false;
  }
}

auth.onAuthStateChanged(async (user) => {
  document.getElementById('loadingOverlay').style.display = 'none';

  if (user) {
    const isAdmin = await verificarAdmin(user.uid, user.email);
    if (isAdmin) {
      document.getElementById('adminLoginSection').classList.add('hidden');
      document.getElementById('adminPanelSection').classList.remove('hidden');
      document.getElementById('adminName').textContent = user.displayName || 'Admin';
      document.getElementById('adminAvatar').textContent = (user.displayName || 'A').charAt(0).toUpperCase();
      loadAdminData();
    } else {
      document.getElementById('adminLoginSection').classList.remove('hidden');
      document.getElementById('adminPanelSection').classList.add('hidden');
    }
  } else {
    document.getElementById('adminLoginSection').classList.remove('hidden');
    document.getElementById('adminPanelSection').classList.add('hidden');
  }
});

function showAdminSection(section) {
  document.querySelectorAll('[id^="admin-"]').forEach(el => { if (el.classList) el.classList.add('hidden'); });
  const target = document.getElementById('admin-' + section);
  if (target) { target.classList.remove('hidden'); target.classList.add('animate-fadeIn'); }
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  event.currentTarget?.classList.add('active');
}

function showToast(msg, type = 'success') {
  const c = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span>${type === 'success' ? '✅' : type === 'error' ? '❌' : '⚠️'}</span><span>${msg}</span><button class="toast-close" onclick="this.parentElement.remove()">×</button>`;
  c.appendChild(t);
  setTimeout(() => t.remove(), 5000);
}

async function loadAdminData() {
  db.ref('usuarios').on('value', (snap) => {
    const users = snap.val() || {};
    renderAdminUsers(users);
    updateAdminStats(users);
  });
  db.ref('codigos').on('value', (snap) => {
    renderCodes(snap.val() || {});
  });
  loadPlansEditor();
}

function renderAdminUsers(users) {
  const tbody = document.getElementById('adminUsersTable');
  const entries = Object.entries(users);
  if (entries.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-gray">Sin usuarios</td></tr>';
    return;
  }

  tbody.innerHTML = entries.map(([uid, data]) => {
    const p = data.perfil || {};
    return `<tr>
      <td style="font-weight:600;">${p.nombre || 'Sin nombre'}</td>
      <td>${p.email || '-'}</td>
      <td>${p.negocio || '-'}</td>
      <td><span class="badge-plan badge-${p.plan || 'free'}">${(p.plan || 'gratuito').toUpperCase()}</span></td>
      <td><span class="badge-status ${p.activo !== false ? 'badge-active' : 'badge-inactive'}">${p.activo !== false ? 'Activo' : 'Inactivo'}</span></td>
      <td>
        <button class="btn btn-sm ${p.activo !== false ? 'btn-danger' : 'btn-success'}" onclick="toggleUserStatus('${uid}', ${p.activo !== false})">${p.activo !== false ? 'Desactivar' : 'Activar'}</button>
        <button class="btn btn-sm btn-outline" onclick="viewUserData('${uid}')">👁️</button>
        <button class="btn btn-sm btn-primary" onclick="editUserLimits('${uid}')">✏️ Límites</button>
      </td>
    </tr>`;
  }).join('');
}

async function toggleUserStatus(uid, currentActive) {
  showConfirm(
    currentActive ? '¿Desactivar este usuario?' : '¿Activar este usuario?',
    currentActive ? 'El usuario no podrá ingresar al sistema.' : 'El usuario podrá acceder nuevamente.',
    async () => {
      await db.ref('usuarios/' + uid + '/perfil/activo').set(!currentActive);
      showToast(currentActive ? 'Usuario desactivado' : 'Usuario activado', 'success');
    }
  );
}

async function viewUserData(uid) {
  const snap = await db.ref('usuarios/' + uid).once('value');
  const data = snap.val();
  const ventas = data.ventas ? Object.keys(data.ventas).length : 0;
  const productos = data.productos ? Object.keys(data.productos).length : 0;
  const extractos = data.extractos ? Object.keys(data.extractos).length : 0;
  const p = data.perfil || {};
  showUserModal(uid, p, productos, ventas, extractos);
}

function showUserModal(uid, p, productos, ventas, extractos) {
  let modal = document.getElementById('adminUserModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'adminUserModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;';
    document.body.appendChild(modal);
  }
  modal.innerHTML = `
    <div style="background:var(--white);border-radius:20px;padding:32px;max-width:420px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
        <div style="width:48px;height:48px;border-radius:14px;background:var(--gradient-1);display:flex;align-items:center;justify-content:center;font-size:1.4rem;color:white;">${(p.nombre || 'U').charAt(0).toUpperCase()}</div>
        <div>
          <div style="font-weight:800;font-size:1.1rem;">${p.nombre || 'Sin nombre'}</div>
          <div style="font-size:0.8rem;color:var(--gray);">${p.email || '-'}</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;">
        <div style="background:var(--light-2);border-radius:12px;padding:12px;text-align:center;">
          <div style="font-size:1.5rem;font-weight:800;color:var(--primary);">${productos}</div>
          <div style="font-size:0.75rem;color:var(--gray);">Productos</div>
        </div>
        <div style="background:var(--light-2);border-radius:12px;padding:12px;text-align:center;">
          <div style="font-size:1.5rem;font-weight:800;color:var(--success);">${ventas}</div>
          <div style="font-size:0.75rem;color:var(--gray);">Ventas</div>
        </div>
        <div style="background:var(--light-2);border-radius:12px;padding:12px;text-align:center;">
          <div style="font-size:1.5rem;font-weight:800;color:var(--secondary);">${extractos}</div>
          <div style="font-size:0.75rem;color:var(--gray);">Extractos</div>
        </div>
        <div style="background:var(--light-2);border-radius:12px;padding:12px;text-align:center;">
          <div style="font-size:1rem;font-weight:800;color:var(--accent);">${(p.plan || 'gratuito').toUpperCase()}</div>
          <div style="font-size:0.75rem;color:var(--gray);">Plan</div>
        </div>
      </div>
      <div style="font-size:0.85rem;color:var(--gray);margin-bottom:20px;">
        <div><strong>Negocio:</strong> ${p.negocio || '-'}</div>
        <div><strong>Teléfono:</strong> ${p.telefono || '-'}</div>
        <div><strong>Registro:</strong> ${p.fechaRegistro ? new Date(p.fechaRegistro).toLocaleDateString('es-MX') : '-'}</div>
        <div><strong>Extractos usados hoy:</strong> ${p.limiteActualDia || 0} / ${p.limiteExtractosDia || 1}</div>
        <div><strong>Extractos usados este mes:</strong> ${p.limiteActualMes || 0} / ${p.limiteExtractosMes || 2}</div>
      </div>
      <div style="display:flex;gap:8px;">
        <button onclick="document.getElementById('adminUserModal').style.display='none'" style="flex:1;padding:12px;border-radius:10px;border:1.5px solid var(--light);background:var(--white);font-weight:600;cursor:pointer;font-size:0.9rem;">Cerrar</button>
        <button onclick="editUserLimits('${uid}');document.getElementById('adminUserModal').style.display='none';" style="flex:1;padding:12px;border-radius:10px;border:none;background:var(--primary);color:white;font-weight:700;cursor:pointer;font-size:0.9rem;">✏️ Editar Límites</button>
        <button onclick="deleteUserData('${uid}');document.getElementById('adminUserModal').style.display='none';" style="flex:1;padding:12px;border-radius:10px;border:none;background:var(--danger,#e74c3c);color:white;font-weight:700;cursor:pointer;font-size:0.9rem;">🗑️ Eliminar</button>
      </div>
    </div>
  `;
  modal.style.display = 'flex';
  modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
}

/**
 * editUserLimits
 * Abre modal para editar directamente los límites y contadores reales de extractos de un usuario.
 * Permite modificar: limiteExtractosDia, limiteExtractosMes, limiteActualDia, limiteActualMes
 */
async function editUserLimits(uid) {
  const snap = await db.ref('usuarios/' + uid + '/perfil').once('value');
  const p = snap.val() || {};

  let modal = document.getElementById('adminLimitsModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'adminLimitsModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div style="background:var(--white);border-radius:20px;padding:28px;max-width:480px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
      <h3 style="font-weight:800;margin-bottom:4px;font-size:1.1rem;">✏️ Editar Límites de Usuario</h3>
      <p style="font-size:0.8rem;color:var(--gray);margin-bottom:20px;">${p.nombre || uid} — Plan: ${(p.plan || 'gratuito').toUpperCase()}</p>

      <h4 style="font-size:0.9rem;font-weight:700;margin-bottom:10px;color:var(--primary);">📄 Extractos — Límites del Plan</h4>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
        <div class="form-group">
          <label style="font-size:0.8rem;">Límite Extractos/Día</label>
          <input type="number" id="ul-limEDia" value="${p.limiteExtractosDia || 1}" style="width:100%;padding:10px;border-radius:8px;border:1.5px solid var(--light);font-size:0.95rem;">
        </div>
        <div class="form-group">
          <label style="font-size:0.8rem;">Límite Extractos/Mes</label>
          <input type="number" id="ul-limEMes" value="${p.limiteExtractosMes || 2}" style="width:100%;padding:10px;border-radius:8px;border:1.5px solid var(--light);font-size:0.95rem;">
        </div>
      </div>

      <h4 style="font-size:0.9rem;font-weight:700;margin-bottom:6px;color:var(--secondary);">📊 Contadores Actuales (uso real)</h4>
      <p style="font-size:0.78rem;color:var(--gray);margin-bottom:10px;">Modifica solo si necesitas resetear o corregir el contador real. Normalmente se resetean automáticamente cada día/mes.</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
        <div class="form-group">
          <label style="font-size:0.8rem;">Usados Hoy (limiteActualDia)</label>
          <input type="number" id="ul-actDia" value="${p.limiteActualDia || 0}" style="width:100%;padding:10px;border-radius:8px;border:1.5px solid var(--light);font-size:0.95rem;">
        </div>
        <div class="form-group">
          <label style="font-size:0.8rem;">Usados Este Mes (limiteActualMes)</label>
          <input type="number" id="ul-actMes" value="${p.limiteActualMes || 0}" style="width:100%;padding:10px;border-radius:8px;border:1.5px solid var(--light);font-size:0.95rem;">
        </div>
      </div>

      <h4 style="font-size:0.9rem;font-weight:700;margin-bottom:10px;color:var(--primary);">🛍️ Otros Límites del Plan</h4>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:20px;">
        <div class="form-group">
          <label style="font-size:0.8rem;">Límite Productos</label>
          <input type="number" id="ul-limProd" value="${p.limiteProductos || 50}" style="width:100%;padding:10px;border-radius:8px;border:1.5px solid var(--light);font-size:0.95rem;">
        </div>
        <div class="form-group">
          <label style="font-size:0.8rem;">Ventas/Día</label>
          <input type="number" id="ul-limVDia" value="${p.limiteVentasDia || 20}" style="width:100%;padding:10px;border-radius:8px;border:1.5px solid var(--light);font-size:0.95rem;">
        </div>
        <div class="form-group">
          <label style="font-size:0.8rem;">Ventas/Mes</label>
          <input type="number" id="ul-limVMes" value="${p.limiteVentasMes || 500}" style="width:100%;padding:10px;border-radius:8px;border:1.5px solid var(--light);font-size:0.95rem;">
        </div>
      </div>

      <div style="display:flex;gap:10px;">
        <button onclick="document.getElementById('adminLimitsModal').style.display='none'" style="flex:1;padding:13px;border-radius:10px;border:1.5px solid var(--light);background:var(--white);font-weight:600;cursor:pointer;font-size:0.9rem;">Cancelar</button>
        <button onclick="saveUserLimits('${uid}')" style="flex:2;padding:13px;border-radius:10px;border:none;background:var(--gradient-1);color:white;font-weight:700;cursor:pointer;font-size:0.95rem;">💾 Guardar Cambios</button>
      </div>
    </div>
  `;
  modal.style.display = 'flex';
  modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
}

/**
 * saveUserLimits
 * Guarda los límites y contadores de extractos directamente en el perfil del usuario.
 */
async function saveUserLimits(uid) {
  const limiteExtractosDia = parseInt(document.getElementById('ul-limEDia').value) || 1;
  const limiteExtractosMes = parseInt(document.getElementById('ul-limEMes').value) || 2;
  const limiteActualDia = parseInt(document.getElementById('ul-actDia').value) || 0;
  const limiteActualMes = parseInt(document.getElementById('ul-actMes').value) || 0;
  const limiteProductos = parseInt(document.getElementById('ul-limProd').value) || 50;
  const limiteVentasDia = parseInt(document.getElementById('ul-limVDia').value) || 20;
  const limiteVentasMes = parseInt(document.getElementById('ul-limVMes').value) || 500;

  try {
    await db.ref('usuarios/' + uid + '/perfil').update({
      limiteExtractosDia,
      limiteExtractosMes,
      limiteActualDia,
      limiteActualMes,
      limiteProductos,
      limiteVentasDia,
      limiteVentasMes
    });
    document.getElementById('adminLimitsModal').style.display = 'none';
    showToast('Límites del usuario actualizados ✅', 'success');
  } catch (e) {
    console.error(e);
    showToast('Error al guardar límites', 'error');
  }
}

async function deleteUserData(uid) {
  showConfirm('¿Eliminar todos los datos de este usuario?', 'Esta acción no se puede deshacer.', async () => {
    await db.ref('usuarios/' + uid).remove();
    showToast('Usuario eliminado', 'success');
  });
}

function updateAdminStats(users) {
  const entries = Object.entries(users);
  let active = 0, totalSales = 0;
  entries.forEach(([, data]) => {
    if (data.perfil?.activo !== false) active++;
    if (data.ventas) Object.values(data.ventas).forEach(v => { totalSales += v.total || 0; });
  });
  document.getElementById('adminTotalUsers').textContent = entries.length;
  document.getElementById('adminActiveUsers').textContent = active;
  document.getElementById('adminTotalSales').textContent = '$' + totalSales.toFixed(2);

  db.ref('codigos').once('value', (snap) => {
    const codes = snap.val() || {};
    const avail = Object.values(codes).filter(c => c.estado === 'disponible').length;
    document.getElementById('adminAvailCodes').textContent = avail;
  });
}

// ============================================
// PLANES - Editor con límites de extractos PDF
// ============================================

async function loadPlansEditor() {
  const snap = await db.ref('planesConfig').once('value');
  let planes = snap.val();
  if (!planes) {
    planes = {
      gratuito: {
        nombre: 'Gratuito', precio: 0, periodo: 'Para siempre', limiteProductos: 50,
        limiteVentasDia: 20, limiteVentasMes: 500,
        limiteExtractosDia: 1, limiteExtractosMes: 2,
        mediaPermisos: { imagen: true, video: false, modelo3d: false, firebaseStorage: false, githubHosting: true },
        textoBoton: 'Comenzar Gratis', descripcion: 'Funciones básicas para empezar'
      },
      mensual: {
        nombre: 'Mensual', precio: 50, periodo: 'por mes', limiteProductos: 999999,
        limiteVentasDia: 999999, limiteVentasMes: 999999,
        limiteExtractosDia: 5, limiteExtractosMes: 30,
        mediaPermisos: { imagen: true, video: true, modelo3d: false, firebaseStorage: true, githubHosting: true },
        textoBoton: 'Elegir Plan', descripcion: 'Para negocios en crecimiento'
      },
      premium: {
        nombre: 'Premium', precio: 100, periodo: 'por mes', limiteProductos: 999999,
        limiteVentasDia: 999999, limiteVentasMes: 999999,
        limiteExtractosDia: 10, limiteExtractosMes: 60,
        mediaPermisos: { imagen: true, video: true, modelo3d: true, firebaseStorage: true, githubHosting: true },
        textoBoton: 'Elegir Premium', descripcion: 'Todas las funciones'
      },
      mantenimiento: {
        nombre: 'Mantenimiento', precio: 270, periodo: 'pago único', limiteProductos: 999999,
        limiteVentasDia: 999999, limiteVentasMes: 999999,
        limiteExtractosDia: 999999, limiteExtractosMes: 999999,
        mediaPermisos: { imagen: true, video: true, modelo3d: true, firebaseStorage: true, githubHosting: true },
        textoBoton: 'Contactar', descripcion: 'Soporte completo y personalización'
      }
    };
    await db.ref('planesConfig').set(planes);
  }
  renderPlansEditor(planes);
}

function renderPlansEditor(planes) {
  const container = document.getElementById('planesEditor');
  container.innerHTML = Object.entries(planes).map(([key, p]) => `
    <div class="card mb-3 card-3d" id="plan-${key}">
      <div class="card-header">
        <h3>💳 ${p.nombre}</h3>
        <button class="btn btn-sm btn-danger" onclick="deletePlan('${key}')">Eliminar</button>
      </div>
      <div class="form-row-3">
        <div class="form-group"><label>Nombre</label><input type="text" value="${p.nombre}" id="pn-${key}-nombre"></div>
        <div class="form-group"><label>Precio ($)</label><input type="number" value="${p.precio}" id="pn-${key}-precio"></div>
        <div class="form-group"><label>Periodo</label><input type="text" value="${p.periodo}" id="pn-${key}-periodo"></div>
      </div>
      <div class="form-row-3">
        <div class="form-group"><label>Límite Productos</label><input type="number" value="${p.limiteProductos}" id="pn-${key}-limProd"></div>
        <div class="form-group"><label>Límite Ventas/Día</label><input type="number" value="${p.limiteVentasDia}" id="pn-${key}-limVDia"></div>
        <div class="form-group"><label>Límite Ventas/Mes</label><input type="number" value="${p.limiteVentasMes}" id="pn-${key}-limVMes"></div>
      </div>
      <div class="form-row-3">
        <div class="form-group"><label>📄 Extractos/Día</label><input type="number" value="${p.limiteExtractosDia || 1}" id="pn-${key}-limEDia"></div>
        <div class="form-group"><label>📄 Extractos/Mes</label><input type="number" value="${p.limiteExtractosMes || 2}" id="pn-${key}-limEMes"></div>
        <div class="form-group"><label>Texto Botón</label><input type="text" value="${p.textoBoton || ''}" id="pn-${key}-btn"></div>
      </div>
      <div class="form-group"><label>Descripción</label><input type="text" value="${p.descripcion || ''}" id="pn-${key}-desc"></div>
      <h4 style="margin:12px 0 8px;">Permisos de Medios</h4>
      <div style="display:flex;gap:20px;flex-wrap:wrap;">
        <label class="flex items-center gap-2"><div class="switch"><input type="checkbox" ${p.mediaPermisos?.imagen ? 'checked' : ''} id="pn-${key}-img"><span class="switch-slider"></span></div> Imagen</label>
        <label class="flex items-center gap-2"><div class="switch"><input type="checkbox" ${p.mediaPermisos?.video ? 'checked' : ''} id="pn-${key}-vid"><span class="switch-slider"></span></div> Video</label>
        <label class="flex items-center gap-2"><div class="switch"><input type="checkbox" ${p.mediaPermisos?.modelo3d ? 'checked' : ''} id="pn-${key}-3d"><span class="switch-slider"></span></div> Modelo 3D</label>
        <label class="flex items-center gap-2"><div class="switch"><input type="checkbox" ${p.mediaPermisos?.firebaseStorage ? 'checked' : ''} id="pn-${key}-fbs"><span class="switch-slider"></span></div> Firebase Storage</label>
        <label class="flex items-center gap-2"><div class="switch"><input type="checkbox" ${p.mediaPermisos?.githubHosting ? 'checked' : ''} id="pn-${key}-gh"><span class="switch-slider"></span></div> GitHub Hosting</label>
      </div>
      <button class="btn btn-primary btn-block mt-3" onclick="savePlan('${key}')">Guardar Cambios de ${p.nombre}</button>
    </div>
  `).join('');
}

async function savePlan(key) {
  const plan = {
    nombre: document.getElementById(`pn-${key}-nombre`).value,
    precio: parseFloat(document.getElementById(`pn-${key}-precio`).value) || 0,
    periodo: document.getElementById(`pn-${key}-periodo`).value,
    limiteProductos: parseInt(document.getElementById(`pn-${key}-limProd`).value) || 50,
    limiteVentasDia: parseInt(document.getElementById(`pn-${key}-limVDia`).value) || 20,
    limiteVentasMes: parseInt(document.getElementById(`pn-${key}-limVMes`).value) || 500,
    limiteExtractosDia: parseInt(document.getElementById(`pn-${key}-limEDia`).value) || 1,
    limiteExtractosMes: parseInt(document.getElementById(`pn-${key}-limEMes`).value) || 2,
    textoBoton: document.getElementById(`pn-${key}-btn`).value,
    descripcion: document.getElementById(`pn-${key}-desc`).value,
    mediaPermisos: {
      imagen: document.getElementById(`pn-${key}-img`).checked,
      video: document.getElementById(`pn-${key}-vid`).checked,
      modelo3d: document.getElementById(`pn-${key}-3d`).checked,
      firebaseStorage: document.getElementById(`pn-${key}-fbs`).checked,
      githubHosting: document.getElementById(`pn-${key}-gh`).checked
    }
  };
  await db.ref('planesConfig/' + key).set(plan);

  const usersSnap = await db.ref('usuarios').once('value');
  const users = usersSnap.val() || {};
  const updates = {};
  Object.entries(users).forEach(([uid, data]) => {
    if ((data.perfil?.plan || 'gratuito') === key) {
      updates[`usuarios/${uid}/perfil/limiteExtractosDia`] = plan.limiteExtractosDia;
      updates[`usuarios/${uid}/perfil/limiteExtractosMes`] = plan.limiteExtractosMes;
      updates[`usuarios/${uid}/perfil/limiteProductos`] = plan.limiteProductos;
      updates[`usuarios/${uid}/perfil/limiteVentasDia`] = plan.limiteVentasDia;
      updates[`usuarios/${uid}/perfil/limiteVentasMes`] = plan.limiteVentasMes;
      updates[`usuarios/${uid}/perfil/mediaPermisos`] = plan.mediaPermisos;
    }
  });
  if (Object.keys(updates).length > 0) {
    await db.ref().update(updates);
    showToast(`Plan ${plan.nombre} actualizado y aplicado a ${Object.keys(updates).length / 6} usuario(s) ✅`, 'success');
  } else {
    showToast('Plan ' + plan.nombre + ' actualizado ✅', 'success');
  }
}

async function deletePlan(key) {
  if (key === 'gratuito') { showToast('No puedes eliminar el plan gratuito', 'error'); return; }
  showConfirm('¿Eliminar este plan?', 'Esta acción no se puede deshacer.', async () => {
    await db.ref('planesConfig/' + key).remove();
    loadPlansEditor();
    showToast('Plan eliminado', 'success');
  });
}

function addNewPlan() {
  showPrompt('Nuevo Plan', 'ID del nuevo plan (sin espacios, ej: empresarial):', 'empresarial', (id) => {
    if (!id) return;
    const key = id.toLowerCase().replace(/\s/g, '');
    db.ref('planesConfig/' + key).set({
      nombre: id.charAt(0).toUpperCase() + id.slice(1),
      precio: 0, periodo: 'por mes', limiteProductos: 100, limiteVentasDia: 50, limiteVentasMes: 1000,
      limiteExtractosDia: 3, limiteExtractosMes: 15,
      textoBoton: 'Elegir Plan', descripcion: 'Nuevo plan',
      mediaPermisos: { imagen: true, video: false, modelo3d: false, firebaseStorage: false, githubHosting: true }
    }).then(() => { loadPlansEditor(); showToast('Plan creado ✅', 'success'); });
  });
}

// ============================================
// CÓDIGOS DE ACTIVACIÓN
// ============================================

function generateCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));

  const plan = document.getElementById('codeGenPlan').value;

  db.ref('codigos/' + code).set({
    codigo: code,
    tipoPlan: plan,
    estado: 'disponible',
    fechaCreacion: new Date().toISOString()
  }).then(() => {
    document.getElementById('generatedCode').classList.remove('hidden');
    document.getElementById('codeDisplay').textContent = code;
    showToast('Código generado: ' + code, 'success');
  });
}

function renderCodes(codes) {
  const tbody = document.getElementById('codesTable');
  const entries = Object.entries(codes).sort((a, b) => (b[1].fechaCreacion || '').localeCompare(a[1].fechaCreacion || ''));
  if (entries.length === 0) { tbody.innerHTML = '<tr><td colspan="5" class="text-center text-gray">Sin códigos</td></tr>'; return; }

  tbody.innerHTML = entries.map(([, c]) => `
    <tr>
      <td><code style="font-weight:700;letter-spacing:2px;">${c.codigo}</code></td>
      <td><span class="badge-plan badge-${c.tipoPlan}">${(c.tipoPlan || '').toUpperCase()}</span></td>
      <td><span class="badge-status ${c.estado === 'disponible' ? 'badge-active' : 'badge-inactive'}">${c.estado}</span></td>
      <td>${c.usadoPor || '-'}</td>
      <td>${c.fechaCreacion ? new Date(c.fechaCreacion).toLocaleDateString('es-MX') : '-'}</td>
    </tr>
  `).join('');
}

function adminLogout() {
  showConfirm('¿Cerrar sesión?', 'Volverás a la pantalla de inicio.', () => {
    auth.signOut().then(() => window.location.reload());
  });
}

// ============================================
// MODALES DE CONFIRMACIÓN / PROMPT (reemplaza alert/confirm/prompt)
// ============================================
function showConfirm(title, message, onConfirm) {
  let modal = document.getElementById('adminConfirmModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'adminConfirmModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;';
    document.body.appendChild(modal);
  }
  modal.innerHTML = `
    <div style="background:var(--white);border-radius:20px;padding:28px;max-width:360px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.3);text-align:center;">
      <div style="font-size:2rem;margin-bottom:12px;">⚠️</div>
      <h3 style="font-weight:800;margin-bottom:8px;font-size:1.1rem;">${title}</h3>
      <p style="color:var(--gray);font-size:0.9rem;margin-bottom:24px;">${message}</p>
      <div style="display:flex;gap:10px;">
        <button id="adminConfirmCancel" style="flex:1;padding:13px;border-radius:10px;border:1.5px solid var(--light);background:var(--white);font-weight:600;cursor:pointer;font-size:0.95rem;">Cancelar</button>
        <button id="adminConfirmOk" style="flex:1;padding:13px;border-radius:10px;border:none;background:var(--gradient-1);color:white;font-weight:700;cursor:pointer;font-size:0.95rem;">Confirmar</button>
      </div>
    </div>
  `;
  modal.style.display = 'flex';
  modal.querySelector('#adminConfirmCancel').onclick = () => { modal.style.display = 'none'; };
  modal.querySelector('#adminConfirmOk').onclick = () => { modal.style.display = 'none'; onConfirm(); };
  modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
}

function showPrompt(title, message, placeholder, onConfirm) {
  let modal = document.getElementById('adminPromptModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'adminPromptModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;';
    document.body.appendChild(modal);
  }
  modal.innerHTML = `
    <div style="background:var(--white);border-radius:20px;padding:28px;max-width:380px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
      <h3 style="font-weight:800;margin-bottom:8px;font-size:1.1rem;">${title}</h3>
      <p style="color:var(--gray);font-size:0.9rem;margin-bottom:16px;">${message}</p>
      <input id="adminPromptInput" type="text" placeholder="${placeholder}" value="${placeholder}" style="width:100%;padding:12px;border-radius:10px;border:1.5px solid var(--light);font-size:0.95rem;margin-bottom:16px;box-sizing:border-box;">
      <div style="display:flex;gap:10px;">
        <button id="adminPromptCancel" style="flex:1;padding:13px;border-radius:10px;border:1.5px solid var(--light);background:var(--white);font-weight:600;cursor:pointer;font-size:0.95rem;">Cancelar</button>
        <button id="adminPromptOk" style="flex:1;padding:13px;border-radius:10px;border:none;background:var(--gradient-1);color:white;font-weight:700;cursor:pointer;font-size:0.95rem;">Crear</button>
      </div>
    </div>
  `;
  modal.style.display = 'flex';
  modal.querySelector('#adminPromptCancel').onclick = () => { modal.style.display = 'none'; };
  modal.querySelector('#adminPromptOk').onclick = () => {
    const val = modal.querySelector('#adminPromptInput').value.trim();
    modal.style.display = 'none';
    onConfirm(val);
  };
  modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
  setTimeout(() => modal.querySelector('#adminPromptInput').focus(), 100);
}
