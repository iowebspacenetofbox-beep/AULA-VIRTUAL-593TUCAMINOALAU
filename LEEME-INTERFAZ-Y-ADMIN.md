# Aula Virtual 593 · Interfaz y estudio del aula

## Instalar esta actualización

1. Conserva una copia del código que actualmente tienes publicado.
2. Extrae este ZIP. Dentro de la carpeta del proyecto están todos los archivos del aula.
3. En tu repositorio, sustituye `index.html` y `app.js`, y agrega `aula-studio.css` y `aula-studio.js` en la misma carpeta. También puedes subir el contenido completo de la carpeta conservando tus archivos adicionales.
4. No borres imágenes, PDFs, videos u otras herramientas que ya tengas en tu repositorio y no aparezcan en este ZIP.
5. Despliega mediante tu procedimiento actual. Recarga con Ctrl + F5 para cargar la nueva interfaz.

No se requiere una clave adicional ni una dependencia de servidor nueva. Esta entrega modifica archivos locales; no publica cambios en tu sitio ni escribe en tu Firebase de producción.

## Crear y editar contenido

Entra como administrador y abre **Estudio del aula → 3. Temas**. Selecciona materia y módulo, escribe el título y prepara el contenido.

- **Importar texto:** abre TXT, Markdown (.md) o HTML (máximo 2 MB). Añade el contenido en la posición del cursor; no sustituye todo el tema.
- **Pegar desde Word:** copia el contenido y pégalo en el editor. Conserva títulos, negrita, listas y tablas básicas, limpiando elementos ajenos al texto. No importa archivos DOCX directamente ni convierte automáticamente las ecuaciones nativas de Word. Para fórmulas, usa el botón Fórmula y texto LaTeX.
- **Pegar y dar formato:** pega Markdown o texto. Los títulos con #, las listas y las tablas Markdown se convierten en contenido editable. No usa IA, no reescribe ni verifica el contenido científico.
- **Plantilla de clase:** teoría y práctica, laboratorio guiado o lectura y análisis. Añade una estructura editable al texto existente.
- **Ampliar editor:** abre un espacio de trabajo mayor. Sal con el mismo botón o con Escape.
- **Vista previa:** permite revisar texto y herramientas. Pulsa de nuevo para cerrarla y vuelve a abrirla para refrescarla después de editar.
- La barra existente conserva colores, tablas, conceptos emergentes, imágenes, enlaces, fórmulas, deshacer y rehacer.
- Las imágenes locales deben estar publicadas en `imagenes/`. Las imágenes pegadas desde Word que usen rutas temporales o datos incrustados no se importan; usa el botón Imagen.

**Publicar Tema** o **Actualizar Tema** guarda en la misma colección existente. Un aviso indica si tienes cambios sin publicar. Cerrar o recargar la página con cambios pendientes genera una advertencia del navegador; no hay autoguardado ni recuperación después de cerrar por la fuerza. Si el guardado falla, el formulario conserva lo escrito para reintentar.

## Añadir configuración electrónica u otra app

1. En el tema correspondiente, busca **Herramientas del tema**.
2. Pulsa **Añadir herramienta**.
3. Escribe el nombre, por ejemplo «Configuración electrónica».
4. Pega la dirección HTTPS de la aplicación publicada. Si es un HTML autónomo alojado en el mismo sitio, puedes usar una ruta como `herramientas/atomo/index.html`.
5. Añade instrucciones para el alumno.
6. Elige **En una pestaña nueva** o **Dentro del tema**.
7. Guarda el tema.

El alumno verá **Herramientas interactivas** entre los recursos. Puedes añadir varias, subirlas de posición con la flecha y quitar una vinculación sin borrar la aplicación original.

La aplicación de configuración electrónica no está incluida en el ZIP recibido, por lo que no se ha incorporado su código. Este panel permite vincularla cuando tengas su URL. Si usa funciones de Netlify, conserva ese despliegue y pega su URL; copiar solo su HTML al aula no traslada esas funciones.

La vista integrada se carga al pulsar **Iniciar herramienta**. Se ejecuta en un marco aislado: algunas apps requieren cookies, almacenamiento, inicio de sesión o permisos que no funcionan dentro de ese marco; otras bloquean la integración desde su propio servidor. Para esos casos siempre aparece **Abrir en otra pestaña**. Esta opción es la predeterminada por compatibilidad.

Los recursos interactivos no marcan automáticamente un tema como aprobado ni cambian las notas. Continúa utilizándose el flujo de evaluaciones que ya tiene el aula.

## Organización y compatibilidad

- La administración muestra contadores de materias, módulos, temas y alumnos autorizados.
- La lista de temas incluye búsqueda por título, materia o módulo, sin distinguir tildes.
- Se conserva la estructura materia → módulo → tema y los identificadores de las vistas.
- Se añade el campo opcional `herramientas_interactivas` a los temas. Los anteriores, que no tienen ese campo, siguen funcionando sin mostrar el botón de herramientas.
- Las actualizaciones usan el guardado con combinación de campos existente, para conservar otros datos del tema.
- El acceso, los simuladores, el progreso, los Workers y Profe IA mantienen su implementación original.
- No se incluyen cambios de permisos de Firestore. Si tus reglas restringen explícitamente la lista de campos permitidos, necesitarán admitir `herramientas_interactivas` para el administrador. No abras escrituras a todos los usuarios.

## Archivos de la mejora

- `index.html`: controles del editor, búsqueda, herramientas y enlaces a los nuevos recursos.
- `app.js`: carga y guardado de las herramientas, integración del editor y protección del guardado.
- `aula-studio.js`: importación, limpieza de HTML, plantillas, búsqueda y herramientas.
- `aula-studio.css`: diseño del estudio y mejoras de lectura, tarjetas y adaptación móvil.

Los demás archivos originales se conservan. Consulta `VALIDACION-INTERFAZ.txt` para conocer las comprobaciones y su alcance.
