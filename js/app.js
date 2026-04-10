/**
 * ============================================
 * APP.JS - Lógica principal del panel de usuario
 * ============================================
 * Controla todas las funcionalidades del panel:
 * Dashboard, Ventas, Productos, Inventario, Clientes,
 * Reportes, Marketing, Notificaciones, Configuración.
 * 
 * ESTRUCTURA DE DATOS EN REALTIME DATABASE:
 * /usuarios/{uid}/
 *   perfil/          - Datos del usuario y plan
 *   productos/       - Productos del negocio
 *   ventas/          - Historial de ventas
 *   clientes/        - Base de clientes
 *   inventario/      - Movimientos de inventario
 *   descuentos/      - Descuentos y promociones
 *   notificaciones/  - Alertas del sistema
 *   configuracion/   - Ajustes del negocio
 * 
 * PARA AGREGAR NUEVAS FUNCIONALIDADES:
 * 1. Crear la sección HTML en app.html
 * 2. Agregar el nav-item en el sidebar
 * 3. Crear las funciones aquí
 * 4. Registrar en showSection() si es necesario
 * ============================================
 */

let currentUser = null;
let userProfile = null;
let userRef = null;
let productsCache = {};
let clientsCache = {};
let salesChart = null;
let productsChart = null;
let mediaFiles = []; // Archivos de medios temporales para subir

// ============================================
// INICIALIZACIÓN - Se ejecuta al cargar la página
// ============================================
auth.onAuthStateChanged(async (user) => {
  if (!user) {
    window.location.href = 'login.html';
    return;
  }

  // Verificar si es admin (no debería estar aquí)
  const isAdmin = await verificarAdmin(user.uid, user.email);
  if (isAdmin) {
    window.location.href = 'admin.html';
    return;
  }

  currentUser = user;
  userRef = getUserDB(user.uid);

  // Cargar perfil del usuario
  userRef.child('perfil').on('value', (snap) => {
    userProfile = snap.val();
    if (userProfile) {
      updateUIWithProfile();
      checkLimits(); // Verificar límites del plan
    }
  });

  // Cargar datos iniciales
  await loadAllData();

  // Ocultar loading
  document.getElementById('loadingOverlay').style.display = 'none';
});

/**
 * updateUIWithProfile - Actualiza la interfaz con los datos del perfil
 * Cambia nombre, plan, avatar, etc.
 */
function updateUIWithProfile() {
  const name = userProfile.nombre || 'Usuario';
  document.getElementById('profileName').textContent = name;
  document.getElementById('profileAvatar').textContent = name.charAt(0).toUpperCase();
  document.getElementById('sidebarPlan').textContent = 'Plan ' + (userProfile.plan || 'Gratuito').charAt(0).toUpperCase() + (userProfile.plan || 'gratuito').slice(1);
  
  // Saludo según hora del día
  const hour = new Date().getHours();
  let greeting = 'Buenas noches';
  if (hour < 12) greeting = 'Buenos días';
  else if (hour < 18) greeting = 'Buenas tardes';
  document.getElementById('greetingTitle').textContent = `${greeting}, ${name.split(' ')[0]} 👋`;

  // Actualizar permisos de medios
  updateMediaPermissions();
  
  // Mostrar uso del plan
  updatePlanUsage();
}

/**
 * updateMediaPermissions - Habilita/deshabilita tabs de medios según el plan
 */
function updateMediaPermissions() {
  const permisos = userProfile.mediaPermisos || { imagen: true, video: false, modelo3d: false };
  const videoTab = document.getElementById('mediaTabVideo');
  const tab3D = document.getElementById('mediaTab3D');
  
  if (!permisos.video) {
    videoTab.style.opacity = '0.4';
    videoTab.title = 'Requiere plan de pago';
  }
  if (!permisos.modelo3d) {
    tab3D.style.opacity = '0.4';
    tab3D.title = 'Requiere plan Premium';
  }

  // Storage
  const storageSelect = document.getElementById('mediaStorage');
  if (storageSelect) {
    const firebaseOption = storageSelect.querySelector('option[value="firebase"]');
    if (firebaseOption && !permisos.firebaseStorage) {
      firebaseOption.disabled = true;
      firebaseOption.textContent = 'Firebase Storage (requiere plan de pago)';
    }
  }
}

/**
 * checkLimits - Verifica si el usuario ha alcanzado los límites de su plan
 * Genera notificaciones automáticas
 */
async function checkLimits() {
  if (!userProfile) return;

  const today = new Date().toISOString().split('T')[0];
  const currentMonth = new Date().toISOString().slice(0, 7);

  // Contar ventas del día
  const ventasSnap = await userRef.child('ventas').once('value');
  const ventas = ventasSnap.val() || {};
  let ventasHoy = 0;
  let ventasMes = 0;

  Object.values(ventas).forEach(v => {
    if (v.fecha && v.fecha.startsWith(today)) ventasHoy++;
    if (v.fecha && v.fecha.startsWith(currentMonth)) ventasMes++;
  });

  const limiteDia = userProfile.limiteVentasDia || 20;
  const limiteMes = userProfile.limiteVentasMes || 500;

  if (ventasHoy >= limiteDia) {
    addNotification('⚠️ Has alcanzado el límite de ventas diarias (' + limiteDia + '). Mejora tu plan para más.', 'warning');
  } else if (ventasHoy >= limiteDia * 0.8) {
    addNotification('📊 Llevas ' + ventasHoy + '/' + limiteDia + ' ventas hoy. ¡Casi al límite!', 'info');
  }

  if (ventasMes >= limiteMes) {
    addNotification('⚠️ Has alcanzado el límite mensual de ventas (' + limiteMes + '). Mejora tu plan.', 'warning');
  }
}

/**
 * updatePlanUsage - Muestra el uso actual del plan en el dashboard
 */
function updatePlanUsage() {
  const content = document.getElementById('planUsageContent');
  if (!content || !userProfile) return;

  const plan = userProfile.plan || 'gratuito';
  const limite = userProfile.limiteProductos || 50;
  const productCount = Object.keys(productsCache).length;
  const pct = Math.min((productCount / limite) * 100, 100);

  content.innerHTML = `
    <div style="margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;font-size:0.85rem;margin-bottom:4px;">
        <span>Productos: ${productCount} / ${limite >= 999999 ? '∞' : limite}</span>
        <span style="font-weight:700;color:${pct >= 90 ? 'var(--danger)' : 'var(--primary)'};">${pct.toFixed(0)}%</span>
      </div>
      <div style="background:var(--light);height:8px;border-radius:10px;overflow:hidden;">
        <div style="background:${pct >= 90 ? 'var(--danger)' : 'var(--gradient-1)'};height:100%;width:${pct}%;border-radius:10px;transition:width 0.5s ease;"></div>
      </div>
    </div>
    <p style="font-size:0.85rem;color:var(--gray);">Plan actual: <strong style="color:var(--primary);">${plan.charAt(0).toUpperCase() + plan.slice(1)}</strong></p>
    ${plan === 'gratuito' ? '<button class="btn btn-sm btn-primary btn-round mt-2" onclick="showPlanModal()">Mejorar Plan</button>' : ''}
  `;
}

