// Serialize accepted additions. Readiness is event-driven; a click never waits for a CLI.
export function orderedDelivery({ ready, deliver, notify = () => {} }) {
  const pending = [], records = new Map();
  let draining = false;
  async function kick() {
    if (draining) return;
    draining = true;
    try {
      while (pending.length) {
        const item = pending[0];
        const route = ready(item);
        if (!route) break;
        item.status = 'delivering';
        try {
          if (route.cancelled) item.status = 'cancelled';
          else { await deliver(item, route); item.status = 'delivered'; }
        } catch (error) { item.status = 'failed'; item.error = error.message; }
        pending.shift();
        notify(item);
      }
    } finally { draining = false; }
  }
  return {
    get: id => records.get(id),
    size: () => pending.length,
    add(item) {
      if (records.has(item.id)) return records.get(item.id);
      item.status = 'queued'; records.set(item.id, item); pending.push(item);
      notify(item); queueMicrotask(kick); return item;
    },
    kick,
    cancel() { for (const item of pending) item.cancelled = true; void kick(); },
  };
}
