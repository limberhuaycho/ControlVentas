/**
 * ============================================
 * PDF-GENERATOR.JS - Generación de Extractos PDF
 * ============================================
 * Genera extractos en PDF o imagen usando jsPDF.
 * Límites configurables por plan desde admin.
 * 
 * LÍMITES POR DEFECTO (plan gratuito):
 * - 1 extracto por día
 * - 2 extractos por mes
 * 
 * Los planes de pago tienen límites configurables desde admin.
 * ============================================
 */

/**
 * checkExtractoLimits - Verifica si el usuario puede generar más extractos
 * @returns {Promise<{canGenerate: boolean, message: string}>}
 */
async function checkExtractoLimits() {
  if (!currentUser || !userRef) return { canGenerate: false, message: 'Debes iniciar sesión' };

  const today = new Date().toISOString().split('T')[0];
  const currentMonth = new Date().toISOString().slice(0, 7);

  const snap = await userRef.child('extractos').once('value');
  const extractos = snap.val() || {};

  let hoy = 0, mes = 0;
  Object.values(extractos).forEach(e => {
    if (e.fecha && e.fecha.startsWith(today)) hoy++;
    if (e.fecha && e.fecha.startsWith(currentMonth)) mes++;
  });

  const limiteDia = userProfile?.limiteExtractosDia || 1;
  const limiteMes = userProfile?.limiteExtractosMes || 2;

  if (hoy >= limiteDia) {
    return { canGenerate: false, message: `Límite diario alcanzado (${limiteDia}). Mejora tu plan para más.` };
  }
  if (mes >= limiteMes) {
    return { canGenerate: false, message: `Límite mensual alcanzado (${limiteMes}). Mejora tu plan para más.` };
  }

  return { canGenerate: true, message: `Puedes generar ${limiteDia - hoy} más hoy y ${limiteMes - mes} más este mes.` };
}

/**
 * generateExtracto - Genera un extracto en PDF
 * @param {string} format - 'pdf' o 'imagen'
 */
