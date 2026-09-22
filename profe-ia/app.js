(() => {
  const messagesEl = document.getElementById('messages');
  const inputEl = document.getElementById('input');
  const sendEl = document.getElementById('send');
  const statusEl = document.getElementById('status');
  const contextEl = document.getElementById('context-text');

  let aulaContext = {};
  const history = [];

  window.addEventListener('message', (event) => {
    const data = event.data;
    if(!data || data.type !== 'PROFE_IA_CONTEXT') return;
    aulaContext = data.context || {};
    const partes = [aulaContext.materia, aulaContext.modulo, aulaContext.tema, aulaContext.recurso].filter(Boolean);
    contextEl.textContent = partes.length ? partes.join(' › ') : (aulaContext.ruta || 'Aula virtual');
  });

  function limpiarRespuestaIA(texto = '') {
    // Algunos modelos de razonamiento pueden devolver bloques <think>. No los mostramos al alumno.
    return String(texto)
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/^\s*<think>[\s\S]*$/i, '')
      .trim();
  }

  async function renderizarMatematicas(elemento) {
    // MathJax se carga de forma asíncrona. Esperamos un momento si todavía no está listo.
    for(let i = 0; i < 40; i++) {
      if(window.MathJax?.typesetPromise) {
        try {
          if(window.MathJax.startup?.promise) await window.MathJax.startup.promise;
          await window.MathJax.typesetPromise([elemento]);
        } catch(err) {
          console.warn('No se pudo renderizar una fórmula del Profe IA:', err);
        }
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  function renderizarRespuestaIA(bubble, text) {
    const limpio = limpiarRespuestaIA(text);

    if(window.marked && window.DOMPurify) {
      try {
        marked.setOptions({ gfm: true, breaks: true });
        const html = marked.parse(limpio);
        bubble.innerHTML = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
      } catch(err) {
        console.warn('No se pudo renderizar Markdown:', err);
        bubble.textContent = limpio;
      }
    } else {
      bubble.textContent = limpio;
    }

    renderizarMatematicas(bubble);
  }

  function addMessage(role, text, extraClass='') {
    const row = document.createElement('div');
    row.className = `msg ${role === 'user' ? 'user' : 'ai'}`;
    const bubble = document.createElement('div');
    bubble.className = `bubble ${extraClass}`;

    // El texto del alumno siempre va como texto plano.
    // Las respuestas del Profe IA usan Markdown + MathJax de forma sanitizada.
    if(role === 'assistant' && extraClass !== 'typing') renderizarRespuestaIA(bubble, text);
    else bubble.textContent = text;

    row.appendChild(bubble);
    messagesEl.appendChild(row);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return row;
  }

  function autoResize() {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 130) + 'px';
  }

  async function send() {
    const text = inputEl.value.trim();
    if(!text) return;

    const workerUrl = String(window.PROFE_IA_CONFIG?.WORKER_URL || '').trim();
    if(!workerUrl || workerUrl.includes('PEGA_AQUI')) {
      statusEl.innerHTML = '<span class="error">Falta configurar la URL del Cloudflare Worker en profe-ia/config.js.</span>';
      return;
    }

    inputEl.value = '';
    autoResize();
    addMessage('user', text);
    history.push({ role:'user', content:text });

    sendEl.disabled = true;
    inputEl.disabled = true;
    statusEl.textContent = 'El Profe IA está pensando...';
    const typing = addMessage('ai', 'Pensando…', 'typing');

    try {
      const response = await fetch(workerUrl, {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({
          messages: history.slice(-12),
          context: aulaContext
        })
      });

      let data = {};
      try { data = await response.json(); } catch(_) {}

      if(!response.ok) {
        throw new Error(data.error || `Error del servidor (${response.status})`);
      }

      const reply = String(data.reply || '').trim() || 'No recibí una respuesta válida. Intenta de nuevo.';
      typing.remove();
      addMessage('ai', reply);
      history.push({ role:'assistant', content:reply });
      statusEl.textContent = 'Listo. Puedes seguir preguntando sobre el mismo tema.';
    } catch(error) {
      typing.remove();
      addMessage('ai', `No pude conectar con el Profe IA: ${error.message}`);
      statusEl.innerHTML = '<span class="error">Revisa la URL del Worker, el origen permitido y las variables de Cloudflare.</span>';
    } finally {
      sendEl.disabled = false;
      inputEl.disabled = false;
      inputEl.focus();
    }
  }

  inputEl.addEventListener('input', autoResize);
  inputEl.addEventListener('keydown', (e) => {
    if(e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });
  sendEl.addEventListener('click', send);
})();
