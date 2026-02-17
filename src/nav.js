const IDLE_MS = 5000;

export function createNavigator({ getItems, onActivate, onBack }) {
  let index = 0;
  let idleTimer = null;

  function showFocus() {
    document.body.classList.remove("nav-dim");
  }

  function hideFocus() {
    document.body.classList.add("nav-dim");
  }

  function resetIdle() {
    showFocus();
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(hideFocus, IDLE_MS);
  }

  function readItems() {
    try {
      const items = getItems?.();
      return Array.isArray(items) ? items : [];
    } catch {
      return [];
    }
  }

  function clamp(i, n) {
    if (n <= 0) return 0;
    return (i + n) % n;
  }

  function sync() {
    const items = readItems();
    if (items.length === 0) return;

    index = Math.min(index, items.length - 1);

    for (const el of items) el.classList.remove("nav-focus");
    const el = items[index];
    if (!el) return;

    el.classList.add("nav-focus");
    el.scrollIntoView?.({ block: "nearest" });
  }

  function move(delta) {
    const items = readItems();
    if (items.length === 0) return;

    index = clamp(index + delta, items.length);
    sync();
    resetIdle();
  }

  function activate() {
    const items = readItems();
    if (items.length === 0) return;

    resetIdle();
    onActivate?.(items[index], index);
  }

  function back() {
    resetIdle();
    onBack?.();
  }

  function setIndex(i) {
    const items = readItems();
    index = clamp(i, items.length);
    sync();
    resetIdle();
  }

  function attach() {
    resetIdle();

    window.addEventListener("keydown", (e) => {
      const keys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", "Backspace", "Escape"];
      if (keys.includes(e.key)) e.preventDefault();

      if (e.key === "ArrowDown" || e.key === "ArrowRight") move(+1);
      else if (e.key === "ArrowUp" || e.key === "ArrowLeft") move(-1);
      else if (e.key === "Enter") activate();
      else if (e.key === "Backspace" || e.key === "Escape") back();
    });
  }

  return { attach, move, activate, back, setIndex, sync };
}
