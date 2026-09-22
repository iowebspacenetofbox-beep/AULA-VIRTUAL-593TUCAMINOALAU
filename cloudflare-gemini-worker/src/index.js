function corsHeaders(origin, env) {
  const allowed = String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map(x => x.trim())
    .filter(Boolean);

  const originAllowed = origin && allowed.includes(origin);

  return {
    "Access-Control-Allow-Origin": originAllowed ? origin : "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };
}

function jsonResponse(body, status, origin, env) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(origin, env)
    }
  });
}

function limpiarTexto(text = "") {
  return String(text)
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function normalizarModelo(model = "") {
  return String(model).trim().replace(/^models\//, "");
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = String(env.ALLOWED_ORIGINS || "")
      .split(",")
      .map(x => x.trim())
      .filter(Boolean);

    if (request.method === "OPTIONS") {
      if (!origin || !allowed.includes(origin)) {
        return jsonResponse({ error: "Origen no autorizado." }, 403, origin, env);
      }
      return new Response(null, { status: 204, headers: corsHeaders(origin, env) });
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Usa POST para generar una práctica." }, 405, origin, env);
    }

    if (!origin || !allowed.includes(origin)) {
      return jsonResponse({ error: "Origen no autorizado." }, 403, origin, env);
    }

    if (!env.GEMINI_API_KEY) {
      return jsonResponse({ error: "Falta configurar GEMINI_API_KEY como Secret en Cloudflare." }, 500, origin, env);
    }

    const model = normalizarModelo(env.GEMINI_MODEL);
    if (!model) {
      return jsonResponse({ error: "Falta configurar GEMINI_MODEL en Cloudflare." }, 500, origin, env);
    }

    let input;
    try {
      input = await request.json();
    } catch (_) {
      return jsonResponse({ error: "Solicitud JSON inválida." }, 400, origin, env);
    }

    const tema = input?.tema || {};
    const cantidad = Math.max(5, Math.min(15, Number(input?.cantidad) || 10));
    const dificultad = String(input?.dificultad || "media").slice(0, 40);

    const titulo = String(tema.titulo || "").trim().slice(0, 200);
    const materia = String(tema.materia || "").trim().slice(0, 120);
    const modulo = String(tema.modulo || "").trim().slice(0, 160);
    const resumen = String(tema.resumen || "").trim().slice(0, 10000);

    if (!titulo) {
      return jsonResponse({ error: "No se recibió el tema de estudio." }, 400, origin, env);
    }

    const prompt = `
Eres un generador de ejercicios educativos para una plataforma de preparación académica.

Genera exactamente ${cantidad} preguntas de opción múltiple sobre el tema indicado.
La dificultad solicitada es: ${dificultad}.

Contexto:
- Materia: ${materia || "No indicada"}
- Módulo: ${modulo || "No indicado"}
- Tema: ${titulo}
- Resumen del tema:
${resumen || "No hay resumen disponible. Trabaja únicamente con el nombre del tema."}

REQUISITOS:
1. Cada pregunta debe tener exactamente 4 opciones.
2. Debe existir una sola respuesta correcta.
3. "respuesta_correcta" debe ser un número entero 0, 1, 2 o 3 que indique el índice de la opción correcta.
4. Incluye una explicación pedagógica breve pero suficiente.
5. No uses preguntas ambiguas ni opciones del tipo "todas las anteriores".
6. Ajusta las preguntas al tema y a la dificultad solicitada.
7. Cuando uses matemáticas, física o química, escribe fórmulas en LaTeX usando $...$ para fórmulas en línea y $$...$$ para fórmulas destacadas.
8. Devuelve SOLAMENTE JSON válido. No agregues texto antes ni después.

Formato exacto:
{
  "preguntas": [
    {
      "enunciado": "texto",
      "opciones": ["opción A", "opción B", "opción C", "opción D"],
      "respuesta_correcta": 0,
      "explicacion": "explicación"
    }
  ]
}
`.trim();

    const endpoint =
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;

    const requestBody = JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: 0.8,
        responseMimeType: "application/json"
      }
    });

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const maxAttempts = 3;
    let geminiResponse = null;
    let geminiData = {};

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        geminiResponse = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: requestBody
        });
      } catch (err) {
        console.error(`Error de red Gemini (intento ${attempt}/${maxAttempts}):`, err);

        if (attempt < maxAttempts) {
          await sleep(attempt === 1 ? 1500 : 3000);
          continue;
        }

        return jsonResponse(
          { error: "Elix AI no pudo conectarse en este momento. Intenta nuevamente en unos segundos." },
          502,
          origin,
          env
        );
      }

      geminiData = {};
      try {
        geminiData = await geminiResponse.json();
      } catch (_) {}

      if (geminiResponse.ok) break;

      const apiMessage =
        geminiData?.error?.message ||
        `Gemini respondió con error ${geminiResponse.status}.`;

      console.error(`Gemini API error (intento ${attempt}/${maxAttempts}):`, apiMessage);

      const lowerMessage = apiMessage.toLowerCase();
      const isQuotaProblem =
        lowerMessage.includes("quota") ||
        lowerMessage.includes("billing") ||
        lowerMessage.includes("daily limit");

      const isTemporaryProblem =
        [429, 500, 502, 503, 504].includes(geminiResponse.status) ||
        lowerMessage.includes("high demand") ||
        lowerMessage.includes("overloaded") ||
        lowerMessage.includes("try again later") ||
        lowerMessage.includes("temporarily unavailable");

      if (isTemporaryProblem && !isQuotaProblem && attempt < maxAttempts) {
        const retryAfter = Number(geminiResponse.headers.get("Retry-After"));
        const fallbackDelay = attempt === 1 ? 1500 : 3000;
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter * 1000, 5000)
          : fallbackDelay;

        await sleep(waitMs);
        continue;
      }

      if (isTemporaryProblem && !isQuotaProblem) {
        return jsonResponse(
          { error: "Elix AI está temporalmente ocupado. Intentamos varias veces automáticamente. Intenta nuevamente en unos segundos." },
          503,
          origin,
          env
        );
      }

      if (isQuotaProblem) {
        return jsonResponse(
          { error: "Elix AI alcanzó temporalmente un límite de uso de la API. Intenta nuevamente más tarde." },
          429,
          origin,
          env
        );
      }

      return jsonResponse(
        { error: "No se pudo generar la práctica en este momento. Intenta nuevamente." },
        502,
        origin,
        env
      );
    }

    if (!geminiResponse?.ok) {
      return jsonResponse(
        { error: "Elix AI está temporalmente ocupado. Intenta nuevamente en unos segundos." },
        503,
        origin,
        env
      );
    }

    const text = (geminiData?.candidates?.[0]?.content?.parts || [])
      .map(part => part?.text || "")
      .join("")
      .trim();

    if (!text) {
      return jsonResponse({ error: "Gemini no devolvió contenido." }, 502, origin, env);
    }

    let parsed;
    try {
      parsed = JSON.parse(limpiarTexto(text));
    } catch (err) {
      console.error("JSON inválido de Gemini:", text.slice(0, 1000));
      return jsonResponse({ error: "Gemini respondió, pero el formato de las preguntas no fue válido. Intenta generar otra práctica." }, 502, origin, env);
    }

    const preguntas = Array.isArray(parsed) ? parsed : parsed?.preguntas;

    if (!Array.isArray(preguntas) || preguntas.length === 0) {
      return jsonResponse({ error: "Gemini no devolvió una lista de preguntas válida." }, 502, origin, env);
    }

    const limpias = preguntas.slice(0, cantidad).map((p) => ({
      enunciado: String(p?.enunciado || ""),
      opciones: Array.isArray(p?.opciones) ? p.opciones.slice(0, 4).map(x => String(x)) : [],
      respuesta_correcta: Number(p?.respuesta_correcta),
      explicacion: String(p?.explicacion || "")
    }));

    const validas = limpias.every((p) =>
      p.enunciado &&
      p.opciones.length === 4 &&
      Number.isInteger(p.respuesta_correcta) &&
      p.respuesta_correcta >= 0 &&
      p.respuesta_correcta <= 3
    );

    if (!validas || limpias.length !== cantidad) {
      return jsonResponse({ error: "La IA devolvió preguntas incompletas. Intenta nuevamente." }, 502, origin, env);
    }

    return jsonResponse({ preguntas: limpias }, 200, origin, env);
  }
};
