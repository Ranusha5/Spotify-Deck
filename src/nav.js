const IDLE_MS = 5000;

export function createNavigator({ getItems, onActivate, onBack }) {
  let index = 0;
  let idleTimer = null;

  function clearFocusClass(items) {
    items.forEach(el => el.classList.remove("nav-focus"));
  }

  function showFocus() {
    document.body.classList.remove("nav-dim");
  }

  function hideFocus() {
    document.body.classList.add("nav-dim");
  }

  function resetIdle() {
    showFocus();
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => hideFocus(), IDLE_MS);
  }

  function clamp(i, n) {
    if (n <= 0) return 0;
    return (i + n) % n;
  }

  function sync(items) {
    if (!items.length) return;
    index = Math.min(index, items.length - 1);
    clearFocusClass(items);
    const el = items[index];
    el.classList.add("nav-focus");
    el.scrollIntoView?.({ block: "nearest" });
  }

  function move(delta) {
    const items = getItems();
    if (!items.length) return;
    index = clamp(index + delta, items.length);
    sync(items);
    resetIdle();
  }

  function activate() {
    const items = getItems();
    if (!items.length) return;
    resetIdle();
    onActivate(items[index], index);
  }

  function back() {
    resetIdle();
    onBack?.();
  }

  function setIndex(i) {
    const items = getItems();
    index = clamp(i, items.length);
    sync(items);
    resetIdle();
  }

  function attach() {
    // start visible, but will auto-hide after idle
    resetIdle();

    window.addEventListener("keydown", (e) => {
      // Prevent browser scrolling
      if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Enter","Backspace","Escape"].includes(e.key)) {
        e.preventDefault();
      }

      if (e.key === "ArrowDown" || e.key === "ArrowRight") move(+1);
      else if (e.key === "ArrowUp" || e.key === "ArrowLeft") move(-1);
      else if (e.key === "Enter") activate();
      else if (e.key === "Backspace" || e.key === "Escape") back();
      else return;
    });

    // Any wheel/scroll event should also “wake” highlight (optional)
    window.addEventListener("mousemove", resetIdle, { passive: true });
  }

  return { attach, move, activate, back, setIndex, sync };
}