// ============================================
// CARGA DE DATOS
// ============================================

/**
 * loadAllData - Carga todos los datos del usuario desde Realtime Database
 */
async function loadAllData() {
  await Promise.all([
    loadProducts(),
    loadSales(),
    loadClients(),
    loadDiscounts(),
    loadNotifications()
  ]);
  loadGastos();
  updateDashboard();
  initCharts();
}

async function loadProducts() {
  userRef.child('productos').on('value', (snap) => {
    productsCache = snap.val() || {};
    renderProducts();
    updateInventory();
    updateProductSelectors();
    updatePlanUsage();
  });
}

async function loadSales() {
  userRef.child('ventas').on('value', (snap) => {
    const ventas = snap.val() || {};
    renderSales(ventas);
    updateDashboard();
  });
}

async function loadClients() {
  userRef.child('clientes').on('value', (snap) => {
    clientsCache = snap.val() || {};
    renderClients();
    updateClientSelectors();
  });
}

async function loadDiscounts() {
  userRef.child('descuentos').on('value', (snap) => {
    renderDiscounts(snap.val() || {});
  });
}

async function loadNotifications() {
  userRef.child('notificaciones').on('value', (snap) => {
    renderNotifications(snap.val() || {});
  });
}

// ============================================
// NAVEGACIÓN - Cambiar entre secciones
// ============================================

/**
 * showSection - Muestra una sección y oculta las demás
 * @param {string} section - Nombre de la sección (dashboard, ventas, etc.)
 * PARA AGREGAR SECCIONES: Crear div con id="section-{nombre}" en el HTML
 */
function showSection(section) {
  // Ocultar todas las secciones
  document.querySelectorAll('[id^="section-"]').forEach(el => el.classList.add('hidden'));
  // Mostrar la seleccionada
  const target = document.getElementById('section-' + section);
  if (target) {
    target.classList.remove('hidden');
    target.classList.add('animate-fadeIn');
  }
  // Actualizar navegación activa
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  event.currentTarget?.classList.add('active');
  // Actualizar breadcrumb
  const names = {
    dashboard: 'Dashboard', ventas: 'Ventas', productos: 'Productos',
    inventario: 'Inventario', clientes: 'Clientes', reportes: 'Reportes',
    marketing: 'Marketing', notificaciones: 'Notificaciones', configuracion: 'Configuración',
    gastos: 'Gastos'
  };
  document.getElementById('currentSection').textContent = names[section] || section;
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('mobile-open');
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen();
  } else {
    document.exitFullscreen();
  }
}

// ============================================
// MODALES
// ============================================
function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }
function openSaleModal() { openModal('saleModal'); }
function openProductModal() {
  // Limpiar formulario
  document.getElementById('prodEditId').value = '';
  document.querySelectorAll('#productModal input, #productModal textarea').forEach(i => {
    if (i.type !== 'hidden') i.value = '';
  });
  document.getElementById('prodStock').value = '0';
  document.getElementById('prodMinStock').value = '5';
  document.getElementById('prodShippingCost').value = '0';
  mediaFiles = [];
  document.getElementById('mediaPreviewGrid').innerHTML = '';
  openModal('productModal');
}
function openClientModal() {
  document.getElementById('clientEditId').value = '';
  document.querySelectorAll('#clientModal input, #clientModal textarea').forEach(i => { if (i.type !== 'hidden') i.value = ''; });
  openModal('clientModal');
}
function openDiscountModal() { openModal('discountModal'); }
function openAdjustModal() { openModal('adjustModal'); }

function showPlanModal() {
  const info = document.getElementById('currentPlanInfo');
  const plan = userProfile?.plan || 'gratuito';
  info.innerHTML = `
    <div style="background:var(--light-2);border-radius:12px;padding:16px;">
      <p style="font-size:0.9rem;color:var(--gray);">Plan actual</p>
      <p style="font-size:1.3rem;font-weight:800;color:var(--primary);">${plan.charAt(0).toUpperCase() + plan.slice(1)}</p>
    </div>
  `;

  // Cargar planes disponibles desde Realtime Database
  db.ref('planesConfig').once('value', (snap) => {
    const planes = snap.val() || {
      gratuito: { nombre: 'Gratuito', precio: 0, periodo: 'Para siempre', limiteProductos: 50 },
      mensual: { nombre: 'Mensual', precio: 50, periodo: 'por mes', limiteProductos: 999999 },
      premium: { nombre: 'Premium', precio: 100, periodo: 'por mes', limiteProductos: 999999 },
      mantenimiento: { nombre: 'Mantenimiento', precio: 270, periodo: 'pago único', limiteProductos: 999999 }
    };

    const container = document.getElementById('planOptions');
    container.innerHTML = '';
    Object.entries(planes).forEach(([key, p]) => {
      const selected = key === plan ? 'selected' : '';
      container.innerHTML += `
        <div class="plan-option ${selected}" onclick="selectPlan(this, '${key}')">
          <div class="plan-check">${selected ? '✓' : ''}</div>
          <div style="font-weight:700;font-size:1.05rem;">${p.nombre}</div>
          <div style="font-size:1.5rem;font-weight:900;color:var(--primary);margin:8px 0;">$${p.precio}</div>
          <div style="font-size:0.8rem;color:var(--gray);">${p.periodo}</div>
          <div style="font-size:0.8rem;color:var(--gray);margin-top:4px;">Productos: ${p.limiteProductos >= 999999 ? 'Ilimitados' : p.limiteProductos}</div>
        </div>
      `;
    });
  });

  openModal('planModal');
}

function selectPlan(el, plan) {
  document.querySelectorAll('.plan-option').forEach(p => {
    p.classList.remove('selected');
    p.querySelector('.plan-check').textContent = '';
  });
  el.classList.add('selected');
  el.querySelector('.plan-check').textContent = '✓';
}

function activatePlanCode() {
  const code = document.getElementById('planActivationCode').value.toUpperCase().trim();
  if (code.length !== 8) {
    showToast('El código debe tener 8 caracteres', 'warning');
    return;
  }
  document.getElementById('activationCode') && (document.getElementById('activationCode').value = code);
  activateCodeInternal(code);
}

function activateCodeFromConfig() {
  const code = document.getElementById('cfgActivationCode').value.toUpperCase().trim();
  if (code.length !== 8) { showToast('El código debe tener 8 caracteres', 'warning'); return; }
  activateCodeInternal(code);
}

