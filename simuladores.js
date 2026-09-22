import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, addDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

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

const params = new URLSearchParams(location.search);
const temaId = params.get("temaId") || "";
const materiaId = params.get("materiaId") || "";

const topicInfo = document.getElementById("topic-info");
const statusBox = document.getElementById("status");
const quizBox = document.getElementById("quiz");
const resultBox = document.getElementById("result");
const scoreBox = document.getElementById("score");
const scoreText = document.getElementById("score-text");
const generateBtn = document.getElementById("generate-btn");
const newBtn = document.getElementById("new-btn");

let temaActual = null;
let usuarioActual = null;
let preguntas = [];
let dificultadActual = "media";

function setStatus(message, type = "") {
  statusBox.textContent = message;
  statusBox.className = `status${type ? " " + type : ""}`;
  statusBox.classList.remove("hidden");
}

function hideStatus() {
  statusBox.classList.add("hidden");
}

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function workerUrl() {
  const value = window.SIMULADORES_IA_CONFIG?.WORKER_URL?.trim() || "";
  if (!value || value.includes("PEGA_AQUI")) {
    throw new Error("El simulador todavía no tiene configurada la URL del Worker de Gemini.");
  }
  return value.replace(/\/+$/, "");
}

async function typeset(element = document.body) {
  if (!window.MathJax?.typesetPromise) return;
  try {
    if (window.MathJax.typesetClear) window.MathJax.typesetClear([element]);
    await window.MathJax.typesetPromise([element]);
  } catch (err) {
    console.warn("MathJax:", err);
  }
}

async function cargarContexto() {
  if (!temaId || !materiaId) {
    throw new Error("No se recibió el tema desde el aula. Vuelve al tema e intenta abrir la práctica otra vez.");
  }

  const [temaSnap, materiaSnap] = await Promise.all([
    getDoc(doc(db, "temas_globales", temaId)),
    getDoc(doc(db, "materias", materiaId))
  ]);

  if (!temaSnap.exists()) throw new Error("No se encontró el tema en Firebase.");

  const tema = { id: temaSnap.id, ...temaSnap.data() };
  const materia = materiaSnap.exists() ? materiaSnap.data() : {};

  let modulo = {};
  if (tema.modulo_id) {
    try {
      const modSnap = await getDoc(doc(db, "modulos", tema.modulo_id));
      if (modSnap.exists()) modulo = modSnap.data();
    } catch (_) {}
  }

  temaActual = {
    temaId,
    materiaId,
    titulo: tema.titulo || "Tema",
    materia: materia.nombre || "Materia",
    modulo: modulo.nombre || "Módulo",
    moduloId: tema.modulo_id || "",
    resumen: String(tema.resumen_teorico || "").slice(0, 10000)
  };

  topicInfo.textContent = `${temaActual.materia} · ${temaActual.modulo} · ${temaActual.titulo}`;
}

function validarPreguntas(lista) {
  if (!Array.isArray(lista) || !lista.length) throw new Error("La IA no devolvió preguntas válidas.");

  return lista.map((p, i) => {
    const opciones = Array.isArray(p.opciones) ? p.opciones.map(x => String(x)) : [];
    const correcta = Number(p.respuesta_correcta);

    if (!String(p.enunciado || "").trim()) throw new Error(`La pregunta ${i + 1} llegó sin enunciado.`);
    if (opciones.length !== 4) throw new Error(`La pregunta ${i + 1} no tiene exactamente 4 opciones.`);
    if (!Number.isInteger(correcta) || correcta < 0 || correcta > 3) {
      throw new Error(`La pregunta ${i + 1} tiene una respuesta correcta inválida.`);
    }

    return {
      enunciado: String(p.enunciado),
      opciones,
      respuesta_correcta: correcta,
      explicacion: String(p.explicacion || "Revisa el procedimiento y vuelve a intentarlo.")
    };
  });
}

async function generarPractica() {
  if (!usuarioActual || !temaActual) return;

  generateBtn.disabled = true;
  newBtn.disabled = true;
  resultBox.classList.add("hidden");
  quizBox.innerHTML = "";
  setStatus("Generando preguntas con Elix AI...", "");

  const waitingMessageTimer = setTimeout(() => {
    setStatus(
      "Elix AI está preparando las preguntas. Si el servicio está ocupado, reintentaremos automáticamente...",
      ""
    );
  }, 5000);

  try {
    const cantidad = Number(document.getElementById("count").value);
    const dificultad = document.getElementById("difficulty").value;
    dificultadActual = dificultad;

    const res = await fetch(workerUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tema: temaActual,
        cantidad,
        dificultad
      })
    });

    let data = {};
    try { data = await res.json(); } catch (_) {}

    if (!res.ok) {
      throw new Error(data?.error || `El Worker respondió con error ${res.status}.`);
    }

    preguntas = validarPreguntas(data.preguntas);
    renderPreguntas();
    hideStatus();
    newBtn.classList.remove("hidden");
    newBtn.disabled = false;
  } catch (err) {
    console.error(err);
    setStatus(err.message || "No se pudo generar la práctica.", "error");
  } finally {
    clearTimeout(waitingMessageTimer);
    generateBtn.disabled = false;
  }
}

