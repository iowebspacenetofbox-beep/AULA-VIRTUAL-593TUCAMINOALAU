const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

function parseAllowedOrigins(value = "") {
  return String(value).split(",").map(v => v.trim()).filter(Boolean);
}

function corsHeaders(origin, allowedOrigins) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Vary": "Origin"
  };
  if (origin && allowedOrigins.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type";
    headers["Access-Control-Max-Age"] = "86400";
  }
  return headers;
}

function json(data, status, origin, allowedOrigins) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders(origin, allowedOrigins)
  });
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .slice(-20)
    .filter(m => m && ["user", "assistant"].includes(m.role))
    .map(m => ({
      role: m.role,
      content: String(m.content || "").trim().slice(0, 4000)
    }))
    .filter(m => m.content);
}

function cleanContext(context = {}) {
  const allowed = ["ruta", "materia", "modulo", "tema", "recurso", "vista"];
  const out = {};
  for (const key of allowed) {
    if (context?.[key]) out[key] = String(context[key]).trim().slice(0, 300);
  }
  return out;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowedOrigins = parseAllowedOrigins(env.ALLOWED_ORIGINS);

    if (request.method === "OPTIONS") {
      if (!origin || !allowedOrigins.includes(origin)) {
        return json({ error: "Origen no permitido." }, 403, origin, allowedOrigins);
      }
      return new Response(null, { status: 204, headers: corsHeaders(origin, allowedOrigins) });
    }

    if (request.method !== "POST") {
      return json({ error: "Método no permitido." }, 405, origin, allowedOrigins);
    }

    // CORS protege el uso desde navegadores no autorizados.
    // Para producción de mayor escala puede añadirse validación del token Firebase.
    if (!origin || !allowedOrigins.includes(origin)) {
      return json({ error: "Origen no permitido." }, 403, origin, allowedOrigins);
    }

    if (!env.GROQ_API_KEY) {
      return json({ error: "Falta configurar el secreto GROQ_API_KEY en Cloudflare." }, 500, origin, allowedOrigins);
    }
    if (!env.GROQ_MODEL) {
      return json({ error: "Falta configurar GROQ_MODEL con un modelo activo de tu cuenta Groq." }, 500, origin, allowedOrigins);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "JSON inválido." }, 400, origin, allowedOrigins);
    }

    const messages = normalizeMessages(body.messages);
    if (!messages.length) {
      return json({ error: "No se recibió una pregunta válida." }, 400, origin, allowedOrigins);
    }

    const context = cleanContext(body.context);
    const contextText = Object.entries(context)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");

    const systemPrompt = [
      "Eres Profe IA 593, un tutor académico claro, paciente y riguroso para estudiantes de bachillerato que se preparan para ingresar a la universidad.",
      "Explica con precisión, usa pasos y ejemplos cuando ayuden, y adapta la respuesta al nivel del estudiante.",
      "No inventes datos del curso. Si el contexto académico no basta para responder, dilo y pide el dato que falta.",
      "Cuando el estudiante esté trabajando un ejercicio, prioriza enseñar el procedimiento y el razonamiento.",
      "Mantén las respuestas enfocadas y relativamente breves, salvo que el estudiante pida profundidad.",
      contextText ? `Contexto actual dentro del aula:\n${contextText}` : "No hay contexto adicional del aula."
    ].join("\n\n");

    const groqResponse = await fetch(GROQ_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: env.GROQ_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages
        ],
        temperature: 0.35,
        max_tokens: 1000
      })
    });

    let groqData;
    try {
      groqData = await groqResponse.json();
    } catch {
      groqData = null;
    }

    if (!groqResponse.ok) {
      console.error("Groq error:", groqResponse.status, groqData);
      return json({
        error: "Groq rechazó la solicitud. Revisa GROQ_API_KEY, GROQ_MODEL y el estado de tu cuenta."
      }, 502, origin, allowedOrigins);
    }

    const reply = groqData?.choices?.[0]?.message?.content;
    if (!reply) {
      return json({ error: "Groq no devolvió contenido." }, 502, origin, allowedOrigins);
    }

    return json({ reply }, 200, origin, allowedOrigins);
  }
};
