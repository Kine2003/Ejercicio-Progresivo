(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const form = $('#task-form');
  const localOnly = globalThis.AGENDA_CONFIG?.localOnly === true;
  let tasks = [], filter = 'all', editingId = null, syncing = false, serverAvailable = false;
  let toastTimer, installPrompt;
  const today = () => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };
  const prettyDate = value => new Intl.DateTimeFormat('es-EC', { day: 'numeric', month: 'short' }).format(new Date(`${value}T12:00:00`));
  function toast(message, error = false) {
    clearTimeout(toastTimer);
    $('#toast').textContent = message;
    $('#toast').classList.toggle('error', error);
    $('#toast').hidden = false;
    toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4500);
  }
  function connectionStatus(pending = 0) {
    if (localOnly) {
      const badge = $('#connection-badge');
      badge.textContent = 'Solo este dispositivo';
      badge.className = 'connection-badge local-only';
      $('#sync-button').hidden = true;
      $('#sync-status').textContent = 'Tus tareas se guardan en este navegador y no se sincronizan con otros dispositivos.';
      $('#last-sync').hidden = true;
      return;
    }
    const online = navigator.onLine && serverAvailable;
    const badge = $('#connection-badge');
    badge.textContent = online ? 'En conexión' : navigator.onLine ? 'Servidor sin conexión' : 'Sin conexión';
    badge.className = `connection-badge ${online ? 'online' : 'offline'}`;
    $('#sync-button').disabled = syncing;
    $('#sync-button').textContent = syncing ? 'Sincronizando…' : 'Sincronizar ahora';
    $('#task-list').setAttribute('aria-busy', String(syncing));
    $('#sync-status').textContent = syncing ? 'Enviando cambios y actualizando tu agenda…'
      : !online ? pending ? 'Tus cambios están guardados aquí. Se enviarán cuando vuelva la conexión.' : 'Puedes seguir usando tu agenda. Reintentaremos la conexión automáticamente.'
      : pending ? 'Hay cambios guardados en este dispositivo pendientes de enviar.' : 'Tus tareas están al día y guardadas en el servidor.';
  }
  function iconButton(label, path, action, id, extraClass = '') {
    const button = document.createElement('button');
    button.type = 'button'; button.className = `icon-button ${extraClass}`;
    button.setAttribute('aria-label', label); button.title = label;
    button.dataset.action = action; button.dataset.id = id;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
    const shape = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    shape.setAttribute('d', path); svg.append(shape); button.append(svg);
    return button;
  }
  async function render() {
    const state = await AgendaStorage.view();
    tasks = state.tasks.filter(task => !task.deleted);
    const pendingIds = new Set(state.outbox.map(change => change.task.id));
    $('#pending-count').textContent = tasks.filter(task => !task.completed).length;
    $('#completed-count').textContent = tasks.filter(task => task.completed).length;
    $('#queue-count').textContent = state.outbox.length;
    $('#task-total').textContent = `${tasks.length} ${tasks.length === 1 ? 'tarea' : 'tareas'}`;
    $('#last-sync').textContent = state.lastSync ? `Última sincronización: ${new Intl.DateTimeFormat('es-EC', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(state.lastSync)}` : 'Todavía no se ha sincronizado.';
    const visible = tasks.filter(task => filter === 'all' || (filter === 'completed' ? task.completed : !task.completed));
    visible.sort((a, b) => Number(a.completed) - Number(b.completed) || a.dueDate.localeCompare(b.dueDate) || a.title.localeCompare(b.title));
    const list = $('#task-list');
    const focused = document.activeElement?.dataset;
    list.replaceChildren();
    visible.forEach(task => {
      const item = document.createElement('article'); item.className = `task-item ${task.completed ? 'completed' : ''}`;
      const toggle = document.createElement('input'); toggle.type = 'checkbox'; toggle.className = 'task-toggle'; toggle.checked = task.completed;
      toggle.setAttribute('aria-label', `${task.completed ? 'Marcar como pendiente' : 'Completar'}: ${task.title}`);
      toggle.dataset.action = 'toggle'; toggle.dataset.id = task.id;
      const content = document.createElement('div'); content.className = 'task-content';
      const title = document.createElement('h3'); title.className = 'task-title'; title.textContent = task.title;
      const subject = document.createElement('p'); subject.className = 'task-subject'; subject.textContent = task.subject;
      const meta = document.createElement('div'); meta.className = 'task-meta';
      const date = document.createElement('span');
      const overdue = !task.completed && task.dueDate < today();
      date.textContent = `${overdue ? 'Vencida · ' : 'Entrega · '}${prettyDate(task.dueDate)}`;
      if (overdue) date.className = 'overdue';
      const priority = document.createElement('span'); priority.className = `priority ${task.priority}`;
      priority.textContent = { high: 'Alta', normal: 'Normal', low: 'Baja' }[task.priority];
      meta.append(date, priority);
      if (pendingIds.has(task.id)) { const local = document.createElement('span'); local.className = 'pending-label'; local.textContent = 'Por sincronizar'; meta.append(local); }
      content.append(title, subject, meta);
      const actions = document.createElement('div'); actions.className = 'task-actions';
      actions.append(iconButton(`Editar: ${task.title}`, 'M15 4l5 5M4 20l4-1L20 7a2.1 2.1 0 0 0-3-3L5 16z', 'edit', task.id), iconButton(`Eliminar: ${task.title}`, 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5m4-5v5', 'delete', task.id, 'delete'));
      item.append(toggle, content, actions); list.append(item);
    });
    if (focused?.id && focused?.action) {
      [...list.querySelectorAll('[data-action]')].find(element => element.dataset.id === focused.id && element.dataset.action === focused.action)?.focus();
    }
    $('#empty-state').hidden = visible.length > 0;
    $('#empty-title').textContent = filter === 'pending' ? 'Todo al día' : filter === 'completed' ? 'Cada tarea cuenta' : 'Tu agenda está lista';
    $('#empty-copy').textContent = filter === 'pending' ? 'No tienes tareas pendientes.' : filter === 'completed' ? 'Las tareas que completes aparecerán aquí.' : 'Añade tu primera tarea para comenzar.';
    connectionStatus(state.outbox.length);
  }
  async function synchronize(manual = false) {
    if (localOnly) return;
    if (syncing) return;
    if (!navigator.onLine) {
      await render();
      if (manual) toast('Estás sin conexión. Tus cambios siguen guardados aquí.');
      return;
    }
    syncing = true; connectionStatus();
    try {
      await AgendaSync.run(); serverAvailable = true;
      if (manual) toast('Agenda sincronizada.');
    } catch (error) {
      serverAvailable = false;
      if (manual) toast('No se pudo conectar. Tus cambios siguen guardados y se reintentará.', true);
      console.info('Sincronización pendiente:', error.message);
    } finally {
      syncing = false;
      await render();
    }
  }
  async function requestBackgroundSync() {
    if (localOnly) return;
    try {
      const registration = await navigator.serviceWorker?.getRegistration();
      if (registration && 'sync' in registration) await registration.sync.register('agenda-pending');
    } catch (error) { console.info('Se reintentará al abrir la agenda:', error.message); }
  }
  async function persist(task, message) {
    await AgendaStorage.save({ ...task, updatedAt: new Date().toISOString() }, !localOnly);
    await render(); toast(message);
    void requestBackgroundSync(); void synchronize();
  }
  function resetForm() {
    editingId = null; form.reset(); $('#due-date').value = today();
    $('#form-heading').textContent = 'Nueva tarea'; $('#save-button').textContent = 'Guardar tarea'; $('#cancel-edit').hidden = true;
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const title = $('#title').value.trim(), subject = $('#subject').value.trim();
    if (!title || !subject) { toast('Escribe una tarea y una materia.', true); return; }
    $('#save-button').disabled = true;
    const existing = tasks.find(task => task.id === editingId);
    try {
      await persist({ id: editingId || crypto.randomUUID(), title, subject, dueDate: $('#due-date').value, priority: $('#priority').value, completed: existing?.completed || false, deleted: false }, editingId ? 'Cambios guardados en este dispositivo.' : 'Tarea guardada en este dispositivo.');
      resetForm();
    } catch (error) { toast('No se pudo guardar localmente. Conserva el formulario y vuelve a intentarlo.', true); console.error(error); }
    finally { $('#save-button').disabled = false; }
  });
  $('#cancel-edit').addEventListener('click', resetForm);
  $('#task-list').addEventListener('click', async event => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const task = tasks.find(item => item.id === button.dataset.id);
    if (!task) return;
    try {
      if (button.dataset.action === 'edit') {
        editingId = task.id; $('#title').value = task.title; $('#subject').value = task.subject;
        $('#due-date').value = task.dueDate; $('#priority').value = task.priority;
        $('#form-heading').textContent = 'Editar tarea'; $('#save-button').textContent = 'Guardar cambios'; $('#cancel-edit').hidden = false;
        $('#title').focus();
      } else if (button.dataset.action === 'delete') {
        if (!confirm(`¿Eliminar la tarea «${task.title}»?`)) return;
        await persist({ ...task, deleted: true }, 'Tarea eliminada.');
        if (editingId === task.id) resetForm();
      } else if (button.dataset.action === 'toggle') {
        await persist({ ...task, completed: button.checked }, button.checked ? 'Tarea completada.' : 'Tarea marcada como pendiente.');
      }
    } catch (error) { toast('No se pudo guardar el cambio en este dispositivo.', true); await render(); console.error(error); }
  });
  $('.filters').addEventListener('click', event => {
    const button = event.target.closest('[data-filter]'); if (!button) return;
    filter = button.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach(element => {
      const selected = element === button; element.classList.toggle('active', selected); element.setAttribute('aria-pressed', String(selected));
    });
    void render();
  });
  $('#sync-button').addEventListener('click', () => void synchronize(true));
  if (!localOnly) {
    window.addEventListener('online', () => void synchronize());
    window.addEventListener('offline', () => { serverAvailable = false; void render(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) void synchronize(); });
    // Reintento incluso si la red vuelve sin emitir el evento online.
    setInterval(() => { if (!document.hidden) void synchronize(); }, 15000);
  }
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; $('#install-button').hidden = false; });
  $('#install-button').addEventListener('click', async () => {
    if (!installPrompt) return;
    await installPrompt.prompt(); installPrompt = null; $('#install-button').hidden = true;
  });
  window.addEventListener('appinstalled', () => { $('#install-button').hidden = true; });
  async function setupOffline() {
    if (!('serviceWorker' in navigator)) { $('#offline-ready').textContent = 'Usa un navegador compatible para abrir sin conexión.'; return; }
    try {
      await navigator.serviceWorker.register('./sw.js');
      await navigator.serviceWorker.ready;
      $('#offline-ready').textContent = 'Agenda disponible sin conexión';
      navigator.serviceWorker.addEventListener('message', event => {
        if (event.data?.type === 'AGENDA_SYNCED') { serverAvailable = navigator.onLine; void render(); }
      });
    } catch (error) { $('#offline-ready').textContent = 'No se pudo preparar el acceso sin conexión.'; console.error(error); }
  }
  async function start() {
    $('#today-label').textContent = new Intl.DateTimeFormat('es-EC', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
    resetForm();
    try {
      if (localOnly) {
        $('#sync-heading').textContent = 'Guardado local';
        $('#queue-count').closest('.sync-summary').hidden = true;
        $('.connection-panel details').hidden = true;
      }
      await render(); void setupOffline();
      if (!localOnly) await synchronize();
    }
    catch (error) {
      $('#sync-status').textContent = 'No se pudo abrir el almacenamiento local. Habilita los datos del sitio y recarga.';
      $('#task-list').setAttribute('aria-busy', 'false'); $('#save-button').disabled = true;
      toast('El navegador no permite guardar los datos de esta agenda.', true); console.error(error);
    }
  }
  void start();
})();