async function activateCodeInternal(code) {
  try {
    const snap = await db.ref('codigos/' + code).once('value');
    const codeData = snap.val();
    if (!codeData) { showToast('Código no encontrado', 'error'); return; }
    if (codeData.estado === 'usado') { showToast('Código ya utilizado', 'error'); return; }

    const planSnap = await db.ref('planesConfig/' + codeData.tipoPlan).once('value');
    const planData = planSnap.val() || {};

    await userRef.child('perfil').update({
      plan: codeData.tipoPlan,
      limiteProductos: planData.limiteProductos || 999999,
      limiteVentasDia: planData.limiteVentasDia || 999999,
      limiteVentasMes: planData.limiteVentasMes || 999999,
      mediaPermisos: planData.mediaPermisos || { imagen: true, video: true, modelo3d: true, firebaseStorage: true, githubHosting: true },
      codigoActivado: code,
      fechaActivacion: new Date().toISOString()
    });

    await db.ref('codigos/' + code).update({
      estado: 'usado', usadoPor: currentUser.uid, fechaUso: new Date().toISOString()
    });

    showToast('¡Plan activado! 🎉', 'success');
    closeModal('planModal');
  } catch (e) {
    console.error(e);
    showToast('Error al activar', 'error');
  }
}

// ============================================
// PRODUCTOS - CRUD
// ============================================

/**
 * saveProduct - Guarda o actualiza un producto
 * Valida límites del plan antes de guardar
 * ESTRUCTURA: /usuarios/{uid}/productos/{id}/{datos}
 */
async function saveProduct() {
  const editId = document.getElementById('prodEditId').value;
  const name = document.getElementById('prodName').value.trim();
  if (!name) { showToast('El nombre es requerido', 'warning'); return; }

  // Verificar límite de productos
  if (!editId) {
    const limite = userProfile?.limiteProductos || 50;
    if (Object.keys(productsCache).length >= limite) {
      showToast(`Has alcanzado el límite de ${limite} productos. Mejora tu plan.`, 'error');
      showPlanModal();
      return;
    }
  }

  const product = {
    nombre: name,
    descripcion: document.getElementById('prodDescription').value,
    categoria: document.getElementById('prodCategory').value,
    marca: document.getElementById('prodBrand').value,
    precioCompra: parseFloat(document.getElementById('prodCostPrice').value) || 0,
    precioVenta: parseFloat(document.getElementById('prodSalePrice').value) || 0,
    stock: parseInt(document.getElementById('prodStock').value) || 0,
    stockMinimo: parseInt(document.getElementById('prodMinStock').value) || 5,
    tipo: document.getElementById('prodType').value,
    peso: parseFloat(document.getElementById('prodWeight').value) || 0,
    variantes: document.getElementById('prodVariants').value,
    etiquetas: document.getElementById('prodTags').value,
    estado: document.getElementById('prodStatus').value,
    sucursal: document.getElementById('prodBranch').value,
    codigoBarras: document.getElementById('prodBarcode').value,
    requiereEnvio: document.getElementById('prodShipping').value === 'si',
    costoEnvio: parseFloat(document.getElementById('prodShippingCost').value) || 0,
    fechaActualizacion: new Date().toISOString()
  };

  if (!editId) {
    product.fechaCreacion = new Date().toISOString();
  }

  // Upload media files if any
  if (mediaFiles.length > 0) {
    product.imagenes = [];
    const storageType = document.getElementById('mediaStorage').value;
    
    for (const file of mediaFiles) {
      if (storageType === 'firebase' && userProfile?.mediaPermisos?.firebaseStorage) {
        try {
          const ref = storage.ref(`usuarios/${currentUser.uid}/productos/${Date.now()}_${file.name}`);
          await ref.put(file);
          const url = await ref.getDownloadURL();
          product.imagenes.push({ url, nombre: file.name, tipo: file.type });
        } catch (e) {
          console.error('Error subiendo archivo:', e);
        }
      } else {
        // Para GitHub hosting, guardar como base64 (limitado)
        const reader = new FileReader();
        const base64 = await new Promise((resolve) => {
          reader.onload = () => resolve(reader.result);
          reader.readAsDataURL(file);
        });
        product.imagenes.push({ url: base64, nombre: file.name, tipo: file.type });
      }
    }
  }

  try {
    if (editId) {
      await userRef.child('productos/' + editId).update(product);
      showToast('Producto actualizado ✅', 'success');
    } else {
      await userRef.child('productos').push(product);
      showToast('Producto creado ✅', 'success');
    }
    closeModal('productModal');
    mediaFiles = [];
  } catch (e) {
    console.error(e);
    showToast('Error al guardar producto', 'error');
  }
}

function renderProducts() {
  const grid = document.getElementById('productsGrid');
  const entries = Object.entries(productsCache);
  document.getElementById('productCount').textContent = entries.length + ' productos registrados';

  if (entries.length === 0) {
    grid.innerHTML = '<div class="card text-center text-gray" style="grid-column:1/-1;padding:60px;">No hay productos. ¡Agrega el primero!</div>';
    return;
  }

  grid.innerHTML = entries.map(([id, p]) => `
    <div class="card card-3d" style="position:relative;">
      <div style="cursor:pointer;" onclick="editProduct('${id}')">
        ${p.imagenes && p.imagenes.length > 0 ? 
          `<img src="${p.imagenes[0].url}" style="width:100%;height:120px;object-fit:cover;border-radius:8px;margin-bottom:12px;">` : 
          `<div style="width:100%;height:80px;background:var(--light-2);border-radius:8px;display:flex;align-items:center;justify-content:center;margin-bottom:12px;font-size:2rem;">📦</div>`
        }
        <h4 style="font-size:0.95rem;margin-bottom:4px;">${p.nombre}</h4>
        <p style="font-size:0.8rem;color:var(--gray);margin-bottom:8px;">${p.categoria || 'Sin categoría'}</p>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-weight:800;color:var(--primary);font-size:1.1rem;">$${(p.precioVenta || 0).toFixed(2)}</span>
          <span class="badge-status ${p.stock <= (p.stockMinimo || 5) ? 'badge-inactive' : 'badge-active'}">${p.stock} uds</span>
        </div>
        <div style="display:flex;gap:6px;margin-top:8px;">
          <span class="badge-status badge-${p.estado === 'activo' ? 'active' : 'inactive'}">${p.estado || 'activo'}</span>
        </div>
      </div>
      <button onclick="deleteProduct('${id}')" style="position:absolute;top:10px;right:10px;width:32px;height:32px;border-radius:8px;border:none;background:rgba(231,76,60,0.12);color:#e74c3c;font-size:1rem;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background 0.2s;" title="Eliminar producto" onmouseover="this.style.background='rgba(231,76,60,0.25)'" onmouseout="this.style.background='rgba(231,76,60,0.12)'">🗑️</button>
    </div>
  `).join('');
}

