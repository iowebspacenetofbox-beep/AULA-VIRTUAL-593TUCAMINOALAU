# Gemini para Ejercicios de Práctica - 593 TucaminoalaU

Este paquete NO reemplaza index.html ni app.js del aula.
Solo agrega el simulador de práctica y un Worker separado para Gemini.

## Archivos a agregar al repositorio

En la raíz:
- simuladores.html
- simuladores.js
- simuladores-config.js

Carpeta nueva:
- cloudflare-gemini-worker/
  - package.json
  - wrangler.toml
  - src/index.js

## Seguridad

La API key de Gemini NO va en GitHub.
Se guarda únicamente en Cloudflare como Secret con el nombre GEMINI_API_KEY.

## Build command del AULA

Cuando los tres archivos del simulador ya estén en GitHub, cambia el Build command del proyecto
aula-virtual-593tucaminoalau por:

mkdir -p dist && cp index.html app.js simuladores.html simuladores.js simuladores-config.js dist/ && cp -r imagenes profe-ia dist/

El Deploy command del aula se mantiene como ya lo tienes configurado.

## Nuevo Worker Gemini

Crea un Worker conectado al mismo repositorio:
- Nombre: simulador-ia-593
- Root directory / Path: /cloudflare-gemini-worker
- Build command: vacío
- Deploy command: npx wrangler deploy

Después crea estas variables:
- GEMINI_API_KEY = tu clave (Secret)
- GEMINI_MODEL = ID exacto de un modelo Gemini activo en tu cuenta (Variable)
- ALLOWED_ORIGINS = https://aula-virtual-593tucaminoalau.io-web-space-neto-f-box.workers.dev (Variable)

## Último paso

Cuando Cloudflare te dé la URL del Worker, edita simuladores-config.js:

window.SIMULADORES_IA_CONFIG = {
  WORKER_URL: "https://TU-WORKER.workers.dev"
};

Haz Commit changes y espera el nuevo despliegue del aula.

## Funcionamiento

El app.js del aula ya abre:
simuladores.html?temaId=...&materiaId=...

El simulador:
1. Verifica que el estudiante esté autenticado en Firebase.
2. Lee materia, módulo, tema y resumen desde Firestore.
3. Envía ese contexto al Worker.
4. El Worker llama a Gemini sin exponer la API key.
5. Recibe 5, 10 o 15 preguntas con cuatro opciones.
6. El estudiante responde y la página califica localmente.
7. Las fórmulas se renderizan con MathJax.
8. Las prácticas NO modifican el progreso del tema.
