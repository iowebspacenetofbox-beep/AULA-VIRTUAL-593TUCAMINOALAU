(() => {
  const messagesEl = document.getElementById('messages');
  const inputEl = document.getElementById('input');
  const sendEl = document.getElementById('send');
  const statusEl = document.getElementById('status');
  const contextEl = document.getElementById('context-text');
  const newChatEl = document.getElementById('new-chat');

  const STORAGE_KEY = 'profeIA593_chat_local_v1';
  const MAX_LOCAL_MESSAGES = 100;
  const MAX_CONTEXT_MESSAGES = 20;

  let aulaContext = {};
  let history = [];
  let requestInFlight = false;
  let editandoRow = null;

  function guardarHistorialLocal() {
    try {
      const limpio = history
        .filter(m => m && ['user','assistant'].includes(m.role) && String(m.content || '').trim())
        .slice(-MAX_LOCAL_MESSAGES)
        .map(m => ({ role:m.role, content:String(m.content).slice(0, 8000) }));
      history = limpio;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(limpio));
    } catch(err) {
      console.warn('No se pudo guardar la memoria local del Profe IA:', err);
    }
  }

  function cargarHistorialLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const data = raw ? JSON.parse(raw) : [];
      if(!Array.isArray(data)) return [];
      return data
        .filter(m => m && ['user','assistant'].includes(m.role) && typeof m.content === 'string' && m.content.trim())
        .slice(-MAX_LOCAL_MESSAGES);
    } catch(err) {
      console.warn('No se pudo leer la memoria local del Profe IA:', err);
      return [];
    }
  }

  function limpiarMensajesVisuales() {
    messagesEl.querySelectorAll('.msg').forEach(el => el.remove());
  }

  function renderizarHistorialActual() {
    limpiarMensajesVisuales();
    history.forEach((item, index) => addMessage(item.role, item.content, '', index));
  }

  async function restaurarHistorialVisual() {
    history = cargarHistorialLocal();
    renderizarHistorialActual();
    if(history.length) {
      statusEl.textContent = 'Chat restaurado desde la memoria de este equipo.';
      await new Promise(resolve => requestAnimationFrame(resolve));
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  }

  function nuevoChat() {
    if(history.length && !confirm('¿Iniciar un chat nuevo? Se borrará la conversación guardada en este equipo.')) return;
    history = [];
    try { localStorage.removeItem(STORAGE_KEY); } catch(_) {}
    limpiarMensajesVisuales();
    inputEl.value = '';
    autoResize();
    statusEl.textContent = 'Nuevo chat iniciado. La memoria anterior de este equipo fue borrada.';
    inputEl.focus();
  }

  window.addEventListener('message', (event) => {
    const data = event.data;
    if(!data || data.type !== 'PROFE_IA_CONTEXT') return;
    aulaContext = data.context || {};
    const partes = [aulaContext.materia, aulaContext.modulo, aulaContext.tema, aulaContext.recurso].filter(Boolean);
    contextEl.textContent = partes.length ? partes.join(' › ') : (aulaContext.ruta || 'Aula virtual');
  });

  function limpiarRespuestaIA(texto = '') {
    return String(texto)
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/^\s*<think>[\s\S]*$/i, '')
      .trim();
  }

  function escapeHTML(texto = '') {
    return String(texto)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Renderizador Markdown seguro incorporado. No depende de marked.js ni de DOMPurify.
  // Todo el texto se escapa primero y solo después se añaden etiquetas controladas.
  function markdownSeguro(texto = '') {
    let src = String(texto).replace(/\r\n?/g, '\n').trim();
    const protegidos = [];

    const guardar = (contenido) => {
      const token = `@@PROTEGIDO_${protegidos.length}@@`;
      protegidos.push(contenido);
      return token;
    };

    // Protege código y matemáticas para que los asteriscos o guiones internos no se interpreten como Markdown.
    src = src.replace(/```([\s\S]*?)```/g, (_, code) => guardar(`<pre><code>${escapeHTML(code.replace(/^\n|\n$/g, ''))}</code></pre>`));
    src = src.replace(/\$\$([\s\S]*?)\$\$/g, (m) => guardar(escapeHTML(m)));
    src = src.replace(/\\\[([\s\S]*?)\\\]/g, (m) => guardar(escapeHTML(m)));
    src = src.replace(/\\\(([\s\S]*?)\\\)/g, (m) => guardar(escapeHTML(m)));
    src = src.replace(/\$(?!\$)([^\n$]+?)\$/g, (m) => guardar(escapeHTML(m)));
    src = src.replace(/`([^`\n]+)`/g, (_, code) => guardar(`<code>${escapeHTML(code)}</code>`));

    src = escapeHTML(src);

    // Formato en línea sobre texto ya escapado.
    src = src
      .replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>')
      .replace(/__([^_\n]+?)__/g, '<strong>$1</strong>')
      .replace(/(^|[\s(])\*([^*\n]+?)\*(?=$|[\s).,!?:;])/g, '$1<em>$2</em>')
      .replace(/(^|[\s(])_([^_\n]+?)_(?=$|[\s).,!?:;])/g, '$1<em>$2</em>');

    const lines = src.split('\n');
    const out = [];
    let paragraph = [];
    let listType = null;

    const flushParagraph = () => {
      if(paragraph.length) {
        out.push(`<p>${paragraph.join('<br>')}</p>`);
        paragraph = [];
      }
    };
    const closeList = () => {
      if(listType) {
        out.push(`</${listType}>`);
        listType = null;
      }
    };

    for(const raw of lines) {
      const line = raw.trimEnd();
      if(!line.trim()) {
        flushParagraph();
        closeList();
        continue;
      }

      let m;
      if((m = line.match(/^####\s+(.+)$/))) { flushParagraph(); closeList(); out.push(`<h4>${m[1]}</h4>`); continue; }
      if((m = line.match(/^###\s+(.+)$/)))  { flushParagraph(); closeList(); out.push(`<h3>${m[1]}</h3>`); continue; }
      if((m = line.match(/^##\s+(.+)$/)))   { flushParagraph(); closeList(); out.push(`<h2>${m[1]}</h2>`); continue; }
      if((m = line.match(/^#\s+(.+)$/)))    { flushParagraph(); closeList(); out.push(`<h1>${m[1]}</h1>`); continue; }
      if((m = line.match(/^>\s?(.+)$/)))    { flushParagraph(); closeList(); out.push(`<blockquote>${m[1]}</blockquote>`); continue; }

      if((m = line.match(/^[-*+]\s+(.+)$/))) {
        flushParagraph();
        if(listType !== 'ul') { closeList(); out.push('<ul>'); listType = 'ul'; }
        out.push(`<li>${m[1]}</li>`);
        continue;
      }
      if((m = line.match(/^\d+[.)]\s+(.+)$/))) {
        flushParagraph();
        if(listType !== 'ol') { closeList(); out.push('<ol>'); listType = 'ol'; }
        out.push(`<li>${m[1]}</li>`);
        continue;
      }

      closeList();
      paragraph.push(line.trim());
    }

    flushParagraph();
    closeList();

    let html = out.join('');
    protegidos.forEach((contenido, index) => {
      html = html.replaceAll(`@@PROTEGIDO_${index}@@`, contenido);
    });
    return html;
  }

  async function renderizarMatematicas(elemento) {
    for(let i = 0; i < 60; i++) {
      if(window.MathJax?.typesetPromise) {
        try {
          if(window.MathJax.startup?.promise) await window.MathJax.startup.promise;
          if(window.MathJax.typesetClear) window.MathJax.typesetClear([elemento]);
          await window.MathJax.typesetPromise([elemento]);
        } catch(err) {
          console.warn('No se pudo renderizar una fórmula del Profe IA:', err);
        }
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    console.warn('MathJax no terminó de cargar en el Profe IA.');
  }

  async function renderizarRespuestaIA(bubble, text) {
    const limpio = limpiarRespuestaIA(text);
    bubble.innerHTML = markdownSeguro(limpio);
    await renderizarMatematicas(bubble);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function setEditButtonsDisabled(disabled) {
    messagesEl.querySelectorAll('.edit-message-btn').forEach(btn => { btn.disabled = disabled; });
  }

  function obtenerWorkerUrl() {
    return String(window.PROFE_IA_CONFIG?.WORKER_URL || '').trim();
  }

  function workerConfigurado(workerUrl = obtenerWorkerUrl()) {
    return Boolean(workerUrl && !workerUrl.includes('PEGA_AQUI'));
  }

  function abrirEditorMensaje(historyIndex, row) {
    if(requestInFlight) {
      statusEl.textContent = 'Espera a que termine la respuesta actual antes de editar una pregunta.';
      return;
    }

    const actual = history[historyIndex];
    if(!actual || actual.role !== 'user') return;

    // Solo mantiene un editor abierto a la vez.
    if(editandoRow && editandoRow !== row) renderizarHistorialActual();
    editandoRow = row;

    row.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'edit-message-box';

    const textarea = document.createElement('textarea');
    textarea.value = actual.content;
    textarea.maxLength = 4000;
    textarea.setAttribute('aria-label', 'Editar pregunta');

    const actions = document.createElement('div');
    actions.className = 'edit-message-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'edit-message-cancel';
    cancelBtn.textContent = 'Cancelar';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'edit-message-save';
    saveBtn.textContent = 'Guardar y reenviar';

    cancelBtn.addEventListener('click', () => {
      editandoRow = null;
      renderizarHistorialActual();
    });

    saveBtn.addEventListener('click', async () => {
      const edited = textarea.value.trim();
      if(!edited) {
        statusEl.innerHTML = '<span class="error">La pregunta no puede quedar vacía.</span>';
        textarea.focus();
        return;
      }

      const workerUrl = obtenerWorkerUrl();
      if(!workerConfigurado(workerUrl)) {
        statusEl.innerHTML = '<span class="error">Falta configurar la URL del Cloudflare Worker en profe-ia/config.js.</span>';
        return;
      }

      if(edited === actual.content) {
        editandoRow = null;
        renderizarHistorialActual();
        return;
      }

      // Editar una pregunta crea una nueva rama coherente: elimina esa pregunta y
      // las respuestas posteriores, conserva lo anterior y vuelve a consultar al Profe IA.
      history = history.slice(0, historyIndex);
      guardarHistorialLocal();
      editandoRow = null;
      renderizarHistorialActual();
      statusEl.textContent = 'Pregunta editada. Generando una nueva respuesta...';
      await enviarTexto(edited, workerUrl);
    });

    textarea.addEventListener('keydown', (e) => {
      if(e.key === 'Escape') cancelBtn.click();
      if(e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        saveBtn.click();
      }
    });

    actions.append(cancelBtn, saveBtn);
    box.append(textarea, actions);
    row.appendChild(box);
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }

  function addMessage(role, text, extraClass='', historyIndex=null) {
    const row = document.createElement('div');
    row.className = `msg ${role === 'user' ? 'user' : 'ai'}`;
    const bubble = document.createElement('div');
    bubble.className = `bubble ${extraClass}`;

    if(role === 'assistant' && extraClass !== 'typing') {
      // Renderiza Markdown y LaTeX sin bloquear el resto del chat.
      renderizarRespuestaIA(bubble, text);
    } else {
      bubble.textContent = text;
    }

    if(role === 'user' && Number.isInteger(historyIndex)) {
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'edit-message-btn';
      editBtn.title = 'Editar pregunta';
      editBtn.setAttribute('aria-label', 'Editar pregunta');
      editBtn.innerHTML = '<i class="fas fa-pen"></i>';
      editBtn.addEventListener('click', () => abrirEditorMensaje(historyIndex, row));
      row.appendChild(editBtn);
    }

    row.appendChild(bubble);
    messagesEl.appendChild(row);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return row;
  }

  function autoResize() {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 130) + 'px';
  }

  async function enviarTexto(text, workerUrl = obtenerWorkerUrl()) {
    text = String(text || '').trim();
    if(!text || requestInFlight) return;

    if(!workerConfigurado(workerUrl)) {
      statusEl.innerHTML = '<span class="error">Falta configurar la URL del Cloudflare Worker en profe-ia/config.js.</span>';
      return;
    }

    requestInFlight = true;
    history.push({ role:'user', content:text });
    guardarHistorialLocal();
    addMessage('user', text, '', history.length - 1);

    sendEl.disabled = true;
    inputEl.disabled = true;
    setEditButtonsDisabled(true);
    statusEl.textContent = 'El Profe IA está pensando...';
    const typing = addMessage('ai', 'Pensando…', 'typing');

    try {
      const response = await fetch(workerUrl, {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ messages: history.slice(-MAX_CONTEXT_MESSAGES), context: aulaContext })
      });

      let data = {};
      try { data = await response.json(); } catch(_) {}

      if(!response.ok) throw new Error(data.error || `Error del servidor (${response.status})`);

      const reply = String(data.reply || '').trim() || 'No recibí una respuesta válida. Intenta de nuevo.';
      typing.remove();
      history.push({ role:'assistant', content:reply });
      guardarHistorialLocal();
      addMessage('assistant', reply, '', history.length - 1);
      statusEl.textContent = 'Listo. Puedes seguir preguntando sobre el mismo tema.';
    } catch(error) {
      typing.remove();
      addMessage('assistant', `No pude conectar con el Profe IA: ${error.message}`);
      statusEl.innerHTML = '<span class="error">Revisa la URL del Worker, el origen permitido y las variables de Cloudflare.</span>';
    } finally {
      requestInFlight = false;
      sendEl.disabled = false;
      inputEl.disabled = false;
      setEditButtonsDisabled(false);
      inputEl.focus();
    }
  }

  async function send() {
    if(requestInFlight) return;
    const text = inputEl.value.trim();
    if(!text) return;

    const workerUrl = obtenerWorkerUrl();
    if(!workerConfigurado(workerUrl)) {
      statusEl.innerHTML = '<span class="error">Falta configurar la URL del Cloudflare Worker en profe-ia/config.js.</span>';
      return;
    }

    inputEl.value = '';
    autoResize();
    await enviarTexto(text, workerUrl);
  }

  inputEl.addEventListener('input', autoResize);
  inputEl.addEventListener('keydown', (e) => {
    if(e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });
  sendEl.addEventListener('click', send);
  newChatEl?.addEventListener('click', nuevoChat);

  // Recupera automáticamente la conversación guardada en este navegador/equipo.
  restaurarHistorialVisual();
})();
