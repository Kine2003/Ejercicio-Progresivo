/* Fetch API compartida por la página y el service worker. */
(() => {
  'use strict';
  let running;
  async function exchange() {
    let sent;
    do {
      sent = (await AgendaStorage.queue()).slice(0, 100);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch(sent.length ? '/api/sync' : '/api/tasks', {
          method: sent.length ? 'POST' : 'GET',
          headers: sent.length ? { 'Content-Type': 'application/json' } : {},
          body: sent.length ? JSON.stringify({ changes: sent.map(({ mutationId, task }) => ({ mutationId, task })) }) : undefined,
          cache: 'no-store',
          signal: controller.signal
        });
        if (!response.ok) throw new Error(`El servidor respondió con el estado ${response.status}.`);
        const data = await response.json();
        if (!Array.isArray(data.tasks) || !Array.isArray(data.acknowledged) || !Number.isSafeInteger(data.revision) || data.revision < 0 ||
          data.tasks.some(task => !task || typeof task.id !== 'string' || typeof task.title !== 'string' || typeof task.subject !== 'string' ||
            typeof task.dueDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(task.dueDate) || !['high', 'normal', 'low'].includes(task.priority) ||
            typeof task.completed !== 'boolean' || typeof task.deleted !== 'boolean')) throw new Error('Respuesta del servidor no válida.');
        if (sent.some(change => !data.acknowledged.includes(change.mutationId))) throw new Error('Hay cambios que el servidor todavía no confirmó.');
        await AgendaStorage.acknowledge(sent, data);
      } finally {
        clearTimeout(timeout);
      }
    } while (sent.length && (await AgendaStorage.queue()).length);
  }
  function run() {
    if (!running) {
      // Evita que varias pestañas y el service worker envíen a la vez.
      running = (globalThis.navigator?.locks
        ? navigator.locks.request('mi-agenda-sync', exchange)
        : exchange()).finally(() => { running = null; });
    }
    return running;
  }
  globalThis.AgendaSync = { run };
})();
