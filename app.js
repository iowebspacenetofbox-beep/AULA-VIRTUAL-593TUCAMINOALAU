import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { 
    getAuth, signInWithPopup, GoogleAuthProvider, signInWithEmailAndPassword, onAuthStateChanged, signOut 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { 
    getFirestore, doc, getDoc, setDoc, deleteDoc, collection, getDocs, addDoc, query, where 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// ==========================================
// CONFIGURACIÓN
// ==========================================
const ADMIN_EMAIL = "videosc847@gmail.com"; 
const CORREO_FORMSUBMIT = "sebastianneto84@gmail.com";

const firebaseConfig = {
  apiKey: "AIzaSyAO_RcOstMWsdsHyawSaSsNrxnI5KNDaGU",
  authDomain: "simulador-quiz20-5.firebaseapp.com",
  projectId: "simulador-quiz20-5",
  storageBucket: "simulador-quiz20-5.firebasestorage.app",
  messagingSenderId: "677582682271",
  appId: "1:677582682271:web:b1f3f2ab0b60e7f9be0aaa"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

let usuarioActual = null;
let materiaSeleccionada = null;
let moduloSeleccionado = null; 
let temaActualInfo = null;
let quizActivo = null;
let temaEditandoId = null;
let editorSavedRange = null;
let simuladoresGuardadosCache = {};

// ==========================================
// ORDEN AMIGABLE DE MATERIAS, MÓDULOS Y TEMAS
// ==========================================
function valorOrden(item) {
    const n = Number(item?.orden);
    return Number.isFinite(n) && n > 0 ? n : Number.MAX_SAFE_INTEGER;
}

function fechaOrden(item) {
    return String(item?.fecha_creacion || item?.fecha_actualizacion || '');
}

function ordenarPorOrden(lista = [], campoNombre = 'nombre') {
    return [...lista].sort((a, b) => {
        const diff = valorOrden(a) - valorOrden(b);
        if(diff !== 0) return diff;
        const fechaDiff = fechaOrden(a).localeCompare(fechaOrden(b));
        if(fechaDiff !== 0) return fechaDiff;
        return String(a?.[campoNombre] || '').localeCompare(String(b?.[campoNombre] || ''), 'es', { sensitivity: 'base' });
    });
}

async function obtenerSiguienteOrden(coleccionNombre, campoFiltro = null, valorFiltro = null) {
    const ref = campoFiltro
        ? query(collection(db, coleccionNombre), where(campoFiltro, '==', valorFiltro))
        : collection(db, coleccionNombre);
    const snap = await getDocs(ref);
    if(snap.empty) return 1;

    const campoNombre = coleccionNombre === 'temas_globales' ? 'titulo' : 'nombre';
    const lista = ordenarPorOrden(snap.docs.map(d => ({ id:d.id, ...d.data() })), campoNombre);
    const hayOrdenIncompleto = lista.some(item => !Number.isFinite(Number(item.orden)) || Number(item.orden) <= 0);

    // Compatibilidad con contenido ya existente: si aún no tenía orden explícito,
    // lo normaliza una sola vez respetando su orden de creación/nombre.
    if(hayOrdenIncompleto) await guardarOrdenGrupo(
        coleccionNombre === 'materias' ? 'materia' : (coleccionNombre === 'modulos' ? 'modulo' : 'tema'),
        lista
    );

    return lista.length + 1;
}

async function obtenerGrupoOrden(tipo, parentId = '') {
    if(tipo === 'materia') {
        const snap = await getDocs(collection(db, 'materias'));
        const lista = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        return ordenarPorOrden(lista, 'nombre');
    }
    if(tipo === 'modulo') {
        const snap = await getDocs(query(collection(db, 'modulos'), where('materia_id', '==', parentId)));
        const lista = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        return ordenarPorOrden(lista, 'nombre');
    }
    if(tipo === 'tema') {
        const snap = await getDocs(query(collection(db, 'temas_globales'), where('modulo_id', '==', parentId)));
        const lista = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        return ordenarPorOrden(lista, 'titulo');
    }
    return [];
}

async function guardarOrdenGrupo(tipo, lista) {
    const coleccionNombre = tipo === 'materia' ? 'materias' : (tipo === 'modulo' ? 'modulos' : 'temas_globales');
    await Promise.all(lista.map((item, index) => setDoc(
        doc(db, coleccionNombre, item.id),
        { orden: index + 1, fecha_actualizacion_orden: new Date().toISOString() },
        { merge: true }
    )));
}

window.reordenarElemento = async function(tipo, id, direccion, parentId = '') {
    const estado = document.getElementById('admin-organizador-status');
    try {
        if(estado) estado.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Guardando nuevo orden...`;
        const lista = await obtenerGrupoOrden(tipo, parentId);
        const actual = lista.findIndex(x => x.id === id);
        if(actual < 0) return;
        const destino = direccion === 'arriba' ? actual - 1 : actual + 1;
        if(destino < 0 || destino >= lista.length) return;
        [lista[actual], lista[destino]] = [lista[destino], lista[actual]];
        await guardarOrdenGrupo(tipo, lista);
        await Promise.all([cargarOrganizador(), cargarDatosAdmin(), cargarEstructuraGlobal()]);
        if(estado) {
            estado.innerHTML = `<span style="color:var(--success)"><i class="fas fa-circle-check"></i> Orden actualizado automáticamente.</span>`;
            setTimeout(() => { if(estado.textContent.includes('Orden actualizado')) estado.innerHTML = ''; }, 2200);
        }
    } catch(e) {
        console.error('Error reordenando:', e);
        if(estado) estado.innerHTML = `<span style="color:var(--danger)"><i class="fas fa-triangle-exclamation"></i> No se pudo cambiar el orden: ${escapeHTML(e.message)}</span>`;
        else alert('No se pudo cambiar el orden: ' + e.message);
    }
};

async function cargarOrganizador() {
    const cont = document.getElementById('admin-organizador-estructura');
    if(!cont) return;
    cont.innerHTML = `<div class="admin-empty-state"><i class="fas fa-spinner fa-spin"></i><span>Cargando estructura...</span></div>`;
    try {
        const [snapMat, snapMod, snapTem] = await Promise.all([
            getDocs(collection(db, 'materias')),
            getDocs(collection(db, 'modulos')),
            getDocs(collection(db, 'temas_globales'))
        ]);
        const materias = ordenarPorOrden(snapMat.docs.map(d => ({ id:d.id, ...d.data() })), 'nombre');
        const modulos = snapMod.docs.map(d => ({ id:d.id, ...d.data() }));
        const temas = snapTem.docs.map(d => ({ id:d.id, ...d.data() }));

        if(!materias.length) {
            cont.innerHTML = `<div class="admin-empty-state"><i class="fas fa-box-open"></i><span>Aún no hay materias. Créala primero desde la pestaña Materias.</span></div>`;
            return;
        }

        const flechas = (tipo, id, parentId, index, total) => `
            <div class="order-controls" aria-label="Cambiar posición">
                <button type="button" class="order-btn" ${index === 0 ? 'disabled' : ''} onclick="reordenarElemento('${tipo}','${id}','arriba','${parentId || ''}')" title="Subir una posición"><i class="fas fa-arrow-up"></i></button>
                <span class="order-number">${index + 1}</span>
                <button type="button" class="order-btn" ${index === total - 1 ? 'disabled' : ''} onclick="reordenarElemento('${tipo}','${id}','abajo','${parentId || ''}')" title="Bajar una posición"><i class="fas fa-arrow-down"></i></button>
            </div>`;

        cont.innerHTML = materias.map((mat, matIndex) => {
            const mods = ordenarPorOrden(modulos.filter(m => m.materia_id === mat.id), 'nombre');
            const safeMat = escapeHTML(mat.nombre || 'Materia');
            const modsHTML = mods.length ? mods.map((mod, modIndex) => {
                const ts = ordenarPorOrden(temas.filter(t => t.modulo_id === mod.id), 'titulo');
                const temasHTML = ts.length ? ts.map((t, tIndex) => `
                    <div class="organizer-topic-row">
                        <div class="organizer-item-name"><span class="organizer-dot organizer-dot-topic"></span><span>${escapeHTML(t.titulo || 'Tema')}</span></div>
                        ${flechas('tema', t.id, mod.id, tIndex, ts.length)}
                    </div>`).join('') : `<div class="organizer-empty">Sin temas todavía.</div>`;
                return `
                    <div class="organizer-module-card">
                        <div class="organizer-module-head">
                            <div class="organizer-item-name"><i class="fas fa-layer-group"></i><strong>${escapeHTML(mod.nombre || 'Módulo')}</strong></div>
                            ${flechas('modulo', mod.id, mat.id, modIndex, mods.length)}
                        </div>
                        <div class="organizer-topic-list">${temasHTML}</div>
                    </div>`;
            }).join('') : `<div class="organizer-empty">Esta materia todavía no tiene módulos.</div>`;

            return `
                <section class="organizer-subject-card">
                    <div class="organizer-subject-head">
                        <div>
                            <div class="organizer-kicker">MATERIA ${matIndex + 1}</div>
                            <h4><i class="fas fa-book-open"></i> ${safeMat}</h4>
                        </div>
                        ${flechas('materia', mat.id, '', matIndex, materias.length)}
                    </div>
                    <div class="organizer-module-list">${modsHTML}</div>
                </section>`;
        }).join('');
    } catch(e) {
        console.error('Error cargando organizador:', e);
        cont.innerHTML = `<div class="admin-empty-state admin-error"><i class="fas fa-triangle-exclamation"></i><span>No se pudo cargar la estructura: ${escapeHTML(e.message)}</span></div>`;
    }
}

// ==========================================
// FUNCIÓN PARA MIGAS DE PAN
// ==========================================
function actualizarRuta(mat, mod, tem) {
    let ruta = "";
    if (mat) ruta += `<span style="color:var(--color-materia)">${mat}</span>`;
    if (mod) ruta += ` > <span style="color:var(--color-modulo)">${mod}</span>`;
    if (tem) ruta += ` > <span style="color:var(--color-tema)">${tem}</span>`;
    document.getElementById('top-title').innerHTML = ruta || "Inicio";
}


// ==========================================
// PROFE IA — INTEGRACIÓN SEGURA CON APP EXTERNA
// ==========================================
function obtenerContextoProfeIA() {
    const vistaActual = [...document.querySelectorAll('#main-content > section')]
        .find(sec => !sec.classList.contains('hidden'))?.id || 'view-inicio';

    return {
        vista: vistaActual,
        ruta: document.getElementById('top-title')?.innerText?.trim() || 'Inicio',
        materia: materiaSeleccionada?.nombre || '',
        modulo: moduloSeleccionado?.nombre || '',
        tema: temaActualInfo?.titulo || '',
        recurso: document.getElementById('subtitulo-recursos')?.innerText?.trim() || ''
    };
}

function enviarContextoProfeIA() {
    const frame = document.getElementById('ai-teacher-frame');
    if(!frame?.contentWindow) return;
    // Solo se envían datos académicos de navegación; no se envían credenciales ni tokens.
    frame.contentWindow.postMessage({
        type: 'PROFE_IA_CONTEXT',
        context: obtenerContextoProfeIA()
    }, '*');
}

window.toggleProfeIA = function(abrir) {
    const panel = document.getElementById('ai-teacher-panel');
    if(!panel) return;
    const debeAbrir = typeof abrir === 'boolean' ? abrir : !panel.classList.contains('open');
    panel.classList.toggle('open', debeAbrir);
    if(debeAbrir) {
        // Espera un instante por si el iframe acaba de cargar y luego entrega el contexto.
        setTimeout(enviarContextoProfeIA, 80);
    }
};

// ==========================================
// NAVEGACIÓN Y CONTROL DE INTERFAZ
// ==========================================
window.mostrarVista = function(idVista) {
    document.querySelectorAll('#main-content > section').forEach(sec => sec.classList.add('hidden'));
    const vista = document.getElementById(idVista);
    if(vista) {
        vista.classList.remove('hidden');
        vista.classList.remove('view-enter');
        void vista.offsetWidth;
        vista.classList.add('view-enter');
    }

    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    if(idVista === 'view-inicio') {
        document.getElementById('nav-inicio')?.classList.add('active');
        actualizarRuta();
    }

    // El botón global de regreso se mantiene fuera del Inicio y del Login.
    const btnRegresar = document.getElementById('btn-global-back');
    if(btnRegresar) {
        btnRegresar.classList.toggle('hidden', idVista === 'view-inicio' || idVista === 'view-login');
    }

    // El Profe IA está disponible en todos los niveles del aula, excepto en el login.
    const aiLauncher = document.getElementById('ai-teacher-launcher');
    if(aiLauncher) aiLauncher.classList.toggle('hidden', idVista === 'view-login');
    if(idVista === 'view-login') document.getElementById('ai-teacher-panel')?.classList.remove('open');
    else setTimeout(enviarContextoProfeIA, 60);

    const main = document.getElementById('main-content');
    if(main && idVista !== 'view-tema') main.scrollTo({ top: 0, behavior: 'smooth' });
}

// Regreso lógico y seguro según la vista actual.
// No depende del historial del navegador, por lo que conserva el flujo interno del aula.
window.regresarAtrasGlobal = function() {
    const vistaActual = [...document.querySelectorAll('#main-content > section')]
        .find(sec => !sec.classList.contains('hidden'))?.id || '';

    if(vistaActual === 'view-quiz') {
        if(temaActualInfo) return mostrarVista('view-tema');
        return mostrarVista('view-inicio');
    }

    if(vistaActual === 'view-tema') {
        // Si está dentro de Textos, Videos, Imágenes o Evaluación, primero vuelve al menú del tema.
        const menuRecursos = document.getElementById('menu-recursos');
        if(menuRecursos && menuRecursos.classList.contains('hidden')) {
            return window.volverRecursos();
        }

        if(moduloSeleccionado?.id) {
            return window.cargarModulo(
                moduloSeleccionado.id,
                moduloSeleccionado.nombre,
                moduloSeleccionado.materiaId,
                moduloSeleccionado.materiaNombre,
                moduloSeleccionado.evaluacion
            );
        }

        if(materiaSeleccionada?.id) {
            return window.cargarMateria(materiaSeleccionada.id, materiaSeleccionada.nombre);
        }

        return mostrarVista('view-inicio');
    }

    if(vistaActual === 'view-modulo') {
        if(materiaSeleccionada?.id) {
            return window.cargarMateria(materiaSeleccionada.id, materiaSeleccionada.nombre);
        }
        return mostrarVista('view-inicio');
    }

    if(vistaActual === 'view-materia' || vistaActual === 'view-admin') {
        return mostrarVista('view-inicio');
    }

    return mostrarVista('view-inicio');
};

window.toggleTreeNode = function(id) {
    const el = document.getElementById(id);
    if(el) el.classList.toggle('open');
}

// FUNCIONES PARA EL MENÚ DE RECURSOS
window.mostrarRecurso = function(id, nombreRecurso) {
    document.getElementById('menu-recursos').classList.add('hidden');
    document.querySelectorAll('.recurso-content').forEach(el => el.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');

    const subtitulo = document.getElementById('subtitulo-recursos');
    if(subtitulo) {
        // En "Resumen y Textos" evitamos repetir el nombre debajo del título del tema.
        if(id === 'acc-textos') {
            subtitulo.classList.add('hidden');
        } else {
            subtitulo.textContent = nombreRecurso;
            subtitulo.classList.remove('hidden');
        }
    }
}

window.volverRecursos = function() {
    document.getElementById('menu-recursos').classList.remove('hidden');
    document.querySelectorAll('.recurso-content').forEach(el => el.classList.add('hidden'));

    const subtitulo = document.getElementById('subtitulo-recursos');
    if(subtitulo) {
        subtitulo.textContent = "Recursos de aprendizaje";
        subtitulo.classList.remove('hidden');
    }
}

window.switchAdminTab = function(tabName) {
    document.querySelectorAll('#view-admin .tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('#view-admin .tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(`admin-tab-${tabName}`).classList.remove('hidden');
    
    const btns = document.querySelectorAll('#view-admin .tab-btn');
    if(tabName === 'materias') btns[0].classList.add('active');
    if(tabName === 'modulos') btns[1].classList.add('active');
    if(tabName === 'temas') btns[2].classList.add('active');
    if(tabName === 'organizar') { btns[3].classList.add('active'); cargarOrganizador(); }
    if(tabName === 'alumnos') btns[4].classList.add('active');
}

// ==========================================
// FUNCIONES PARA MODALES (IMÁGENES Y CONCEPTOS)
// ==========================================
window.mostrarModalImagen = function(nombreImagen) {
    const body = document.getElementById('modal-body');
    body.innerHTML = `<div class="modal-content-img" style="text-align:center;"><img src="imagenes/${nombreImagen}" alt="Imagen Ampliada"></div>`;
    document.getElementById('custom-modal').classList.add('active');
};

window.mostrarModalConcepto = function(texto) {
    const body = document.getElementById('modal-body');
    body.innerHTML = `<div style="font-size: 16px; line-height: 1.7; color: var(--text-dark); padding: 10px;">${texto}</div>`;
    document.getElementById('custom-modal').classList.add('active');
    
    if(window.MathJax) {
        MathJax.typesetPromise([body]);
    }
};

window.cerrarModal = function() {
    document.getElementById('custom-modal').classList.remove('active');
    document.getElementById('modal-body').innerHTML = "";
};


// ==========================================
// EDITOR VISUAL DEL ADMINISTRADOR
// ==========================================
function escapeHTML(texto = "") {
    return String(texto)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function escapeAttr(texto = "") {
    return escapeHTML(texto).replace(/`/g, "&#096;");
}

function getRichEditor() {
    return document.getElementById('admin-rich-editor');
}

function guardarSeleccionEditor() {
    const editor = getRichEditor();
    const sel = window.getSelection();
    if(!editor || !sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    if(editor.contains(range.commonAncestorContainer)) editorSavedRange = range.cloneRange();
}

function restaurarSeleccionEditor() {
    const editor = getRichEditor();
    if(!editor) return;
    editor.focus();
    if(editorSavedRange) {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(editorSavedRange);
    }
}

function syncEditorToTextarea() {
    const editor = getRichEditor();
    const hidden = document.getElementById('admin-tema-resumen');
    if(editor && hidden) hidden.value = editor.innerHTML.trim();
}

function insertHTMLAtEditor(html) {
    restaurarSeleccionEditor();
    document.execCommand('insertHTML', false, html);
    guardarSeleccionEditor();
    syncEditorToTextarea();
}

window.editorCommand = function(command, value = null) {
    restaurarSeleccionEditor();
    document.execCommand(command, false, value);
    guardarSeleccionEditor();
    syncEditorToTextarea();
};

window.editorAplicarBloque = function(tag) {
    const permitido = ['p', 'h2', 'h3', 'blockquote'].includes(tag) ? tag : 'p';
    window.editorCommand('formatBlock', permitido);
};

window.editorColorTexto = function(color) {
    window.editorCommand('foreColor', color);
};

window.editorResaltado = function(color) {
    restaurarSeleccionEditor();
    document.execCommand('hiliteColor', false, color);
    guardarSeleccionEditor();
    syncEditorToTextarea();
};

window.editorInsertarEnlace = function() {
    const url = prompt('Pega la URL del enlace:');
    if(!url) return;
    restaurarSeleccionEditor();
    const sel = window.getSelection();
    const textoSeleccionado = sel && !sel.isCollapsed ? sel.toString() : '';
    if(textoSeleccionado) {
        document.execCommand('createLink', false, url.trim());
        const editor = getRichEditor();
        editor?.querySelectorAll(`a[href="${CSS.escape(url.trim())}"]`).forEach(a => {
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
        });
    } else {
        const etiqueta = prompt('Texto que se mostrará:', url.trim()) || url.trim();
        insertHTMLAtEditor(`<a href="${escapeAttr(url.trim())}" target="_blank" rel="noopener noreferrer">${escapeHTML(etiqueta)}</a>`);
        return;
    }
    guardarSeleccionEditor();
    syncEditorToTextarea();
};

window.editorInsertarImagen = function() {
    const archivo = prompt('Nombre del archivo dentro de la carpeta imagenes (ej.: atomo.png):');
    if(!archivo) return;
    const pie = prompt('Pie de imagen (opcional):') || '';
    const safeFile = archivo.trim().replace(/^imagenes\//i, '');
    const caption = pie.trim() ? `<figcaption>${escapeHTML(pie.trim())}</figcaption>` : '';
    insertHTMLAtEditor(`<figure class="rich-figure"><img src="imagenes/${escapeAttr(safeFile)}" alt="${escapeAttr(pie || safeFile)}" class="rich-inline-image" data-modal-image="${escapeAttr(safeFile)}">${caption}</figure><p><br></p>`);
};

window.editorInsertarFormula = function() {
    const formula = prompt('Escribe la fórmula en LaTeX sin los signos $$ (ej.: E = mc^2):');
    if(!formula) return;
    insertHTMLAtEditor(`<p style="text-align:center;">$$${escapeHTML(formula.trim())}$$</p><p><br></p>`);
};

window.editorInsertarConcepto = function() {
    const etiqueta = prompt('Escribe la palabra o frase que funcionará como concepto emergente:');
    if(!etiqueta) return;
    const contenido = prompt('Escribe la explicación que aparecerá en la ventana emergente:');
    if(!contenido) return;
    const codificado = encodeURIComponent(contenido.trim());
    // Se inserta como texto normal azul y clicable, no como botón.
    insertHTMLAtEditor(`<span class="concept-link" data-concept="${escapeAttr(codificado)}">${escapeHTML(etiqueta.trim())}</span>&nbsp;`);
};

window.editorInsertarTabla = function() {
    const filas = Math.max(1, Math.min(10, parseInt(prompt('Número de filas (1 a 10):', '3')) || 3));
    const columnas = Math.max(1, Math.min(8, parseInt(prompt('Número de columnas (1 a 8):', '3')) || 3));
    let html = '<table><tbody>';
    for(let f = 0; f < filas; f++) {
        html += '<tr>';
        for(let c = 0; c < columnas; c++) {
            const tag = f === 0 ? 'th' : 'td';
            html += `<${tag}>${f === 0 ? `Encabezado ${c + 1}` : 'Celda'}</${tag}>`;
        }
        html += '</tr>';
    }
    html += '</tbody></table><p><br></p>';
    insertHTMLAtEditor(html);
};

window.editorInsertarSeparador = function() {
    insertHTMLAtEditor('<hr><p><br></p>');
};

window.toggleEditorPreview = function() {
    const preview = document.getElementById('admin-editor-preview');
    const editor = getRichEditor();
    if(!preview || !editor) return;
    if(preview.classList.contains('hidden')) {
        preview.innerHTML = editor.innerHTML || '<p style="color:#64748B">La vista previa está vacía.</p>';
        preview.classList.remove('hidden');
        if(window.MathJax) MathJax.typesetPromise([preview]).catch(() => {});
    } else {
        preview.classList.add('hidden');
    }
};

function limpiarFormularioTemaAdmin() {
    temaEditandoId = null;
    document.getElementById('admin-tema-titulo').value = '';
    document.getElementById('admin-tema-lecturas').value = '';
    document.getElementById('admin-tema-videos').value = '';
    document.getElementById('admin-tema-laboratorio').value = '';
    document.getElementById('admin-tema-imagenes').value = '';
    const editor = getRichEditor();
    if(editor) editor.innerHTML = '';
    editorSavedRange = null;
    syncEditorToTextarea();
    document.getElementById('admin-editor-preview')?.classList.add('hidden');
    const btnGuardar = document.getElementById('btn-admin-guardar-tema');
    if(btnGuardar) btnGuardar.innerHTML = `<i class="fas fa-save"></i> Publicar Tema`;
    document.getElementById('btn-admin-cancelar-edicion')?.classList.add('hidden');
}

async function cargarModulosAdmin(materiaId, moduloSeleccionadoId = '') {
    const selModulo = document.getElementById('admin-tema-modulo');
    if(!selModulo) return;
    selModulo.innerHTML = "<option value=''>Cargando módulos...</option>";
    if(!materiaId) {
        selModulo.innerHTML = "<option value=''>Selecciona primero una materia</option>";
        return;
    }
    const snap = await getDocs(query(collection(db, "modulos"), where("materia_id", "==", materiaId)));
    if(snap.empty) {
        selModulo.innerHTML = "<option value=''>No hay módulos. Crea uno primero.</option>";
        return;
    }
    const modulosOrdenados = ordenarPorOrden(snap.docs.map(d => ({ id:d.id, ...d.data() })), 'nombre');
    selModulo.innerHTML = `<option value="">-- Selecciona un Módulo --</option>` + modulosOrdenados.map(d => `<option value="${d.id}">${d.nombre}</option>`).join('');
    if(moduloSeleccionadoId) selModulo.value = moduloSeleccionadoId;
}

window.editarTema = async function(id) {
    try {
        const snap = await getDoc(doc(db, 'temas_globales', id));
        if(!snap.exists()) return alert('No se encontró el tema.');
        const data = snap.data();
        temaEditandoId = id;
        window.switchAdminTab('temas');

        document.getElementById('admin-tema-materia').value = data.materia_id || '';
        await cargarModulosAdmin(data.materia_id || '', data.modulo_id || '');
        document.getElementById('admin-tema-titulo').value = data.titulo || '';
        document.getElementById('admin-tema-lecturas').value = (data.lecturas_recomendadas || []).map(l => `${l.titulo || 'Enlace'} ${l.url || ''}`).join('\n');
        document.getElementById('admin-tema-videos').value = (data.videos_recomendados || []).join('\n');
        document.getElementById('admin-tema-laboratorio').value = data.video_laboratorio || '';
        document.getElementById('admin-tema-imagenes').value = (data.imagenes || []).join('\n');

        const editor = getRichEditor();
        const contenido = data.resumen_teorico || '';
        const pareceHTML = /<\/?[a-z][\s\S]*>/i.test(contenido);
        editor.innerHTML = pareceHTML ? contenido : (typeof marked !== 'undefined' ? marked.parse(contenido) : escapeHTML(contenido).replace(/\n/g, '<br>'));
        syncEditorToTextarea();

        const btnGuardar = document.getElementById('btn-admin-guardar-tema');
        btnGuardar.innerHTML = `<i class="fas fa-rotate"></i> Actualizar Tema`;
        document.getElementById('btn-admin-cancelar-edicion').classList.remove('hidden');
        document.getElementById('admin-status').innerHTML = `<span style="color:var(--primary-light)"><i class="fas fa-pen"></i> Editando: ${escapeHTML(data.titulo || 'Tema')}</span>`;
        document.getElementById('view-admin').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch(e) {
        alert('No se pudo cargar el tema para editar: ' + e.message);
    }
};

window.cancelarEdicionTema = function() {
    limpiarFormularioTemaAdmin();
    document.getElementById('admin-status').innerHTML = '';
};

document.addEventListener('DOMContentLoaded', () => {

    document.getElementById('btn-global-back')?.addEventListener('click', window.regresarAtrasGlobal);
    document.getElementById('ai-teacher-frame')?.addEventListener('load', () => setTimeout(enviarContextoProfeIA, 60));

    // Inicialización del editor visual y acciones enriquecidas.
    const editor = getRichEditor();
    if(editor) {
        ['keyup', 'mouseup', 'focus', 'input'].forEach(evt => editor.addEventListener(evt, () => {
            guardarSeleccionEditor();
            syncEditorToTextarea();
        }));
        document.querySelectorAll('.editor-toolbar button').forEach(btn => {
            btn.addEventListener('mousedown', e => e.preventDefault());
        });
    }

    document.getElementById('btn-admin-cancelar-edicion')?.addEventListener('click', window.cancelarEdicionTema);

    document.addEventListener('click', (e) => {
        const imagen = e.target.closest?.('[data-modal-image]');
        if(imagen) {
            e.preventDefault();
            window.mostrarModalImagen(imagen.dataset.modalImage);
            return;
        }
        const concepto = e.target.closest?.('[data-concept]');
        if(concepto) {
            e.preventDefault();
            let contenido = concepto.dataset.concept || '';
            try { contenido = decodeURIComponent(contenido); } catch(_) {}
            window.mostrarModalConcepto(contenido);
        }
    });

    document.querySelectorAll('.btn-logout').forEach(btn => btn.addEventListener('click', () => signOut(auth)));

    document.getElementById('btn-ir-admin')?.addEventListener('click', () => {
        mostrarVista('view-admin');
        cargarDatosAdmin();
    });


    // Login
    document.getElementById('btn-login-email')?.addEventListener('click', async () => {
        const email = document.getElementById('login-email').value.trim().toLowerCase();
        const pass = document.getElementById('login-password').value;
        const errBox = document.getElementById('login-error');
        errBox.classList.add('hidden');
        if(!email || !pass) { errBox.textContent = "Ingresa tu correo y contraseña."; errBox.classList.remove('hidden'); return; }
        try { await signInWithEmailAndPassword(auth, email, pass); } 
        catch(e) { errBox.textContent = "Error al iniciar sesión: Verifique sus credenciales."; errBox.classList.remove('hidden'); }
    });

    document.getElementById('btn-login-google')?.addEventListener('click', () => {
        signInWithPopup(auth, provider).catch(() => {
            const err = document.getElementById('login-error');
            err.textContent = "Error al conectar con Google."; err.classList.remove('hidden');
        });
    });

    document.getElementById('btn-descargar-pdf')?.addEventListener('click', async () => {
        const elemento = document.getElementById('tema-resumen');
        const boton = document.getElementById('btn-descargar-pdf');
        if(!elemento) return;

        const textoBoton = boton?.innerHTML || '';
        let iframeImpresion = null;

        try {
            if(boton) {
                boton.disabled = true;
                boton.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Preparando PDF...`;
            }

            // Espera a que fuentes, imágenes y MathJax estén listos antes de copiar el contenido.
            if(document.fonts?.ready) {
                try { await document.fonts.ready; } catch(_) {}
            }
            if(window.MathJax?.startup?.promise) {
                try { await window.MathJax.startup.promise; } catch(_) {}
            }

            const imagenes = [...elemento.querySelectorAll('img')];
            await Promise.all(imagenes.map(img => new Promise(resolve => {
                if(img.complete) {
                    if(typeof img.decode === 'function') img.decode().catch(() => {}).finally(resolve);
                    else resolve();
                    return;
                }
                const terminar = () => resolve();
                img.addEventListener('load', terminar, { once:true });
                img.addEventListener('error', terminar, { once:true });
                setTimeout(terminar, 3000);
            })));

            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

            // Trabajamos SIEMPRE sobre una copia. La vista del estudiante no se modifica.
            const contenido = elemento.cloneNode(true);
            contenido.id = "print-root";

            // Elimina las capas invisibles de MathJax que pueden duplicar fórmulas al imprimir.
            contenido.querySelectorAll(
                'mjx-assistive-mml, .MJX_Assistive_MathML'
            ).forEach(el => el.remove());
            contenido.querySelectorAll('mjx-container [aria-hidden="true"] math').forEach(el => el.remove());

            // Limpieza específica para contenido pegado/editado:
            // Word, navegadores y editores suelen dejar alturas, márgenes y saltos enormes.
            // Aquí se eliminan SOLO en la copia de impresión.
            const bloquesNormalizables = contenido.querySelectorAll(
                'p, div, section, article, header, footer, aside, blockquote, ul, ol, li, h1, h2, h3, h4, h5, h6, figure'
            );

            bloquesNormalizables.forEach(el => {
                [
                    'height', 'min-height', 'max-height',
                    'margin-top', 'margin-bottom',
                    'padding-top', 'padding-bottom',
                    'break-before', 'break-after', 'break-inside',
                    'page-break-before', 'page-break-after', 'page-break-inside'
                ].forEach(prop => el.style.removeProperty(prop));

                // Evita que posiciones heredadas saquen elementos de su flujo natural.
                const pos = String(el.style.position || '').toLowerCase();
                if(['absolute', 'fixed', 'sticky'].includes(pos)) {
                    el.style.removeProperty('position');
                    el.style.removeProperty('top');
                    el.style.removeProperty('bottom');
                    el.style.removeProperty('left');
                    el.style.removeProperty('right');
                }
            });

            // Quita párrafos/divs vacíos usados como "espaciadores".
            // Conserva cualquier bloque que contenga una imagen, tabla, fórmula u otro contenido real.
            [...contenido.querySelectorAll('p, div')].forEach(el => {
                const tieneContenidoVisual = el.querySelector(
                    'img, svg, table, figure, video, iframe, mjx-container, math, hr'
                );
                const texto = (el.textContent || '')
                    .replace(/\u00a0/g, ' ')
                    .replace(/\s+/g, '')
                    .trim();

                const soloSaltos = !texto &&
                    !tieneContenidoVisual &&
                    [...el.childNodes].every(n =>
                        n.nodeType === Node.TEXT_NODE ||
                        (n.nodeType === Node.ELEMENT_NODE && ['BR', 'SPAN'].includes(n.nodeName))
                    );

                if(soloSaltos) el.remove();
            });

            // Reduce secuencias de <br> repetidos dentro de bloques.
            contenido.querySelectorAll('p, div, blockquote, li').forEach(el => {
                let brPrevio = false;
                [...el.childNodes].forEach(n => {
                    if(n.nodeType === Node.ELEMENT_NODE && n.nodeName === 'BR') {
                        if(brPrevio) n.remove();
                        brPrevio = true;
                    } else if(
                        n.nodeType === Node.TEXT_NODE &&
                        !(n.textContent || '').trim()
                    ) {
                        // Los nodos de texto vacíos no reinician la secuencia.
                    } else {
                        brPrevio = false;
                    }
                });
            });

            // Documento de impresión independiente: el layout del aula no interviene.
            const estilosPagina = [...document.head.querySelectorAll('style, link[rel="stylesheet"]')]
                .map(nodo => nodo.outerHTML)
                .join('\n');

            iframeImpresion = document.createElement('iframe');
            iframeImpresion.setAttribute('aria-hidden', 'true');
            iframeImpresion.tabIndex = -1;
            iframeImpresion.style.position = 'fixed';
            iframeImpresion.style.right = '0';
            iframeImpresion.style.bottom = '0';
            iframeImpresion.style.width = '1px';
            iframeImpresion.style.height = '1px';
            iframeImpresion.style.border = '0';
            iframeImpresion.style.opacity = '0';
            iframeImpresion.style.pointerEvents = 'none';
            document.body.appendChild(iframeImpresion);

            const docPrint = iframeImpresion.contentDocument;
            docPrint.open();
            docPrint.write(`<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${estilosPagina}
<style>
    @page {
        size: letter portrait;
        margin: 12mm 14mm 13mm 14mm;
    }

    html, body {
        margin: 0 !important;
        padding: 0 !important;
        width: auto !important;
        height: auto !important;
        min-height: 0 !important;
        background: #fff !important;
        overflow: visible !important;
    }

    body {
        color: #111827 !important;
        font-size: 11.5pt !important;
        line-height: 1.48 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
    }

    #print-root {
        display: block !important;
        position: static !important;
        width: 100% !important;
        max-width: none !important;
        height: auto !important;
        min-height: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: visible !important;
        background: #fff !important;
        color: #111827 !important;
        box-shadow: none !important;
        border: 0 !important;
        transform: none !important;
    }

    /* Regla clave: no heredamos alturas ni espacios verticales exagerados del editor. */
    #print-root p {
        margin: 0 0 7px !important;
        padding: 0 !important;
        min-height: 0 !important;
        height: auto !important;
        line-height: 1.48 !important;
        orphans: 2;
        widows: 2;
    }

    #print-root h1,
    #print-root h2,
    #print-root h3,
    #print-root h4,
    #print-root h5,
    #print-root h6 {
        margin: 13px 0 6px !important;
        padding: 0 !important;
        min-height: 0 !important;
        height: auto !important;
        line-height: 1.25 !important;
        break-after: avoid-page !important;
        page-break-after: avoid !important;
    }

    #print-root ul,
    #print-root ol {
        margin: 5px 0 8px 22px !important;
        padding: 0 !important;
        min-height: 0 !important;
        height: auto !important;
    }

    #print-root li {
        margin: 0 0 3px !important;
        padding: 0 !important;
        min-height: 0 !important;
        height: auto !important;
        line-height: 1.45 !important;
    }

    #print-root blockquote {
        margin: 8px 0 8px 14px !important;
        padding: 4px 0 4px 12px !important;
        min-height: 0 !important;
        height: auto !important;
    }

    #print-root div,
    #print-root section,
    #print-root article {
        min-height: 0 !important;
        max-height: none !important;
        height: auto !important;
        margin-top: 0 !important;
        margin-bottom: 0 !important;
        padding-top: 0 !important;
        padding-bottom: 0 !important;
        break-before: auto !important;
        break-after: auto !important;
        break-inside: auto !important;
        page-break-before: auto !important;
        page-break-after: auto !important;
        page-break-inside: auto !important;
    }

    /* Solo los objetos que verdaderamente conviene mantener enteros evitan cortes. */
    #print-root img,
    #print-root figure,
    #print-root tr,
    #print-root mjx-container[display="true"] {
        break-inside: avoid-page !important;
        page-break-inside: avoid !important;
    }

    #print-root figure {
        margin: 9px auto !important;
        padding: 0 !important;
        max-width: 100% !important;
        height: auto !important;
    }

    #print-root img {
        max-width: 100% !important;
        height: auto !important;
    }

    #print-root table {
        width: 100% !important;
        max-width: 100% !important;
        table-layout: auto !important;
        margin: 8px 0 !important;
        break-inside: auto !important;
        page-break-inside: auto !important;
    }

    #print-root mjx-container {
        max-width: 100% !important;
        margin-top: 6px !important;
        margin-bottom: 6px !important;
    }

    #print-root pre,
    #print-root code {
        white-space: pre-wrap !important;
        overflow-wrap: anywhere !important;
    }

    #print-root a {
        color: inherit !important;
        text-decoration: none !important;
    }

    #print-root *,
    #print-root *::before,
    #print-root *::after {
        animation: none !important;
        transition: none !important;
    }
