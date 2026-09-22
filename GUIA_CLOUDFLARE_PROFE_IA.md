# Profe IA 593 — guía de despliegue

Este paquete separa la clave de Groq del navegador:

Aula / Profe IA (frontend) -> Cloudflare Worker -> Groq API

La clave `GROQ_API_KEY` nunca se escribe en `index.html`, `app.js`, `config.js` ni en GitHub.

## 1. Publicar el aula y Profe IA con Cloudflare Pages

1. Sube la carpeta del proyecto a tu repositorio de GitHub. Mantén juntos:
   - `index.html`
   - `app.js`
   - tu carpeta `imagenes/`
   - `profe-ia/`
2. En Cloudflare abre **Workers & Pages** y crea un proyecto de Pages conectado a ese repositorio.
3. Para un sitio HTML estático no necesitas un framework ni comando de compilación. El directorio de salida debe ser la raíz donde está `index.html`.
4. Despliega. Cloudflare te dará una URL parecida a:
   `https://tu-proyecto.pages.dev`
5. Guarda esa URL: la usarás como origen permitido del Worker.

## 2. Crear la clave en Groq

En tu cuenta Groq crea una API key. No la pegues en ningún archivo ni la subas a GitHub.

También copia el ID exacto de un modelo de chat que aparezca como activo en tu cuenta Groq.
El Worker usa la variable `GROQ_MODEL` para que puedas cambiar de modelo sin modificar el código.

## 3. Desplegar el Cloudflare Worker

### Opción sencilla con Wrangler

Necesitas Node.js instalado.

Desde una terminal:

```bash
cd cloudflare-worker
npm install
npx wrangler login
npx wrangler secret put GROQ_API_KEY
npx wrangler deploy
```

Al ejecutar `secret put`, pega tu clave de Groq. Cloudflare la guarda como secreto.

Después, en Cloudflare > tu Worker > Settings > Variables agrega:

- `ALLOWED_ORIGINS` = `https://tu-proyecto.pages.dev`
- `GROQ_MODEL` = el ID exacto de un modelo activo en tu cuenta Groq

Si también usas un dominio propio, puedes autorizar más de un origen separándolos con coma:

`https://tu-proyecto.pages.dev,https://aula.tudominio.com`

Vuelve a desplegar si Cloudflare te lo solicita.

## 4. Conectar Profe IA con el Worker

Cloudflare te dará una URL del Worker parecida a:

`https://profe-ia-593.tu-subdominio.workers.dev`

Abre:

`profe-ia/config.js`

y cambia:

```js
WORKER_URL: "PEGA_AQUI_LA_URL_DE_TU_WORKER"
```

por la URL real del Worker.

Haz commit y push a GitHub. Cloudflare Pages volverá a desplegar automáticamente si tienes la integración activa.

## 5. Prueba

1. Inicia sesión en el aula.
2. Verás la pestaña flotante **Profe IA**.
3. Ábrela desde Inicio, Materia, Módulo o Tema.
4. El panel recibe automáticamente el contexto académico actual (materia, módulo y tema), pero no recibe tu contraseña ni la API key.
5. Escribe una pregunta. La petición viaja al Worker y el Worker llama a Groq.

## Seguridad incorporada

- `GROQ_API_KEY` vive únicamente como Secret de Cloudflare.
- El navegador nunca recibe la clave.
- El Worker solo acepta `POST`.
- El Worker valida el `Origin` contra `ALLOWED_ORIGINS`.
- Se limitan la cantidad y longitud de mensajes enviados a Groq.
- `GROQ_MODEL` está fuera del frontend y se puede cambiar desde Cloudflare.

Para una segunda fase, si quieres blindar todavía más el servicio, podemos hacer que el Worker valide el token de Firebase del alumno antes de permitir cada consulta. Eso evita que alguien use el endpoint desde fuera del aula incluso si conoce la URL del Worker.
