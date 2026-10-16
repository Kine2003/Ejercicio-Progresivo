# Mi Agenda Estudiantil

Aplicación web progresiva para gestionar tareas con o sin conexión. Se creó siguiendo los temas de Fetch API, JSON, IndexedDB y eventos del PDF **semana 5 teoría** (pp. 14–19 y 21), añadiendo una cola de cambios y un service worker para cubrir la sincronización.

## Abrir la página

1. Haz doble clic en **INICIAR.cmd**.
2. Deja la ventana del servidor abierta y entra en **http://localhost:8000** con Edge, Chrome o Brave.
3. Espera a que aparezca **«Agenda disponible sin conexión»** al pie de la página.

Requiere Python 3, sin instalar paquetes adicionales. El iniciador también detecta el Python incluido en pgAdmin, disponible en este equipo. Alternativa: `python servidor.py`. Si el puerto está ocupado, usa `python servidor.py --port 8001` y abre `http://localhost:8001`.

**No abras index.html con doble clic ni uses solamente Live Server:** necesitas este servidor para que la API guarde los cambios y el service worker funcione desde localhost. La primera visita requiere el servidor activo para descargar la interfaz.

## Publicación en GitHub Pages

El workflow de GitHub Actions valida el servidor Python y la sintaxis de JavaScript en cada cambio. Al actualizar `main`, prepara y publica automáticamente la agenda en **Settings → Pages**. El sitio se publica en <https://kine2003.github.io/Ejercicio-Progresivo/>.

La versión de GitHub Pages guarda las tareas únicamente en el almacenamiento local del navegador (IndexedDB). No ejecuta Python ni SQLite, por lo que los datos no se comparten entre navegadores o dispositivos. Para sincronizar entre navegadores, abre la versión local con `INICIAR.cmd`.

## Comprobar el funcionamiento sin conexión

1. Abre la agenda normalmente y espera a que termine de sincronizar.
2. Pulsa **F12 → Network / Red → Offline**. Mantén las herramientas abiertas para que la emulación siga activa.
3. Añade una tarea, edítala o marca otra como completada. Verás **«Por sincronizar»** y el contador de cambios pendientes.
4. Recarga: la página y las tareas deben seguir disponibles.
5. Vuelve a **No throttling / Sin limitación**. Los cambios se enviarán automáticamente; si el navegador no emite el evento de reconexión, se reintenta cada 15 segundos mientras la página esté visible. También puedes pulsar **Sincronizar ahora**.
6. Cuando el contador llegue a cero, abre la misma dirección en otro navegador para comprobar que los cambios están guardados en el servidor.

También puedes detener el servidor con Ctrl+C, trabajar y recargar desde el caché, y volver a iniciarlo. Esto demuestra el mismo mecanismo sin depender de internet externo. Una conexión a localhost funciona aunque apagues el Wi-Fi; para simular la pérdida de acceso al servidor utiliza los pasos anteriores.

## Cómo se guarda y sincroniza

- **IndexedDB:** conserva tareas y una cola de operaciones. Cada cambio y su operación pendiente se escriben en la misma transacción.
- **Fetch API:** usa GET `/api/tasks` para descargar y POST `/api/sync` para enviar lotes de cambios. Comprueba `response.ok`, procesa JSON y conserva la cola si hay errores.
- **Sincronización:** se ejecuta al abrir, al recuperar conexión, cada 15 segundos con la página visible y mediante el botón. Background Sync también puede ejecutarla en navegadores compatibles; en otros, abre la agenda para sincronizar.
- **Servidor real:** Python guarda los datos en `data/agenda.sqlite3`. Reconoce cada operación por un identificador para evitar repetirla después de un fallo. SQLite confirma cada lote antes de responder.
- **Service worker:** almacena HTML, CSS, JavaScript, manifiesto e iconos. La API siempre va a la red; una respuesta del caché nunca se confunde con una confirmación del servidor.
- **Cambios durante un envío:** la confirmación solo elimina las operaciones enviadas. Una edición nueva conserva su lugar en la cola. Una revisión del servidor impide aplicar respuestas antiguas.
- **PWA:** manifiesto e iconos para instalación. Usa «Instalar agenda» si el navegador muestra el botón, o su opción de instalar este sitio como aplicación.

Es una demostración local para un solo usuario. Entre dispositivos o navegadores, gana el último cambio aceptado por el servidor; no incluye cuentas ni resolución colaborativa de conflictos. Para publicarla en internet se necesitaría alojar también el servidor y usar HTTPS. No borres los datos del sitio ni la carpeta `data` si deseas conservar la información.

## Archivos principales

| Archivo | Función |
| --- | --- |
| `public/index.html` y `styles.css` | Interfaz adaptable a celular y computadora |
| `public/app.js` | Formularios, acciones y estado de conexión |
| `public/storage.js` | IndexedDB y cola de cambios |
| `public/sync.js` | Comunicación con Fetch API |
| `public/sw.js` | Caché y sincronización en segundo plano |
| `public/manifest.webmanifest` | Instalación como PWA |
| `servidor.py` | Servidor, API y persistencia SQLite |
| `INFORME_CUADERNO.txt` | Informe breve para copiar a mano |

Referencias técnicas: [Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch), [Service workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers) y [sincronización en segundo plano](https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API).
