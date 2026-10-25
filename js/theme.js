const THEME_KEY = "pokedex.theme.v1";

export function validTheme(value) {
  return ["light", "dark", "system"].includes(value) ? value : "system";
}

export function resolvedTheme(preference, systemIsDark) {
  return preference === "dark" ||
    (validTheme(preference) === "system" && systemIsDark)
    ? "dark"
    : "light";
}

export function createThemeControl() {
  const select = document.querySelector("#theme-select");
  const notice = document.querySelector("#theme-notice");
  const media = matchMedia("(prefers-color-scheme: dark)");
  let preference = "system";
  function unavailable() {
    notice.hidden = false;
    notice.textContent =
      "A preferência de tema vale nesta sessão. O navegador não permitiu salvá-la para a próxima visita.";
  }
  try {
    preference = validTheme(localStorage.getItem(THEME_KEY));
  } catch {
    unavailable();
  }
  function apply() {
    const theme = resolvedTheme(preference, media.matches);
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    select.value = preference;
    document.querySelector('meta[name="theme-color"]').content =
      theme === "dark" ? "#101a17" : "#f6f5ef";
  }
  select.addEventListener("change", () => {
    preference = validTheme(select.value);
    apply();
    try {
      localStorage.setItem(THEME_KEY, preference);
      notice.hidden = true;
    } catch {
      unavailable();
    }
  });
  media.addEventListener("change", () => {
    if (preference === "system") apply();
  });
  window.addEventListener("storage", (event) => {
    if (event.key === THEME_KEY || event.key === null) {
      preference = validTheme(event.newValue);
      apply();
    }
  });
  apply();
}