</style>
</head>
<body>
${contenido.outerHTML}
</body>
</html>`);
            docPrint.close();

            if(docPrint.fonts?.ready) {
                try { await docPrint.fonts.ready; } catch(_) {}
            }

            const imgsPrint = [...docPrint.images];
            await Promise.all(imgsPrint.map(img => new Promise(resolve => {
                if(img.complete) return resolve();
                img.addEventListener('load', resolve, { once:true });
                img.addEventListener('error', resolve, { once:true });
                setTimeout(resolve, 3000);
            })));

            await new Promise(resolve => setTimeout(resolve, 180));

            const winPrint = iframeImpresion.contentWindow;
            winPrint.focus();
            winPrint.print();
        } catch(err) {
            console.error("Error preparando impresión del resumen:", err);
            alert("No se pudo preparar el PDF. Intenta nuevamente.");
        } finally {
            setTimeout(() => iframeImpresion?.remove(), 1200);

            if(boton) {
                boton.disabled = false;
                boton.innerHTML = textoBoton;
            }
        }
    });

    // ==========================================
    // ADMINISTRADOR: GESTIÓN DE ESTRUCTURA
    // ==========================================
    
    document.getElementById('btn-crear-materia')?.addEventListener('click', async () => {
        const nombre = document.getElementById('admin-nueva-materia').value.trim();
        if(!nombre) return alert("Escribe el nombre de la materia.");
        try {
            const orden = await obtenerSiguienteOrden('materias');
            await addDoc(collection(db, "materias"), { nombre, orden, fecha_creacion: new Date().toISOString() });
            document.getElementById('admin-nueva-materia').value = "";
            cargarDatosAdmin();
            cargarEstructuraGlobal();
            alert("Materia creada con éxito.");
        } catch(e) { alert("Error: " + e.message); }
    });

    document.getElementById('btn-crear-modulo')?.addEventListener('click', async () => {
        const materia_id = document.getElementById('admin-select-materia-modulo').value;
        const nombre = document.getElementById('admin-nuevo-modulo').value.trim();
        const archivo_eval = document.getElementById('admin-nuevo-modulo-eval').value.trim();
        
        if(!materia_id || !nombre) return alert("Selecciona la materia y escribe el nombre del módulo.");
        try {
            const orden = await obtenerSiguienteOrden('modulos', 'materia_id', materia_id);
            await addDoc(collection(db, "modulos"), { materia_id, nombre, orden, archivo_evaluacion: archivo_eval, fecha_creacion: new Date().toISOString() });
            document.getElementById('admin-nuevo-modulo').value = "";
            document.getElementById('admin-nuevo-modulo-eval').value = "";
            cargarDatosAdmin();
            cargarEstructuraGlobal();
            alert("Módulo creado con éxito.");
        } catch(e) { alert("Error: " + e.message); }
    });

    document.getElementById('admin-tema-materia')?.addEventListener('change', async (e) => {
        await cargarModulosAdmin(e.target.value);
    });

    document.getElementById('btn-admin-guardar-tema')?.addEventListener('click', async () => {
        const materia_id = document.getElementById('admin-tema-materia').value;
        const modulo_id = document.getElementById('admin-tema-modulo').value;
        const titulo = document.getElementById('admin-tema-titulo').value.trim();
        syncEditorToTextarea();
        const resumen_teorico = document.getElementById('admin-tema-resumen').value.trim();
        const lecturasRaw = document.getElementById('admin-tema-lecturas').value;
        const videosRaw = document.getElementById('admin-tema-videos').value;
        const video_laboratorio = document.getElementById('admin-tema-laboratorio').value.trim();
        const imagenesRaw = document.getElementById('admin-tema-imagenes').value;
        const status = document.getElementById('admin-status');

        if(!materia_id || !modulo_id || !titulo) return alert("Selecciona materia, módulo e ingresa el título del tema.");
        if(!resumen_teorico) return alert("Escribe el resumen o contenido del tema en el editor visual.");

        status.style.color = "var(--primary-light)";
        status.innerHTML = "<i class='fas fa-spinner fa-spin'></i> Guardando tema...";

        try {
            const parseLinks = (txt) => txt.split('\n').filter(l => l.includes('http')).map(l => {
                const match = l.match(/(https?:\/\/\S+)/i);
                if(!match) return null;
                const url = match[1].trim();
                let title = l.replace(url, '').replace(/^[\d\.\-\*]*\s*/, '').replace(/:\s*$/, '').trim();
                return { titulo: title || "Enlace sugerido", url };
            }).filter(Boolean);

            const parseSimpleList = (txt) => txt.split('\n').map(l => l.trim()).filter(l => l.length > 0);

            const payload = {
                materia_id, modulo_id, titulo,
                resumen_teorico,
                lecturas_recomendadas: parseLinks(lecturasRaw),
                videos_recomendados: parseSimpleList(videosRaw),
                imagenes: parseSimpleList(imagenesRaw),
                video_laboratorio,
                fecha_actualizacion: new Date().toISOString()
            };

            if(temaEditandoId) {
                await setDoc(doc(db, "temas_globales", temaEditandoId), payload, { merge: true });
                status.style.color = "var(--success)";
                status.innerHTML = "✅ Tema actualizado con éxito.";
            } else {
                payload.fecha_creacion = new Date().toISOString();
                payload.orden = await obtenerSiguienteOrden('temas_globales', 'modulo_id', modulo_id);
                await addDoc(collection(db, "temas_globales"), payload);
                status.style.color = "var(--success)";
                status.innerHTML = "✅ Tema publicado con éxito.";
            }

            limpiarFormularioTemaAdmin();
            cargarDatosAdmin();
            cargarEstructuraGlobal();
        } catch(e) {
            status.style.color = "var(--danger)";
            status.innerHTML = "❌ Error: " + e.message;
        } finally {
            setTimeout(() => {
                if(!temaEditandoId && status.textContent.includes('éxito')) status.innerHTML = "";
            }, 5000);
        }
    });

    document.getElementById('btn-admin-agregar-alumno')?.addEventListener('click', async () => {
        const nombre = document.getElementById('admin-nuevo-alumno-nombre')?.value.trim() || '';
        const email = document.getElementById('admin-nuevo-alumno-email').value.trim().toLowerCase();
        if(!nombre) return alert("Escribe el nombre del estudiante.");
        if(!email) return alert("Escribe un correo válido.");
        try {
            await setDoc(doc(db, "alumnos_autorizados", email), {
                email,
                nombre,
                fecha: new Date().toISOString()
            }, { merge: true });
            document.getElementById('admin-nuevo-alumno-nombre').value = "";
            document.getElementById('admin-nuevo-alumno-email').value = "";
            alert("Alumno autorizado correctamente.");
            cargarDatosAdmin();
        } catch(e) { alert("Error: " + e.message); }
    });

    // ==========================================
    // SIMULADOR: REDIRECCIÓN AL ARCHIVO EXTERNO
    // ==========================================
    document.getElementById('btn-generar-simulador')?.addEventListener('click', () => {
        if(temaActualInfo && materiaSeleccionada) {
            const url = `simuladores.html?temaId=${temaActualInfo.id}&materiaId=${materiaSeleccionada.id}`;
            window.open(url, '_blank');
        } else {
            alert("Error: Por favor seleccione un tema válido primero.");
        }
    });

    document.getElementById('btn-enviar-quiz')?.addEventListener('click', async () => {
        let puntaje = 0;
        quizActivo.forEach((p, index) => {
            const sel = document.querySelector(`input[name="q${index}"]:checked`);
            const divExp = document.getElementById(`exp-q${index}`);
            if(divExp) divExp.classList.remove('hidden');
            if(sel && parseInt(sel.value) === p.respuesta_correcta) puntaje++;
        });

        const resDiv = document.getElementById('quiz-resultado');
        resDiv.innerHTML = `<h3>Puntaje Obtenido</h3><p style="font-size: 36px; font-weight: 800; color: var(--primary-light); margin:0;">${puntaje} / ${quizActivo.length}</p>`;
        resDiv.classList.remove('hidden');
        document.getElementById('btn-enviar-quiz').classList.add('hidden');

        await setDoc(doc(db, "usuarios", usuarioActual.uid, "progreso_temas", temaActualInfo.id), {
            status: "green", timestamp: new Date().toISOString()
        }, { merge: true });

        // Deja preparada una animación de avance para cuando el estudiante vuelva al módulo.
        if(moduloSeleccionado?.id && temaActualInfo?.id) {
            sessionStorage.setItem('pendingTrackAnimation', JSON.stringify({
                uid: usuarioActual.uid,
                moduleId: moduloSeleccionado.id,
                topicId: temaActualInfo.id,
                timestamp: Date.now()
            }));
        }

        fetch(`https://formsubmit.co/ajax/${CORREO_FORMSUBMIT}`, {
            method: "POST", headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ _subject: `Evaluación Completada - ${usuarioActual.email}`, usuario: usuarioActual.email, tema: temaActualInfo.titulo, resultado: `${puntaje}/${quizActivo.length}` })
        }).catch(() => {});
    });

});