function editProduct(id) {
  const p = productsCache[id];
  if (!p) return;
  document.getElementById('prodEditId').value = id;
  document.getElementById('prodName').value = p.nombre || '';
  document.getElementById('prodDescription').value = p.descripcion || '';
  document.getElementById('prodCategory').value = p.categoria || '';
  document.getElementById('prodBrand').value = p.marca || '';
  document.getElementById('prodCostPrice').value = p.precioCompra || '';
  document.getElementById('prodSalePrice').value = p.precioVenta || '';
  document.getElementById('prodStock').value = p.stock || 0;
  document.getElementById('prodMinStock').value = p.stockMinimo || 5;
  document.getElementById('prodType').value = p.tipo || 'unidad';
  document.getElementById('prodWeight').value = p.peso || '';
  document.getElementById('prodVariants').value = p.variantes || '';
  document.getElementById('prodTags').value = p.etiquetas || '';
  document.getElementById('prodStatus').value = p.estado || 'activo';
  document.getElementById('prodBranch').value = p.sucursal || '';
  document.getElementById('prodBarcode').value = p.codigoBarras || '';
  document.getElementById('prodShipping').value = p.requiereEnvio ? 'si' : 'no';
  document.getElementById('prodShippingCost').value = p.costoEnvio || 0;
  openModal('productModal');
}

async function deleteProduct(id) {
  showConfirmModal('¿Eliminar producto?', 'Esta acción no se puede deshacer.', async () => {
    try {
      await userRef.child('productos/' + id).remove();
      showToast('Producto eliminado', 'success');
    } catch (e) {
      showToast('Error al eliminar', 'error');
    }
  });
}

function showConfirmModal(title, message, onConfirm, confirmLabel, confirmIcon) {
  let modal = document.getElementById('appConfirmModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'appConfirmModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;';
    document.body.appendChild(modal);
  }
  const label = confirmLabel || 'Eliminar';
  const icon = confirmIcon || '🗑️';
  modal.innerHTML = `
    <div style="background:var(--white);border-radius:20px;padding:28px;max-width:360px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.3);text-align:center;">
      <div style="font-size:2rem;margin-bottom:12px;">⚠️</div>
      <h3 style="font-weight:800;margin-bottom:8px;font-size:1.1rem;">${title}</h3>
      <p style="color:var(--gray);font-size:0.9rem;margin-bottom:24px;">${message}</p>
      <div style="display:flex;gap:10px;">
        <button id="appConfirmCancel" style="flex:1;padding:13px;border-radius:10px;border:1.5px solid var(--light);background:var(--white);font-weight:600;cursor:pointer;font-size:0.95rem;">Cancelar</button>
        <button id="appConfirmOk" style="flex:1;padding:13px;border-radius:10px;border:none;background:#e74c3c;color:white;font-weight:700;cursor:pointer;font-size:0.95rem;">${icon} ${label}</button>
      </div>
    </div>
  `;
  modal.style.display = 'flex';
  modal.querySelector('#appConfirmCancel').onclick = () => { modal.style.display = 'none'; };
  modal.querySelector('#appConfirmOk').onclick = () => { modal.style.display = 'none'; onConfirm(); };
  modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
}

function filterProducts(search) {
  // Simple client-side filter
  const cards = document.querySelectorAll('#productsGrid .card');
  const term = (search || document.getElementById('productSearch').value).toLowerCase();
  cards.forEach(card => {
    const text = card.textContent.toLowerCase();
    card.style.display = text.includes(term) ? '' : 'none';
  });
}

// ============================================
// VENTAS
// ============================================

function renderSales(ventas) {
  const tbody = document.getElementById('salesTableBody');
  const entries = Object.entries(ventas).sort((a, b) => (b[1].fecha || '').localeCompare(a[1].fecha || ''));
  document.getElementById('salesCount').textContent = entries.length + ' ventas';

  if (entries.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-gray" style="padding:40px;">No hay ventas registradas</td></tr>';
    return;
  }

  tbody.innerHTML = entries.slice(0, 50).map(([id, v]) => `
    <tr>
      <td>${v.fecha ? new Date(v.fecha).toLocaleDateString('es-MX') : '-'}</td>
      <td>${v.cliente || 'General'}</td>
      <td>${v.items ? v.items.length + ' productos' : '-'}</td>
      <td style="font-weight:700;">$${(v.total || 0).toFixed(2)}</td>
      <td style="color:var(--success);font-weight:600;">$${(v.ganancia || 0).toFixed(2)}</td>
      <td>
        <button class="btn btn-sm" style="background:var(--light);color:var(--dark);" onclick="viewSale('${id}')">👁️</button>
        <button class="btn btn-sm btn-danger" onclick="deleteSale('${id}')">🗑️</button>
      </td>
    </tr>
  `).join('');
}

async function saveSale() {
  // Check daily limit
  const today = new Date().toISOString().split('T')[0];
  const snap = await userRef.child('ventas').once('value');
  const ventas = snap.val() || {};
  let ventasHoy = Object.values(ventas).filter(v => v.fecha && v.fecha.startsWith(today)).length;
  const limiteDia = userProfile?.limiteVentasDia || 20;
  
  if (ventasHoy >= limiteDia) {
    showToast(`Límite diario alcanzado (${limiteDia}). Mejora tu plan.`, 'error');
    showPlanModal();
    return;
  }

  const items = [];
  let total = 0;
  let ganancia = 0;

  document.querySelectorAll('#saleItems .form-row').forEach(row => {
    const productId = row.querySelector('.sale-product').value;
    const qty = parseInt(row.querySelector('.sale-qty').value) || 0;
    if (productId && qty > 0 && productsCache[productId]) {
      const p = productsCache[productId];
      const subtotal = p.precioVenta * qty;
      total += subtotal;
      ganancia += (p.precioVenta - p.precioCompra) * qty;
      items.push({
        productoId: productId,
        nombre: p.nombre,
        cantidad: qty,
        precioUnitario: p.precioVenta,
        subtotal: subtotal
      });

      // Descontar stock automáticamente
      userRef.child('productos/' + productId + '/stock').transaction(current => (current || 0) - qty);
    }
  });

  if (items.length === 0) {
    showToast('Agrega al menos un producto', 'warning');
    return;
  }

  const venta = {
    fecha: new Date().toISOString(),
    cliente: document.getElementById('saleClient').value || 'General',
    items: items,
    total: total,
    ganancia: ganancia
  };

  try {
    await userRef.child('ventas').push(venta);
    showToast('Venta registrada ✅', 'success');
    closeModal('saleModal');
    // Reset items
    document.getElementById('saleItems').innerHTML = getSaleItemRow();
    document.getElementById('saleTotal').textContent = '$0.00';
  } catch (e) {
    showToast('Error al registrar venta', 'error');
  }
}

function getSaleItemRow() {
  const options = Object.entries(productsCache).map(([id, p]) => 
    `<option value="${id}">${p.nombre} - $${(p.precioVenta||0).toFixed(2)}</option>`
  ).join('');
  return `
    <div class="form-row" style="margin-bottom:12px;">
      <div class="form-group">
        <label>Producto</label>
        <select class="sale-product" onchange="updateSalePrice(this)">
          <option value="">Seleccionar...</option>${options}
        </select>
      </div>
      <div class="form-group">
        <label>Cantidad</label>
        <input type="number" class="sale-qty" value="1" min="1" onchange="updateSaleTotal()">
      </div>
    </div>
  `;
}

