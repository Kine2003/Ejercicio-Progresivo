/* IndexedDB: las tareas y sus cambios pendientes se guardan juntos. */
(() => {
  'use strict';
  const DB_NAME = 'mi-agenda';
  let database;
  function openDB() {
    if (!database) database = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore('tasks', { keyPath: 'id' });
        db.createObjectStore('outbox', { keyPath: 'id', autoIncrement: true });
        db.createObjectStore('meta', { keyPath: 'key' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => { database = null; reject(request.error); };
      request.onblocked = () => { database = null; reject(new Error('Cierra otras pestañas de la agenda y vuelve a abrirla.')); };
    });
    return database;
  }
  const requestValue = request => new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const finished = transaction => new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = transaction.onerror = () => reject(transaction.error || new Error('No se pudo guardar en este dispositivo.'));
  });
  async function view() {
    const db = await openDB();
    const tx = db.transaction(['tasks', 'outbox', 'meta'], 'readonly');
    const done = finished(tx);
    const [tasks, outbox, lastSync] = await Promise.all([
      requestValue(tx.objectStore('tasks').getAll()),
      requestValue(tx.objectStore('outbox').getAll()),
      requestValue(tx.objectStore('meta').get('lastSync'))
    ]);
    await done;
    return { tasks, outbox, lastSync: lastSync?.value || null };
  }
  async function save(task) {
    const change = { mutationId: crypto.randomUUID(), task, createdAt: Date.now() };
    const db = await openDB();
    const tx = db.transaction(['tasks', 'outbox'], 'readwrite');
    const done = finished(tx);
    try {
      tx.objectStore('tasks').put(task);
      tx.objectStore('outbox').add(change);
    } catch (error) {
      tx.abort();
      await done.catch(() => {});
      throw error;
    }
    await done;
  }
  async function queue() {
    const db = await openDB();
    const tx = db.transaction('outbox', 'readonly');
    const done = finished(tx);
    const changes = await requestValue(tx.objectStore('outbox').getAll());
    await done;
    return changes;
  }
  // Nunca borrar cambios nuevos creados mientras una solicitud estaba en vuelo.
  async function acknowledge(sent, response) {
    const db = await openDB();
    const tx = db.transaction(['tasks', 'outbox', 'meta'], 'readwrite');
    const done = finished(tx);
    const outbox = tx.objectStore('outbox');
    const accepted = new Set(response.acknowledged || []);
    sent.forEach(change => { if (accepted.has(change.mutationId)) outbox.delete(change.id); });
    const meta = tx.objectStore('meta');
    const revision = meta.get('serverRevision');
    revision.onsuccess = () => {
      const request = outbox.getAll();
      request.onsuccess = () => {
        try {
          if (response.revision >= (revision.result?.value || 0)) {
            const pending = new Set(request.result.map(change => change.task.id));
            const tasks = tx.objectStore('tasks');
            response.tasks.forEach(task => {
              if (!pending.has(task.id)) {
                if (task.deleted) tasks.delete(task.id);
                else tasks.put(task);
              }
            });
            meta.put({ key: 'serverRevision', value: response.revision });
          }
          meta.put({ key: 'lastSync', value: Date.now() });
        } catch (error) { tx.abort(); }
      };
    };
    await done;
  }
  globalThis.AgendaStorage = { view, save, queue, acknowledge };
})();
