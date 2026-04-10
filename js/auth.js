/**
 * ============================================
 * AUTH.JS - Autenticación y gestión de sesión
 * ============================================
 * Maneja login, registro con Google, activación de códigos.
 * Google Sign-In para registro: solo pide nombre y tienda.
 * Teléfono opcional con selector de país.
 */

const countryCodes = [
  { code: '+591', name: 'Bolivia', flag: '🇧🇴' },
  { code: '+52', name: 'México', flag: '🇲🇽' },
  { code: '+1', name: 'EE.UU.', flag: '🇺🇸' },
  { code: '+54', name: 'Argentina', flag: '🇦🇷' },
  { code: '+56', name: 'Chile', flag: '🇨🇱' },
  { code: '+57', name: 'Colombia', flag: '🇨🇴' },
  { code: '+51', name: 'Perú', flag: '🇵🇪' },
  { code: '+593', name: 'Ecuador', flag: '🇪🇨' },
  { code: '+598', name: 'Uruguay', flag: '🇺🇾' },
  { code: '+595', name: 'Paraguay', flag: '🇵🇾' },
  { code: '+58', name: 'Venezuela', flag: '🇻🇪' },
  { code: '+34', name: 'España', flag: '🇪🇸' },
  { code: '+55', name: 'Brasil', flag: '🇧🇷' },
  { code: '+506', name: 'Costa Rica', flag: '🇨🇷' },
  { code: '+503', name: 'El Salvador', flag: '🇸🇻' },
  { code: '+502', name: 'Guatemala', flag: '🇬🇹' },
  { code: '+504', name: 'Honduras', flag: '🇭🇳' },
  { code: '+507', name: 'Panamá', flag: '🇵🇦' },
];

function initCountrySelector() {
  const sel = document.getElementById('regCountryCode');
  if (!sel) return;
  sel.innerHTML = countryCodes.map(c =>
    `<option value="${c.code}" ${c.code === '+591' ? 'selected' : ''}>${c.flag} ${c.name} (${c.code})</option>`
  ).join('');
}

function showAuthTab(tab) {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const googleRegForm = document.getElementById('googleRegForm');
  const tabs = document.querySelectorAll('.auth-tab');

  tabs.forEach(t => t.classList.remove('active'));

  if (tab === 'login') {
    loginForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
    if (googleRegForm) googleRegForm.classList.add('hidden');
    tabs[0].classList.add('active');
  } else {
    loginForm.classList.add('hidden');
    registerForm.classList.remove('hidden');
    if (googleRegForm) googleRegForm.classList.add('hidden');
    tabs[1].classList.add('active');
  }
}

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

// ============================================
// LOGIN con email/contraseña
// ============================================
async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  const btn = document.getElementById('loginBtn');

  btn.innerHTML = '<div class="spinner spinner-sm" style="border-top-color:white;display:inline-block;"></div> Entrando...';
  btn.disabled = true;

  try {
    const result = await auth.signInWithEmailAndPassword(email, password);
    const user = result.user;

    const isAdmin = await verificarAdmin(user.uid, user.email);
    if (isAdmin) {
      showToast('Bienvenido Administrador', 'success');
      setTimeout(() => window.location.href = 'admin.html', 1000);
    } else {
      const snap = await getUserDB(user.uid).child('perfil').once('value');
      const perfil = snap.val();
      if (perfil && perfil.activo === false) {
        showToast('Tu cuenta está desactivada. Contacta al administrador.', 'error');
        await auth.signOut();
      } else {
        showToast('¡Bienvenido!', 'success');
        setTimeout(() => window.location.href = 'app.html', 1000);
      }
    }
  } catch (error) {
    console.error('Error login:', error);
    let msg = 'Error al iniciar sesión';
    if (error.code === 'auth/user-not-found') msg = 'Usuario no encontrado';
    if (error.code === 'auth/wrong-password') msg = 'Contraseña incorrecta';
    if (error.code === 'auth/invalid-email') msg = 'Email inválido';
    if (error.code === 'auth/too-many-requests') msg = 'Demasiados intentos. Espera un momento.';
    showToast(msg, 'error');
  } finally {
    btn.innerHTML = 'Iniciar Sesión';
    btn.disabled = false;
  }
}

// ============================================
// REGISTRO con Google - Paso 1: Sign in con Google
// ============================================
let pendingGoogleUser = null;

