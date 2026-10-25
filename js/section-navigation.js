import { motionAllowed } from "./feedback.js";

const destinations = [
  {
    id: "search-section",
    focus: "pokemon-search",
    label: "Busca",
    description: "Encontre seu próximo Pokémon",
  },
  {
    id: "pokemon-card",
    label: "Pokémon",
    description: "Cenário, tipos e atributos",
  },
  {
    id: "species-heading",
    label: "Sobre a espécie",
    description: "Habitat e informações da espécie",
  },
  {
    id: "notes-heading",
    label: "Anotações",
    description: "Seu diário de campo por espécie",
  },
  {
    id: "matchup-heading",
    label: "Afinidades",
    description: "Fraquezas, resistências e imunidades",
  },
  {
    id: "evolution-heading",
    label: "Evoluções",
    description: "Família e condições de evolução",
  },
  {
    id: "team-heading",
    label: "Equipe",
    description: "Parceiros, sugestões e equipes salvas",
  },
  {
    id: "comparison-heading",
    label: "Comparar",
    description: "Atributos e afinidades lado a lado",
  },
  {
    id: "attack-heading",
    label: "Cobertura de ataques",
    description: "Escolha tipos e avalie seus ataques",
  },
  {
    id: "collection-heading",
    label: "Coleção",
    description: "Favoritos, progresso e buscas salvas",
  },
  {
    id: "backup-heading",
    label: "Backup",
    description: "Guarde ou transfira sua coleção",
  },
];

export function createSectionNavigation() {
  const select = (id) => document.querySelector(id);
  const header = select(".header"),
    dock = select("#section-dock");
  const dialog = select("#section-menu"),
    toggle = select("#section-menu-open");
  const list = select("#section-menu-list"),
    currentLabel = select("#section-current");
  const entries = destinations
    .map((entry) => ({ ...entry, element: document.getElementById(entry.id) }))
    .filter((entry) => entry.element);
  let current = "",
    frame = null,
    offset = 105,
    backdropPress = false;

  // Keep the original header links available if native dialogs are unsupported.
  if (typeof dialog.showModal !== "function" || !entries.length) return;
  for (const entry of entries) {
    const target = document.getElementById(entry.focus || entry.id);
    if (
      !target.hasAttribute("tabindex") &&
      !target.matches("input, button, a, select")
    )
      target.tabIndex = -1;
  }
  list.replaceChildren(
    ...entries.map((entry, index) => {
      const item = document.createElement("li"),
        button = document.createElement("button");
      button.type = "button";
      button.className = "section-menu-item";
      button.dataset.sectionId = entry.id;
      const number = document.createElement("span"),
        text = document.createElement("span"),
        label = document.createElement("strong"),
        description = document.createElement("small");
      number.className = "section-menu-number";
      number.textContent = String(index + 1).padStart(2, "0");
      number.setAttribute("aria-hidden", "true");
      label.textContent = entry.label;
      description.textContent = entry.description;
      text.append(label, description);
      button.append(number, text);
      button.addEventListener("click", () => navigate(entry));
      item.append(button);
      return item;
    }),
  );

  function setCurrent(entry) {
    if (!entry || current === entry.id) return;
    current = entry.id;
    currentLabel.textContent = entry.label;
    for (const button of list.querySelectorAll("[data-section-id]")) {
      if (button.dataset.sectionId === current)
        button.setAttribute("aria-current", "location");
      else button.removeAttribute("aria-current");
    }
    const headerTarget =
      current === "search-section" ? "pokemon-card" : current;
    for (const link of document.querySelectorAll(".header-nav a")) {
      if (link.getAttribute("href") === `#${headerTarget}`)
        link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    }
  }
  function update() {
    frame = null;
    let active = entries[0];
    for (const entry of entries) {
      if (entry.element.getBoundingClientRect().top <= offset + 24)
        active = entry;
      else break;
    }
    if (
      scrollY > 0 &&
      scrollY + innerHeight >= document.documentElement.scrollHeight - 2
    )
      active = entries.at(-1);
    setCurrent(active);
  }
  function schedule() {
    if (frame === null) frame = requestAnimationFrame(update);
  }
  function measure() {
    const measured = Math.ceil(header.getBoundingClientRect().height) + 18;
    if (offset !== measured) {
      offset = measured;
      document.documentElement.style.setProperty(
        "--section-scroll-offset",
        `${offset}px`,
      );
    }
    menuHint();
    schedule();
  }
  function menuHint() {
    if (!dialog.open) return;
    const scroller = list.parentElement;
    const hint = select("#section-menu-scroll-hint");
    hint.textContent = `Deslize a lista para acessar as ${entries.length} seções.`;
    hint.hidden = scroller.scrollHeight <= scroller.clientHeight + 1;
  }
  function navigate(entry) {
    close("navigate");
    const target = document.getElementById(entry.focus || entry.id);
    entry.element.scrollIntoView({
      behavior: motionAllowed() ? "smooth" : "instant",
      block: "start",
    });
    target.focus({ preventScroll: true });
    if (target.matches('input[type="search"]')) target.select();
    setCurrent(entry);
    schedule();
  }
  function open() {
    if (dialog.open) return;
    update();
    dialog.returnValue = "";
    dialog.showModal();
    document.body.classList.add("section-menu-open");
    toggle.setAttribute("aria-expanded", "true");
    menuHint();
    const selected =
      list.querySelector('[aria-current="location"]') ||
      list.querySelector("button");
    selected.focus({ preventScroll: true });
    selected.scrollIntoView({ block: "nearest", behavior: "instant" });
  }
  function closed() {
    if (dialog.open) return;
    document.body.classList.remove("section-menu-open");
    toggle.setAttribute("aria-expanded", "false");
    if (dialog.returnValue !== "navigate")
      toggle.focus({ preventScroll: true });
    schedule();
  }
  function close(reason = "dismiss") {
    if (!dialog.open) return;
    dialog.close(reason);
    closed();
  }
  toggle.addEventListener("click", open);
  select("#section-menu-close").addEventListener("click", () => close());
  select("#section-search").addEventListener("click", () =>
    navigate(entries[0]),
  );
  dialog.addEventListener("close", closed);
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener("keydown", (event) => {
    if (event.key !== "Tab" || event.ctrlKey || event.metaKey || event.altKey)
      return;
    const buttons = [...dialog.querySelectorAll("button:not(:disabled)")];
    const first = buttons[0],
      last = buttons.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  const outside = (event) => {
    const rect = dialog.getBoundingClientRect();
    return (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    );
  };
  dialog.addEventListener("pointerdown", (event) => {
    backdropPress = event.target === dialog && outside(event);
  });
  dialog.addEventListener("click", (event) => {
    if (backdropPress && event.target === dialog && outside(event)) close();
    backdropPress = false;
  });
  addEventListener("scroll", schedule, { passive: true });
  addEventListener("resize", measure, { passive: true });
  if (typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    observer.observe(select("main"));
  }
  document.body.classList.add("section-navigation-ready");
  dock.hidden = false;
  measure();
  update();
}
