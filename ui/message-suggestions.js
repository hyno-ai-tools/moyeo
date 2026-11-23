// Suggestions only fill the composer; they never submit a message.
window.MoyeoMessageSuggestions = function ({ input, toggle, hint, snapshot, request }) {
  const storageKey = 'moyeo.messageSuggestions';
  let enabled = false;
  try { enabled = localStorage.getItem(storageKey) === '1'; } catch {}
  toggle.checked = enabled;
  let text = '', placeholder = '', generation = 0, timer, lastKey = '', observedKey = '';
  function clear() {
    generation++;
    clearTimeout(timer);
    if (text && input.placeholder === text) input.placeholder = placeholder;
    text = ''; hint.hidden = true;
  }
  function eligible(s) { return enabled && !document.hidden && s.ready && !input.value && !s.attachments; }
  function accept() {
    if (!text || !eligible(snapshot())) return false;
    const value = text;
    clear(); input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true })); input.focus();
    return true;
  }
  function update(trigger = false) {
    const s = snapshot();
    if (s.key !== observedKey) { clear(); observedKey = s.key; }
    if (!eligible(s)) { clear(); return; }
    if (!trigger || s.key === lastKey) return;
    clear();
    const revision = generation;
    timer = setTimeout(async () => {
      if (revision !== generation || !eligible(snapshot()) || snapshot().key !== s.key) return;
      lastKey = s.key;
      try {
        const result = await request(s.room);
        if (revision !== generation || !eligible(snapshot()) || snapshot().key !== s.key || result.lastN !== s.lastN) return;
        if (!result.text) return;
        placeholder = input.placeholder; text = result.text;
        input.placeholder = text; hint.hidden = false;
      } catch { /* Optional suggestions must never block chat. */ }
    }, 700);
  }
  toggle.addEventListener('change', () => {
    enabled = toggle.checked;
    try { localStorage.setItem(storageKey, enabled ? '1' : '0'); } catch {}
    clear(); if (enabled) update(true);
  });
  input.addEventListener('input', clear);
  input.addEventListener('compositionstart', clear);
  input.addEventListener('keydown', event => {
    if (event.key === 'Escape') clear();
    if (event.key === 'Tab' && !event.shiftKey && !event.isComposing && accept()) {
      event.preventDefault(); event.stopImmediatePropagation();
    }
  }, true);
  hint.addEventListener('click', accept);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clear(); });
  window.addEventListener('storage', event => {
    if (event.key === storageKey) { enabled = event.newValue === '1'; toggle.checked = enabled; clear(); }
  });
  return { update, clear };
};