async function handleGoogleRegister() {
  try {
    const result = await auth.signInWithPopup(googleProvider);
    const user = result.user;

    // Verificar si ya tiene perfil
    const snap = await getUserDB(user.uid).child('perfil').once('value');
    if (snap.val()) {
      // Ya registrado, redirigir
      showToast('¡Bienvenido de vuelta!', 'success');
      setTimeout(() => window.location.href = 'app.html', 1000);
      return;
    }

    // Nuevo usuario Google: mostrar formulario de datos adicionales
    pendingGoogleUser = user;
    document.getElementById('loginForm').classList.add('hidden');
    document.getElementById('registerForm').classList.add('hidden');
    document.getElementById('googleRegForm').classList.remove('hidden');

    // Pre-llenar nombre si disponible
    if (user.displayName) {
      document.getElementById('googleRegName').value = user.displayName;
    }

    document.getElementById('googleEmailDisplay').textContent = user.email;

  } catch (error) {
    console.error('Error Google Sign-In:', error);
    if (error.code !== 'auth/popup-closed-by-user') {
      showToast('Error al iniciar con Google', 'error');
    }
  }
}

// ============================================
// REGISTRO con Google - Paso 2: Guardar datos adicionales
// ============================================
async function completeGoogleRegister(e) {
  e.preventDefault();
  if (!pendingGoogleUser) {
    showToast('Error: sesión de Google perdida', 'error');
    return;
  }

  const name = document.getElementById('googleRegName').value.trim();
  const business = document.getElementById('googleRegBusiness').value.trim();
  const countryCode = document.getElementById('googleRegCountryCode')?.value || '+591';
  const phone = document.getElementById('googleRegPhone').value.trim();
  const btn = document.getElementById('googleRegBtn');

  if (!name || !business) {
    showToast('Nombre y tienda son requeridos', 'warning');
    return;
  }

  btn.innerHTML = '<div class="spinner spinner-sm" style="border-top-color:white;display:inline-block;"></div> Creando...';
  btn.disabled = true;

  try {
    const fullPhone = phone ? countryCode + ' ' + phone : '-';

    await getUserDB(pendingGoogleUser.uid).child('perfil').set({
      nombre: name,
      negocio: business,
      telefono: fullPhone,
      email: pendingGoogleUser.email,
      plan: 'gratuito',
      activo: true,
      fechaRegistro: new Date().toISOString(),
      limiteProductos: 50,
      limiteVentasDia: 20,
      limiteVentasMes: 500,
      limiteExtractosDia: 1,
      limiteExtractosMes: 2,
      mediaPermisos: {
        imagen: true,
        video: false,
        modelo3d: false,
        firebaseStorage: false,
        githubHosting: true
      }
    });

    await getUserDB(pendingGoogleUser.uid).child('configuracion').set({
      moneda: 'BOB',
      impuesto: 13,
      nombreNegocio: business
    });

    showToast('¡Cuenta creada exitosamente!', 'success');
    setTimeout(() => window.location.href = 'app.html', 1500);

  } catch (error) {
    console.error('Error registro Google:', error);
    showToast('Error al crear cuenta', 'error');
  } finally {
    btn.innerHTML = 'Crear Cuenta';
    btn.disabled = false;
  }
}

// ============================================
// REGISTRO con email/contraseña (manual)
// ============================================
async function handleRegister(e) {
  e.preventDefault();
  const name = document.getElementById('regName').value;
  const business = document.getElementById('regBusiness').value;
  const countryCode = document.getElementById('regCountryCode')?.value || '+591';
  const phone = document.getElementById('regPhone').value.trim();
  const email = document.getElementById('regEmail').value;
  const password = document.getElementById('regPassword').value;
  const btn = document.getElementById('regBtn');

  btn.innerHTML = '<div class="spinner spinner-sm" style="border-top-color:white;display:inline-block;"></div> Creando...';
  btn.disabled = true;

  try {
    const result = await auth.createUserWithEmailAndPassword(email, password);
    const user = result.user;

    const fullPhone = phone ? countryCode + ' ' + phone : '-';

    await getUserDB(user.uid).child('perfil').set({
      nombre: name,
      negocio: business,
      telefono: fullPhone,
      email: email,
      plan: 'gratuito',
      activo: true,
      fechaRegistro: new Date().toISOString(),
      limiteProductos: 50,
      limiteVentasDia: 20,
      limiteVentasMes: 500,
      limiteExtractosDia: 1,
      limiteExtractosMes: 2,
      mediaPermisos: {
        imagen: true,
        video: false,
        modelo3d: false,
        firebaseStorage: false,
        githubHosting: true
      }
    });

    await getUserDB(user.uid).child('configuracion').set({
      moneda: 'BOB',
      impuesto: 13,
      nombreNegocio: business
    });

    showToast('¡Cuenta creada exitosamente!', 'success');
    setTimeout(() => window.location.href = 'app.html', 1500);

  } catch (error) {
    console.error('Error registro:', error);
    let msg = 'Error al crear cuenta';
    if (error.code === 'auth/email-already-in-use') msg = 'Este correo ya está registrado';
    if (error.code === 'auth/weak-password') msg = 'La contraseña es muy débil';
    showToast(msg, 'error');
  } finally {
    btn.innerHTML = 'Crear Cuenta';
    btn.disabled = false;
  }
}