// ==========================================
// ESTADO DE AUTENTICACIÓN
// ==========================================
onAuthStateChanged(auth, async (user) => {
    if(user) {
        const esAdmin = user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
        let nombreVisible = "593 TucaminoalaU";

        if(!esAdmin) {
            const authSnap = await getDoc(doc(db, "alumnos_autorizados", user.email.toLowerCase()));
            if(!authSnap.exists()) {
                const errBox = document.getElementById('login-error');
                if(errBox) { errBox.innerHTML = `El correo <b>${user.email}</b> no está autorizado. Contacta a tu docente.`; errBox.classList.remove('hidden'); }
                await signOut(auth); return;
            }

            const datosAlumno = authSnap.data() || {};
            nombreVisible = String(datosAlumno.nombre || user.displayName || user.email.split('@')[0] || 'Estudiante').trim();

            if(datosAlumno.uid !== user.uid) {
                setDoc(doc(db, "alumnos_autorizados", user.email.toLowerCase()), {
                    uid: user.uid,
                    ultimo_acceso: new Date().toISOString()
                }, { merge: true }).catch(err => console.warn("No se pudo asociar UID del alumno:", err));
            }
        }

        usuarioActual = user;
        const userDisplay = document.getElementById('user-display-name');
        if(userDisplay) {
            userDisplay.textContent = nombreVisible;
            userDisplay.title = esAdmin ? "Administrador" : user.email;
        }
        document.getElementById('sidebar').classList.remove('hidden');
        document.getElementById('top-navbar').classList.remove('hidden');

        const btnAdmin = document.getElementById('btn-ir-admin');
        if(esAdmin) btnAdmin?.classList.remove('hidden');
        else btnAdmin?.classList.add('hidden');

        cargarEstructuraGlobal();
        mostrarVista('view-inicio');
    } else {
        usuarioActual = null;
        document.getElementById('sidebar').classList.add('hidden');
        document.getElementById('top-navbar').classList.add('hidden');
        mostrarVista('view-login');
    }
});

