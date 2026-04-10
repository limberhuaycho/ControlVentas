/**
 * ============================================
 * ADMIN.JS - Panel de administración
 * ============================================
 * Admin verifica con Google + Firestore.
 * No redirige a login.html, se queda en admin.html.
 */

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
      
      // Actualizar nombre admin
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

// Verificar si ya hay sesión admin activa
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
      // No es admin, mostrar login
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

function showToast(msg, type='success') {
  const c = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span>${type==='success'?'✅':type==='error'?'❌':'⚠️'}</span><span>${msg}</span><button class="toast-close" onclick="this.parentElement.remove()">×</button>`;
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
  if (entries.length === 0) { tbody.innerHTML = '<tr><td colspan="6" class="text-center text-gray">Sin usuarios</td></tr>'; return; }
  
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
      </td>
    </tr>`;
  }).join('');
}

async function toggleUserStatus(uid, currentActive) {
  await db.ref('usuarios/' + uid + '/perfil/activo').set(!currentActive);
  showToast(currentActive ? 'Usuario desactivado' : 'Usuario activado', 'success');
}

async function viewUserData(uid) {
  const snap = await db.ref('usuarios/' + uid).once('value');
  const data = snap.val();
  const ventas = data.ventas ? Object.keys(data.ventas).length : 0;
  const productos = data.productos ? Object.keys(data.productos).length : 0;
  const extractos = data.extractos ? Object.keys(data.extractos).length : 0;
  const p = data.perfil || {};
  alert(`Usuario: ${p.nombre}\nEmail: ${p.email}\nNegocio: ${p.negocio}\nPlan: ${p.plan}\nProductos: ${productos}\nVentas: ${ventas}\nExtractos generados: ${extractos}\nRegistro: ${p.fechaRegistro || '-'}`);
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
      gratuito: { nombre:'Gratuito', precio:0, periodo:'Para siempre', limiteProductos:50, limiteVentasDia:20, limiteVentasMes:500,
        limiteExtractosDia:1, limiteExtractosMes:2,
        mediaPermisos:{ imagen:true, video:false, modelo3d:false, firebaseStorage:false, githubHosting:true },
        textoBoton:'Comenzar Gratis', descripcion:'Funciones básicas para empezar' },
      mensual: { nombre:'Mensual', precio:50, periodo:'por mes', limiteProductos:999999, limiteVentasDia:999999, limiteVentasMes:999999,
        limiteExtractosDia:5, limiteExtractosMes:30,
        mediaPermisos:{ imagen:true, video:true, modelo3d:false, firebaseStorage:true, githubHosting:true },
        textoBoton:'Elegir Plan', descripcion:'Para negocios en crecimiento' },
      premium: { nombre:'Premium', precio:100, periodo:'por mes', limiteProductos:999999, limiteVentasDia:999999, limiteVentasMes:999999,
        limiteExtractosDia:10, limiteExtractosMes:60,
        mediaPermisos:{ imagen:true, video:true, modelo3d:true, firebaseStorage:true, githubHosting:true },
        textoBoton:'Elegir Premium', descripcion:'Todas las funciones' },
      mantenimiento: { nombre:'Mantenimiento', precio:270, periodo:'pago único', limiteProductos:999999, limiteVentasDia:999999, limiteVentasMes:999999,
        limiteExtractosDia:999999, limiteExtractosMes:999999,
        mediaPermisos:{ imagen:true, video:true, modelo3d:true, firebaseStorage:true, githubHosting:true },
        textoBoton:'Contactar', descripcion:'Soporte completo y personalización' }
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
        <div class="form-group"><label>Texto Botón</label><input type="text" value="${p.textoBoton||''}" id="pn-${key}-btn"></div>
      </div>
      <div class="form-group"><label>Descripción</label><input type="text" value="${p.descripcion||''}" id="pn-${key}-desc"></div>
      <h4 style="margin:12px 0 8px;">Permisos de Medios</h4>
      <div style="display:flex;gap:20px;flex-wrap:wrap;">
        <label class="flex items-center gap-2"><div class="switch"><input type="checkbox" ${p.mediaPermisos?.imagen?'checked':''} id="pn-${key}-img"><span class="switch-slider"></span></div> Imagen</label>
        <label class="flex items-center gap-2"><div class="switch"><input type="checkbox" ${p.mediaPermisos?.video?'checked':''} id="pn-${key}-vid"><span class="switch-slider"></span></div> Video</label>
        <label class="flex items-center gap-2"><div class="switch"><input type="checkbox" ${p.mediaPermisos?.modelo3d?'checked':''} id="pn-${key}-3d"><span class="switch-slider"></span></div> Modelo 3D</label>
        <label class="flex items-center gap-2"><div class="switch"><input type="checkbox" ${p.mediaPermisos?.firebaseStorage?'checked':''} id="pn-${key}-fbs"><span class="switch-slider"></span></div> Firebase Storage</label>
        <label class="flex items-center gap-2"><div class="switch"><input type="checkbox" ${p.mediaPermisos?.githubHosting?'checked':''} id="pn-${key}-gh"><span class="switch-slider"></span></div> GitHub Hosting</label>
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
  showToast('Plan ' + plan.nombre + ' actualizado ✅', 'success');
}

async function deletePlan(key) {
  if (key === 'gratuito') { showToast('No puedes eliminar el plan gratuito', 'error'); return; }
  if (!confirm('¿Eliminar este plan?')) return;
  await db.ref('planesConfig/' + key).remove();
  loadPlansEditor();
  showToast('Plan eliminado', 'success');
}

function addNewPlan() {
  const id = prompt('ID del nuevo plan (sin espacios, ej: empresarial):');
  if (!id) return;
  const key = id.toLowerCase().replace(/\s/g, '');
  db.ref('planesConfig/' + key).set({
    nombre: id.charAt(0).toUpperCase() + id.slice(1),
    precio: 0, periodo: 'por mes', limiteProductos: 100, limiteVentasDia: 50, limiteVentasMes: 1000,
    limiteExtractosDia: 3, limiteExtractosMes: 15,
    textoBoton: 'Elegir Plan', descripcion: 'Nuevo plan',
    mediaPermisos: { imagen:true, video:false, modelo3d:false, firebaseStorage:false, githubHosting:true }
  }).then(() => { loadPlansEditor(); showToast('Plan creado ✅', 'success'); });
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
  const entries = Object.entries(codes).sort((a,b) => (b[1].fechaCreacion||'').localeCompare(a[1].fechaCreacion||''));
  if (entries.length === 0) { tbody.innerHTML = '<tr><td colspan="5" class="text-center text-gray">Sin códigos</td></tr>'; return; }
  
  tbody.innerHTML = entries.map(([, c]) => `
    <tr>
      <td><code style="font-weight:700;letter-spacing:2px;">${c.codigo}</code></td>
      <td><span class="badge-plan badge-${c.tipoPlan}">${(c.tipoPlan||'').toUpperCase()}</span></td>
      <td><span class="badge-status ${c.estado==='disponible'?'badge-active':'badge-inactive'}">${c.estado}</span></td>
      <td>${c.usadoPor || '-'}</td>
      <td>${c.fechaCreacion ? new Date(c.fechaCreacion).toLocaleDateString('es-MX') : '-'}</td>
    </tr>
  `).join('');
}

function adminLogout() {
  if (confirm('¿Cerrar sesión?')) auth.signOut().then(() => window.location.reload());
}