// ============================================
// LOGIN con Google (para usuarios existentes)
// ============================================
async function handleGoogleLogin() {
  try {
    const result = await auth.signInWithPopup(googleProvider);
    const user = result.user;

    // Verificar si es admin
    const isAdmin = await verificarAdmin(user.uid, user.email);
    if (isAdmin) {
      showToast('Bienvenido Administrador', 'success');
      setTimeout(() => window.location.href = 'admin.html', 1000);
      return;
    }

    // Verificar si tiene perfil
    const snap = await getUserDB(user.uid).child('perfil').once('value');
    if (!snap.val()) {
      // No tiene perfil, mostrar form de registro Google
      pendingGoogleUser = user;
      document.getElementById('loginForm').classList.add('hidden');
      document.getElementById('registerForm').classList.add('hidden');
      document.getElementById('googleRegForm').classList.remove('hidden');
      if (user.displayName) {
        document.getElementById('googleRegName').value = user.displayName;
      }
      document.getElementById('googleEmailDisplay').textContent = user.email;
      return;
    }

    const perfil = snap.val();
    if (perfil.activo === false) {
      showToast('Tu cuenta está desactivada.', 'error');
      await auth.signOut();
      return;
    }

    showToast('¡Bienvenido!', 'success');
    setTimeout(() => window.location.href = 'app.html', 1000);

  } catch (error) {
    console.error('Error Google Login:', error);
    if (error.code !== 'auth/popup-closed-by-user') {
      showToast('Error al iniciar con Google', 'error');
    }
  }
}

// ============================================
// ACTIVAR CÓDIGO
// ============================================
async function activateCode() {
  const code = document.getElementById('activationCode').value.toUpperCase().trim();
  const btn = document.getElementById('activateBtn');

  if (code.length !== 8) {
    showToast('El código debe tener 8 caracteres', 'warning');
    return;
  }

  const user = auth.currentUser;
  if (!user) {
    showToast('Debes iniciar sesión primero', 'error');
    return;
  }

  btn.innerHTML = '<div class="spinner spinner-sm" style="display:inline-block;"></div>';
  btn.disabled = true;

  try {
    const snap = await db.ref('codigos/' + code).once('value');
    const codeData = snap.val();

    if (!codeData) { showToast('Código no encontrado', 'error'); return; }
    if (codeData.estado === 'usado') { showToast('Este código ya fue utilizado', 'error'); return; }

    const planConfig = await db.ref('planesConfig/' + codeData.tipoPlan).once('value');
    const planData = planConfig.val() || {};

    await getUserDB(user.uid).child('perfil').update({
      plan: codeData.tipoPlan,
      limiteProductos: planData.limiteProductos || 999999,
      limiteVentasDia: planData.limiteVentasDia || 999999,
      limiteVentasMes: planData.limiteVentasMes || 999999,
      limiteExtractosDia: planData.limiteExtractosDia || 5,
      limiteExtractosMes: planData.limiteExtractosMes || 30,
      mediaPermisos: planData.mediaPermisos || {
        imagen: true, video: true,
        modelo3d: codeData.tipoPlan === 'premium' || codeData.tipoPlan === 'mantenimiento',
        firebaseStorage: true, githubHosting: true
      },
      codigoActivado: code,
      fechaActivacion: new Date().toISOString()
    });

    await db.ref('codigos/' + code).update({
      estado: 'usado',
      usadoPor: user.uid,
      fechaUso: new Date().toISOString()
    });

    showToast('¡Plan activado exitosamente! 🎉', 'success');
    setTimeout(() => window.location.reload(), 2000);

  } catch (error) {
    console.error('Error activación:', error);
    showToast('Error al activar código', 'error');
  } finally {
    btn.innerHTML = 'Activar';
    btn.disabled = false;
  }
}

// Verificar sesión activa
auth.onAuthStateChanged(async (user) => {
  if (user && window.location.pathname.includes('login')) {
    const isAdmin = await verificarAdmin(user.uid, user.email);
    if (isAdmin) {
      window.location.href = 'admin.html';
    } else {
      window.location.href = 'app.html';
    }
  }
});

// Inicializar selectores de país al cargar
document.addEventListener('DOMContentLoaded', () => {
  initCountrySelector();
  // Inicializar selector de país en formulario Google
  const googleCountrySel = document.getElementById('googleRegCountryCode');
  if (googleCountrySel) {
    googleCountrySel.innerHTML = countryCodes.map(c =>
      `<option value="${c.code}" ${c.code === '+591' ? 'selected' : ''}>${c.flag} ${c.name} (${c.code})</option>`
    ).join('');
  }
});