// ==========================================
// RENDERIZADO DINÁMICO
// ==========================================
async function cargarEstructuraGlobal() {
    const cont = document.getElementById('sidebar-dynamic-content');
    cont.innerHTML = "<div style='padding:15px; color:#94A3B8; font-size:12px;'>Cargando estructura...</div>";

    const [snapMat, snapMod, snapTem] = await Promise.all([
        getDocs(collection(db, "materias")),
        getDocs(collection(db, "modulos")),
        getDocs(collection(db, "temas_globales"))
    ]);

    let materias = []; snapMat.forEach(d => materias.push({id: d.id, ...d.data()}));
    let modulos = []; snapMod.forEach(d => modulos.push({id: d.id, ...d.data()}));
    let temas = []; snapTem.forEach(d => temas.push({id: d.id, ...d.data()}));

    materias = ordenarPorOrden(materias, 'nombre');
    modulos = ordenarPorOrden(modulos, 'nombre');
    temas = ordenarPorOrden(temas, 'titulo');

    let html = "";
    materias.forEach(mat => {
        const idArbolMat = `tree-mat-${mat.id}`;
        // Hacemos que la Materia sea cliqueable para abrir la nueva vista de Módulos (Plan de Vuelo)
        const safeMatNombre = (mat.nombre || "").replace(/'/g, "\\'");
        
        html += `
            <div class="tree-subject">
                <div class="tree-subject-header" onclick="toggleTreeNode('${idArbolMat}'); cargarMateria('${mat.id}', '${safeMatNombre}')">
                    <span style="flex:1;"><i class="fas fa-book" style="margin-right:8px;"></i> ${mat.nombre}</span>
                    <i class="fas fa-chevron-down" style="font-size: 12px; padding: 5px;"></i>
                </div>
                <div class="tree-modulos" id="${idArbolMat}">
        `;
        
        const modulosMat = modulos.filter(m => m.materia_id === mat.id);
        if(modulosMat.length === 0) html += `<div style="font-size:11px; color:#64748B; padding:5px 15px;">Sin módulos</div>`;

        modulosMat.forEach(mod => {
            const idArbolMod = `tree-mod-${mod.id}`;
            const evalArchivo = mod.archivo_evaluacion || "";
            
            const safeModNombre = (mod.nombre || "").replace(/'/g, "\\'");

            html += `
                <div class="tree-modulo-header" onclick="toggleTreeNode('${idArbolMod}'); cargarModulo('${mod.id}', '${safeModNombre}', '${mat.id}', '${safeMatNombre}', '${evalArchivo}')">
                    <i class="fas fa-layer-group" style="margin-right:5px;"></i> ${mod.nombre}
                </div>
                <div class="tree-topics" id="${idArbolMod}">
            `;
            const temasMod = temas.filter(t => t.modulo_id === mod.id);
            if(temasMod.length === 0) html += `<div style="font-size:11px; color:#64748B; padding:5px 15px;">Sin temas</div>`;
            temasMod.forEach(t => {
                html += `<a class="tree-topic-item" onclick="abrirTema('${t.id}', '${mat.id}', '${safeMatNombre}', '${safeModNombre}')">• ${t.titulo}</a>`;
            });
            html += `</div>`;
        });
        html += `</div></div>`;
    });

    cont.innerHTML = html;
}

// ==========================================
// NUEVA FUNCIÓN: CARGAR MATERIA Y MOSTRAR PROGRESO DE MÓDULOS (AVIONES)
// ==========================================
window.cargarMateria = async function(materiaId, materiaNombre) {
    materiaSeleccionada = { id: materiaId, nombre: materiaNombre };
    
    document.getElementById('materia-titulo').textContent = materiaNombre;
    actualizarRuta(materiaNombre, null, null);
    mostrarVista('view-materia');

    const container = document.getElementById('materia-modulos-container');
    container.innerHTML = "<p style='color: var(--text-light); text-align:center;'><i class='fas fa-spinner fa-spin'></i> Preparando plan de vuelo...</p>";

    const [snapMod, snapTem, snapProg, snapProgMod] = await Promise.all([
        getDocs(query(collection(db, "modulos"), where("materia_id", "==", materiaId))),
        getDocs(collection(db, "temas_globales")),
        getDocs(collection(db, "usuarios", usuarioActual.uid, "progreso_temas")),
        getDocs(collection(db, "usuarios", usuarioActual.uid, "progreso_modulos"))
    ]);

    let modulos = []; snapMod.forEach(d => modulos.push({id: d.id, ...d.data()}));
    let temas = []; snapTem.forEach(d => temas.push({id: d.id, ...d.data()}));
    modulos = ordenarPorOrden(modulos, 'nombre');
    temas = ordenarPorOrden(temas, 'titulo');
    let mapaProgreso = {}; snapProg.forEach(d => mapaProgreso[d.id] = d.data().status);
    let mapaProgresoModulos = {}; snapProgMod.forEach(d => mapaProgresoModulos[d.id] = d.data() || {});

    if(modulos.length === 0) {
        container.innerHTML = `<p style="color:var(--text-light); font-size:15px; text-align:center;">Aún no se han asignado módulos a esta materia.</p>`;
        return;
    }

    // Calcular el estatus de cada MÓDULO en base a sus TEMAS
    let modulosEstado = modulos.map(mod => {
        let temasModulo = temas.filter(t => t.modulo_id === mod.id);
        if(temasModulo.length === 0) return { ...mod, status: 'red' }; // Si no hay temas, está rojo/pendiente
        
        let allGreen = true;
        let anyProgress = false;
        
        temasModulo.forEach(t => {
            let st = mapaProgreso[t.id] || 'red';
            if(st !== 'green') allGreen = false;
            if(st === 'green' || st === 'yellow') anyProgress = true;
        });
        
        const requiereEvaluacion = Boolean(String(mod.archivo_evaluacion || '').trim());
        const evaluacionCompletada = mapaProgresoModulos[mod.id]?.evaluacion_completada === true;

        let status = 'red';
        if(allGreen && (!requiereEvaluacion || evaluacionCompletada)) status = 'green';
        else if(anyProgress || allGreen) status = 'yellow';

        return { ...mod, status, evaluacionCompletada };
    });

    let indexActual = -1;
    for (let i = 0; i < modulosEstado.length; i++) {
        if (modulosEstado[i].status !== 'green') {
            indexActual = i; break;
        }
    }
    if (indexActual === -1 && modulosEstado.length > 0) indexActual = modulosEstado.length - 1;

    let html = `<div class="pista-container pista-materia">`;
    
    modulosEstado.forEach((mod, index) => {
        const st = mod.status;
        const bgClass = st === 'green' ? 'estado-verde' : (st === 'yellow' ? 'estado-amarillo' : 'estado-rojo');
        
        // El avión sustituye al coche para darle ese estilo "Grande / Nivel módulo"
        const avionHtml = (index === indexActual) ? `<div class="coche avion">✈️</div>` : '';
        
        const safeMatNombre = (materiaNombre || "").replace(/'/g, "\\'");
        const safeModNombre = (mod.nombre || "").replace(/'/g, "\\'");
        const safeEval = mod.archivo_evaluacion || "";

        html += `<div class="pista-estacion" style="cursor:pointer; min-width:160px;" onclick="cargarModulo('${mod.id}', '${safeModNombre}', '${materiaId}', '${safeMatNombre}', '${safeEval}')">
            ${avionHtml}
            <div class="info-tema ${bgClass}" style="font-size: 16px; padding: 20px; border-width: 5px; box-shadow: 0 8px 20px rgba(0,0,0,0.3);">${mod.nombre}</div>
        </div>`;
    });
    
    html += `<div class="meta-bandera"><span>🌍</span><div style="margin-top: 5px;">MUNDO</div></div></div>`;
    container.innerHTML = html;
}

window.cargarModulo = async function(moduloId, moduloNombre, materiaId, materiaNombre, archivoEval) {
    materiaSeleccionada = { id: materiaId, nombre: materiaNombre };
    moduloSeleccionado = { id: moduloId, nombre: moduloNombre, materiaId, materiaNombre, evaluacion: archivoEval };

    document.getElementById('modulo-titulo').textContent = moduloNombre;
    actualizarRuta(materiaNombre, moduloNombre, null);
    mostrarVista('view-modulo');

    const container = document.getElementById('modulo-temas-container');
    container.innerHTML = "<p style='color: var(--text-light);'><i class='fas fa-spinner fa-spin'></i> Preparando tu pista...</p>";

    const [snapTem, snapProg, snapProgModulo] = await Promise.all([
        getDocs(query(collection(db, "temas_globales"), where("modulo_id", "==", moduloId))),
        getDocs(collection(db, "usuarios", usuarioActual.uid, "progreso_temas")),
        getDoc(doc(db, "usuarios", usuarioActual.uid, "progreso_modulos", moduloId))
    ]);

    let temas = []; snapTem.forEach(d => temas.push({id: d.id, ...d.data()}));
    temas = ordenarPorOrden(temas, 'titulo');
    let mapaProgreso = {}; snapProg.forEach(d => mapaProgreso[d.id] = d.data().status);
    const tieneEvaluacion = Boolean(String(archivoEval || '').trim());
    const evaluacionCompletada = snapProgModulo.exists() && snapProgModulo.data()?.evaluacion_completada === true;

    if(temas.length === 0) {
        container.innerHTML = `<div class="instruction-card" style="text-align:center;"><i class="fas fa-road" style="font-size:28px;color:#94A3B8;"></i><p style="color:var(--text-light); font-size:14px; margin-bottom:0;">No hay estaciones en esta pista aún.</p></div>`;
        return;
    }

    const todosCompletados = temas.every(t => (mapaProgreso[t.id] || 'red') === 'green');

    let indexActual;
    if(!todosCompletados) {
        indexActual = temas.findIndex(t => (mapaProgreso[t.id] || 'red') !== 'green');
    } else if(tieneEvaluacion && !evaluacionCompletada) {
        indexActual = temas.length;
    } else {
        indexActual = temas.length + (tieneEvaluacion ? 1 : 0);
    }

    // Determina si debe mostrarse el avance animado del carrito al regresar del tema.
    let pending = null;
    try { pending = JSON.parse(sessionStorage.getItem('pendingTrackAnimation') || 'null'); } catch(_) {}
    if(pending && (pending.uid !== usuarioActual.uid || Date.now() - (pending.timestamp || 0) > 1000 * 60 * 60 * 6)) pending = null;

    let temaOrigenId = null;
    if(pending?.moduleId === moduloId) temaOrigenId = pending.topicId;
    else if(temaActualInfo?.modulo_id === moduloId) temaOrigenId = temaActualInfo.id;

    const indexOrigen = temaOrigenId ? temas.findIndex(t => t.id === temaOrigenId) : -1;
    const keyAnimada = `lastTrackAnimation:${usuarioActual.uid}:${moduloId}`;
    const yaAnimada = sessionStorage.getItem(keyAnimada);
    const completadoOrigen = indexOrigen >= 0 && (mapaProgreso[temaOrigenId] || 'red') === 'green';
    const debeAnimar = completadoOrigen && indexActual > indexOrigen && (pending?.moduleId === moduloId || yaAnimada !== temaOrigenId);
    const distancia = Math.max(1, indexActual - Math.max(indexOrigen, 0)) * 190;

    let html = `<div class="pista-container">`;
    temas.forEach((t, index) => {
        const st = mapaProgreso[t.id] || "red";
        const bgClass = st === 'green' ? 'estado-verde' : (st === 'yellow' ? 'estado-amarillo' : 'estado-rojo');
        const esActual = index === indexActual;
        const claseMovimiento = esActual && debeAnimar ? ' coche-avanza' : '';
        const estiloDistancia = esActual && debeAnimar ? ` style="--car-distance:-${distancia}px"` : '';
        const cocheHtml = esActual ? `<div class="coche${claseMovimiento}"${estiloDistancia}>🏎️</div>` : '';

        const safeMatNombre = (materiaNombre || "").replace(/'/g, "\\'");
        const safeModNombre = (moduloNombre || "").replace(/'/g, "\\'");

        html += `<div class="pista-estacion" style="cursor:pointer;" data-topic-id="${t.id}" onclick="abrirTema('${t.id}', '${materiaId}', '${safeMatNombre}', '${safeModNombre}')">${cocheHtml}<div class="info-tema ${bgClass}">${t.titulo}</div></div>`;
    });

    if(tieneEvaluacion) {
        const evalEsActual = indexActual === temas.length;
        const evalCar = evalEsActual
            ? `<div class="coche${debeAnimar ? ' coche-avanza' : ''}"${debeAnimar ? ` style="--car-distance:-${distancia}px"` : ''}>🏎️</div>`
            : '';
        const evalCodificada = encodeURIComponent(archivoEval);
        const evalBloqueada = !todosCompletados;
        const evalStyle = evaluacionCompletada
            ? 'background:linear-gradient(135deg,#10B981,#059669); border-color:#047857; color:white;'
            : (evalBloqueada
                ? 'background:linear-gradient(135deg,#94A3B8,#64748B); border-color:#475569; color:white; opacity:.72;'
                : 'background:linear-gradient(135deg,#1E3A8A,#2563EB); border-color:#60A5FA; color:white;');
        const evalClick = evalBloqueada ? '' : `onclick="abrirEvaluacionModulo('${moduloId}', '${evalCodificada}')"`;
        const evalCursor = evalBloqueada ? 'cursor:not-allowed;' : 'cursor:pointer;';
        const evalTexto = evaluacionCompletada ? '✅ Evaluación General' : (evalBloqueada ? '🔒 Evaluación General' : '📝 Evaluación General');

        html += `<div class="pista-estacion" data-eval-station="true" ${evalClick} style="${evalCursor}">
                ${evalCar}
                <div class="info-tema" style="${evalStyle}">${evalTexto}</div>
            </div>`;
    }

    const metaIndex = temas.length + (tieneEvaluacion ? 1 : 0);
    const metaCar = indexActual === metaIndex
        ? `<div class="coche${debeAnimar ? ' coche-avanza' : ''}"${debeAnimar ? ` style="--car-distance:-${distancia}px"` : ''}>🏎️</div>`
        : '';
    html += `<div class="meta-bandera">${metaCar}<span>🏁</span><div style="margin-top:5px;">META</div></div></div>`;
    container.innerHTML = html;

    if(debeAnimar) {
        sessionStorage.setItem(keyAnimada, temaOrigenId);
        if(pending?.moduleId === moduloId) sessionStorage.removeItem('pendingTrackAnimation');
        requestAnimationFrame(() => {
            const destino = indexActual < temas.length
                ? container.querySelector(`[data-topic-id="${temas[indexActual].id}"]`)
                : (tieneEvaluacion && indexActual === temas.length
                    ? container.querySelector('[data-eval-station="true"]')
                    : container.querySelector('.meta-bandera'));
            destino?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        });
    } else if(pending?.moduleId === moduloId) {
        sessionStorage.removeItem('pendingTrackAnimation');
    }
}

window.abrirEvaluacionModulo = async function(moduloId, urlCodificada) {
    let url = "";
    try { url = decodeURIComponent(urlCodificada || ""); } catch(_) { url = urlCodificada || ""; }
    if(!url) return;

    window.open(url, '_blank', 'noopener,noreferrer');

    try {
        await setDoc(doc(db, "usuarios", usuarioActual.uid, "progreso_modulos", moduloId), {
            evaluacion_completada: true,
            fecha_evaluacion: new Date().toISOString()
        }, { merge: true });

        if(moduloSeleccionado?.id === moduloId) {
            await window.cargarModulo(
                moduloSeleccionado.id,
                moduloSeleccionado.nombre,
                moduloSeleccionado.materiaId,
                moduloSeleccionado.materiaNombre,
                moduloSeleccionado.evaluacion
            );
        }
    } catch(err) {
        console.error("No se pudo registrar la evaluación del módulo:", err);
        alert("La evaluación se abrió, pero no se pudo registrar el avance del módulo. Revisa tu conexión e inténtalo nuevamente.");
    }
};

window.abrirTema = async function(temaId, matId, matNombre, modNombre) {
    try {
        materiaSeleccionada = { id: matId, nombre: matNombre };
        const docSnap = await getDoc(doc(db, "temas_globales", temaId));
        if(!docSnap.exists()) return;

        const data = docSnap.data();
        temaActualInfo = { id: temaId, ...data };

        // Si el tema se abrió directamente desde el árbol lateral, reconstruye el módulo actual
        // para que el botón global de regreso mantenga correctamente el flujo hacia el módulo.
        if(data.modulo_id && (!moduloSeleccionado || moduloSeleccionado.id !== data.modulo_id)) {
            const modSnap = await getDoc(doc(db, "modulos", data.modulo_id));
            const modData = modSnap.exists() ? modSnap.data() : {};
            moduloSeleccionado = {
                id: data.modulo_id,
                nombre: modNombre || modData.nombre || "Módulo",
                materiaId: matId,
                materiaNombre: matNombre,
                evaluacion: modData.archivo_evaluacion || ""
            };
        }

        document.getElementById('tema-titulo').textContent = data.titulo;
        actualizarRuta(matNombre, modNombre, data.titulo);

        const progRef = doc(db, "usuarios", usuarioActual.uid, "progreso_temas", temaId);
        const progSnap = await getDoc(progRef);
        if(!progSnap.exists() || progSnap.data().status === 'red') {
            await setDoc(progRef, { status: 'yellow', last_accessed: new Date().toISOString() }, { merge: true });
        }

        if(typeof window.volverRecursos === 'function') {
            window.volverRecursos();
        }

        const resBox = document.getElementById('tema-resumen');
        if (resBox) {
            resBox.innerHTML = typeof marked !== 'undefined' ? marked.parse(data.resumen_teorico || "") : data.resumen_teorico;
            if(window.MathJax?.typesetPromise) {
                // Renderiza las fórmulas UNA sola vez al cargar el tema y espera a que
                // terminen antes de mostrar la vista. Así el PDF solo captura la salida final.
                try {
                    await MathJax.typesetPromise([resBox]);
                } catch(err) {
                    console.log('Error renderizando LaTeX:', err);
                }
            }
        }

        const lecList = document.getElementById('tema-lecturas-list');
        if (lecList) {
            lecList.innerHTML = (Array.isArray(data.lecturas_recomendadas) && data.lecturas_recomendadas.length) ? 
                data.lecturas_recomendadas.map((l, idx) => `<a href="${l.url}" target="_blank" class="enlace-lectura">Lectura ${idx + 1}: ${l.titulo}</a>`).join('') : "<p style='color:var(--text-light)'>No hay lecturas asignadas.</p>";
        }

        const vidList = document.getElementById('tema-videos-list');
        if (vidList) {
            if (Array.isArray(data.videos_recomendados) && data.videos_recomendados.length) {
                vidList.innerHTML = data.videos_recomendados.map(vUrl => {
                    let embedUrl = vUrl;
                    if(vUrl.includes("youtube.com/watch?v=")) embedUrl = vUrl.replace("watch?v=", "embed/").split('&')[0];
                    else if(vUrl.includes("youtu.be/")) embedUrl = vUrl.replace("youtu.be/", "youtube.com/embed/").split('?')[0];
                    
                    return `<iframe width="320" height="190" src="${embedUrl}" title="Video" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="border-radius:10px; box-shadow: 0 5px 15px rgba(0,0,0,0.1);"></iframe>`;
                }).join('');
            } else {
                vidList.innerHTML = "<p style='color:var(--text-light)'>No hay videos asignados.</p>";
            }
        }

        const secLab = document.getElementById('seccion-laboratorio');
        if (secLab) {
            const matNormalizada = (matNombre || "").trim().toUpperCase();
            if ((matNormalizada === "QUÍMICA" || matNormalizada === "QUIMICA") && data.video_laboratorio) {
                secLab.classList.remove('hidden');
                
                let embedLabUrl = data.video_laboratorio;
                if(embedLabUrl.includes("youtube.com/watch?v=")) embedLabUrl = embedLabUrl.replace("watch?v=", "embed/").split('&')[0];
                else if(embedLabUrl.includes("youtu.be/")) embedLabUrl = embedLabUrl.replace("youtu.be/", "youtube.com/embed/").split('?')[0];
                
                document.getElementById('contenedor-video-laboratorio').innerHTML = `<iframe width="100%" height="315" src="${embedLabUrl}" title="Video de Laboratorio" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="border-radius:10px; box-shadow: 0 5px 15px rgba(0,0,0,0.1); max-width: 560px;"></iframe>`;
            } else {
                secLab.classList.add('hidden');
            }
        }

        const imgList = document.getElementById('tema-imagenes-list');
        if (imgList) {
            if (Array.isArray(data.imagenes) && data.imagenes.length) {
                imgList.innerHTML = data.imagenes.map(img => `<img src="imagenes/${img}" style="max-height: 220px; border-radius: 10px; box-shadow: 0 4px 10px rgba(0,0,0,0.15);">`).join('');
            } else {
                imgList.innerHTML = "<p style='color:var(--text-light)'>No hay imágenes asignadas.</p>";
            }
        }

        cargarSimuladoresGuardados();
        mostrarVista('view-tema');

    } catch(err) {
        console.error("Error cargando el tema:", err);
        alert("Ocurrió un error interno al intentar renderizar el tema. Por favor revisa la consola.");
    }
}

async function cargarSimuladoresGuardados() {
    const cont = document.getElementById('lista-simuladores-guardados');
    if(!cont || !usuarioActual?.uid || !temaActualInfo?.id) return;

    cont.innerHTML = "<p style='font-size:13px;color:var(--text-light);'>Cargando historial...</p>";
    simuladoresGuardadosCache = {};

    try {
        const snap = await getDocs(query(
            collection(db, "usuarios", usuarioActual.uid, "simuladores_guardados"),
            where("tema_id", "==", temaActualInfo.id)
        ));

        if(snap.empty) {
            cont.innerHTML = "<p style='font-size:13px; color:var(--text-light);'>No has realizado ninguna evaluación previa guardada.</p>";
            return;
        }

        const intentos = snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')));

        cont.innerHTML = intentos.map((data, index) => {
            simuladoresGuardadosCache[data.id] = data;

            const puntaje = Number.isFinite(Number(data.puntaje)) ? Number(data.puntaje) : null;
            const total = Number.isFinite(Number(data.total))
                ? Number(data.total)
                : (Array.isArray(data.preguntas) ? data.preguntas.length : null);

            const fecha = data.fecha ? new Date(data.fecha) : null;
            const fechaTxt = fecha && !Number.isNaN(fecha.getTime())
                ? fecha.toLocaleString('es-EC')
                : "";

            const resultado = puntaje !== null && total !== null
                ? `<strong style="color:var(--primary-light);">${puntaje}/${total}</strong>`
                : `<strong style="color:var(--text-light);">Revisar</strong>`;

            return `<button class="btn-outline"
                        style="justify-content:space-between;text-align:left;padding:12px 14px;gap:12px;"
                        onclick="revisarSimuladorGuardado('${data.id}')">
                        <span style="display:flex;align-items:center;gap:9px;">
                            <i class="fas fa-lock" style="color:#64748B;"></i>
                            <span>
                                <strong>Práctica realizada #${intentos.length - index}</strong>
                                ${fechaTxt ? `<small style="display:block;color:var(--text-light);margin-top:2px;">${escapeHTML(fechaTxt)}</small>` : ''}
                            </span>
                        </span>
                        ${resultado}
                    </button>`;
        }).join('');
    } catch(err) {
        console.error("Error cargando simuladores guardados:", err);
        cont.innerHTML = "<p style='font-size:13px;color:var(--danger);'>No se pudo cargar el historial de prácticas.</p>";
    }
}

window.revisarSimuladorGuardado = function(intentoId) {
    const intento = simuladoresGuardadosCache[intentoId];
    if(!intento) {
        alert("No se pudo abrir esta práctica. Vuelve a entrar al tema e inténtalo nuevamente.");
        return;
    }

    const preguntasGuardadas = Array.isArray(intento.preguntas) ? intento.preguntas : [];
    const respuestasGuardadas = Array.isArray(intento.respuestas) ? intento.respuestas : [];

    if(!preguntasGuardadas.length) {
        alert("Esta práctica no contiene preguntas guardadas.");
        return;
    }

    quizActivo = preguntasGuardadas;
    document.getElementById('quiz-titulo').textContent = intento.tema_titulo || temaActualInfo?.titulo || "Práctica";
    document.getElementById('quiz-subtitulo').textContent = "Revisión bloqueada de tu práctica guardada";
    document.getElementById('btn-enviar-quiz')?.classList.add('hidden');

    const cont = document.getElementById('quiz-preguntas-container');
    cont.innerHTML = preguntasGuardadas.map((p, idx) => {
        const rawRespuesta = respuestasGuardadas[idx] !== undefined
            ? respuestasGuardadas[idx]
            : p.respuesta_usuario;

        const tieneRespuesta =
            rawRespuesta !== null &&
            rawRespuesta !== undefined &&
            rawRespuesta !== "" &&
            Number.isInteger(Number(rawRespuesta));

        const respuestaAlumno = tieneRespuesta ? Number(rawRespuesta) : null;
        const correcta = Number(p.respuesta_correcta);
        const opciones = Array.isArray(p.opciones) ? p.opciones : [];

        const opcionesHtml = opciones.map((op, opIdx) => {
            const esCorrecta = opIdx === correcta;
            const fueAlumno = respuestaAlumno === opIdx;

            let fondo = "#FFFFFF";
            let borde = "#CBD5E1";
            let etiqueta = "";

            if(esCorrecta) {
                fondo = "#ECFDF5";
                borde = "#86EFAC";
                etiqueta = fueAlumno
                    ? `<strong style="margin-left:8px;color:rgb(58,124,34);">✓ Tu respuesta · Correcta</strong>`
                    : `<strong style="margin-left:8px;color:rgb(58,124,34);">✓ Respuesta correcta</strong>`;
            } else if(fueAlumno) {
                fondo = "#FEF2F2";
                borde = "#FCA5A5";
                etiqueta = `<strong style="margin-left:8px;color:#B91C1C;">✗ Tu respuesta</strong>`;
            }

            return `<label class="quiz-option" style="cursor:default;background:${fondo};border-color:${borde};">
                        <input type="radio" name="rev-q${idx}" value="${opIdx}" disabled ${fueAlumno ? 'checked' : ''}>
                        <span>${escapeHTML(op)}${etiqueta}</span>
                    </label>`;
        }).join('');

        const avisoSinRespuesta = !tieneRespuesta
            ? `<div style="margin:8px 0 0;color:#B45309;font-size:12px;font-weight:700;">No quedó registrada una respuesta del alumno en este intento.</div>`
            : '';

        return `<div class="instruction-card" style="margin-bottom:15px;">
                    <p style="font-weight:700;">${idx + 1}. ${escapeHTML(p.enunciado || '')}</p>
                    ${opcionesHtml}
                    ${avisoSinRespuesta}
                    <div style="margin-top:12px;background:#EFF6FF;padding:12px;border-radius:8px;font-size:13px;color:#1E3A8A;line-height:1.55;">
                        <strong>Explicación de la IA:</strong> ${escapeHTML(p.explicacion || 'No hay explicación guardada para esta pregunta.')}
                    </div>
                </div>`;
    }).join('');

    const puntaje = Number.isFinite(Number(intento.puntaje)) ? Number(intento.puntaje) : null;
    const total = Number.isFinite(Number(intento.total)) ? Number(intento.total) : preguntasGuardadas.length;
    const porcentaje = Number.isFinite(Number(intento.porcentaje)) ? Number(intento.porcentaje) : null;

    const resDiv = document.getElementById('quiz-resultado');
    if(resDiv) {
        resDiv.innerHTML = `
            <h3 style="margin-bottom:6px;">Resultado guardado</h3>
            <p style="font-size:36px;font-weight:800;color:var(--primary-light);margin:0;">
                ${puntaje !== null ? puntaje : '—'} / ${total}
            </p>
            ${porcentaje !== null ? `<p style="margin:6px 0 0;font-weight:700;">${porcentaje}% de aciertos</p>` : ''}
            <p style="color:var(--text-light);margin:8px 0 0;">
                Esta práctica está bloqueada. Puedes revisar tus respuestas y las explicaciones, pero no volver a contestarla.
            </p>`;
        resDiv.classList.remove('hidden');
    }

    mostrarVista('view-quiz');

    if(window.MathJax?.typesetPromise) {
        MathJax.typesetPromise([cont]).catch(err => console.log('Error renderizando LaTeX:', err));
    }
};

window.iniciarQuiz = function(preguntas) {
    quizActivo = preguntas;
    document.getElementById('quiz-titulo').textContent = temaActualInfo.titulo;
    document.getElementById('quiz-subtitulo').textContent = "Revisión de respuestas guardadas:";
    document.getElementById('btn-enviar-quiz').classList.remove('hidden');
    document.getElementById('quiz-resultado').classList.add('hidden');

    const cont = document.getElementById('quiz-preguntas-container');
    cont.innerHTML = quizActivo.map((p, idx) => `
        <div class="instruction-card" style="margin-bottom: 15px;">
            <p style="font-weight:700;">${idx + 1}. ${p.enunciado}</p>
            ${p.opciones.map((op, opIdx) => `<label class="quiz-option"><input type="radio" name="q${idx}" value="${opIdx}"><span>${op}</span></label>`).join('')}
            <div id="exp-q${idx}" class="hidden" style="margin-top: 10px; background: #F0FDF4; padding: 10px; border-radius: 6px; font-size: 13px; color: #166534;"><strong>Explicación:</strong> ${p.explicacion}</div>
        </div>`).join('');

    if(window.MathJax) MathJax.typesetPromise();
    mostrarVista('view-quiz');
}

// ==========================================
// FUNCIONES ADMIN (CARGAR Y ELIMINAR)
// ==========================================
async function cargarDatosAdmin() {
    const [snapMat, snapMod, snapTem, snapAlu] = await Promise.all([
        getDocs(collection(db, "materias")),
        getDocs(collection(db, "modulos")),
        getDocs(collection(db, "temas_globales")),
        getDocs(collection(db, "alumnos_autorizados"))
    ]);

    const contMat = document.getElementById('admin-lista-materias');
    const contMod = document.getElementById('admin-lista-modulos');
    const contTem = document.getElementById('admin-lista-temas');
    const contAlu = document.getElementById('admin-lista-alumnos');
    const selMatMod = document.getElementById('admin-select-materia-modulo');
    const selMatTem = document.getElementById('admin-tema-materia');

    const materias = ordenarPorOrden(snapMat.docs.map(d => ({ id:d.id, ...d.data() })), 'nombre');
    const modulos = snapMod.docs.map(d => ({ id:d.id, ...d.data() }));
    const temas = snapTem.docs.map(d => ({ id:d.id, ...d.data() }));
    const materiasMap = Object.fromEntries(materias.map(m => [m.id, m.nombre]));
    const modulosMap = Object.fromEntries(modulos.map(m => [m.id, m.nombre]));

    if(!materias.length) {
        contMat.innerHTML = `<div class="admin-empty-state"><i class="fas fa-book"></i><span>No hay materias creadas.</span></div>`;
        selMatMod.innerHTML = "<option value=''>Crea una materia primero</option>";
        selMatTem.innerHTML = "<option value=''>Crea una materia primero</option>";
    } else {
        const opcionesHTML = `<option value="">-- Selecciona una Materia --</option>` + materias.map(m => `<option value="${m.id}">${escapeHTML(m.nombre)}</option>`).join('');
        selMatMod.innerHTML = opcionesHTML;
        selMatTem.innerHTML = opcionesHTML;
        contMat.innerHTML = materias.map((data, index) => `
            <div class="admin-list-row admin-ordered-row">
                <div class="admin-order-badge">${index + 1}</div>
                <div class="admin-row-main"><strong>${escapeHTML(data.nombre)}</strong><small>Se muestra en esta posición en el menú del alumno.</small></div>
                <div class="admin-list-actions">
                    <button class="btn-outline admin-mini-btn" ${index === 0 ? 'disabled' : ''} onclick="reordenarElemento('materia','${data.id}','arriba','')" title="Subir"><i class="fas fa-arrow-up"></i></button>
                    <button class="btn-outline admin-mini-btn" ${index === materias.length - 1 ? 'disabled' : ''} onclick="reordenarElemento('materia','${data.id}','abajo','')" title="Bajar"><i class="fas fa-arrow-down"></i></button>
                    <button class="btn-danger admin-mini-btn" onclick="eliminarDocumento('materias', '${data.id}')" title="Eliminar"><i class="fas fa-trash"></i></button>
                </div>
            </div>`).join('');
    }

    if(!modulos.length) {
        contMod.innerHTML = `<div class="admin-empty-state"><i class="fas fa-layer-group"></i><span>No hay módulos creados.</span></div>`;
    } else {
        contMod.innerHTML = materias.map(mat => {
            const grupo = ordenarPorOrden(modulos.filter(m => m.materia_id === mat.id), 'nombre');
            if(!grupo.length) return '';
            return `<div class="admin-group-block"><div class="admin-group-title"><i class="fas fa-book"></i>${escapeHTML(mat.nombre)}</div>${grupo.map((data, index) => {
                const evalHtml = data.archivo_evaluacion ? `<span class="admin-chip">Evaluación vinculada</span>` : '';
                return `<div class="admin-list-row admin-ordered-row">
                    <div class="admin-order-badge module">${index + 1}</div>
                    <div class="admin-row-main"><strong>${escapeHTML(data.nombre)}</strong><small>${evalHtml || 'Sin evaluación final vinculada'}</small></div>
                    <div class="admin-list-actions">
                        <button class="btn-outline admin-mini-btn" ${index === 0 ? 'disabled' : ''} onclick="reordenarElemento('modulo','${data.id}','arriba','${mat.id}')" title="Subir"><i class="fas fa-arrow-up"></i></button>
                        <button class="btn-outline admin-mini-btn" ${index === grupo.length - 1 ? 'disabled' : ''} onclick="reordenarElemento('modulo','${data.id}','abajo','${mat.id}')" title="Bajar"><i class="fas fa-arrow-down"></i></button>
                        <button class="btn-danger admin-mini-btn" onclick="eliminarDocumento('modulos', '${data.id}')" title="Eliminar"><i class="fas fa-trash"></i></button>
                    </div>
                </div>`;
            }).join('')}</div>`;
        }).join('') || `<div class="admin-empty-state"><span>No hay módulos creados.</span></div>`;
    }

    if(!temas.length) {
        contTem.innerHTML = `<div class="admin-empty-state"><i class="fas fa-file-lines"></i><span>No hay temas creados.</span></div>`;
    } else {
        const bloques = [];
        materias.forEach(mat => {
            ordenarPorOrden(modulos.filter(m => m.materia_id === mat.id), 'nombre').forEach(mod => {
                const grupo = ordenarPorOrden(temas.filter(t => t.modulo_id === mod.id), 'titulo');
                if(!grupo.length) return;
                bloques.push(`<div class="admin-group-block">
                    <div class="admin-group-title"><i class="fas fa-route"></i>${escapeHTML(mat.nombre)} <span>›</span> ${escapeHTML(mod.nombre)}</div>
                    ${grupo.map((data, index) => `<div class="admin-list-row admin-ordered-row">
                        <div class="admin-order-badge topic">${index + 1}</div>
                        <div class="admin-row-main"><strong>${escapeHTML(data.titulo)}</strong><small>Posición ${index + 1} dentro del módulo.</small></div>
                        <div class="admin-list-actions">
                            <button class="btn-outline admin-mini-btn" ${index === 0 ? 'disabled' : ''} onclick="reordenarElemento('tema','${data.id}','arriba','${mod.id}')" title="Subir"><i class="fas fa-arrow-up"></i></button>
                            <button class="btn-outline admin-mini-btn" ${index === grupo.length - 1 ? 'disabled' : ''} onclick="reordenarElemento('tema','${data.id}','abajo','${mod.id}')" title="Bajar"><i class="fas fa-arrow-down"></i></button>
                            <button class="btn-outline admin-mini-btn" onclick="editarTema('${data.id}')" title="Editar tema"><i class="fas fa-pen"></i> Editar</button>
                            <button class="btn-danger admin-mini-btn" onclick="eliminarDocumento('temas_globales', '${data.id}')" title="Eliminar tema"><i class="fas fa-trash"></i></button>
                        </div>
                    </div>`).join('')}
                </div>`);
            });
        });
        // Conserva visibles temas huérfanos por si existe información antigua incompleta.
        const idsRenderizados = new Set();
        materias.forEach(mat => modulos.filter(m => m.materia_id === mat.id).forEach(mod => temas.filter(t => t.modulo_id === mod.id).forEach(t => idsRenderizados.add(t.id))));
        const huerfanos = temas.filter(t => !idsRenderizados.has(t.id));
        if(huerfanos.length) {
            bloques.push(`<div class="admin-group-block"><div class="admin-group-title warning"><i class="fas fa-triangle-exclamation"></i>Temas sin módulo reconocido</div>${huerfanos.map(data => `<div class="admin-list-row"><div class="admin-row-main"><strong>${escapeHTML(data.titulo)}</strong><small>${escapeHTML(modulosMap[data.modulo_id] || 'Módulo no disponible')}</small></div><div class="admin-list-actions"><button class="btn-outline admin-mini-btn" onclick="editarTema('${data.id}')"><i class="fas fa-pen"></i> Editar</button><button class="btn-danger admin-mini-btn" onclick="eliminarDocumento('temas_globales','${data.id}')"><i class="fas fa-trash"></i></button></div></div>`).join('')}</div>`);
        }
        contTem.innerHTML = bloques.join('');
    }

    if(snapAlu.empty) contAlu.innerHTML = `<div class="admin-empty-state"><i class="fas fa-user"></i><span>No hay alumnos autorizados.</span></div>`;
    else {
        contAlu.innerHTML = snapAlu.docs.map(d => {
            const data = d.data() || {};
            const nombre = data.nombre || 'Nombre pendiente';
            const email = data.email || d.id;
            const uid = String(data.uid || '').trim();
            const uidArg = encodeURIComponent(uid);
            const emailArg = encodeURIComponent(email);
            const nombreArg = encodeURIComponent(nombre);
            return `<div class="admin-list-row">
                <div class="admin-row-main">
                    <strong>${escapeHTML(nombre)}</strong>
                    <small>${escapeHTML(email)}${uid ? '' : ' · UID pendiente hasta el próximo ingreso del alumno'}</small>
                </div>
                <div class="admin-list-actions">
                    <button class="btn-outline admin-mini-btn" ${uid ? '' : 'disabled'} onclick="verPruebasAlumno('${uidArg}','${emailArg}','${nombreArg}')" title="${uid ? 'Ver pruebas guardadas' : 'El alumno debe iniciar sesión una vez para asociar su UID'}">
                        <i class="fas fa-clipboard-check"></i> Pruebas
                    </button>
                    <button class="btn-danger admin-mini-btn" onclick="eliminarDocumento('alumnos_autorizados', '${d.id}')"><i class="fas fa-trash"></i></button>
                </div>
            </div>`;
        }).join('');
    }

    // Si el organizador está visible, mantenlo sincronizado.
    if(!document.getElementById('admin-tab-organizar')?.classList.contains('hidden')) cargarOrganizador();
}

window.verPruebasAlumno = async function(uidCodificado, emailCodificado, nombreCodificado) {
    const cont = document.getElementById('admin-lista-pruebas-alumno');
    if(!cont) return;

    const uid = decodeURIComponent(uidCodificado || '');
    const email = decodeURIComponent(emailCodificado || '');
    const nombre = decodeURIComponent(nombreCodificado || '');

    if(!uid) {
        cont.innerHTML = `<div style="padding:10px;border-radius:8px;background:#FFF7ED;color:#9A3412;font-size:12px;">
            Este alumno todavía no tiene el UID asociado. Debe entrar al aula al menos una vez con esta versión para que el administrador pueda gestionar su progreso.
        </div>`;
        return;
    }

    cont.innerHTML = `<p style="color:var(--text-light);font-size:12px;"><i class="fas fa-spinner fa-spin"></i> Cargando progreso de ${escapeHTML(nombre || email)}...</p>`;

    try {
        const [snapIntentos, snapProgMod, snapModulos] = await Promise.all([
            getDocs(collection(db, "usuarios", uid, "simuladores_guardados")),
            getDocs(collection(db, "usuarios", uid, "progreso_modulos")),
            getDocs(collection(db, "modulos"))
        ]);

        const intentos = snapIntentos.docs
            .map(d => ({ id:d.id, ...d.data() }))
            .sort((a,b) => String(b.fecha || '').localeCompare(String(a.fecha || '')));

        const modulosMap = {};
        snapModulos.forEach(d => modulosMap[d.id] = d.data()?.nombre || "Módulo");

        const evaluaciones = snapProgMod.docs
            .map(d => ({ id:d.id, ...d.data() }))
            .filter(x => x.evaluacion_completada === true);

        const practicasHtml = intentos.length
            ? intentos.map((data) => {
                const fecha = data.fecha ? new Date(data.fecha) : null;
                const fechaTxt = fecha && !Number.isNaN(fecha.getTime()) ? fecha.toLocaleString('es-EC') : 'Fecha no disponible';
                const tema = data.tema_titulo || data.tema_id || 'Tema';
                const puntaje = Number.isFinite(Number(data.puntaje)) && Number.isFinite(Number(data.total))
                    ? `${Number(data.puntaje)}/${Number(data.total)}`
                    : 'Sin puntaje';

                return `<div class="admin-list-row" style="align-items:center;">
                    <div class="admin-row-main">
                        <strong>${escapeHTML(tema)}</strong>
                        <small>${escapeHTML(fechaTxt)} · Resultado ${escapeHTML(puntaje)}</small>
                    </div>
                    <button class="btn-danger admin-mini-btn"
                        onclick="eliminarPruebaAlumno('${encodeURIComponent(uid)}','${encodeURIComponent(data.id)}','${encodeURIComponent(data.tema_id || '')}','${encodeURIComponent(nombre || email)}')"
                        title="Eliminar práctica y devolver el tema a En progreso">
                        <i class="fas fa-trash"></i> Dar de baja práctica
                    </button>
                </div>`;
            }).join('')
            : `<div class="admin-empty-state" style="min-height:60px;"><span>No tiene prácticas guardadas.</span></div>`;

        const evaluacionesHtml = evaluaciones.length
            ? evaluaciones.map(data => {
                const moduloNombre = modulosMap[data.id] || data.modulo_nombre || "Módulo";
                const fecha = data.fecha_evaluacion ? new Date(data.fecha_evaluacion) : null;
                const fechaTxt = fecha && !Number.isNaN(fecha.getTime()) ? fecha.toLocaleString('es-EC') : 'Marcada como realizada';

                return `<div class="admin-list-row" style="align-items:center;">
                    <div class="admin-row-main">
                        <strong>${escapeHTML(moduloNombre)}</strong>
                        <small>${escapeHTML(fechaTxt)}</small>
                    </div>
                    <button class="btn-outline admin-mini-btn"
                        onclick="desmarcarEvaluacionModulo('${encodeURIComponent(uid)}','${encodeURIComponent(data.id)}','${encodeURIComponent(nombre || email)}','${encodeURIComponent(email)}')"
                        title="Desmarcar evaluación final y devolver el módulo a En progreso">
                        <i class="fas fa-rotate-left"></i> Desmarcar evaluación
                    </button>
                </div>`;
            }).join('')
            : `<div class="admin-empty-state" style="min-height:60px;"><span>No tiene evaluaciones finales marcadas como realizadas.</span></div>`;

        cont.innerHTML = `
            <div style="margin-bottom:12px;font-size:13px;">
                <strong>${escapeHTML(nombre || email)}</strong>
                <span style="color:var(--text-light);"> · ${escapeHTML(email)}</span>
            </div>

            <div style="margin-top:10px;">
                <h5 style="margin:0 0 8px;color:var(--primary);font-size:13px;"><i class="fas fa-list-check"></i> Prácticas de temas</h5>
                ${practicasHtml}
            </div>

            <div style="margin-top:18px;padding-top:14px;border-top:1px solid var(--border);">
                <h5 style="margin:0 0 8px;color:var(--primary);font-size:13px;"><i class="fas fa-flag-checkered"></i> Evaluaciones finales de módulo</h5>
                ${evaluacionesHtml}
            </div>
        `;
    } catch(err) {
        console.error("Error cargando progreso del alumno:", err);
        cont.innerHTML = `<p style="color:var(--danger);font-size:12px;">No se pudo cargar el progreso. ${escapeHTML(err.message || '')}</p>`;
    }
};

window.desmarcarEvaluacionModulo = async function(uidCodificado, moduloCodificado, nombreCodificado, emailCodificado) {
    const uid = decodeURIComponent(uidCodificado || '');
    const moduloId = decodeURIComponent(moduloCodificado || '');
    const nombre = decodeURIComponent(nombreCodificado || '');
    const email = decodeURIComponent(emailCodificado || '');

    if(!uid || !moduloId) return;
    if(!confirm(`¿Desmarcar la evaluación final de ${nombre || 'este alumno'}? El módulo volverá a En progreso y el carrito regresará a la estación de evaluación.`)) return;

    try {
        await setDoc(doc(db, "usuarios", uid, "progreso_modulos", moduloId), {
            evaluacion_completada: false,
            fecha_reinicio_admin: new Date().toISOString()
        }, { merge: true });

        alert("Evaluación final desmarcada. El módulo volvió a En progreso.");

        await window.verPruebasAlumno(
            encodeURIComponent(uid),
            encodeURIComponent(email),
            encodeURIComponent(nombre || email)
        );
    } catch(err) {
        console.error("No se pudo desmarcar la evaluación final:", err);
        alert("No se pudo desmarcar la evaluación final: " + (err.message || "Error desconocido"));
    }
};

window.eliminarPruebaAlumno = async function(uidCodificado, intentoCodificado, temaCodificado, nombreCodificado) {
    const uid = decodeURIComponent(uidCodificado || '');
    const intentoId = decodeURIComponent(intentoCodificado || '');
    const temaId = decodeURIComponent(temaCodificado || '');
    const nombre = decodeURIComponent(nombreCodificado || '');

    if(!uid || !intentoId) return;
    if(!confirm(`¿Eliminar esta prueba de ${nombre || 'este alumno'}? El tema volverá a En progreso.`)) return;

    try {
        await deleteDoc(doc(db, "usuarios", uid, "simuladores_guardados", intentoId));

        if(temaId) {
            await setDoc(doc(db, "usuarios", uid, "progreso_temas", temaId), {
                status: "yellow",
                reiniciado_por_admin: true,
                fecha_reinicio: new Date().toISOString()
            }, { merge: true });

            try {
                const temaSnap = await getDoc(doc(db, "temas_globales", temaId));
                const moduloId = temaSnap.exists() ? temaSnap.data()?.modulo_id : "";
                if(moduloId) {
                    await setDoc(doc(db, "usuarios", uid, "progreso_modulos", moduloId), {
                        evaluacion_completada: false,
                        fecha_reinicio_admin: new Date().toISOString()
                    }, { merge: true });
                }
            } catch(errModulo) {
                console.warn("No se pudo reiniciar el progreso de evaluación del módulo:", errModulo);
            }
        }

        alert("Prueba eliminada. El tema volvió a En progreso.");

        const alumnoSnap = await getDocs(collection(db, "alumnos_autorizados"));
        const ficha = alumnoSnap.docs.find(d => String(d.data()?.uid || '') === uid);
        const email = ficha?.data()?.email || ficha?.id || '';
        const nombreFicha = ficha?.data()?.nombre || nombre || email;

        await window.verPruebasAlumno(
            encodeURIComponent(uid),
            encodeURIComponent(email),
            encodeURIComponent(nombreFicha)
        );
    } catch(err) {
        console.error("No se pudo eliminar la prueba:", err);
        alert("No se pudo eliminar la prueba: " + (err.message || "Error desconocido"));
    }
};

window.eliminarDocumento = async function(coleccion, id) {
    if(confirm(`¿Estás seguro de eliminar este elemento definitivamente?`)) {
        await deleteDoc(doc(db, coleccion, id));
        if(coleccion === 'temas_globales' && temaEditandoId === id) limpiarFormularioTemaAdmin();
        cargarDatosAdmin();
        cargarEstructuraGlobal();
        cargarOrganizador();
    }
}