async function generateExtracto(format = 'pdf') {
  const check = await checkExtractoLimits();
  if (!check.canGenerate) {
    showToast(check.message, 'error');
    showPlanModal();
    return;
  }

  showToast('Generando extracto...', 'success');

  const nombre = userProfile?.nombre || 'Usuario';
  const negocio = userProfile?.negocio || 'Mi Negocio';
  const fecha = new Date();
  const fechaStr = fecha.toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
  const fechaFile = fecha.toISOString().split('T')[0];

  // Obtener datos de ventas del mes actual
  const currentMonth = fecha.toISOString().slice(0, 7);
  const ventasSnap = await userRef.child('ventas').once('value');
  const ventasData = ventasSnap.val() || {};
  const ventasMes = Object.values(ventasData).filter(v => v.fecha && v.fecha.startsWith(currentMonth));

  let totalIngresos = 0;

  ventasMes.forEach(v => {
  totalIngresos += v.total || 0;
  });

// ✅ NUEVO: Obtener gastos reales
  const gastosSnap = await userRef.child('gastos').once('value');
  const gastosData = gastosSnap.val() || {};

  let totalGastos = 0;
  Object.values(gastosData).forEach(g => {
    if (g.fecha && g.fecha.startsWith(currentMonth)) {
      totalGastos += g.monto || 0;
    }
  });

  // ✅ NUEVO: Ganancia REAL
  const totalGanancias = totalIngresos - totalGastos;

  // Obtener productos
  const prodSnap = await userRef.child('productos').once('value');
  const productos = prodSnap.val() || {};
  const totalProductos = Object.keys(productos).length;

  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Header
    doc.setFillColor(108, 92, 231);
    doc.rect(0, 0, 210, 45, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('EXTRACTO', 105, 18, { align: 'center' });
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text('Control-Ventas', 105, 28, { align: 'center' });
    doc.setFontSize(10);
    doc.text(fechaStr, 105, 36, { align: 'center' });

    // Info del negocio
    doc.setTextColor(45, 52, 54);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(negocio, 20, 60);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Propietario: ' + nombre, 20, 68);
    doc.text('Fecha de generación: ' + fechaStr, 20, 75);

    // Línea separadora
    doc.setDrawColor(108, 92, 231);
    doc.setLineWidth(0.5);
    doc.line(20, 80, 190, 80);

    // Resumen
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Resumen del Mes', 20, 92);

    const resumenY = 102;
    const items = [
      ['Total de Ventas:', ventasMes.length.toString()],
      ['Ingresos Totales:', '$' + totalIngresos.toFixed(2)],
      ['Gastos Reales:', '$' + totalGastos.toFixed(2)],
      ['Ganancia Neta:', '$' + totalGanancias.toFixed(2)],
      ['Productos Registrados:', totalProductos.toString()],
      ['Plan Actual:', (userProfile?.plan || 'Gratuito').charAt(0).toUpperCase() + (userProfile?.plan || 'gratuito').slice(1)]
    ];

    doc.setFontSize(10);
    items.forEach((item, i) => {
      const y = resumenY + (i * 10);
      doc.setFont('helvetica', 'bold');
      doc.text(item[0], 20, y);
      doc.setFont('helvetica', 'normal');
      doc.text(item[1], 90, y);
    });

    // Detalle de ventas recientes
    const detalleY = resumenY + items.length * 10 + 15;
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Últimas Ventas', 20, detalleY);

    doc.setFontSize(9);
    const headerY = detalleY + 10;
    doc.setFillColor(245, 246, 250);
    doc.rect(20, headerY - 5, 170, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.text('Fecha', 22, headerY);
    doc.text('Cliente', 62, headerY);
    doc.text('Productos', 110, headerY);
    doc.text('Total', 155, headerY);

    doc.setFont('helvetica', 'normal');
    const recentSales = ventasMes.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '')).slice(0, 15);
    recentSales.forEach((v, i) => {
      const y = headerY + 8 + (i * 7);
      if (y > 270) return;
      doc.text(v.fecha ? new Date(v.fecha).toLocaleDateString('es-MX') : '-', 22, y);
      doc.text((v.cliente || 'General').substring(0, 20), 62, y);
      doc.text(v.items ? v.items.length + ' items' : '-', 110, y);
      doc.text('$' + (v.total || 0).toFixed(2), 155, y);
    });

    // Footer
    doc.setFillColor(45, 52, 54);
    doc.rect(0, 280, 210, 17, 'F');
    doc.setTextColor(178, 190, 195);
    doc.setFontSize(8);
    doc.text('Generado por Control-Ventas | ' + fechaStr + ' | Este documento es informativo', 105, 289, { align: 'center' });

    const fileName = `Extracto_${nombre.replace(/\s/g, '_')}_${fechaFile}`;

    if (format === 'pdf') {
      doc.save(fileName + '.pdf');
    } else {
      // Generar como imagen
      const canvas = document.createElement('canvas');
      const imgData = doc.output('datauristring');
      // Para imagen, usar html2canvas del PDF
      const pdfBlob = doc.output('blob');
      const url = URL.createObjectURL(pdfBlob);
      // Descarga como PDF por compatibilidad, el usuario puede capturar pantalla
      doc.save(fileName + '.pdf');
      showToast('Para imagen: usa captura de pantalla del PDF', 'info');
    }

    // Registrar extracto generado
    await userRef.child('extractos').push({
      fecha: new Date().toISOString(),
      tipo: format,
      nombre: fileName
    });

    showToast('¡Extracto generado! 📄', 'success');

  } catch (error) {
    console.error('Error generando extracto:', error);
    showToast('Error al generar extracto', 'error');
  }
}

/**
 * showExtractoModal - Muestra el modal para generar extracto
 */
function showExtractoModal() {
  checkExtractoLimits().then(check => {
    const content = document.getElementById('extractoInfo');
    if (content) {
      content.innerHTML = `
        <p style="font-size:0.9rem;color:var(--gray);margin-bottom:12px;">${check.message}</p>
        <p style="font-size:0.85rem;color:var(--gray);">Se generará con los datos del mes actual.</p>
      `;
    }
    openModal('extractoModal');
  });
}