function addSaleItem() {
  document.getElementById('saleItems').insertAdjacentHTML('beforeend', getSaleItemRow());
}

function updateSalePrice() { updateSaleTotal(); }

function updateSaleTotal() {
  let total = 0;
  document.querySelectorAll('#saleItems .form-row').forEach(row => {
    const sel = row.querySelector('.sale-product');
    const qty = parseInt(row.querySelector('.sale-qty').value) || 0;
    if (sel.value && productsCache[sel.value]) {
      total += productsCache[sel.value].precioVenta * qty;
    }
  });
  document.getElementById('saleTotal').textContent = '$' + total.toFixed(2);
}

async function deleteSale(id) {
  showConfirmModal('¿Eliminar esta venta?', 'Esta acción no se puede deshacer.', async () => {
    await userRef.child('ventas/' + id).remove();
    showToast('Venta eliminada', 'success');
  });
}

function viewSale(id) {
  userRef.child('ventas/' + id).once('value').then(s => {
    const v = s.val();
    if (!v) return;
    let items = (v.items || []).map(i => `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--light);font-size:0.85rem;"><span>${i.nombre} x${i.cantidad}</span><span style="font-weight:700;">$${(i.subtotal||0).toFixed(2)}</span></div>`).join('');
    let modal = document.getElementById('appSaleViewModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'appSaleViewModal';
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;';
      document.body.appendChild(modal);
    }
    modal.innerHTML = `
      <div style="background:var(--white);border-radius:20px;padding:28px;max-width:400px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.3);max-height:80vh;overflow-y:auto;">
        <h3 style="font-weight:800;margin-bottom:16px;">🧾 Detalle de Venta</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">
          <div style="background:var(--light-2);border-radius:10px;padding:10px;"><div style="font-size:0.75rem;color:var(--gray);">Fecha</div><div style="font-weight:700;font-size:0.85rem;">${new Date(v.fecha).toLocaleString('es-MX')}</div></div>
          <div style="background:var(--light-2);border-radius:10px;padding:10px;"><div style="font-size:0.75rem;color:var(--gray);">Cliente</div><div style="font-weight:700;font-size:0.85rem;">${v.cliente||'General'}</div></div>
          <div style="background:var(--light-2);border-radius:10px;padding:10px;"><div style="font-size:0.75rem;color:var(--gray);">Total</div><div style="font-weight:800;color:var(--primary);">$${(v.total||0).toFixed(2)}</div></div>
          <div style="background:var(--light-2);border-radius:10px;padding:10px;"><div style="font-size:0.75rem;color:var(--gray);">Ganancia</div><div style="font-weight:800;color:var(--success);">$${(v.ganancia||0).toFixed(2)}</div></div>
        </div>
        <h4 style="margin-bottom:8px;font-size:0.9rem;">Productos</h4>
        ${items}
        <button onclick="document.getElementById('appSaleViewModal').style.display='none'" style="width:100%;margin-top:20px;padding:13px;border-radius:10px;border:none;background:var(--gradient-1);color:white;font-weight:700;cursor:pointer;font-size:0.95rem;">Cerrar</button>
      </div>
    `;
    modal.style.display = 'flex';
    modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
  });
}

function updateProductSelectors() {
  const options = '<option value="">Seleccionar...</option>' + 
    Object.entries(productsCache).map(([id, p]) => 
      `<option value="${id}">${p.nombre} - $${(p.precioVenta||0).toFixed(2)}</option>`
    ).join('');
  
  document.querySelectorAll('.sale-product').forEach(sel => { sel.innerHTML = options; });
  
  const discountProd = document.getElementById('discountProduct');
  if (discountProd) {
    discountProd.innerHTML = '<option value="todos">Todos los productos</option>' + 
      Object.entries(productsCache).map(([id, p]) => `<option value="${id}">${p.nombre}</option>`).join('');
  }

  const adjustProd = document.getElementById('adjustProduct');
  if (adjustProd) {
    adjustProd.innerHTML = Object.entries(productsCache).map(([id, p]) => 
      `<option value="${id}">${p.nombre} (Stock: ${p.stock})</option>`
    ).join('');
  }
}

function updateClientSelectors() {
  const sel = document.getElementById('saleClient');
  if (sel) {
    sel.innerHTML = '<option value="">Cliente general</option>' + 
      Object.entries(clientsCache).map(([id, c]) => `<option value="${c.nombre}">${c.nombre}</option>`).join('');
  }
}

// ============================================
// CLIENTES
// ============================================

function renderClients() {
  const tbody = document.getElementById('clientsTableBody');
  const entries = Object.entries(clientsCache);
  
  document.getElementById('totalClients').textContent = entries.length;
  document.getElementById('frequentClients').textContent = entries.filter(([,c]) => c.tipo === 'frecuente').length;
  
  const thisMonth = new Date().toISOString().slice(0, 7);
  document.getElementById('newClients').textContent = entries.filter(([,c]) => c.fechaRegistro && c.fechaRegistro.startsWith(thisMonth)).length;

  if (entries.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-gray" style="padding:40px;">Sin clientes registrados</td></tr>';
    return;
  }

  tbody.innerHTML = entries.map(([id, c]) => `
    <tr>
      <td style="font-weight:600;">${c.nombre}</td>
      <td><span class="badge-status badge-${c.tipo === 'frecuente' ? 'active' : c.tipo === 'mayorista' ? 'pending' : 'plan'} badge-free">${c.tipo || 'nuevo'}</span></td>
      <td>${c.telefono || '-'}</td>
      <td>$${(c.totalCompras || 0).toFixed(2)}</td>
      <td>${c.ultimaCompra ? new Date(c.ultimaCompra).toLocaleDateString('es-MX') : '-'}</td>
      <td>
        <button class="btn btn-sm" style="background:var(--light);color:var(--dark);" onclick="editClient('${id}')">✏️</button>
        <button class="btn btn-sm btn-danger" onclick="deleteClient('${id}')">🗑️</button>
      </td>
    </tr>
  `).join('');
}

async function saveClient() {
  const editId = document.getElementById('clientEditId').value;
  const client = {
    nombre: document.getElementById('clientName').value.trim(),
    telefono: document.getElementById('clientPhone').value,
    email: document.getElementById('clientEmail').value,
    tipo: document.getElementById('clientType').value,
    notas: document.getElementById('clientNotes').value,
    fechaActualizacion: new Date().toISOString()
  };

  if (!client.nombre) { showToast('El nombre es requerido', 'warning'); return; }

  if (!editId) client.fechaRegistro = new Date().toISOString();

  try {
    if (editId) {
      await userRef.child('clientes/' + editId).update(client);
    } else {
      await userRef.child('clientes').push(client);
    }
    showToast('Cliente guardado ✅', 'success');
    closeModal('clientModal');
  } catch (e) {
    showToast('Error al guardar', 'error');
  }
}

