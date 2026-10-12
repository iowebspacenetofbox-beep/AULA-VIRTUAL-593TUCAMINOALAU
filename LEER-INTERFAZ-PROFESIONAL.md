# Plataforma Virtual de Educación — Interfaz profesional

Esta entrega parte del ZIP más reciente enviado y conserva su estructura de carpetas.

## Cambios

- Paleta unificada de azul profundo, verde y fondos claros.
- Presentación del acceso, portada, menú, tarjetas, recursos, administración y prácticas.
- Tipografía, espaciado, campos, botones y adaptación a móvil.
- Nombre visible: Plataforma Virtual de Educación.
- Se conservan el logotipo y los colores que identifican el progreso.

Los cambios de presentación están en index.html, aula-studio.css, simuladores.html y profe-ia/index.html. En profe-ia/app.js únicamente se sustituyó una etiqueta visible. Se actualizaron también menciones del nombre en las guías.

## Comprobaciones

Comparación con el ZIP de origen: scripts incrustados, eventos e identificadores conservados; los archivos JavaScript permanecen idénticos salvo la etiqueta indicada. Pruebas locales con datos simulados de navegación, editor, acceso y presentación en escritorio y móvil completadas. Estas pruebas no verifican autenticación ni escritura reales en Firebase. No se modificó la base de datos.

## Cómo usar esta entrega

Descomprime el ZIP y usa el contenido de su carpeta raíz para actualizar el mismo proyecto, conservando las rutas relativas y la configuración de despliegue existente. Guarda una copia de tu versión publicada antes de actualizar. Este archivo contiene el proyecto completo; no se ha publicado automáticamente.

## Edición Horizonte

Segunda revisión visual: verde profundo y marfil, títulos combinados con tipografía editorial, portada ilustrada del video, tarjetas de aprendizaje y acceso de presentación más elegante. La ilustración se guarda en imagenes/portada-aprendizaje.svg y no reemplaza el video. Esta revisión conserva todos los archivos JavaScript y eventos de la entrega anterior. Pruebas locales con servicios simulados, en escritorio y móvil, completadas.

Este ZIP es completo y sustituye al anterior; no es necesario instalar ambos.

## Horizonte — acabado refinado

Inicio más compacto, tarjetas editoriales, controles uniformes, recursos de aprendizaje y administración refinados. Profe IA se abre desde una cápsula inferior; su funcionamiento permanece igual. Se armonizaron el chat y las prácticas con la paleta verde y marfil. Dos mensajes visibles en simuladores.js usan ahora «plataforma» en lugar de «aula»; su lógica permanece intacta.

Verificado: navegación, editor, apertura de Profe IA, escritorio y móvil; acceso ajustado a 1366 × 768. Pruebas con servicios simulados, sin validar autenticación real ni generación IA.

Conserva tu comando de despliegue de Cloudflare. Comando de compilación para incluir los archivos del proyecto y la carpeta opcional de videos:

```bash
mkdir -p dist && cp index.html app.js aula-studio.css aula-studio.js simuladores.html simuladores.js simuladores-config.js dist/ && cp -r imagenes profe-ia dist/ && if [ -d videos ]; then cp -r videos dist/; fi
```

Este cambio visual no corrige por sí mismo los errores 504 de la API de Cloudflare.
