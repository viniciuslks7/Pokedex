import { dismissNotice, motionAllowed, notify } from "./feedback.js";
import { pokemonLabel } from "./api.js";

const habitats = {
  forest: ["Floresta serena", "#c6d9b9"],
  coast: ["Litoral azul", "#bad5dd"],
  volcano: ["Vale vulcânico", "#e5c1a4"],
  storm: ["Céu de tempestade", "#c9cdb0"],
  twilight: ["Bosque lunar", "#bdcec9"],
  alpine: ["Picos nevados", "#cfddd8"],
};
const typeHabitats = {
  normal: "forest",
  grass: "forest",
  bug: "forest",
  fairy: "forest",
  water: "coast",
  fire: "volcano",
  ground: "volcano",
  rock: "volcano",
  fighting: "volcano",
  electric: "storm",
  steel: "storm",
  poison: "twilight",
  psychic: "twilight",
  ghost: "twilight",
  dark: "twilight",
  ice: "alpine",
  flying: "alpine",
  dragon: "alpine",
};

export function createScene() {
  const stage = document.querySelector(".pokemon-stage");
  const image = document.querySelector("#pokemon-image");
  const greet = document.querySelector("#pokemon-greet");
  const night = document.querySelector("#scene-night");
  const motion = document.querySelector("#scene-motion");
  const cry = document.querySelector("#pokemon-cry");
  const speech = document.querySelector("#scene-speech");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let current = null;
  let busy = true;
  let imageReady = false;
  let effectsEnabled = true;
  let greetingIndex = 0;
  let speechTimer;
  let sparkleTimer;
  let audio = null;
  let pointerFrame = null;

  function updateControls() {
    greet.disabled = busy || !current || !imageReady;
    cry.disabled =
      busy || !current || !(current.cries?.latest || current.cries?.legacy);
    cry.title = cry.disabled
      ? "Som indisponível para este Pokémon"
      : "Ouvir o som deste Pokémon";
  }

  function stopCry() {
    if (audio) audio.pause();
    audio = null;
    cry.setAttribute("aria-pressed", "false");
    cry.textContent = "♫ Ouvir";
  }

  function resetPointer() {
    cancelAnimationFrame(pointerFrame);
    pointerFrame = null;
    greet.style.setProperty("--look-x", "0px");
    greet.style.setProperty("--look-y", "0px");
  }

  function updateMotion() {
    const enabled = effectsEnabled && !reducedMotion.matches;
    document.body.classList.toggle("motion-paused", !enabled);
    document.documentElement.classList.toggle("motion-paused", !enabled);
    motion.setAttribute("aria-pressed", String(enabled));
    motion.disabled = reducedMotion.matches;
    motion.title = reducedMotion.matches
      ? "Sua preferência por movimento reduzido está sendo respeitada"
      : enabled
        ? "Pausar os efeitos de movimento"
        : "Ativar os efeitos de movimento";
    if (!enabled) {
      resetPointer();
      image.getAnimations().forEach((animation) => animation.cancel());
      greet.getAnimations().forEach((animation) => animation.cancel());
    }
  }

  image.addEventListener("load", () => {
    imageReady = true;
    updateControls();
    if (motionAllowed())
      image.animate(
        [
          { opacity: 0, filter: "blur(4px)" },
          { opacity: 1, filter: "blur(0px)" },
        ],
        { duration: 360, easing: "ease-out" },
      );
  });
  image.addEventListener("error", () => {
    imageReady = false;
    updateControls();
  });
  greet.addEventListener("click", () => {
    if (greet.disabled) return;
    const name = pokemonLabel(current.name);
    const messages = [
      `${name} gostou da sua visita!`,
      `${name} está pronto para a próxima aventura.`,
      `Você e ${name}: uma ótima dupla!`,
    ];
    speech.textContent = messages[greetingIndex++ % messages.length];
    speech.hidden = false;
    clearTimeout(speechTimer);
    speechTimer = setTimeout(() => {
      speech.hidden = true;
    }, 3000);
    if (motionAllowed()) {
      greet.getAnimations().forEach((animation) => animation.cancel());
      greet.animate(
        [
          { transform: "translateY(0) rotate(0)" },
          { transform: "translateY(-18px) rotate(-5deg)", offset: 0.35 },
          { transform: "translateY(-6px) rotate(4deg)", offset: 0.7 },
          { transform: "translateY(0) rotate(0)" },
        ],
        { duration: 550, easing: "ease-out" },
      );
    }
  });
  stage.addEventListener("pointermove", (event) => {
    if (
      event.pointerType !== "mouse" ||
      !motionAllowed() ||
      greet.disabled ||
      pointerFrame
    )
      return;
    const bounds = stage.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 12;
    const y = ((event.clientY - bounds.top) / bounds.height - 0.5) * 8;
    pointerFrame = requestAnimationFrame(() => {
      greet.style.setProperty("--look-x", `${x}px`);
      greet.style.setProperty("--look-y", `${y}px`);
      pointerFrame = null;
    });
  });
  stage.addEventListener("pointerleave", resetPointer);
  night.addEventListener("click", () => {
    const enabled = night.getAttribute("aria-pressed") !== "true";
    night.setAttribute("aria-pressed", String(enabled));
    stage.classList.toggle("is-night", enabled);
    notify(
      enabled
        ? "Anoiteceu por aqui. Boa exploração!"
        : "Um novo dia de descobertas.",
    );
  });
  motion.addEventListener("click", () => {
    effectsEnabled = !effectsEnabled;
    updateMotion();
  });
  reducedMotion.addEventListener("change", updateMotion);
  cry.addEventListener("click", async () => {
    if (cry.disabled) return;
    if (audio) {
      stopCry();
      return;
    }
    const clip = new Audio(current.cries.latest || current.cries.legacy);
    clip.volume = 0.35;
    audio = clip;
    cry.setAttribute("aria-pressed", "true");
    cry.textContent = "■ Parar";
    clip.addEventListener(
      "ended",
      () => {
        if (audio === clip) stopCry();
      },
      { once: true },
    );
    const failed = () => {
      if (audio !== clip) return;
      stopCry();
      notify("Não foi possível reproduzir o som. Tente novamente.");
    };
    clip.addEventListener("error", failed, { once: true });
    try {
      await clip.play();
    } catch {
      failed();
    }
  });
  updateMotion();

  return {
    setPokemon(data) {
      stopCry();
      dismissNotice();
      clearTimeout(speechTimer);
      speech.hidden = true;
      current = data;
      imageReady = false;
      greetingIndex = 0;
      const habitat = typeHabitats[data.types[0]?.type.name] || "forest";
      stage.dataset.habitat = habitat;
      document.querySelector("#scene-name").textContent = habitats[habitat][0];
      document.body.style.setProperty("--world-tint", habitats[habitat][1]);
      document.querySelector(".pokemon-card").dataset.type =
        data.types[0]?.type.name || "normal";
      greet.setAttribute(
        "aria-label",
        `Interagir com ${pokemonLabel(data.name)}`,
      );
      stage.classList.remove("is-shiny");
      resetPointer();
      updateControls();
    },
    setBusy(value) {
      busy = value;
      if (value) stopCry();
      updateControls();
    },
    setShiny(value) {
      stage.classList.toggle("is-shiny", value);
      clearTimeout(sparkleTimer);
      stage.classList.remove("is-sparkling");
      if (value && motionAllowed()) {
        // Restart the short sparkle when the user activates shiny again.
        void stage.offsetWidth;
        stage.classList.add("is-sparkling");
        sparkleTimer = setTimeout(
          () => stage.classList.remove("is-sparkling"),
          700,
        );
      }
      notify(
        value
          ? "Uma nova paleta para seu companheiro: shiny ativado!"
          : "De volta às cores originais.",
      );
    },
  };
}