function editClient(id) {
  const c = clientsCache[id];
  if (!c) return;
  document.getElementById('clientEditId').value = id;
  document.getElementById('clientName').value = c.nombre || '';
  document.getElementById('clientPhone').value = c.telefono || '';
  document.getElementById('clientEmail').value = c.email || '';
  document.getElementById('clientType').value = c.tipo || 'nuevo';
  document.getElementById('clientNotes').value = c.notas || '';
  openModal('clientModal');
}

async function deleteClient(id) {
  if (!confirm('¿Eliminar este cliente?')) return;
  await userRef.child('clientes/' + id).remove();
  showToast('Cliente eliminado', 'success');
}

// ============================================
// INVENTARIO
// ============================================

function updateInventory() {
  const entries = Object.entries(productsCache);
  let lowStock = 0, outOfStock = 0;

  entries.forEach(([, p]) => {
    if (p.stock <= 0) outOfStock++;
    else if (p.stock <= (p.stockMinimo || 5)) lowStock++;
  });

  document.getElementById('invTotalProducts').textContent = entries.length;
  document.getElementById('invLowStock').textContent = lowStock;
  document.getElementById('invOutOfStock').textContent = outOfStock;

  const tbody = document.getElementById('inventoryTableBody');
  if (entries.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-gray" style="padding:40px;">Sin datos</td></tr>';
    return;
  }

  tbody.innerHTML = entries.map(([id, p]) => {
    let statusClass = 'badge-active';
    let statusText = 'Normal';
    if (p.stock <= 0) { statusClass = 'badge-inactive'; statusText = 'Agotado'; }
    else if (p.stock <= (p.stockMinimo || 5)) { statusClass = 'badge-pending'; statusText = 'Bajo'; }

    return `
      <tr>
        <td style="font-weight:600;">${p.nombre}</td>
        <td>${p.stock}</td>
        <td>${p.stockMinimo || 5}</td>
        <td><span class="badge-status ${statusClass}">${statusText}</span></td>
        <td><button class="btn btn-sm btn-outline" onclick="quickAdjust('${id}')">Ajustar</button></td>
      </tr>
    `;
  }).join('');

  // Check alerts
  checkStockAlerts();
}

function quickAdjust(id) {
  document.getElementById('adjustProduct').value = id;
  openModal('adjustModal');
}

async function saveAdjustment() {
  const productId = document.getElementById('adjustProduct').value;
  const type = document.getElementById('adjustType').value;
  const qty = parseInt(document.getElementById('adjustQty').value) || 0;
  const reason = document.getElementById('adjustReason').value;

  if (!productId || qty <= 0) { showToast('Datos inválidos', 'warning'); return; }

  const change = type === 'entrada' ? qty : -qty;

  await userRef.child('productos/' + productId + '/stock').transaction(current => Math.max(0, (current || 0) + change));
  
  await userRef.child('inventario').push({
    productoId: productId,
    tipo: type,
    cantidad: qty,
    motivo: reason,
    fecha: new Date().toISOString()
  });

  showToast('Stock ajustado ✅', 'success');
  closeModal('adjustModal');
}

function checkStockAlerts() {
  const alerts = [];
  Object.entries(productsCache).forEach(([id, p]) => {
    if (p.stock <= 0) {
      alerts.push(`<div style="padding:8px;background:rgba(214,48,49,0.08);border-radius:8px;margin-bottom:6px;"><strong>${p.nombre}</strong> - ¡Agotado!</div>`);
    } else if (p.stock <= (p.stockMinimo || 5)) {
      alerts.push(`<div style="padding:8px;background:rgba(253,203,110,0.15);border-radius:8px;margin-bottom:6px;"><strong>${p.nombre}</strong> - Solo quedan ${p.stock} unidades</div>`);
    }
  });

  const container = document.getElementById('stockAlerts');
  const list = document.getElementById('stockAlertsList');
  if (alerts.length > 0) {
    container.classList.remove('hidden');
    list.innerHTML = alerts.join('');
  } else {
    container.classList.add('hidden');
  }
}

// ============================================
// DESCUENTOS / MARKETING
// ============================================

function renderDiscounts(descuentos) {
  const grid = document.getElementById('discountsGrid');
  const entries = Object.entries(descuentos);

  if (entries.length === 0) {
    grid.innerHTML = '<div class="card text-center text-gray" style="grid-column:1/-1;padding:60px;">No hay descuentos creados</div>';
    return;
  }

  grid.innerHTML = entries.map(([id, d]) => `
    <div class="card card-3d">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <h4>${d.nombre}</h4>
        <button class="btn btn-sm btn-danger" onclick="deleteDiscount('${id}')">🗑️</button>
      </div>
      <div style="font-size:2rem;font-weight:900;color:var(--primary);margin-bottom:8px;">${d.porcentaje}% OFF</div>
      <p style="font-size:0.85rem;color:var(--gray);">Válido hasta: ${d.expira || 'Sin fecha'}</p>
      <p style="font-size:0.85rem;color:var(--gray);">Aplica a: ${d.producto === 'todos' ? 'Todos' : (productsCache[d.producto]?.nombre || d.producto)}</p>
    </div>
  `).join('');
}

async function saveDiscount() {
  const discount = {
    nombre: document.getElementById('discountName').value,
    porcentaje: parseInt(document.getElementById('discountPercent').value) || 10,
    expira: document.getElementById('discountExpiry').value,
    producto: document.getElementById('discountProduct').value,
    fechaCreacion: new Date().toISOString()
  };

  if (!discount.nombre) { showToast('Nombre requerido', 'warning'); return; }

  await userRef.child('descuentos').push(discount);
  showToast('Descuento creado ✅', 'success');
  closeModal('discountModal');
}

async function deleteDiscount(id) {
  if (!confirm('¿Eliminar descuento?')) return;
  await userRef.child('descuentos/' + id).remove();
  showToast('Descuento eliminado', 'success');
}

// ============================================
// NOTIFICACIONES
// ============================================

function renderNotifications(notifs) {
  const list = document.getElementById('notificationsList');
  const entries = Object.entries(notifs).sort((a, b) => (b[1].fecha || '').localeCompare(a[1].fecha || ''));
  
  const count = entries.filter(([, n]) => !n.leida).length;
  const badge = document.getElementById('notifBadge');
  const dot = document.getElementById('notifDot');
  if (count > 0) {
    badge.style.display = '';
    badge.textContent = count;
    dot.style.display = '';
  } else {
    badge.style.display = 'none';
    dot.style.display = 'none';
  }

  if (entries.length === 0) {
    list.innerHTML = '<div class="card text-center text-gray" style="padding:60px;">No hay notificaciones</div>';
    return;
  }

  list.innerHTML = entries.map(([id, n]) => `
    <div class="notification-item ${n.leida ? '' : 'unread'}" onclick="markNotifRead('${id}')">
      <div class="notification-icon" style="background:rgba(108,92,231,0.1);color:var(--primary);">
        ${n.tipo === 'warning' ? '⚠️' : n.tipo === 'error' ? '❌' : 'ℹ️'}
      </div>
      <div style="flex:1;">
        <p style="font-weight:${n.leida ? '400' : '600'};font-size:0.9rem;">${n.mensaje}</p>
        <p style="font-size:0.75rem;color:var(--gray);">${n.fecha ? new Date(n.fecha).toLocaleString('es-MX') : ''}</p>
      </div>
    </div>
  `).join('');
}

