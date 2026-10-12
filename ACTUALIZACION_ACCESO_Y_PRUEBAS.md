# Actualización — acceso, editor ampliado y resultados del docente

Esta entrega modifica el código del ZIP recibido **sin reemplazar Firebase, sin cambiar colecciones ni eliminar contenidos**. Mantiene el nombre y el logo actuales hasta que decidas el nombre definitivo de la plataforma.

## Qué se corrigió

- **Acceso**: nuevo diseño de dos paneles, limpio y adaptable al teléfono. Se dejó de mostrar la gran ilustración como pantalla de entrada. Permanecen los mismos identificadores de Firebase para correo, contraseña y Google. Ahora el formulario también se envía mediante **Enter**; el botón evita envíos repetidos y los errores aparecen en la misma pantalla.
- **Ampliar editor**: ahora utiliza la API de pantalla completa del navegador. Si el navegador no permite la pantalla completa, se usa un modo de vista fija. El botón permite **Reducir editor**; Escape sale del modo nativo. La fuente `aula-studio.js` y el bloque integrado en `index.html` se han sincronizado.
- **Mis pruebas (docente)**: nueva pestaña del panel de administrador, con las pruebas almacenadas bajo el UID de la propia cuenta de administrador, las evaluaciones de módulos, botones de eliminación individual y un botón para **reiniciar todo el progreso del docente**. Este último exige escribir `REINICIAR` para confirmar. **No reinicia ni toca los alumnos**.
- **Alumnos**: se conserva el panel anterior. Si un estudiante tiene varias pruebas del mismo tema, eliminar una no devuelve el tema a pendiente hasta que no quede ningún intento de ese tema.
- **Pruebas del aula (evaluador antiguo)**: además de marcar el progreso del tema, registran ahora resultado, fecha y respuestas en `usuarios/{uid}/simuladores_guardados`, de modo que el docente también pueda verlas en su pestaña. Guardado conjunto con el progreso mediante lote.
- **Simulador independiente**: si el guardado falla, aparece **Reintentar guardado** sin recalificar ni generar otro registro. Se informa explícitamente cuando Firestore rechaza la escritura.

## Cómo desplegar (GitHub + Cloudflare)

1. Realiza primero una copia de seguridad del repositorio publicado y de las reglas actuales de Firestore.
2. Abre la carpeta `AULA-VIRTUAL-593TUCAMINOALAU-main/` que viene en este ZIP. Sube **su contenido** a la raíz de tu repositorio, sustituyendo los archivos de igual nombre. Conserva archivos adicionales de tu repositorio que no vienen en el ZIP.
3. Espera el despliegue de Cloudflare Pages/Workers que ya tengas conectado a GitHub.
4. Abre el sitio y pulsa `Ctrl + F5` una vez. Entra como administrador y abre **Admin → Mis pruebas (docente)**. Comprueba los resultados y prueba primero el botón de **Actualizar resultados** (no modifica Firebase).
5. Realiza una prueba nueva de ejemplo, deja que termine el guardado, y vuelve a **Mis pruebas (docente)** para confirmar que aparece. Solo cuando estés seguro, usa las opciones de reinicio que desees.

## Importante sobre Firestore

El código **no contiene** las reglas de seguridad de Firestore de tu proyecto, por lo que no fue posible verificar si la cuenta del administrador tiene permisos de escritura/lectura en:

- `usuarios/{uid}/simuladores_guardados/{intentoId}`
- `usuarios/{uid}/progreso_temas/{temaId}`
- `usuarios/{uid}/progreso_modulos/{moduloId}`

Si sale **permission-denied**, el intento **no está guardado**. El mensaje ahora lo indica y permite volver a intentarlo. Revisa **Firebase Console → Firestore Database → Reglas**; el permiso debe identificar de manera segura a quien es dueño del UID o al administrador, según el diseño de tu app. **No utilices `allow read, write: if true`**, porque dejaría los datos de tus alumnos expuestos. Para ajustar esas reglas sin abrir accesos necesitamos ver las reglas actuales.

El diseño y los controles se verificaron con un navegador local, y el manejo de resultados y reinicio con una base Firebase simulada. **No se conectó a tu Firestore real** ni se alteró un solo registro de producción. Una simulación satisfactoria no garantiza que las reglas publicadas concedan esos permisos.

## Si decides cambiar el nombre

El nombre de marca actual sigue en el título de la página, el logo y algunas otras pantallas. La vista nueva usa palabras neutrales como **Plataforma educativa** y **Plataforma Virtual de Educación**. Cuando elijas el nombre definitivo, lo cambiamos de forma consistente en toda la plataforma, sin afectar usuarios ni datos.
