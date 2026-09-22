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
        const btnVolverRecursos = document.getElementById('btn-volver-recursos');
        if(btnVolverRecursos && !btnVolverRecursos.classList.contains('hidden')) {
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
    document.getElementById('btn-volver-modulo').classList.add('hidden');
    document.getElementById('btn-volver-recursos').classList.remove('hidden');
    document.getElementById('subtitulo-recursos').textContent = nombreRecurso;
}

window.volverRecursos = function() {
    document.getElementById('menu-recursos').classList.remove('hidden');
    document.querySelectorAll('.recurso-content').forEach(el => el.classList.add('hidden'));
    document.getElementById('btn-volver-recursos').classList.add('hidden');
    document.getElementById('btn-volver-modulo').classList.remove('hidden');
    document.getElementById('subtitulo-recursos').textContent = "Recursos de aprendizaje";
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
    const etiqueta = prompt('Texto del botón o concepto (ej.: ¿Qué es electronegatividad?):');
    if(!etiqueta) return;
    const contenido = prompt('Escribe la explicación que aparecerá en la ventana emergente:');
    if(!contenido) return;
    const codificado = encodeURIComponent(contenido.trim());
    insertHTMLAtEditor(`<button type="button" class="concept-link" data-concept="${escapeAttr(codificado)}"><i class="fas fa-circle-info"></i>${escapeHTML(etiqueta.trim())}</button>&nbsp;`);
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

    document.getElementById('btn-volver-modulo')?.addEventListener('click', () => {
        if(moduloSeleccionado) window.cargarModulo(moduloSeleccionado.id, moduloSeleccionado.nombre, moduloSeleccionado.materiaId, moduloSeleccionado.materiaNombre, moduloSeleccionado.evaluacion);
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

    document.getElementById('btn-descargar-pdf')?.addEventListener('click', () => {
        const elemento = document.getElementById('tema-resumen');
        const nombreArchivo = (temaActualInfo?.titulo || 'Resumen').replace(/\s+/g, '_') + '.pdf';
        const opt = {
            margin:       0.5,
            filename:     nombreArchivo,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2 },
            jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
        };
        html2pdf().set(opt).from(elemento).save();
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
        document.getElementById('btn-volver-tema-desde-quiz').classList.remove('hidden');

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

    document.getElementById('btn-volver-tema-desde-quiz')?.addEventListener('click', () => mostrarVista('view-tema'));
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

    const [snapMod, snapTem, snapProg] = await Promise.all([
        getDocs(query(collection(db, "modulos"), where("materia_id", "==", materiaId))),
        getDocs(collection(db, "temas_globales")),
        getDocs(collection(db, "usuarios", usuarioActual.uid, "progreso_temas"))
    ]);

    let modulos = []; snapMod.forEach(d => modulos.push({id: d.id, ...d.data()}));
    let temas = []; snapTem.forEach(d => temas.push({id: d.id, ...d.data()}));
    modulos = ordenarPorOrden(modulos, 'nombre');
    temas = ordenarPorOrden(temas, 'titulo');
    let mapaProgreso = {}; snapProg.forEach(d => mapaProgreso[d.id] = d.data().status);

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
        
        let status = 'red';
        if(allGreen) status = 'green';
        else if(anyProgress) status = 'yellow';
        
        return { ...mod, status };
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

    const [snapTem, snapProg] = await Promise.all([
        getDocs(query(collection(db, "temas_globales"), where("modulo_id", "==", moduloId))),
        getDocs(collection(db, "usuarios", usuarioActual.uid, "progreso_temas"))
    ]);

    let temas = []; snapTem.forEach(d => temas.push({id: d.id, ...d.data()}));
    temas = ordenarPorOrden(temas, 'titulo');
    let mapaProgreso = {}; snapProg.forEach(d => mapaProgreso[d.id] = d.data().status);

    if(temas.length === 0) {
        container.innerHTML = `<div class="instruction-card" style="text-align:center;"><i class="fas fa-road" style="font-size:28px;color:#94A3B8;"></i><p style="color:var(--text-light); font-size:14px; margin-bottom:0;">No hay estaciones en esta pista aún.</p></div>`;
        return;
    }

    const todosCompletados = temas.every(t => (mapaProgreso[t.id] || 'red') === 'green');
    let indexActual = todosCompletados ? temas.length : temas.findIndex(t => (mapaProgreso[t.id] || 'red') !== 'green');
    if(indexActual < 0) indexActual = temas.length;

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

    if(archivoEval) {
        html += `<div class="pista-estacion">
                <a href="${archivoEval}" target="_blank" rel="noopener noreferrer" style="text-decoration:none; width:100%;">
                    <div class="info-tema" style="background:linear-gradient(135deg,#1E3A8A,#2563EB); border-color:#60A5FA; color:white;">📝 Evaluación General</div>
                </a></div>`;
    }

    const metaCar = indexActual === temas.length
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
                : container.querySelector('.meta-bandera');
            destino?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        });
    } else if(pending?.moduleId === moduloId) {
        sessionStorage.removeItem('pendingTrackAnimation');
    }
}

