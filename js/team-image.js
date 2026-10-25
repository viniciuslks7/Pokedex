import { getResource, pokemonLabel, resourceId } from "./api.js";

function titleCase(value) {
  return pokemonLabel(value).replace(/\b[a-z]/g, (letter) =>
    letter.toUpperCase(),
  );
}
function rounded(context, x, y, width, height, radius, fill) {
  context.fillStyle = fill;
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.fill();
}
function ball(context, x, y, radius) {
  context.fillStyle = "#d2e4b2";
  context.beginPath();
  context.arc(x, y, radius, Math.PI, 0);
  context.fill();
  context.fillStyle = "#f6f5ef";
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI);
  context.fill();
  context.strokeStyle = "#193c30";
  context.lineWidth = Math.max(4, radius / 7);
  context.beginPath();
  context.moveTo(x - radius, y);
  context.lineTo(x + radius, y);
  context.stroke();
  context.beginPath();
  context.arc(x, y, radius / 3, 0, Math.PI * 2);
  context.fillStyle = "#193c30";
  context.fill();
  context.beginPath();
  context.arc(x, y, radius / 6, 0, Math.PI * 2);
  context.fillStyle = "#f6f5ef";
  context.fill();
}
function lines(context, text, width, maxLines = 2) {
  const words = text.split(" "),
    result = [];
  let line = "";
  for (const word of words) {
    const next = line ? line + " " + word : word;
    if (context.measureText(next).width > width && line) {
      result.push(line);
      line = word;
    } else line = next;
  }
  if (line) result.push(line);
  if (result.length > maxLines) {
    result.length = maxLines;
    let last = result[maxLines - 1];
    while (context.measureText(last + "…").width > width)
      last = last.slice(0, -1);
    result[maxLines - 1] = last + "…";
  }
  return result;
}
export function drawTeamImage(
  canvas,
  pokemon,
  portraits,
  types,
  title,
  date = new Date(),
) {
  canvas.width = 1200;
  canvas.height = 1080;
  const context = canvas.getContext("2d");
  if (!context) throw Error("Seu navegador não conseguiu preparar a imagem.");
  const gradient = context.createLinearGradient(0, 0, 1200, 1080);
  gradient.addColorStop(0, "#112c23");
  gradient.addColorStop(1, "#355b42");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 1200, 1080);
  context.fillStyle = "#b2d29812";
  for (const [x, y, r] of [
    [1100, 40, 320],
    [50, 1080, 350],
  ]) {
    context.beginPath();
    context.arc(x, y, r, 0, Math.PI * 2);
    context.fill();
  }
  ball(context, 84, 78, 29);
  context.fillStyle = "#e0edcf";
  context.font = "600 17px system-ui, sans-serif";
  context.fillText("POKÉDEX · COMPANHEIROS DE AVENTURA", 135, 84);
  context.font = "700 38px system-ui, sans-serif";
  context.fillStyle = "#fffef6";
  context.fillText(title, 48, 150, 1100);
  context.font = "18px system-ui, sans-serif";
  context.fillStyle = "#c6d8c4";
  context.fillText(
    `${pokemon.length} de 6 companheiros · Cada parceiro tem seu jeito.`,
    48,
    184,
  );
  for (let i = 0; i < 6; i++) {
    const x = 48 + (i % 3) * 376,
      y = 220 + Math.floor(i / 3) * 365,
      member = pokemon[i];
    rounded(context, x, y, 352, 338, 22, member ? "#f7f8ef" : "#ffffff0d");
    if (!member) {
      context.font = "600 38px system-ui, sans-serif";
      context.fillStyle = "#b5c9ac";
      context.textAlign = "center";
      context.fillText(String(i + 1).padStart(2, "0"), x + 176, y + 150);
      context.font = "17px system-ui, sans-serif";
      context.fillText("Próximo companheiro", x + 176, y + 186);
      context.textAlign = "left";
      continue;
    }
    const primary = types[member.types[0]?.type.name] || types.normal;
    rounded(context, x + 14, y + 14, 324, 190, 15, primary[2]);
    context.fillStyle = "#355341";
    context.font = "600 16px system-ui, sans-serif";
    context.fillText(
      `#${String(resourceId(member.species?.url) || member.id).padStart(3, "0")}`,
      x + 28,
      y + 43,
    );
    const portrait = portraits[i];
    if (portrait) {
      context.imageSmoothingEnabled = false;
      const scale = Math.min(180 / portrait.width, 165 / portrait.height);
      context.drawImage(
        portrait,
        x + 176 - (portrait.width * scale) / 2,
        y + 100 - (portrait.height * scale) / 2,
        portrait.width * scale,
        portrait.height * scale,
      );
    } else ball(context, x + 176, y + 113, 45);
    context.fillStyle = "#193c30";
    context.font = "700 25px system-ui, sans-serif";
    lines(context, titleCase(member.name), 300).forEach((line, index) =>
      context.fillText(line, x + 24, y + 239 + index * 29),
    );
    let badgeX = x + 24;
    for (const { type } of member.types) {
      const palette = types[type.name] || [type.name, "#193c30", "#e6edda"];
      context.font = "600 15px system-ui, sans-serif";
      const width = context.measureText(palette[0]).width + 25;
      rounded(context, badgeX, y + 294, width, 28, 7, palette[2]);
      context.fillStyle = palette[1];
      context.fillText(palette[0], badgeX + 12, y + 313);
      badgeX += width + 9;
    }
  }
  context.fillStyle = "#d7e4cb";
  context.font = "16px system-ui, sans-serif";
  context.fillText(
    "Dados: PokéAPI · Projeto de fã, sem afiliação à Nintendo.",
    48,
    1015,
  );
  context.textAlign = "right";
  context.fillText(
    new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(
      date,
    ),
    1152,
    1015,
  );
  context.textAlign = "left";
  return canvas;
}
async function portrait(pokemon, signal) {
  const sprites = pokemon.sprites;
  const urls = [
    sprites?.front_default,
    sprites?.versions?.["generation-v"]?.["black-white"]?.animated
      ?.front_default,
    sprites?.other?.["official-artwork"]?.front_default,
  ].filter(Boolean);
  for (const url of new Set(urls)) {
    signal.throwIfAborted();
    try {
      if (!url.startsWith("data:image/")) {
        const parsed = new URL(url);
        if (
          parsed.protocol !== "https:" ||
          parsed.hostname !== "raw.githubusercontent.com"
        )
          continue;
      }
      const response = await fetch(url, {
        mode: "cors",
        credentials: "omit",
        signal: AbortSignal.any([signal, AbortSignal.timeout(3500)]),
      });
      if (
        !response.ok ||
        !response.headers.get("content-type")?.startsWith("image/")
      )
        continue;
      const bitmap = await createImageBitmap(await response.blob());
      signal.throwIfAborted();
      return bitmap;
    } catch {
      signal.throwIfAborted();
    }
  }
  return null;
}
export function createTeamImageExporter({ getMembers, types }) {
  const select = (id) => document.querySelector(id),
    open = select("#team-image-export"),
    generate = select("#team-image-generate"),
    panel = select("#team-image-panel");
  const status = select("#team-image-status"),
    image = select("#team-image-preview"),
    download = select("#team-image-download"),
    title = select("#team-image-title");
  let controller = null,
    version = 0,
    busy = false,
    signature = "",
    url = null;
  function clear() {
    if (url) URL.revokeObjectURL(url);
    url = null;
    image.hidden = download.hidden = true;
    image.removeAttribute("src");
  }
  function controls() {
    open.disabled = !getMembers().length || busy;
    generate.disabled = !getMembers().length || busy;
  }
  async function exportImage() {
    const selected = getMembers().map((member) => ({ ...member }));
    if (!selected.length || busy) return;
    panel.hidden = false;
    clear();
    controller?.abort();
    const active = new AbortController();
    controller = active;
    const request = ++version,
      timeout = setTimeout(() => active.abort(), 14000);
    busy = true;
    controls();
    status.textContent = "Preparando os retratos e a imagem da equipe…";
    let portraits = [];
    try {
      const pokemon = await Promise.all(
        selected.map((member) =>
          getResource(`pokemon/${member.id}`, active.signal),
        ),
      );
      const portraitResults = await Promise.allSettled(
        pokemon.map((member) => portrait(member, active.signal)),
      );
      portraits = portraitResults.map((result) =>
        result.status === "fulfilled" ? result.value : null,
      );
      active.signal.throwIfAborted();
      if (request !== version) return;
      const text =
        title.value.replace(/\s+/g, " ").trim().slice(0, 40) ||
        "Minha equipe Pokémon";
      const canvas = drawTeamImage(
        document.createElement("canvas"),
        pokemon,
        portraits,
        types,
        text,
      );
      const blob = await new Promise((resolve, reject) =>
        canvas.toBlob(
          (value) =>
            value
              ? resolve(value)
              : reject(Error("Não foi possível gerar o PNG.")),
          "image/png",
        ),
      );
      if (request !== version) return;
      url = URL.createObjectURL(blob);
      image.src = url;
      image.alt = `${text}: ${pokemon.map((member) => pokemonLabel(member.name)).join(", ")}`;
      image.hidden = download.hidden = false;
      download.href = url;
      download.download = "pokedex-minha-equipe.png";
      const missing = portraits.filter((value) => !value).length;
      status.textContent = missing
        ? `Imagem pronta. ${missing} ${missing === 1 ? "retrato indisponível foi substituído" : "retratos indisponíveis foram substituídos"} por um símbolo. Use “Baixar PNG”.`
        : "Imagem pronta para salvar e compartilhar. Use “Baixar PNG”.";
    } catch (error) {
      if (request === version)
        status.textContent =
          error.name === "AbortError"
            ? "A preparação demorou demais. Tente gerar a imagem novamente."
            : "Não foi possível consultar todos os integrantes. Abra seus detalhes com conexão ou escolha Pokémon disponíveis nesta prévia e tente novamente.";
    } finally {
      portraits.forEach((value) => value?.close());
      clearTimeout(timeout);
      if (request === version) {
        busy = false;
        controls();
      }
    }
  }
  open.addEventListener("click", exportImage);
  generate.addEventListener("click", exportImage);
  title.addEventListener("input", () => {
    controller?.abort();
    version++;
    busy = false;
    clear();
    controls();
    status.textContent = "Título alterado. Gere a imagem para aplicar.";
  });
  return {
    update() {
      const next = getMembers()
        .map((member) => member.id)
        .join(",");
      if (next !== signature) {
        signature = next;
        controller?.abort();
        version++;
        busy = false;
        clear();
        status.textContent = panel.hidden
          ? ""
          : "A equipe mudou. Gere uma nova imagem com os integrantes atuais.";
      }
      controls();
    },
  };
}
