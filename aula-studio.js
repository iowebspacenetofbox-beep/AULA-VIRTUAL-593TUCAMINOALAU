/* Extensión del editor. Conserva las colecciones y el flujo original del aula. */
(() => {
'use strict';
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let baseline = '', saving = false;
const fieldIds = ['admin-tema-materia','admin-tema-modulo','admin-tema-titulo','admin-tema-lecturas','admin-tema-videos','admin-tema-laboratorio','admin-tema-imagenes','admin-tema-pdf'];
function safeURL(value, tool = false) {
 const raw = String(value || '').trim();
 if(!raw || /[\u0000-\u0020\\]/.test(raw) || /^(?:javascript|data|vbscript|file|blob):/i.test(raw)) return '';
 try {
  const url = new URL(raw, location.href);
  if(url.username || url.password) return '';
  if(!['https:', 'http:'].includes(url.protocol)) return '';
  if(tool && url.protocol !== 'https:' && url.origin !== location.origin) return '';
  return raw;
 } catch(_) { return ''; }
}
// Allowlist: el HTML importado conserva contenido educativo, nunca scripts o iframes.
function cleanHTML(html) {
 const source = new DOMParser().parseFromString(String(html || ''), 'text/html');
 const allowed = new Set('P BR DIV SPAN FONT H1 H2 H3 H4 H5 H6 STRONG B EM I U S STRIKE SUB SUP UL OL LI BLOCKQUOTE PRE CODE TABLE THEAD TBODY TFOOT TR TD TH HR A IMG FIGURE FIGCAPTION'.split(' '));
 const remove = new Set('SCRIPT STYLE IFRAME OBJECT EMBED SVG MATH FORM INPUT BUTTON TEXTAREA SELECT LINK META BASE NOSCRIPT TEMPLATE'.split(' '));
 function walk(node) {
  if(node.nodeType === 3) return document.createTextNode(node.textContent);
  if(node.nodeType !== 1 || remove.has(node.tagName)) return document.createDocumentFragment();
  const out = allowed.has(node.tagName) ? document.createElement(node.tagName === 'FONT' ? 'span' : node.tagName.toLowerCase()) : document.createDocumentFragment();
  if(out.nodeType === 1) {
   if(node.tagName === 'A') { const url = safeURL(node.getAttribute('href')); if(url) { out.setAttribute('href',url); out.target='_blank'; out.rel='noopener noreferrer'; } }
   if(node.tagName === 'IMG') { const url=safeURL(node.getAttribute('src')); if(!url) return document.createDocumentFragment(); out.src=url; out.alt=node.getAttribute('alt') || ''; out.loading='lazy'; }
   if(node.tagName === 'FONT' && node.getAttribute('color')) out.style.color=node.getAttribute('color');
   ['colspan','rowspan'].forEach(k => {const n=Number(node.getAttribute(k)); if(n>0 && n<=30) out.setAttribute(k,String(n));});
   ['data-concept','data-modal-image'].forEach(k=>{if(node.hasAttribute(k)) out.setAttribute(k,node.getAttribute(k));});
   const classes = (node.getAttribute('class') || '').split(/\s+/).filter(c=>['concept-link','rich-figure','rich-inline-image','studio-callout'].includes(c));
   if(classes.length) out.className=classes.join(' ');
   ['text-align','color','background-color','font-weight','font-style','text-decoration','vertical-align'].forEach(k=>{ const v=node.style.getPropertyValue(k); if(v && !/url|expression|var\(/i.test(v)) out.style.setProperty(k,v); });
  }
  node.childNodes.forEach(child => out.append(walk(child)));
  return out;
 }
 const container=document.createElement('div'); source.body.childNodes.forEach(n=>container.append(walk(n))); return container.innerHTML;
}
function markdown(text) {
 // Proteger delimitadores y barras LaTeX frente al parser Markdown.
 const formulas=[];
 const token='AULAMATH'+Math.random().toString(36).slice(2).toUpperCase();
 const protectedText=String(text).replace(/\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|(?<!\$)\$[^$\n]+\$(?!\$)/g, m=>{ formulas.push(m); return token+(formulas.length-1)+'END'; });
 let html=window.marked?.parse ? window.marked.parse(protectedText) : '<p>'+esc(protectedText).replace(/\n/g,'<br>')+'</p>';
 formulas.forEach((m,i)=>{html=html.split(token+i+'END').join(esc(m));});
 return html;
}
function sync() {
 if(!$('admin-rich-editor')) return;
 $('admin-tema-resumen').value=$('admin-rich-editor').innerHTML.trim();
 const text=$('admin-rich-editor').textContent.trim();
 $('studio-word-count').textContent=(text ? text.split(/\s+/).length : 0)+' palabras';
 $('studio-dirty').textContent=saving ? 'Guardando…' : dirty() ? 'Cambios sin publicar' : 'Sin cambios pendientes';
}
function snapshot() { return JSON.stringify([fieldIds.map(id=>$(id)?.value || ''),$('admin-rich-editor')?.innerHTML || '',Array.from(document.querySelectorAll('#studio-tool-list .studio-tool-row')).map(row=>Array.from(row.querySelectorAll('input,textarea,select')).map(n=>n.value))]); }
function dirty(){return !!baseline && baseline!==snapshot();}
function markClean(){baseline=snapshot();sync();}
function canDiscard(){return !dirty() || confirm('Hay cambios sin publicar en este tema. ¿Quieres descartarlos?');}
function insert(html) {
 if(saving) return;
 window.editorCommand('insertHTML',cleanHTML(html)); sync();
}
function dialog(title, body, actionLabel, action) {
 const d=document.createElement('dialog'); d.className='studio-dialog';
 d.innerHTML=`<form method="dialog"><header><h2>${esc(title)}</h2><button class="btn-outline" value="cancel" aria-label="Cerrar">×</button></header>${body}<footer><button class="btn-outline" value="cancel">Cancelar</button><button class="btn-success" type="button" data-apply>${esc(actionLabel)}</button></footer><p class="studio-dialog-error" role="alert"></p></form>`;
 document.body.append(d); d.addEventListener('close',()=>d.remove());
 d.querySelector('[data-apply]').onclick=()=>{try {const html=action(d);d.close();if(html)insert(html);}catch(e){d.querySelector('[role=alert]').textContent=e.message;}};
 d.showModal();
}
function addTool(data={}) {
 const row=document.createElement('div'); row.className='studio-tool-row';
 row.innerHTML=`<div class="studio-tool-head"><strong>Recurso interactivo</strong><div><button type="button" class="btn-outline" data-up aria-label="Subir herramienta">↑</button> <button type="button" class="btn-outline" data-remove aria-label="Quitar herramienta">Quitar</button></div></div>
<label>Nombre<input class="input-text" data-title maxlength="120" placeholder="Configuración electrónica" value="${esc(data.titulo)}"></label>
<label>Enlace o ruta de la app<input class="input-text" data-url placeholder="https://mi-app.netlify.app o herramientas/atomo/index.html" value="${esc(data.url)}"></label>
<label>Instrucciones para el alumno<textarea data-description rows="2" maxlength="1500" placeholder="Explora un elemento y observa cómo se llenan sus orbitales.">${esc(data.descripcion)}</textarea></label>
<label>Cómo se abre<select class="input-text" data-mode><option value="enlace">En una pestaña nueva (mayor compatibilidad)</option><option value="integrada">Dentro del tema</option></select></label>`;
 row.querySelector('[data-mode]').value=data.modo==='integrada'?'integrada':'enlace';
 row.querySelector('[data-remove]').onclick=()=>{row.remove();sync();};
 row.querySelector('[data-up]').onclick=()=>{if(row.previousElementSibling)row.before(row.previousElementSibling);sync();};
 $('studio-tool-list').append(row);sync();
}
function loadTools(items) { $('studio-tool-list').replaceChildren(); (Array.isArray(items)?items:[]).forEach(addTool); }
function readTools() {
 return Array.from(document.querySelectorAll('#studio-tool-list .studio-tool-row')).map((r,i)=>{
  const titulo=r.querySelector('[data-title]').value.trim();const url=safeURL(r.querySelector('[data-url]').value,true);
  if(!titulo || !url) throw new Error(`Herramienta ${i+1}: escribe un nombre y un enlace HTTPS válido o una ruta del mismo sitio.`);
  return {titulo,url,descripcion:r.querySelector('[data-description]').value.trim(),modo:r.querySelector('[data-mode]').value};
 });
}
function toolCards(items, target) {
 target.replaceChildren();
 items.forEach(t=>{
  if(!safeURL(t.url,true)) return;
  const article=document.createElement('article');article.className='studio-resource-card';
  article.innerHTML=`<div class="studio-eyebrow">HERRAMIENTA INTERACTIVA</div><h3>${esc(t.titulo)}</h3><p>${esc(t.descripcion)}</p><div class="studio-quickbar"><a class="btn-outline" target="_blank" rel="noopener noreferrer" href="${esc(t.url)}">Abrir en otra pestaña ↗</a></div>`;
  if(t.modo==='integrada') {
   const btn=document.createElement('button');btn.type='button';btn.className='btn-success';btn.textContent='Iniciar herramienta';
   const note=document.createElement('p');note.className='studio-hint';note.textContent='Si la app no carga o necesita iniciar sesión, ábrela en otra pestaña.';
   btn.onclick=()=>{
    const existing=article.querySelector('iframe');
    if(existing){existing.remove();btn.textContent='Iniciar herramienta';return;}
    const frame=document.createElement('iframe');frame.src=t.url;frame.title=t.titulo || 'Herramienta interactiva';
    frame.setAttribute('sandbox','allow-scripts allow-forms allow-downloads allow-popups allow-popups-to-escape-sandbox');
    frame.referrerPolicy='no-referrer';frame.allowFullscreen=true;frame.loading='lazy';article.append(frame);btn.textContent='Cerrar herramienta';
   };
   article.querySelector('.studio-quickbar').prepend(btn);article.append(note);
  }
  target.append(article);
 });
}
function renderTools(items) {
 const valid=(Array.isArray(items)?items:[]).filter(t=>t && safeURL(t.url,true));
 $('studio-tools-menu').classList.toggle('hidden',!valid.length);toolCards(valid,$('studio-student-tools'));
}
function previewTools(preview) {
 try {const items=readTools();if(items.length){const wrap=document.createElement('div');preview.append(wrap);toolCards(items,wrap);}} catch(e){const p=document.createElement('p');p.textContent=e.message;preview.append(p);}
}
function search() {
 const q=($('studio-search')?.value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();let count=0;
 document.querySelectorAll('#admin-lista-temas .admin-group-block').forEach(group=>{
  let visible=0;const heading=group.querySelector('.admin-group-title')?.textContent||'';
  group.querySelectorAll('.admin-list-row').forEach(row=>{const text=(heading+' '+row.querySelector('.admin-row-main').textContent).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();const match=text.includes(q);row.hidden=!match;if(match)visible++;});
  group.hidden=!visible;count+=visible;
 });
 $('studio-search-status').textContent=q ? `${count} temas encontrados` : '';
}
function refreshAdmin(...counts) { $('studio-stats').innerHTML=counts.map((n,i)=>`<div><strong>${n}</strong><span>${['Materias','Módulos','Temas','Alumnos autorizados'][i]}</span></div>`).join('');search(); }
window.AulaStudio={cleanHTML,markdown,safeURL,loadTools,readTools,renderTools,previewTools,markClean,canDiscard,refreshAdmin,setSaving(value){saving=value;$('admin-tab-temas').classList.toggle('studio-saving',value);sync();}};
document.addEventListener('DOMContentLoaded',()=>{
 const editor=$('admin-rich-editor'); if(!editor) return;
 const compact=matchMedia('(max-width: 768px)');
 function collapseMobile(){if(compact.matches){$('sidebar').classList.add('collapsed');$('btn-expand-sidebar').classList.remove('hidden');}}
 collapseMobile();compact.addEventListener('change',collapseMobile);
 editor.setAttribute('role','textbox');editor.setAttribute('aria-label','Contenido del tema');editor.setAttribute('aria-multiline','true');
 $('admin-tab-temas').addEventListener('input',sync);$('admin-tab-temas').addEventListener('change',sync);
 $('studio-add-tool').onclick=()=>addTool();$('studio-search').addEventListener('input',search);
 editor.addEventListener('paste',e=>{
  if(!e.clipboardData)return;e.preventDefault();
  const html=e.clipboardData.getData('text/html'),text=e.clipboardData.getData('text/plain');
  insert(html || '<p>'+esc(text).replace(/\n/g,'<br>')+'</p>');
 });
 // El arrastre de archivos/enlaces no puede introducir HTML sin limpiar.
 editor.addEventListener('drop',e=>{e.preventDefault();});
 $('studio-import').onclick=()=>$('studio-file').click();
 $('studio-file').onchange=async e=>{
  const file=e.target.files[0];if(!file)return;
  try {
   if(file.size>2*1024*1024)throw new Error('Usa un archivo de texto menor a 2 MB.');
   const ext=file.name.split('.').pop().toLowerCase();if(!['md','markdown','html','htm','txt'].includes(ext))throw new Error('Formato admitido: TXT, Markdown o HTML. Para Word, copia y pega el contenido.');
   const text=await file.text();
   insert(['html','htm'].includes(ext)?text:['md','markdown'].includes(ext)?markdown(text):'<p>'+esc(text).replace(/\n\s*\n/g,'</p><p>').replace(/\n/g,'<br>')+'</p>');
  }catch(err){alert(err.message);}finally{e.target.value='';}
 };
 $('studio-paste').onclick=()=>dialog('Pegar y dar formato',`<p>Pega texto o Markdown: los encabezados con #, las listas y las tablas se convertirán en contenido editable. Se añade a tu texto actual.</p><label>Texto<textarea data-text rows="12" placeholder="# Título del tema&#10;&#10;## Conceptos clave&#10;- Primer concepto"></textarea></label>`,'Insertar con formato',d=>{const text=d.querySelector('[data-text]').value;if(!text.trim())throw new Error('Pega primero un texto.');return markdown(text);});
 $('studio-template').onclick=()=>dialog('Una base para tu clase',`<p>Se añade al contenido existente. Puedes cambiar todos los apartados.</p><label>Tipo de clase<select data-template><option value="teoria">Teoría y práctica</option><option value="laboratorio">Laboratorio guiado</option><option value="lectura">Lectura y análisis</option></select></label>`,'Insertar plantilla',d=>{
 const templates={teoria:'<h2>Objetivo de aprendizaje</h2><p>Al finalizar, podrás…</p><h2>Conceptos clave</h2><p>Explica aquí las ideas principales.</p><h3>Ejemplo resuelto</h3><p>Desarrolla el procedimiento paso a paso.</p><blockquote>Recuerda: escribe aquí una idea esencial.</blockquote><h2>Ahora practica</h2><ol><li>Describe el problema.</li><li>Aplica lo aprendido.</li></ol>',laboratorio:'<h2>Pregunta de investigación</h2><p>¿Qué vamos a comprobar?</p><h2>Materiales</h2><ul><li>Material necesario</li></ul><h2>Procedimiento</h2><ol><li>Preparación</li><li>Observación</li><li>Registro de resultados</li></ol><h2>Resultados y conclusiones</h2><p>Compara lo observado con tu hipótesis.</p>',lectura:'<h2>Antes de leer</h2><p>Activa tus conocimientos previos.</p><h2>Texto de estudio</h2><p>Introduce aquí la lectura.</p><h2>Preguntas de análisis</h2><ol><li>¿Cuál es la idea principal?</li><li>¿Qué evidencia la respalda?</li></ol><h2>Síntesis</h2><p>Resume lo aprendido con tus palabras.</p>'};return templates[d.querySelector('[data-template]').value];});
 function focusOff(){document.body.classList.remove('studio-focus');$('studio-focus').textContent='Ampliar editor';}
 $('studio-focus').onclick=()=>{const active=document.body.classList.toggle('studio-focus');$('studio-focus').textContent=active?'Salir de vista ampliada':'Ampliar editor';};
 document.addEventListener('keydown',e=>{if(e.key==='Escape')focusOff();});
 new MutationObserver(()=>{if($('view-admin').classList.contains('hidden')||$('admin-tab-temas').classList.contains('hidden'))focusOff();}).observe($('view-admin'),{attributes:true,subtree:true,attributeFilter:['class']});
 window.addEventListener('beforeunload',e=>{if(dirty()){e.preventDefault();e.returnValue='';}});
 document.querySelectorAll('.editor-actions button').forEach(b=>b.addEventListener('mousedown',e=>e.preventDefault()));
 markClean();
});
})();