window.abrirTema = async function(temaId, matId, matNombre, modNombre) {
    try {
        materiaSeleccionada = { id: matId, nombre: matNombre };
        const docSnap = await getDoc(doc(db, "temas_globales", temaId));
        if(!docSnap.exists()) return;

        const data = docSnap.data();
        temaActualInfo = { id: temaId, ...data };

        // Si el tema se abrió directamente desde el árbol lateral, reconstruye el módulo actual
        // para que el botón "Volver a módulos" siga funcionando correctamente.
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
            if(window.MathJax) {
                MathJax.typesetPromise([resBox]).catch((err) => console.log('Error renderizando LaTeX:', err));
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

    cont.innerHTML = "<p style='font-size:13px; color:var(--text-light);'>Cargando historial...</p>";

    try {
        const snap = await getDocs(query(
            collection(db, "usuarios", usuarioActual.uid, "simuladores_guardados"),
            where("tema_id", "==", temaActualInfo.id)
        ));

        simuladoresGuardadosCache = {};

        if(snap.empty) {
            cont.innerHTML = "<p style='font-size:13px; color:var(--text-light);'>Todavía no has completado ninguna práctica de este tema.</p>";
            return;
        }

        const intentos = snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => String(b.fecha || b.timestamp || '').localeCompare(String(a.fecha || a.timestamp || '')));

        let html = "";

        intentos.forEach((data, index) => {
            simuladoresGuardadosCache[data.id] = data;

            const puntaje = Number.isFinite(Number(data.puntaje)) ? Number(data.puntaje) : null;
            const total = Number.isFinite(Number(data.total)) ? Number(data.total) :
                (Array.isArray(data.preguntas) ? data.preguntas.length : null);

            let fechaTexto = "";
            if(data.fecha || data.timestamp) {
                const fecha = new Date(data.fecha || data.timestamp);
                if(!Number.isNaN(fecha.getTime())) {
                    fechaTexto = fecha.toLocaleString('es-EC', {
                        day:'2-digit', month:'2-digit', year:'numeric',
                        hour:'2-digit', minute:'2-digit'
                    });
                }
            }

            const dificultad = data.dificultad
                ? String(data.dificultad).charAt(0).toUpperCase() + String(data.dificultad).slice(1)
                : "";

            const resultado = puntaje !== null && total
                ? `<strong style="color:var(--primary-light);">${puntaje}/${total}</strong>`
                : `<strong>Revisión</strong>`;

            const detalle = [fechaTexto, dificultad].filter(Boolean).join(" · ");

            html += `
                <button class="btn-outline" style="justify-content:space-between; text-align:left; padding:12px 14px; gap:12px;"
                        onclick="revisarSimuladorGuardado('${data.id}')">
                    <span style="display:flex; align-items:center; gap:9px;">
                        <i class="fas fa-lock" style="color:#64748B;"></i>
                        <span>
                            <strong>Práctica realizada ${intentos.length > 1 ? `#${intentos.length - index}` : ''}</strong>
                            ${detalle ? `<small style="display:block; color:var(--text-light); margin-top:2px;">${escapeHTML(detalle)}</small>` : ''}
                        </span>
                    </span>
                    <span>${resultado}</span>
                </button>`;
        });

        cont.innerHTML = html;
    } catch(err) {
        console.error("Error cargando prácticas guardadas:", err);
        cont.innerHTML = "<p style='font-size:13px; color:var(--danger);'>No se pudo cargar tu historial de prácticas.</p>";
    }
}

window.revisarSimuladorGuardado = function(intentoId) {
    const intento = simuladoresGuardadosCache[intentoId];
    if(!intento) return alert("No se pudo abrir esta práctica. Vuelve a entrar al tema e inténtalo nuevamente.");

    const preguntas = Array.isArray(intento.preguntas) ? intento.preguntas : [];
    const respuestas = Array.isArray(intento.respuestas) ? intento.respuestas : [];

    if(!preguntas.length) return alert("Esta práctica guardada no contiene preguntas para revisar.");

    quizActivo = preguntas;

    const puntaje = Number.isFinite(Number(intento.puntaje)) ? Number(intento.puntaje) : 0;
    const total = Number.isFinite(Number(intento.total)) ? Number(intento.total) : preguntas.length;

    let fechaTexto = "";
    if(intento.fecha || intento.timestamp) {
        const fecha = new Date(intento.fecha || intento.timestamp);
        if(!Number.isNaN(fecha.getTime())) fechaTexto = fecha.toLocaleString('es-EC');
    }

    document.getElementById('quiz-titulo').textContent = temaActualInfo?.titulo || intento.tema_titulo || "Práctica";
    document.getElementById('quiz-subtitulo').textContent =
        `Revisión bloqueada · Resultado ${puntaje}/${total}${fechaTexto ? ` · ${fechaTexto}` : ''}`;

    document.getElementById('btn-enviar-quiz')?.classList.add('hidden');
    document.getElementById('btn-volver-tema-desde-quiz')?.classList.remove('hidden');

    const cont = document.getElementById('quiz-preguntas-container');

    cont.innerHTML = preguntas.map((p, idx) => {
        const respuesta = Number.isInteger(Number(respuestas[idx])) ? Number(respuestas[idx]) : null;
        const correcta = Number(p.respuesta_correcta);

        const opciones = (Array.isArray(p.opciones) ? p.opciones : []).map((op, opIdx) => {
            const esCorrecta = opIdx === correcta;
            const fueElegida = respuesta === opIdx;

            let estilo = "cursor:default;";
            let etiqueta = "";

            if(esCorrecta) {
                estilo += "background:#ECFDF5;border-color:#6EE7B7;";
                etiqueta = `<strong style="margin-left:8px;color:#047857;">✓ Correcta</strong>`;
            } else if(fueElegida) {
                estilo += "background:#FEF2F2;border-color:#FCA5A5;";
                etiqueta = `<strong style="margin-left:8px;color:#B91C1C;">Tu respuesta</strong>`;
            }

            return `
                <label class="quiz-option" style="${estilo}">
                    <input type="radio" name="review-q${idx}" value="${opIdx}" disabled ${fueElegida ? 'checked' : ''}>
                    <span>${escapeHTML(op)}${etiqueta}</span>
                </label>`;
        }).join('');

        const sinRespuesta = respuesta === null
            ? `<p style="margin:10px 0 0; color:#B45309; font-size:13px;"><strong>Sin respuesta registrada.</strong></p>`
            : '';

        return `
            <div class="instruction-card" style="margin-bottom:15px;">
                <p style="font-weight:700;">${idx + 1}. ${escapeHTML(p.enunciado || '')}</p>
                ${opciones}
                ${sinRespuesta}
                <div style="margin-top:12px; background:#EFF6FF; padding:12px; border-radius:8px; font-size:13px; color:#1E3A8A; line-height:1.55;">
                    <strong>Explicación de la IA:</strong> ${escapeHTML(p.explicacion || 'No hay explicación guardada para esta pregunta.')}
                </div>
            </div>`;
    }).join('');

    const resDiv = document.getElementById('quiz-resultado');
    if(resDiv) {
        resDiv.innerHTML = `
            <h3 style="margin-bottom:6px;">Resultado guardado</h3>
            <p style="font-size:36px; font-weight:800; color:var(--primary-light); margin:0;">${puntaje} / ${total}</p>
            <p style="color:var(--text-light); margin:8px 0 0;">Esta práctica está bloqueada y disponible únicamente para revisión.</p>`;
        resDiv.classList.remove('hidden');
    }

    if(window.MathJax?.typesetPromise) {
        MathJax.typesetPromise([cont]).catch(err => console.log('Error renderizando LaTeX:', err));
    }

    mostrarVista('view-quiz');
};

// Compatibilidad con cualquier historial antiguo que solo haya guardado las preguntas.
window.iniciarQuiz = function(preguntas) {
    const legacyId = `legacy-${Date.now()}`;
    simuladoresGuardadosCache[legacyId] = {
        preguntas: Array.isArray(preguntas) ? preguntas : [],
        respuestas: [],
        puntaje: 0,
        total: Array.isArray(preguntas) ? preguntas.length : 0,
        tema_titulo: temaActualInfo?.titulo || "Práctica"
    };
    window.revisarSimuladorGuardado(legacyId);
};

// Refresca el historial al volver desde la pestaña del simulador.
window.addEventListener('storage', (event) => {
    if(event.key !== 'simuladorGuardado' || !event.newValue) return;
    try {
        const info = JSON.parse(event.newValue);
        if(info.uid === usuarioActual?.uid && info.temaId === temaActualInfo?.id) {
            cargarSimuladoresGuardados();
        }
    } catch(_) {}
});

document.addEventListener('visibilitychange', () => {
    if(!document.hidden && usuarioActual?.uid && temaActualInfo?.id) {
        cargarSimuladoresGuardados();
    }
});

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
            return `<div class="admin-list-row">
                <div class="admin-row-main">
                    <strong>${escapeHTML(nombre)}</strong>
                    <small>${escapeHTML(email)}</small>
                </div>
                <button class="btn-danger admin-mini-btn" onclick="eliminarDocumento('alumnos_autorizados', '${d.id}')"><i class="fas fa-trash"></i></button>
            </div>`;
        }).join('');
    }

    // Si el organizador está visible, mantenlo sincronizado.
    if(!document.getElementById('admin-tab-organizar')?.classList.contains('hidden')) cargarOrganizador();
}

window.eliminarDocumento = async function(coleccion, id) {
    if(confirm(`¿Estás seguro de eliminar este elemento definitivamente?`)) {
        await deleteDoc(doc(db, coleccion, id));
        if(coleccion === 'temas_globales' && temaEditandoId === id) limpiarFormularioTemaAdmin();
        cargarDatosAdmin();
        cargarEstructuraGlobal();
        cargarOrganizador();
    }
}