async function addNotification(mensaje, tipo = 'info') {
  await userRef.child('notificaciones').push({
    mensaje, tipo, leida: false, fecha: new Date().toISOString()
  });
}

async function markNotifRead(id) {
  await userRef.child('notificaciones/' + id).update({ leida: true });
}

// ============================================
// DASHBOARD - Estadísticas
// ============================================

function updateDashboard() {
  const today = new Date().toISOString().split('T')[0];
  const thisMonth = new Date().toISOString().slice(0, 7);

  // Ventas
  userRef.child('ventas').once('value', (snapV) => {
    const ventas = snapV.val() || {};
    let ventasDia = 0, ingresosMes = 0;
    Object.values(ventas).forEach(v => {
      if (v.fecha && v.fecha.startsWith(today)) ventasDia += v.total || 0;
      if (v.fecha && v.fecha.startsWith(thisMonth)) ingresosMes += v.total || 0;
    });

    // Gastos reales
    userRef.child('gastos').once('value', (snapG) => {
      const gastos = snapG.val() || {};
      let gastosMes = 0;
      Object.values(gastos).forEach(g => {
        if (g.fecha && g.fecha.startsWith(thisMonth)) gastosMes += g.monto || 0;
      });

      const gananciaNeta = ingresosMes - gastosMes;

      document.getElementById('ventasDia').textContent = '$' + ventasDia.toFixed(2);
      document.getElementById('ingresosMes').textContent = '$' + ingresosMes.toFixed(2);
      document.getElementById('gastosMes').textContent = '$' + gastosMes.toFixed(2);
      document.getElementById('gananciaNeta').textContent = '$' + gananciaNeta.toFixed(2);

      // Color ganancia
      const gananciaEl = document.getElementById('gananciaNeta');
      if (gananciaEl) gananciaEl.style.color = gananciaNeta >= 0 ? 'var(--success)' : 'var(--danger)';
    });
  });
}

// ============================================
// GRÁFICAS (Chart.js)
// ============================================

function initCharts() {
  const salesCtx = document.getElementById('salesChart')?.getContext('2d');
  if (salesCtx) {
    salesChart = new Chart(salesCtx, {
      type: 'line',
      data: {
        labels: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
        datasets: [{
          label: 'Ingresos',
          data: [0, 0, 0, 0, 0, 0, 0],
          borderColor: '#6c5ce7',
          backgroundColor: 'rgba(108,92,231,0.1)',
          fill: true,
          tension: 0.4
        }, {
          label: 'Ganancias',
          data: [0, 0, 0, 0, 0, 0, 0],
          borderColor: '#00cec9',
          backgroundColor: 'rgba(0,206,201,0.1)',
          fill: true,
          tension: 0.4
        }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } } }
    });
  }

  const prodCtx = document.getElementById('productsChart')?.getContext('2d');
  if (prodCtx) {
    productsChart = new Chart(prodCtx, {
      type: 'doughnut',
      data: {
        labels: ['Sin datos'],
        datasets: [{ data: [1], backgroundColor: ['#dfe6e9'] }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }
}

// ============================================
// MEDIOS (Imagen / Video / 3D)
// ============================================

function switchMediaType(type) {
  const permisos = userProfile?.mediaPermisos || { imagen: true, video: false, modelo3d: false };
  
  if (type === 'video' && !permisos.video) {
    showToast('Videos requieren plan de pago', 'warning');
    showPlanModal();
    return;
  }
  if (type === '3d' && !permisos.modelo3d) {
    showToast('Modelos 3D requieren plan Premium', 'warning');
    showPlanModal();
    return;
  }

  document.querySelectorAll('.media-type-tab').forEach(t => t.classList.remove('active'));
  event.currentTarget.classList.add('active');

  const fileInput = document.getElementById('mediaFileInput');
  const hint = document.getElementById('mediaHint');

  if (type === 'imagen') {
    fileInput.accept = 'image/*';
    hint.textContent = 'Imágenes: JPG, PNG, WEBP (máx 5MB)';
  } else if (type === 'video') {
    fileInput.accept = 'video/*';
    hint.textContent = 'Videos: MP4, WEBM (máx 50MB)';
  } else {
    fileInput.accept = '.glb,.gltf,.obj';
    hint.textContent = 'Modelos 3D: GLB, GLTF, OBJ';
  }
}

function handleMediaUpload(files) {
  for (const file of files) {
    if (file.size > 50 * 1024 * 1024) {
      showToast('Archivo demasiado grande (máx 50MB)', 'error');
      continue;
    }
    mediaFiles.push(file);
    
    const preview = document.getElementById('mediaPreviewGrid');
    const div = document.createElement('div');
    div.className = 'media-preview-item';
    
    if (file.type.startsWith('image/')) {
      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      div.appendChild(img);
    } else if (file.type.startsWith('video/')) {
      const vid = document.createElement('video');
      vid.src = URL.createObjectURL(file);
      vid.muted = true;
      div.appendChild(vid);
    } else {
      div.innerHTML = '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:var(--light-2);font-size:2rem;">🧊</div>';
    }
    
    const delBtn = document.createElement('button');
    delBtn.className = 'media-delete';
    delBtn.textContent = '×';
    delBtn.onclick = (e) => {
      e.stopPropagation();
      mediaFiles = mediaFiles.filter(f => f !== file);
      div.remove();
    };
    div.appendChild(delBtn);
    preview.appendChild(div);
  }
}

// Drag and drop
const uploadArea = document.getElementById('mediaUploadArea');
if (uploadArea) {
  uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('dragover'); });
  uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    handleMediaUpload(e.dataTransfer.files);
  });
}

// ============================================
// COLLAPSIBLE - Secciones desplegables
// ============================================

/**
 * toggleCollapsible - Abre/cierra una sección desplegable
 * @param {HTMLElement} header - El botón que activó el toggle
 */
function toggleCollapsible(header) {
  header.parentElement.classList.toggle('open');
}

// ============================================
// CONFIGURACIÓN
// ============================================

async function saveConfig() {
  const config = {
    nombreNegocio: document.getElementById('cfgBusinessName').value,
    moneda: document.getElementById('cfgCurrency').value,
    impuesto: parseInt(document.getElementById('cfgTax').value) || 0
  };
  await userRef.child('configuracion').update(config);
  showToast('Configuración guardada ✅', 'success');
}

// Load config on section show
function loadConfig() {
  userRef.child('configuracion').once('value', (snap) => {
    const cfg = snap.val() || {};
    document.getElementById('cfgBusinessName').value = cfg.nombreNegocio || '';
    document.getElementById('cfgCurrency').value = cfg.moneda || 'MXN';
    document.getElementById('cfgTax').value = cfg.impuesto || 16;
  });
}

