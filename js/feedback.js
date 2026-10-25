let toastTimer;

export function dismissNotice() {
  clearTimeout(toastTimer);
  document.querySelector("#toast").hidden = true;
}

export function motionAllowed() {
  return (
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
    !document.body.classList.contains("motion-paused")
  );
}

export function notify(message) {
  const toast = document.querySelector("#toast");
  clearTimeout(toastTimer);
  toast.hidden = false;
  toast.textContent = message;
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 3500);
}

export function pop(element) {
  if (!motionAllowed()) return;
  element.animate(
    [
      { transform: "scale(1)" },
      { transform: "scale(1.07)" },
      { transform: "scale(1)" },
    ],
    { duration: 320, easing: "ease-out" },
  );
}