function renderPreguntas() {
  quizBox.innerHTML = preguntas.map((p, i) => `
    <article class="card question" data-question="${i}">
      <h3>${i + 1}. ${escapeHTML(p.enunciado)}</h3>

      <div>
        ${p.opciones.map((op, j) => `
          <label class="option" data-option="${j}">
            <input type="radio" name="q${i}" value="${j}">
            <span><strong>${String.fromCharCode(65 + j)}.</strong> ${escapeHTML(op)}</span>
          </label>
        `).join("")}
      </div>

      <div class="explanation hidden" id="exp-${i}">
        <strong>Explicación:</strong> ${escapeHTML(p.explicacion)}
      </div>
    </article>
  `).join("") + `
    <button id="grade-btn" class="primary" style="width:100%;padding:15px;font-size:16px;">
      Calificar práctica
    </button>
  `;

  document.getElementById("grade-btn").addEventListener("click", calificar);
  typeset(quizBox);
  quizBox.scrollIntoView({ behavior:"smooth", block:"start" });
}

async function guardarIntentoPractica({ respuestas, puntaje, total, porcentaje }) {
  if (!usuarioActual?.uid || !temaActual?.temaId) {
    throw new Error("No hay una sesión o tema válido para guardar esta práctica.");
  }

  const intento = {
    tipo: "practica_ia",
    version: 2,
    tema_id: temaActual.temaId,
    tema_titulo: temaActual.titulo || "Tema",
    materia_id: temaActual.materiaId || "",
    materia_nombre: temaActual.materia || "Materia",
    modulo_id: temaActual.moduloId || "",
    modulo_nombre: temaActual.modulo || "Módulo",
    dificultad: dificultadActual || "media",
    puntaje,
    total,
    porcentaje,
    preguntas: preguntas.map((p) => ({
      enunciado: String(p.enunciado || ""),
      opciones: Array.isArray(p.opciones) ? p.opciones.map((op) => String(op)) : [],
      respuesta_correcta: Number(p.respuesta_correcta),
      explicacion: String(p.explicacion || "")
    })),
    respuestas: respuestas.map((r) => Number.isInteger(r) ? r : null),
    fecha: new Date().toISOString(),
    usuario_email: usuarioActual.email || ""
  };

  const ref = collection(db, "usuarios", usuarioActual.uid, "simuladores_guardados");
  const guardado = await addDoc(ref, intento);

  // Avisa a la pestaña del aula para que refresque el historial en cuanto el alumno vuelva.
  try {
    localStorage.setItem("simuladorGuardado", JSON.stringify({
      uid: usuarioActual.uid,
      temaId: temaActual.temaId,
      intentoId: guardado.id,
      timestamp: Date.now()
    }));
  } catch (_) {}

  return guardado.id;
}

async function calificar() {
  const gradeBtn = document.getElementById("grade-btn");
  if (gradeBtn?.disabled) return;
  if (gradeBtn) gradeBtn.disabled = true;

  let aciertos = 0;
  const respuestas = [];

  preguntas.forEach((p, i) => {
    const card = quizBox.querySelector(`[data-question="${i}"]`);
    const seleccionada = card.querySelector(`input[name="q${i}"]:checked`);
    const labels = [...card.querySelectorAll(".option")];

    const valor = seleccionada ? Number(seleccionada.value) : null;
    respuestas.push(Number.isInteger(valor) ? valor : null);

    labels.forEach(label => {
      label.classList.remove("correct", "wrong");
      const idx = Number(label.dataset.option);
      if (idx === p.respuesta_correcta) label.classList.add("correct");
    });

    if (Number.isInteger(valor)) {
      if (valor === p.respuesta_correcta) {
        aciertos++;
      } else {
        labels[valor]?.classList.add("wrong");
      }
    }

    card.querySelectorAll("input[type=radio]").forEach(input => input.disabled = true);
    document.getElementById(`exp-${i}`)?.classList.remove("hidden");
  });

  const total = preguntas.length;
  const porcentaje = Math.round((aciertos / total) * 100);

  scoreBox.textContent = `${aciertos} / ${total}`;
  const textoBase =
    porcentaje >= 80 ? `Muy buen trabajo: ${porcentaje}% de aciertos.` :
    porcentaje >= 60 ? `Vas avanzando: ${porcentaje}% de aciertos. Revisa las explicaciones.` :
    `Obtuviste ${porcentaje}% de aciertos. Revisa las explicaciones y genera otra práctica.`;

  scoreText.textContent = `${textoBase} Guardando esta práctica en tu historial...`;
  resultBox.classList.remove("hidden");
  await typeset(quizBox);
  resultBox.scrollIntoView({ behavior:"smooth", block:"center" });

  try {
    await guardarIntentoPractica({ respuestas, puntaje: aciertos, total, porcentaje });
    scoreText.textContent = `${textoBase} Esta práctica quedó guardada en tu historial para que puedas revisarla después.`;
  } catch (err) {
    console.error("No se pudo guardar la práctica:", err);
    scoreText.textContent = `${textoBase} La práctica se calificó, pero no se pudo guardar en el historial. Revisa tu conexión e inténtalo nuevamente.`;
  }
}

newBtn.addEventListener("click", generarPractica);
generateBtn.addEventListener("click", generarPractica);

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    setStatus("Debes iniciar sesión en el aula antes de abrir los ejercicios de práctica.", "error");
    generateBtn.disabled = true;
    return;
  }

  usuarioActual = user;

  try {
    setStatus("Cargando el tema desde Firebase...");
    await cargarContexto();
    hideStatus();
  } catch (err) {
    console.error(err);
    setStatus(err.message || "No se pudo cargar el tema.", "error");
    generateBtn.disabled = true;
  }
});