// ============================================
// UTILIDADES
// ============================================

function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span>${type === 'success' ? '✅' : type === 'error' ? '❌' : '⚠️'}</span>
    <span>${message}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">×</button>
  `;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}

function handleLogout() {
  showConfirmModal('¿Cerrar sesión?', 'Serás redirigido al inicio.', () => {
    auth.signOut().then(() => {
      window.location.href = 'login.html';
    });
  }, 'Cerrar Sesión', '🔓');
}

function handleSearch(value) {
  // Global search - simple implementation
  console.log('Buscando:', value);
}

function filterSales() {
  // Would filter the sales table by date/client
  showToast('Filtros aplicados', 'success');
}

function clearFilters() {
  document.getElementById('filterDateFrom').value = '';
  document.getElementById('filterDateTo').value = '';
  document.getElementById('filterClient').value = '';
  showToast('Filtros limpiados', 'success');
}

function showReportTab(tab) {
  document.querySelectorAll('.tabs .tab').forEach(t => t.classList.remove('active'));
  event.currentTarget.classList.add('active');
}

// Close modals on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.remove('active');
  });
});

// Close sidebar on mobile when clicking outside
document.addEventListener('click', (e) => {
  const sidebar = document.getElementById('sidebar');
  if (window.innerWidth <= 992 && sidebar.classList.contains('mobile-open')) {
    if (!sidebar.contains(e.target) && !e.target.closest('[onclick*="toggleSidebar"]')) {
      sidebar.classList.remove('mobile-open');
    }
  }
});

// ============================================
// GASTOS - Registro y gestión de gastos
// ============================================

const TIPOS_GASTO = ['Venta', 'Servicios', 'Pasaje', 'Alquiler', 'Otros'];

function openGastoModal() {
  // Reset form
  document.getElementById('gastoEditId').value = '';
  document.getElementById('gastoDescripcion').value = '';
  document.getElementById('gastoMonto').value = '';
  document.getElementById('gastoTipo').value = 'Venta';
  document.getElementById('gastoFecha').value = new Date().toISOString().split('T')[0];
  openModal('gastoModal');
}

async function saveGasto() {
  const editId = document.getElementById('gastoEditId').value;
  const descripcion = document.getElementById('gastoDescripcion').value.trim();
  const monto = parseFloat(document.getElementById('gastoMonto').value) || 0;
  const tipo = document.getElementById('gastoTipo').value;
  const fecha = document.getElementById('gastoFecha').value;

  if (!descripcion) { showToast('La descripción es requerida', 'warning'); return; }
  if (monto <= 0) { showToast('El monto debe ser mayor a 0', 'warning'); return; }

  const gasto = { descripcion, monto, tipo, fecha: fecha || new Date().toISOString().split('T')[0], fechaISO: new Date().toISOString() };

  try {
    if (editId) {
      await userRef.child('gastos/' + editId).update(gasto);
    } else {
      await userRef.child('gastos').push(gasto);
    }
    showToast('Gasto guardado ✅', 'success');
    closeModal('gastoModal');
  } catch (e) {
    showToast('Error al guardar gasto', 'error');
  }
}

async function deleteGasto(id) {
  showConfirmModal('¿Eliminar este gasto?', 'Esta acción no se puede deshacer.', async () => {
    await userRef.child('gastos/' + id).remove();
    showToast('Gasto eliminado', 'success');
  });
}

function editGasto(id) {
  userRef.child('gastos/' + id).once('value').then(snap => {
    const g = snap.val();
    if (!g) return;
    document.getElementById('gastoEditId').value = id;
    document.getElementById('gastoDescripcion').value = g.descripcion || '';
    document.getElementById('gastoMonto').value = g.monto || '';
    document.getElementById('gastoTipo').value = g.tipo || 'Venta';
    document.getElementById('gastoFecha').value = g.fecha || '';
    openModal('gastoModal');
  });
}

function loadGastos() {
  userRef.child('gastos').on('value', (snap) => {
    renderGastos(snap.val() || {});
    updateDashboard(); // recalculate with real gastos
  });
}

function renderGastos(gastos) {
  const tbody = document.getElementById('gastosTableBody');
  if (!tbody) return;
  const entries = Object.entries(gastos).sort((a, b) => (b[1].fecha || '').localeCompare(a[1].fecha || ''));
  const totalEl = document.getElementById('gastosTotalMes');

  // Sum gastos this month
  const thisMonth = new Date().toISOString().slice(0, 7);
  let totalMes = 0;
  entries.forEach(([, g]) => { if (g.fecha && g.fecha.startsWith(thisMonth)) totalMes += g.monto || 0; });
  if (totalEl) totalEl.textContent = '$' + totalMes.toFixed(2);

  // Stats by type
  TIPOS_GASTO.forEach(tipo => {
    const el = document.getElementById('gastoStat_' + tipo);
    if (el) {
      const sum = entries.filter(([, g]) => g.tipo === tipo && g.fecha && g.fecha.startsWith(thisMonth))
        .reduce((acc, [, g]) => acc + (g.monto || 0), 0);
      el.textContent = '$' + sum.toFixed(2);
    }
  });

  if (entries.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-gray" style="padding:40px;">No hay gastos registrados</td></tr>';
    return;
  }

  tbody.innerHTML = entries.slice(0, 50).map(([id, g]) => `
    <tr>
      <td>${g.fecha || '-'}</td>
      <td style="font-weight:600;">${g.descripcion}</td>
      <td><span style="padding:4px 10px;border-radius:20px;font-size:0.8rem;font-weight:600;background:rgba(108,92,231,0.1);color:var(--primary);">${g.tipo || 'Otros'}</span></td>
      <td style="font-weight:700;color:var(--danger);">$${(g.monto || 0).toFixed(2)}</td>
      <td>
        <button class="btn btn-sm" style="background:var(--light);color:var(--dark);" onclick="editGasto('${id}')">✏️</button>
        <button class="btn btn-sm btn-danger" onclick="deleteGasto('${id}')">🗑️</button>
      </td>
    </tr>
  `).join('');
}

function addMediaByLink() {
  const url = document.getElementById('mediaLinkUrl').value.trim();
  if (!url) { showToast('Ingresa una URL válida', 'warning'); return; }
  
  const preview = document.getElementById('mediaPreviewGrid');
  const div = document.createElement('div');
  div.className = 'media-preview-item';
  const img = document.createElement('img');
  img.src = url;
  img.onerror = () => { div.remove(); showToast('No se pudo cargar la imagen', 'error'); };
  div.appendChild(img);
  
  const delBtn = document.createElement('button');
  delBtn.className = 'media-delete';
  delBtn.textContent = '×';
  delBtn.onclick = (e) => { e.stopPropagation(); div.remove(); };
  div.appendChild(delBtn);
  preview.appendChild(div);
  
  // Store URL in a data attribute for saving
  div.dataset.imageUrl = url;
  document.getElementById('mediaLinkUrl').value = '';
  showToast('Imagen agregada por URL ✅', 'success');
}
