const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const simulator = new ScadaSimulator(demoConfig);
const alarms = new AlarmManager(simulator.bus);
const trends = new TrendManager(demoConfig, simulator);
let role = localStorage.getItem("dagoca-role") || "Operador";
let username = localStorage.getItem("dagoca-user") || "Operador 01";
let soundEnabled = localStorage.getItem("dagoca-sound") !== "false";
let cipTimer = null;
let cipRunning = false;
let selectedCip = new Set();

const stageEquipmentTags = ["CIP-01", "TK-001", "TK-003", "TK-004", "TK-005", "E-001", "FERMENTER", "TK-007", "MATURATION", "EMB-01"];
const dataProvider = new SimulationDataProvider(simulator);

function safeStore(key, value) {
  try { localStorage.setItem(key, value); } catch { toast("No fue posible guardar la preferencia local.", "error"); }
}

function formatTime(value, secondsOnly = false) {
  const seconds = Number(value || 0);
  const h = String(Math.floor(seconds / 3600)).padStart(2, "0");
  const m = String(Math.floor(seconds % 3600 / 60)).padStart(2, "0");
  const s = String(seconds % 60).padStart(2, "0");
  return secondsOnly ? `${m}:${s}` : `${h}:${m}:${s}`;
}

function toast(message, type = "") {
  const item = document.createElement("div");
  item.className = `toast ${type}`;
  item.textContent = message;
  $("#toast-region").append(item);
  setTimeout(() => item.remove(), 4200);
}

function equipmentStatusClass(equipment) {
  if (equipment.status === "Alarma") return "alarm";
  if (equipment.status === "Operando") return "active";
  return "";
}

function equipmentCard(equipment, displayName = equipment.tag) {
  const reading = equipment.temperature != null ? `${equipment.temperature.toFixed?.(1) ?? equipment.temperature} °C` : equipment.status;
  return `<button class="equipment ${equipmentStatusClass(equipment)}" data-equipment="${equipment.tag}" title="${equipment.name} · ${equipment.status}">
    <span class="equip-icon ${equipment.type}"><i class="level" style="--level:${equipment.level}%"></i></span>
    <strong>${displayName}</strong><small>${equipment.name}</small><span class="reading">${reading}</span>
  </button>`;
}

function classicUnit(equipment, options = {}) {
  const {
    compact = false,
    shape = equipment.type === "filter" ? "filter" : equipment.type === "cooler" ? "cooler" : "tank",
    process = "MOSTO",
    showGauge = true
  } = options;
  const status = equipment.status === "Operando" ? "RUN" : equipment.status === "Alarma" ? "FALLA" : equipment.available ? "LISTO" : equipment.status.toUpperCase();
  const statusClass = equipment.status === "Operando" ? "run" : equipment.status === "Alarma" ? "fault" : equipment.available ? "ready" : "stopped";
  const secondary = equipment.ph != null ? `pH ${equipment.ph}` : equipment.density != null ? `${equipment.density} SG` : equipment.turbidity != null ? `${equipment.turbidity} NTU` : `${equipment.pressure ?? 0} bar`;
  const displayTag = equipment.displayTag || equipment.tag;
  return `<button class="classic-unit ${compact ? "compact" : ""} ${shape} ${equipmentStatusClass(equipment)}" data-equipment="${equipment.tag}" aria-label="${displayTag}, ${equipment.name}, ${equipment.status}">
    <span class="unit-title">${equipment.name}</span>
    <span class="vessel-wrap">
      <span class="vessel-top"></span>
      <span class="vessel-body">
        <i class="liquid ${process.toLowerCase()}" style="height:${equipment.level}%"></i>
        ${shape === "tank" ? '<i class="agitator">↻</i>' : ""}
        ${shape === "filter" ? '<i class="filter-plates"></i>' : ""}
        ${shape === "cooler" ? '<i class="cooler-coil">〰</i>' : ""}
      </span>
      <span class="vessel-cone"></span><span class="leg left"></span><span class="leg right"></span>
    </span>
    ${showGauge ? `<span class="classic-gauge"><i style="height:${equipment.level}%"></i><b>100</b><b>50</b><b>0</b></span>` : ""}
    <span class="unit-tag">${displayTag}</span>
    <span class="unit-readings"><b>${equipment.temperature?.toFixed?.(1) ?? equipment.temperature} °C</b><small>${secondary}</small></span>
    <span class="classic-status ${statusClass}"><i></i>${status}</span>
  </button>`;
}

function renderMimic() {
  const get = tag => simulator.equipment.get(tag);
  const fermenters = [...simulator.equipment.values()].filter(e => e.tag.startsWith("TK-006"));
  const maturation = [...simulator.equipment.values()].filter(e => e.tag.startsWith("TK-008"));
  const active = simulator.activeStage;
  $("#plant-mimic").innerHTML = `
    <div class="classic-board ${simulator.running ? "system-running" : ""}">
      <div class="classic-board-head">
        <strong>DAGOCA · DISTRIBUCIÓN GENERAL DE PLANTA</strong>
        <div class="pilot-bank">
          <span><i class="${simulator.running ? "green on" : "green"}"></i>MARCHA</span>
          <span><i class="${simulator.emergency ? "red on" : "red"}"></i>FALLO</span>
          <span><i class="${active >= 0 ? "amber on" : "amber"}"></i>PROCESO</span>
        </div>
      </div>
      <div class="plant-zone zone-utilities"><span>ÁREA 01 · SERVICIOS Y AGUA</span></div>
      <div class="plant-zone zone-brewhouse"><span>ÁREA 02 · SALA DE COCCIÓN</span></div>
      <div class="plant-zone zone-cold"><span>ÁREA 03 · ENFRIAMIENTO</span></div>
      <div class="plant-zone zone-fermentation"><span>ÁREA 04 · BODEGA DE FERMENTACIÓN</span></div>
      <div class="plant-zone zone-maturation"><span>ÁREA 05 · MADURACIÓN</span></div>
      <div class="plant-zone zone-packaging"><span>ÁREA 06 · FILTRADO Y EMPAQUE</span></div>
      <svg class="process-pipes" viewBox="0 0 1200 720" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="pipeMetal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fafafa"/><stop offset=".45" stop-color="#777"/><stop offset=".7" stop-color="#f5f5f5"/><stop offset="1" stop-color="#555"/></linearGradient>
          <marker id="productArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 10 5 0 10Z" fill="#8b5b22"/></marker>
          <marker id="waterArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 10 5 0 10Z" fill="#257b8b"/></marker>
        </defs>
        <path class="pipe" d="M28 184H108 M214 184H264 M382 184H432 M550 184H600 M718 184H770 M886 184H926"/>
        <path class="pipe" d="M1040 184H1110V328H300"/>
        <path class="pipe ${active >= 5 && active <= 7 ? "product-flow" : ""}" d="M300 328V350 M405 328V350 M510 328V350 M615 328V350 M720 328V350"/>
        <path class="pipe" d="M300 523V548H900V328H1015"/>
        <path class="pipe ${active >= 7 && active <= 10 ? "product-flow" : ""}" d="M790 548V568 M895 548V568 M1000 548V568 M1105 548V568"/>
        <path class="pipe" d="M1015 328H1145V610H970"/>
        <path class="cip-pipe ${cipRunning ? "cip-flowing" : ""}" d="M46 682H1130V635 M190 682V610 M585 682V525 M900 682V610"/>
        <path class="route-direction water" d="M214 184H255" marker-end="url(#waterArrow)"/>
        <path class="route-direction product" d="M382 184H423 M550 184H591 M718 184H761 M886 184H917" marker-end="url(#productArrow)"/>
        <path class="route-direction product" d="M1090 250V312H910" marker-end="url(#productArrow)"/>
        <path class="route-direction product" d="M580 548H875" marker-end="url(#productArrow)"/>
      </svg>
      <div class="route-tag water-route">AGUA DE PROCESO →</div>
      <div class="route-tag product-route">MOSTO / PRODUCTO →</div>
      <div class="primary-equipment">
        ${classicUnit(get("TK-001"), { shape: "filter", process: "agua" })}
        ${classicUnit(get("TK-002"), { process: "agua" })}
        ${classicUnit(get("TK-003"), { process: "mosto" })}
        ${classicUnit(get("TK-004"), { shape: "filter", process: "mosto" })}
        ${classicUnit(get("TK-005"), { process: "mosto" })}
        ${classicUnit(get("E-001"), { shape: "cooler", process: "refrigerante" })}
      </div>
      <div class="valve-row top-valves">
        ${["LV-100", "LV-104", "LV-108"].map((tag, index) => `<button class="valve-symbol ${simulator.running && active >= index * 2 ? "open" : ""}" data-equipment="${tag}" title="${tag}"><i></i><b>${tag}</b></button>`).join("")}
      </div>
      <button class="inline-actuator inline-b1 ${get("P-001").status === "Operando" ? "run" : ""}" data-equipment="P-001" title="P-001 · Transferencia TK-002 a TK-003"><i>▶</i><b>P-001</b></button>
      <button class="inline-actuator inline-ag1 ${get("AG1").status === "Operando" ? "run" : ""}" data-equipment="AG1" title="AG1 · Agitador de maceración"><i>↻</i><b>AG1</b></button>
      <div class="bank fermenter-bank">
        <div class="bank-header"><b>COLECTOR TK-006</b><span>Selección automática de fermentador</span></div>
        <div class="classic-tank-row">${fermenters.map(e => classicUnit(e, { compact: true, process: "cerveza", showGauge: false })).join("")}</div>
      </div>
      <div class="filter2-bank">
        <div class="bank-header"><b>FILTRADO II</b></div>
        ${classicUnit(get("TK-007"), { compact: true, shape: "filter", process: "cerveza", showGauge: false })}
      </div>
      <div class="bank maturation-bank">
        <div class="bank-header"><b>COLECTOR TK-008</b><span>Selección de maduración</span></div>
        <div class="classic-tank-row">${maturation.map(e => classicUnit(e, { compact: true, process: "cerveza", showGauge: false })).join("")}</div>
      </div>
      <div class="final-skid">
        <div class="pump-set">
          ${["P-001", "P-002", "P-003"].map((tag, index) => `<button class="pump-symbol ${simulator.running && active >= index * 2 ? "run" : ""}" data-equipment="${tag}"><i>▶</i><b>${tag}</b><small>${get(tag).status}</small></button>`).join("")}
        </div>
        <button class="bottling-machine ${active === 11 ? "active" : ""}" data-equipment="EMB-01"><i>▥ ▥ ▥</i><b>EMBOTELLADO</b><small>EMB-01 · ${get("EMB-01").status}</small></button>
      </div>
      <div class="cip-classic"><b>CIP-01</b><span class="cip-reservoir">CIP</span><span>RETORNO DE LIMPIEZA</span></div>
    </div>`;
  $$(".equipment").forEach(button => button.addEventListener("click", () => openEquipment(button.dataset.equipment)));
  $$("#plant-mimic [data-equipment]").forEach(button => button.addEventListener("click", () => openEquipment(button.dataset.equipment)));
}

function renderMetrics() {
  const batch = simulator.activeBatch;
  const current = simulator.currentEquipment();
  const metrics = [
    ["Lote activo", batch?.id || "Sin lote", batch?.recipe || "Cree un lote para comenzar", "#4ed29d"],
    ["Progreso de etapa", `${Math.min(100, Math.round(simulator.stageProgress / demoConfig.simulation.secondsPerStage * 100))}%`, simulator.currentStep()?.name || "En espera", "#5aa9ff"],
    ["Equipo en operación", current?.tag || "—", current?.status || "Sistema preparado", "#e5a94a"],
    ["Alarmas activas", alarms.alarms.filter(a => a.state.startsWith("ACTIVA")).length, `${alarms.alarms.filter(a => a.priority === "Crítica" && a.state !== "CERRADA").length} críticas`, "#c23b45"]
  ];
  $("#overview-metrics").innerHTML = metrics.map(([label, value, detail, color]) => `<div class="metric" style="--accent:${color}"><span>${label}</span><strong>${value}</strong><small>${detail}</small></div>`).join("");
}

function renderHome() {
  const batch = simulator.activeBatch;
  const activeAlarms = alarms.alarms.filter(a => !["CERRADA", "Normalizada"].includes(a.state)).length;
  const cards = [
    ["Estado de planta", simulator.emergency ? "EMERGENCIA" : simulator.running ? "EN PRODUCCIÓN" : "DISPONIBLE", simulator.mode.toUpperCase(), "#18795c"],
    ["Lote activo", batch?.id || "SIN LOTE", batch?.recipe || "Sin receta asignada", "#2e6f9e"],
    ["Etapa", simulator.currentStep()?.name || "EN ESPERA", formatTime(simulator.stageProgress, true), "#b6782e"],
    ["Alarmas", activeAlarms, "Activas en el sistema", "#c23b45"]
  ];
  $("#home-metrics").innerHTML = cards.map(([label, value, detail, color]) => `<div class="metric" style="--accent:${color}"><span>${label}</span><strong>${value}</strong><small>${detail}</small></div>`).join("");
  $("#home-status").innerHTML = `<dl class="status-list"><dt>Modo</dt><dd>${simulator.mode.toUpperCase()}</dd><dt>Receta programada</dt><dd>${batch?.recipe || "—"}</dd><dt>Fermentador</dt><dd>${batch?.fermenter || "—"}</dd><dt>Maduración</dt><dd>${batch?.maturation || "—"}</dd></dl>`;
  $("#home-events").innerHTML = simulator.events.slice(0, 6).map(event => `<li><time>${new Date(event.time).toLocaleTimeString("es-CO")}</time><span>${event.message}</span></li>`).join("") || "<li>Sin eventos registrados.</li>";
}

const stageScreens = Object.freeze({
  water: {
    index: 1, title: "Filtrado y almacenamiento de agua", short: "Agua", media: "water",
    tags: ["TK-001", "TK-002"], actuators: ["LV-100", "P-001"],
    instruments: ["LSL-100", "LSH-100", "LC-100", "LY-100", "PI-102"],
    origin: "Entrada de agua", destination: "TK-003", loop: "LC-100", pv: "Nivel TK-002", sp: "Pendiente de validación",
    note: "TK-001 descarga por gravedad hacia TK-002 según P&ID001."
  },
  mashing: {
    index: 2, title: "Maceración", short: "Maceración", media: "wort",
    tags: ["TK-003"], actuators: ["P-001", "AG1", "TV-105", "LV-104"],
    instruments: ["LSL-104", "LSH-104", "TE-105", "TT-105", "TC-105"],
    origin: "TK-002 + malta manual", destination: "TK-004", loop: "TC-105", pv: "Temperatura TK-003", sp: "66,0 °C · valor de simulación",
    note: "Chaqueta de vapor, agitador AG1, CIP y desagüe."
  },
  filter1: {
    index: 3, title: "Filtrado I", short: "Filtrado I", media: "wort",
    tags: ["TK-004"], actuators: ["LV-104", "P-002"],
    instruments: ["LSL-106", "LSH-106", "LC-106", "PI-106"],
    origin: "TK-003", destination: "TK-005", loop: "LC-106", pv: "Nivel TK-004", sp: "Pendiente de validación",
    note: "El elemento de filtración forma parte de TK-004."
  },
  boiling: {
    index: 4, title: "Cocción", short: "Cocción", media: "wort",
    tags: ["TK-005"], actuators: ["P-002", "TV-107", "LV-108", "P-003"],
    instruments: ["LSL-108", "LC-108", "TE-107", "TT-107", "TC-107"],
    origin: "TK-004 + lúpulo manual", destination: "E-001", loop: "TC-107", pv: "Temperatura TK-005", sp: "100,0 °C · valor de simulación",
    note: "Calentamiento por vapor; tiempo de cocción y reposo configurables."
  },
  cooling: {
    index: 5, title: "Enfriamiento", short: "Enfriamiento", media: "glycol",
    tags: ["E-001"], actuators: ["P-003", "TV-109"],
    instruments: ["TT-109", "TC-109", "TV-109", "PI-109"],
    origin: "TK-005", destination: "TK-006A / TK-006B", loop: "TC-109", pv: "Temperatura de salida", sp: "18,0 °C · valor de simulación",
    note: "E-001 es un intercambiador. Transferencia bloqueada con TT-109 ≥ 35 °C."
  },
  fermentation: {
    index: 6, title: "Fermentación", short: "Fermentación", media: "beer",
    tags: ["TK-006A", "TK-006B"], actuators: ["LV-111"],
    instruments: ["LSH-111", "LSL-112", "TT-111", "TC-111", "PT-111", "AIT-111"],
    origin: "E-001 + levadura manual", destination: "TK-007", loop: "TC-111", pv: "Temperatura del tanque asignado", sp: "Pendiente de validación",
    note: "Dos fermentadores seleccionables con entrada y salida independientes."
  },
  filter2: {
    index: 7, title: "Filtrado II", short: "Filtrado II", media: "beer",
    tags: ["TK-007"], actuators: ["LV-125"],
    instruments: ["LSH-125", "LSL-125", "LC-125", "LY-125", "AIT-125", "PDT-125"],
    origin: "TK-006A / TK-006B", destination: "TK-008A / B / C / D", loop: "LC-125", pv: "Nivel TK-007", sp: "Pendiente de validación",
    note: "Instrumentación de presión diferencial y turbidez: valor simulado; tipo de filtro pendiente."
  },
  maturation: {
    index: 8, title: "Maduración", short: "Maduración", media: "beer",
    tags: ["TK-008A", "TK-008B", "TK-008C", "TK-008D"], actuators: ["TV-113", "TV-116", "TV-119", "TV-122"],
    instruments: ["TT-113", "TC-113", "TT-116", "TC-116", "TT-119", "TC-119", "TT-122", "TC-122"],
    origin: "TK-007", destination: "Embotellado", loop: "TC-113 / 116 / 119 / 122", pv: "Temperatura por tanque", sp: "1–4 °C recomendado; validar receta",
    note: "Cuatro tanques conectados a una línea común de agua helada."
  }
});

function getStageAlarmCount(spec) {
  return alarms.alarms.filter(alarm => alarm.state.startsWith("ACTIVA") && [...spec.tags, ...spec.actuators].some(tag => alarm.equipment === tag || alarm.tag.includes(tag.replace("TK-", "")))).length;
}

function renderStageOverview() {
  const activeStage = simulator.activeStage;
  $("#stage-overview").innerHTML = `
    <div class="overview-route-head"><strong>DISTRIBUCIÓN GENERAL DE PROCESO</strong><button class="text-button" data-go="process">Abrir sinóptico general →</button></div>
    <div class="overview-route">
      ${Object.entries(stageScreens).map(([key, spec], position) => {
        const equipment = simulator.equipment.get(spec.tags[0]);
        const active = activeStage === spec.index;
        const alarmCount = getStageAlarmCount(spec);
        return `<article class="stage-summary ${active ? "active" : ""}">
          <header><span>${String(position + 1).padStart(2, "0")}</span><b>${spec.short}</b><i class="status-dot ${alarmCount ? "alarm" : active ? "running" : "ready"}"></i></header>
          <strong>${spec.tags.join(" · ")}</strong>
          <dl><dt>Estado</dt><dd>${active ? getOperatorSequenceState(simulator).status : equipment?.status || "Disponible"}</dd><dt>Variable</dt><dd>${equipment?.temperature?.toFixed?.(1) ?? "—"} °C</dd><dt>Lote</dt><dd>${equipment?.batchId || "—"}</dd><dt>Alarmas</dt><dd>${alarmCount}</dd></dl>
          <button class="btn" data-go="${key}">Ver detalle</button>
        </article>${position < 7 ? '<span class="overview-connector" aria-hidden="true">→</span>' : ""}`;
      }).join("")}
    </div>`;
  $("#stage-overview").querySelectorAll("[data-go]").forEach(button => button.addEventListener("click", () => switchView(button.dataset.go)));
}

function actuatorMarkup(tag, stageActive) {
  const equipment = simulator.equipment.get(tag);
  const isPump = tag.startsWith("P-");
  const isAgitator = tag === "AG1";
  const running = equipment ? equipment.status === "Operando" : stageActive;
  const state = equipment ? (equipment.position || equipment.status) : (stageActive ? "Abierta" : "Cerrada");
  return `<button class="stage-actuator ${isPump ? "pump" : isAgitator ? "ag-motor" : "valve"} ${running ? "run" : ""}" ${equipment ? `data-equipment="${tag}"` : "disabled"} title="${tag}">
    <i>${isPump ? "▶" : isAgitator ? "↻" : "◁▷"}</i><b>${tag}</b><small>${state}</small>
  </button>`;
}

function stageStateMarkup(spec) {
  const sequence = getOperatorSequenceState(simulator);
  const isActive = simulator.activeStage === spec.index;
  const progress = Math.min(100, Math.round(simulator.stageProgress / demoConfig.simulation.secondsPerStage * 100));
  const pendingText = isActive ? simulator.blockReason() : simulator.activeStage < spec.index ? "Esperando etapa anterior" : "Etapa completada";
  return `<div class="panel-heading"><div><p class="eyebrow">ESTADO DE LA ETAPA</p><h2>${isActive ? sequence.status : spec.title}</h2></div><span class="badge ${isActive ? "Reconocida" : ""}">${isActive ? "EN CURSO" : simulator.activeStage > spec.index ? "COMPLETADA" : "DISPONIBLE"}</span></div>
    <dl class="stage-state-values">
      <dt>Acción activa</dt><dd>${isActive ? sequence.action : "Sin acción automática"}</dd>
      <dt>Tiempo</dt><dd>${isActive ? `${formatTime(simulator.stageProgress)} / ${formatTime(demoConfig.simulation.secondsPerStage)}` : "—"}</dd>
      <dt>Condición para continuar</dt><dd>${pendingText}</dd>
      <dt>Interlock activo</dt><dd>${simulator.emergency ? "Parada de emergencia" : isActive && !simulator.canAdvance() ? pendingText : "Ninguno"}</dd>
      <dt>Próximo destino</dt><dd>${spec.destination}</dd>
    </dl>
    <div class="stage-progress"><i style="width:${isActive ? progress : simulator.activeStage > spec.index ? 100 : 0}%"></i></div>`;
}

function renderStageScreen(key, spec) {
  const target = $(`#stage-${key}`);
  if (!target) return;
  const stageActive = simulator.running && simulator.activeStage === spec.index;
  const equipment = spec.tags.map(tag => simulator.equipment.get(tag)).filter(Boolean);
  const alarmCount = getStageAlarmCount(spec);
  const pvIsLevel = ["water", "filter1", "filter2"].includes(key);
  const pvValue = pvIsLevel ? equipment[0]?.level : equipment[0]?.temperature?.toFixed?.(1);
  target.innerHTML = `
    <div class="stage-screen-head">
      <div><p class="eyebrow">ÁREA DE PROCESO · P&ID</p><h2>${spec.title}</h2><p>${spec.origin} → ${spec.destination}</p></div>
      <div class="stage-head-status"><span><i class="status-dot ${alarmCount ? "alarm" : stageActive ? "running" : "ready"}"></i>${alarmCount ? `${alarmCount} alarma(s)` : stageActive ? "Etapa en operación" : "Sin alarmas activas"}</span><button class="btn" data-go="home">Vista general</button></div>
    </div>
    <div class="stage-workspace">
      <article class="stage-mimic panel">
        <div class="mimic-title"><b>RUTA DE PROCESO</b><span>${spec.note}</span></div>
        <div class="stage-route route-${spec.media} ${stageActive ? "active" : ""}">
          <span class="route-terminal">${spec.origin}</span>
          <i class="route-line"></i>
          ${equipment.map((item, index) => `${classicUnit(item, { compact: equipment.length > 2, shape: item.type === "filter" ? "filter" : item.type === "cooler" ? "cooler" : "tank", process: spec.media, showGauge: equipment.length <= 2 })}${index < equipment.length - 1 ? '<i class="route-line"></i>' : ""}`).join("")}
          <i class="route-line"></i>
          <span class="route-terminal">${spec.destination}</span>
        </div>
        <div class="stage-actuators">${spec.actuators.map(tag => actuatorMarkup(tag, stageActive)).join("")}</div>
        <div class="utility-lines">
          <span class="utility cip">CIP · línea discontinua</span>
          ${["mashing", "boiling"].includes(key) ? '<span class="utility steam">Vapor · línea tramada</span>' : ""}
          ${["cooling", "fermentation", "maturation"].includes(key) ? '<span class="utility glycol">Agua fría / helada · línea cian</span>' : ""}
          <span class="utility drain">Desagüe · línea gris</span>
        </div>
      </article>
      <aside class="panel stage-state-panel">${stageStateMarkup(spec)}</aside>
    </div>
    <div class="stage-data-grid">
      <article class="panel loop-panel">
        <div class="panel-heading"><div><p class="eyebrow">LAZO DE CONTROL</p><h2>${spec.loop}</h2></div><span class="badge">AUTO</span></div>
        <div class="loop-values">
          <span>PV<strong>${pvValue ?? "—"} ${pvIsLevel ? "%" : "°C"}</strong></span>
          <span>SP<strong>${spec.sp}</strong></span>
          <span>Salida<strong>${stageActive ? Math.min(100, 18 + simulator.stageProgress * 7) : 0} %</strong></span>
          <span>Error<strong>${equipment[0]?.setpoint != null ? (equipment[0].setpoint - equipment[0].temperature).toFixed(1) : "—"}</strong></span>
        </div>
        <div class="mini-trend" aria-label="Minigráfica PV y SP"><i></i><b></b></div>
      </article>
      <article class="panel">
        <div class="panel-heading"><div><p class="eyebrow">INSTRUMENTACIÓN</p><h2>Señales visibles</h2></div></div>
        <div class="tag-matrix">${spec.instruments.map(tag => `<span><code>${tag}</code><small>${tag.startsWith("AIT-125") || tag.startsWith("PDT-125") || tag === "AIT-111" ? "VALOR DE SIMULACIÓN" : "SIMULATED"}</small></span>`).join("")}</div>
      </article>
      <article class="panel">
        <div class="panel-heading"><div><p class="eyebrow">LOTE E INTERLOCKS</p><h2>Condiciones operativas</h2></div></div>
        <dl class="stage-state-values"><dt>Lote</dt><dd>${simulator.activeBatch?.id || "—"}</dd><dt>Receta</dt><dd>${simulator.activeBatch?.recipe || "—"}</dd><dt>Origen</dt><dd>${spec.origin}</dd><dt>Destino</dt><dd>${spec.destination}</dd><dt>CIP</dt><dd>${equipment.some(item => item.cipStatus !== "LIMPIO") ? "ACTIVO / PENDIENTE" : "Disponible"}</dd></dl>
      </article>
    </div>
    ${key === "filter2" ? '<p class="engineering-note"><strong>INSTRUMENTACIÓN PENDIENTE DE SELECCIÓN.</strong> El tipo definitivo de filtro, ΔP y turbidez no están confirmados por el P&ID.</p>' : ""}`;
  target.querySelectorAll("[data-equipment]").forEach(button => button.addEventListener("click", () => openEquipment(button.dataset.equipment)));
  target.querySelectorAll("[data-go]").forEach(button => button.addEventListener("click", () => switchView(button.dataset.go)));
}

function renderStageScreens() {
  renderStageOverview();
  Object.entries(stageScreens).forEach(([key, spec]) => renderStageScreen(key, spec));
  const overviewState = $("#overview-stage-state");
  if (overviewState) {
    const spec = Object.values(stageScreens).find(item => item.index === simulator.activeStage) || stageScreens.water;
    overviewState.innerHTML = stageStateMarkup(spec);
  }
  const diagnostics = $("#engineering-diagnostics");
  diagnostics.hidden = role !== "Ingeniería";
  if (role === "Ingeniería") {
    const sequence = getOperatorSequenceState(simulator);
    diagnostics.innerHTML = `<div class="panel-heading"><div><p class="eyebrow">DIAGNÓSTICO DE INGENIERÍA</p><h2>Secuencia y comunicaciones</h2></div></div>
      <dl class="status-list"><dt>SEQUENCE_STEP</dt><dd>${sequence.code}</dd><dt>Proveedor de datos</dt><dd>SimulationDataProvider</dd><dt>PLC previsto</dt><dd>5069-L320ER</dd><dt>Protocolo</dt><dd>EtherNet/IP vía gateway</dd></dl>
      <div class="tag-matrix">${Object.entries(engineeringSignalNames).map(([tag, label]) => `<span><code>${tag}</code><small>${label}</small></span>`).join("")}</div>`;
  }
}

function renderEvents() {
  $("#event-list").innerHTML = simulator.events.slice(0, 8).map(event => `<li><time>${new Date(event.time).toLocaleTimeString("es-CO")}</time><span>${event.message}</span></li>`).join("") || "<li><span>Sin eventos registrados.</span></li>";
}

function renderBatches() {
  $("#batch-table").innerHTML = simulator.batches.map(batch => `<tr>
    <td><code>${batch.id}</code></td><td>${new Date(batch.startedAt || Date.now()).toLocaleDateString("es-CO")}</td><td>${batch.recipe}</td><td>${batch.volume} L</td>
    <td><span class="badge">${batch.status.toUpperCase()}</span></td>
    <td>${batch.startedAt ? new Date(batch.startedAt).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" }) : "—"}</td>
    <td><span class="badge ${batch.status.startsWith("EN ") ? "Reconocida" : "Normalizada"}">${batch.stage}</span></td>
    <td>${formatTime(batch.elapsed)}</td><td>${batch.fermenter} → ${batch.maturation}</td><td>${batch.operator || username}</td>
  </tr>`).join("") || `<tr><td colspan="10" class="empty-row">No hay lotes. Cree el primero para iniciar la producción.</td></tr>`;
}

function renderRecipes() {
  $("#recipe-cards").innerHTML = Object.entries(demoConfig.recipes).map(([name, recipe]) => `<article class="recipe-card">
    <div class="panel-heading"><h3>${name}</h3><button class="text-button recipe-edit" data-recipe="${name}" ${!hasPermission(role, "editRecipe") ? "disabled title='Requiere rol Supervisor'" : ""}>Editar</button></div>
    <div class="recipe-stats">
      <span>Código<strong>${recipe.code}</strong></span><span>Volumen<strong>${recipe.volume} L</strong></span>
      <span>Maceración<strong>${recipe.mashTemp} °C / ${recipe.mashMinimumMinutes} min</strong></span><span>pH<strong>${recipe.mashPhMin}–${recipe.mashPhMax}</strong></span>
      <span>Cocción<strong>${recipe.boilTemp} °C / ${recipe.boilMinutes} min</strong></span><span>Fermentación<strong>${recipe.fermentationTemp} °C</strong></span>
      <span>Densidad<strong>${recipe.initialDensity} → ${recipe.finalDensity}</strong></span><span>Maduración<strong>${recipe.maturationTemp} °C</strong></span>
      <span>Turbidez máx.<strong>${recipe.turbidityMax} NTU</strong></span><span>Validación<strong>${recipe.validation}</strong></span>
    </div>
  </article>`).join("");
  $$(".recipe-edit").forEach(button => button.addEventListener("click", () => editRecipe(button.dataset.recipe)));
}

function editRecipe(name) {
  if (!requirePermission(role, "editRecipe", toast)) return;
  const recipe = demoConfig.recipes[name];
  const value = prompt(`Temperatura de maceración para ${name} (°C):`, recipe.mashTemp);
  if (value == null) return;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 40 || number > 90) return toast("Valor fuera del rango de simulación 40–90 °C.", "error");
  recipe.mashTemp = number;
  safeStore("dagoca-recipes", JSON.stringify(demoConfig.recipes));
  renderRecipes(); toast(`Parámetro de simulación de ${name} actualizado.`);
}

function renderAlarmSummary() {
  const data = [
    ["Críticas", alarms.alarms.filter(a => a.priority === "Crítica" && a.state !== "CERRADA").length, "#c23b45"],
    ["Activas", alarms.alarms.filter(a => a.state.startsWith("ACTIVA")).length, "#b6782e"],
    ["Reconocidas", alarms.alarms.filter(a => a.state === "ACTIVA RECONOCIDA").length, "#2e6f9e"],
    ["Cerradas", alarms.alarms.filter(a => a.state === "CERRADA").length, "#18795c"]
  ];
  $("#alarm-summary").innerHTML = data.map(([label, count, color]) => `<div class="alarm-stat" style="--accent:${color}"><span>${label}</span><strong>${count}</strong></div>`).join("");
}

function renderAlarmTable() {
  const priority = $("#alarm-priority").value;
  const equipment = $("#alarm-equipment").value;
  const state = $("#alarm-state").value;
  const search = $("#alarm-search").value.toLowerCase();
  const filtered = alarms.alarms.filter(alarm =>
    (!priority || alarm.priority === priority) && (!equipment || alarm.equipment === equipment) &&
    (!state || alarm.state === state) && (!search || `${alarm.tag} ${alarm.description} ${alarm.batch}`.toLowerCase().includes(search))
  );
  $("#alarm-table").innerHTML = filtered.map(alarm => {
    const actions = [];
    if (["ACTIVA NO RECONOCIDA", "NORMALIZADA NO RECONOCIDA"].includes(alarm.state)) actions.push(`<button class="ack-button" data-ack="${alarm.id}">Reconocer</button>`);
    if (alarm.state.startsWith("ACTIVA") && simulator.mode === "simulation" && hasPermission(role, "forceSignal")) actions.push(`<button class="ack-button" data-normalize="${alarm.tag}">Normalizar</button>`);
    if (alarm.normalizedAt && alarm.state !== "CERRADA" && hasPermission(role, "closeAlarm")) actions.push(`<button class="ack-button" data-close-alarm="${alarm.id}">Cerrar</button>`);
    return `<tr>
    <td>${new Date(alarm.timestamp).toLocaleString("es-CO")}</td><td><span class="badge ${alarm.priority}">${alarm.priority}</span></td>
    <td><code>${alarm.tag}</code></td><td>${alarm.description}</td><td>${alarm.equipment}</td><td>${alarm.batch}</td>
    <td>${alarm.measuredValue}</td><td>${alarm.limit}</td>
    <td><span class="badge ${alarm.state}">${alarm.state}</span></td>
    <td>${actions.join(" ") || "—"}</td>
  </tr>`;
  }).join("") || `<tr><td colspan="10" class="empty-row">No hay alarmas que coincidan con los filtros.</td></tr>`;
  $$("[data-ack]").forEach(button => button.addEventListener("click", () => {
    if (requirePermission(role, "acknowledgeAlarm", toast)) alarms.acknowledge(button.dataset.ack, username);
  }));
  $$("[data-close-alarm]").forEach(button => button.addEventListener("click", () => {
    if (requirePermission(role, "closeAlarm", toast)) alarms.close(button.dataset.closeAlarm);
  }));
  $$("[data-normalize]").forEach(button => button.addEventListener("click", () => {
    if (simulator.mode === "simulation" && requirePermission(role, "forceSignal", toast)) alarms.normalizeByTag(button.dataset.normalize);
  }));
  $("#alarm-count").textContent = alarms.alarms.filter(a => a.state.startsWith("ACTIVA")).length;
  $("#top-alarm-count").textContent = alarms.alarms.filter(a => a.state.startsWith("ACTIVA")).length;
  $("#alarm-beacon").hidden = !alarms.activeCritical;
}

function updateAlarmEquipmentFilter() {
  const current = $("#alarm-equipment").value;
  const values = [...new Set(alarms.alarms.map(alarm => alarm.equipment))].sort();
  $("#alarm-equipment").innerHTML = `<option value="">Todos</option>${values.map(value => `<option ${value === current ? "selected" : ""}>${value}</option>`).join("")}`;
}

function renderCipTargets() {
  const targets = [...simulator.equipment.values()].filter(item => ["tank", "filter"].includes(item.type) && item.tag !== "TK-001");
  $("#cip-targets").innerHTML = targets.map(item => `<button class="cip-target ${selectedCip.has(item.tag) ? "selected" : ""}" data-cip="${item.tag}" ${cipRunning ? "disabled" : ""}><strong>${item.tag}</strong><small>${item.clean ? "Limpio" : "Sucio"}</small></button>`).join("");
  $$("[data-cip]").forEach(button => button.addEventListener("click", () => {
    selectedCip.has(button.dataset.cip) ? selectedCip.delete(button.dataset.cip) : selectedCip.add(button.dataset.cip);
    renderCipTargets();
  }));
}

function renderCipSteps(active = -1) {
  $("#cip-steps").innerHTML = cipPhases.map((step, index) => `<div class="cip-step ${index < active ? "complete" : index === active ? "active" : ""}">${index + 1}. ${step}</div>`).join("");
}

function startCip() {
  if (cipRunning) return;
  if (!selectedCip.size) return toast("Seleccione al menos un equipo para limpiar.", "error");
  const occupied = [...selectedCip].find(tag => simulator.equipment.get(tag)?.status === "Operando");
  if (occupied) return toast(`Interlock: ${occupied} está en producción.`, "error");
  const duration = Number(new FormData($("#cip-config")).get("duration")) || 8;
  cipRunning = true;
  PersistentState.write("dagoca-cip", { running: true, route: [...selectedCip], phase: 0, startedAt: new Date().toISOString() });
  [...selectedCip].forEach(tag => { const e = simulator.equipment.get(tag); e.status = "En limpieza"; e.clean = false; e.cipStatus = "CIP"; });
  let step = 0, phaseTick = 0;
  $("#cip-flow").classList.add("flowing");
  $("#cip-status").textContent = "Ciclo en curso";
  renderCipTargets(); renderCipSteps(step);
  simulator.log(`CIP iniciado: ${[...selectedCip].join(", ")}`);
  cipTimer = setInterval(() => {
    phaseTick++;
    const total = duration * (cipPhases.length - 1);
    $("#cip-progress-bar").style.width = `${Math.min(100, ((step * duration + phaseTick) / total) * 100)}%`;
    if (phaseTick >= duration) { phaseTick = 0; step++; renderCipSteps(step); }
    PersistentState.write("dagoca-cip", { running: true, route: [...selectedCip], phase: step, elapsed: step * duration + phaseTick });
    if (step >= cipPhases.length - 1) {
      clearInterval(cipTimer); cipTimer = null; cipRunning = false;
      simulator.markClean([...selectedCip]); $("#cip-flow").classList.remove("flowing");
      $("#cip-status").textContent = "Ciclo completo"; $("#cip-progress-bar").style.width = "100%";
      toast("Ciclo CIP completado y ruta drenada."); selectedCip.clear(); renderCipTargets();
      PersistentState.write("dagoca-cip", { running: false, route: [], phase: cipPhases.length - 1 });
    }
  }, 1000);
}

function renderMaintenance() {
  const items = [...simulator.equipment.values()].filter(item => ["tank", "filter", "pump", "cooler", "agitator"].includes(item.type));
  const states = ["DISPONIBLE", "EN MANTENIMIENTO", "FUERA DE SERVICIO", "REQUIERE INSPECCIÓN"];
  $("#maintenance-table").innerHTML = items.map(item => {
    const related = alarms.alarms.filter(alarm => alarm.equipment === item.tag).length;
    return `<tr><td><code>${item.displayTag || item.tag}</code> · ${item.name}</td><td><select data-maintenance="${item.tag}" ${!hasPermission(role, "maintenanceState") ? "disabled" : ""}>${states.map(state => `<option ${item.maintenanceStatus === state ? "selected" : ""}>${state}</option>`).join("")}</select></td><td>${item.operatingHours || 0} h</td><td>${item.starts || 0}</td><td>${item.lastMaintenance}</td><td>${item.nextMaintenance}</td><td>${related}</td><td>${item.maintenance ? "Equipo no asignable" : "Sin observaciones"}</td></tr>`;
  }).join("");
  $$("[data-maintenance]").forEach(select => select.addEventListener("change", () => {
    if (!requirePermission(role, "maintenanceState", toast)) return;
    const equipment = simulator.equipment.get(select.dataset.maintenance);
    if (equipment.batchId) { select.value = equipment.maintenanceStatus; return toast(`No puede retirar ${equipment.tag}: está asignado al lote ${equipment.batchId}.`, "error"); }
    equipment.maintenanceStatus = select.value;
    equipment.maintenance = select.value !== "DISPONIBLE";
    equipment.status = equipment.maintenance ? (select.value === "FUERA DE SERVICIO" ? "Fuera de servicio" : "En mantenimiento") : "Disponible";
    simulator.log(`${equipment.tag}: ${select.value}`);
    simulator.emitState();
  }));
}

function applyAccessControl() {
  const simulationAccess = simulator.mode === "simulation" && hasPermission(role, "forceSignal");
  $("#demo-alarm-btn").hidden = !simulationAccess;
  $("#cip-config").querySelectorAll("input").forEach(input => input.disabled = !hasPermission(role, "editCip"));
  $("#settings-form").querySelectorAll("input:not([name=username]), button").forEach(control => control.disabled = !hasPermission(role, "configureEquipment"));
  $("#reset-simulation-btn").disabled = !hasPermission(role, "resetSimulation");
  $$("[data-mode=maintenance], [data-mode=simulation]").forEach(button => button.disabled = !hasPermission(role, "configureEquipment"));
  $("#simulation-badge").classList.toggle("active", simulator.mode === "simulation");
}

function openEquipment(tag) {
  const equipment = simulator.equipment.get(tag);
  if (!equipment) return;
  $("#drawer-title").textContent = `${equipment.displayTag || equipment.tag} · ${equipment.name}`;
  const related = alarms.alarms.filter(alarm => alarm.equipment === equipment.tag || alarm.tag.includes(equipment.tag)).slice(0, 3);
  const activeBatch = simulator.batches.find(batch => batch.id === equipment.batchId);
  const variables = [
    ["Nivel", equipment.level, "%"], ["Temperatura", equipment.temperature, "°C"], ["Setpoint", equipment.setpoint, "°C"],
    ["Presión", equipment.pressure, "bar"], ["pH", equipment.ph, "pH"], ["Densidad", equipment.density, "SG"],
    ["Turbidez", equipment.turbidity, "NTU"], ["ΔP filtro", equipment.differentialPressure, "bar"]
  ].filter(([, value]) => value != null);
  $("#drawer-content").innerHTML = `<div class="detail-hero">
    <div class="tank-large"><i class="level" style="height:${equipment.level}%"></i></div>
    <div><p class="detail-status">● ${equipment.status}</p><p style="margin-top:8px;color:var(--muted);font-size:10px">Servicio: ${equipmentServices[equipment.tag] || equipment.service}<br>Lote: ${equipment.batchId || "Sin asignar"} · Receta: ${activeBatch?.recipe || "—"}<br>CIP: ${equipment.cipStatus} · Modo: ${simulator.mode.toUpperCase()}</p>${qualityLabel(equipment.quality)}</div>
  </div>
  <div class="detail-grid">${variables.map(([label, value, unit]) => detailValue(label, `${value} ${unit}`)).join("")}${activeBatch ? detailValue("Tiempo en etapa", formatTime(simulator.stageProgress)) : ""}${detailValue("Último mantenimiento", equipment.lastMaintenance)}</div>
  <h3>Instrumentación asociada</h3><div class="instrument-list">${equipment.instruments.length ? equipment.instruments.map(sensor => `<p><code>${sensor.tag}</code><span>${sensor.variable} · ${sensor.status}</span>${qualityLabel(sensor.quality)}</p>`).join("") : `<p><span>INSTRUMENTO PENDIENTE DE SELECCIÓN</span>${qualityLabel()}</p>`}</div>
  <h3>Alarmas relacionadas</h3><div>${related.length ? related.map(a => `<p class="engineering-note">${a.tag} · ${a.description}</p>`).join("") : '<p style="color:var(--muted);font-size:10px">Sin alarmas relacionadas.</p>'}</div>
  <h3>Actuadores asociados</h3><p style="color:var(--muted);font-size:10px">Válvulas: LV-100 · LV-104 · TV-105 · TV-107 · TV-109 · LV-108<br>Bombas: P-001 · P-002 · P-003 · Agitador: AG1</p>
  <h3>Comandos manuales</h3><div class="drawer-actions">
    <button class="btn" data-manual-command="valve" data-target="${equipment.tag}" ${!["manual", "simulation"].includes(simulator.mode) || simulator.emergency ? "disabled" : ""}>Conmutar válvula</button>
    <button class="btn" data-manual-command="pump" data-target="${equipment.tag}" ${!["manual", "simulation"].includes(simulator.mode) || simulator.emergency || !equipment.clean ? "disabled" : ""}>Conmutar bomba</button>
  </div>
  <p class="engineering-note" style="margin-top:12px">La HMI no sustituye protecciones mecánicas de presión ni circuitos instrumentados de seguridad.</p>`;
  $("#equipment-drawer").classList.add("open");
  $("#equipment-drawer").setAttribute("aria-hidden", "false");
  $$("[data-manual-command]").forEach(button => button.addEventListener("click", () => manualCommand(button.dataset.manualCommand, button.dataset.target)));
  $("#close-drawer").focus();
}

function detailValue(label, value) { return `<div class="detail-value"><span>${label}</span><strong>${value}</strong></div>`; }
function closeDrawer() { $("#equipment-drawer").classList.remove("open"); $("#equipment-drawer").setAttribute("aria-hidden", "true"); }

function interlockReject(reason, equipment, action) {
  toast(`INTERLOCK · ${reason} · Equipo: ${equipment} · Acción requerida: ${action}`, "error");
  return false;
}

const manualAssociations = Object.freeze({
  "TK-001": { valve: "LV-100" },
  "TK-002": { pump: "P-001", valve: "LV-100" },
  "TK-003": { pump: "P-001", valve: "TV-105" },
  "TK-004": { pump: "P-002", valve: "LV-104" },
  "TK-005": { pump: "P-003", valve: "TV-107" },
  "E-001": { pump: "P-003", valve: "TV-109" },
  "TK-006A": { valve: "LV-111" },
  "TK-006B": { valve: "LV-111" },
  "TK-007": { valve: "LV-125" },
  "TK-008A": { valve: "TV-113" }, "TK-008B": { valve: "TV-116" },
  "TK-008C": { valve: "TV-119" }, "TK-008D": { valve: "TV-122" }
});

function manualCommand(command, sourceTag) {
  if (!["manual", "simulation"].includes(simulator.mode)) return toast("Seleccione modo Manual o Simulación para operar actuadores.", "error");
  if (!requirePermission(role, "manualOperation", toast)) return;
  if (simulator.emergency) return toast("Comando rechazado: parada de emergencia activa.", "error");
  const source = simulator.equipment.get(sourceTag);
  if (!source) return toast("Equipo no disponible.", "error");
  if (!source.clean || source.status === "En limpieza") return interlockReject("Equipo o línea en CIP", source.tag, "Finalizar y drenar la ruta CIP");
  if (!confirm(`Confirmar comando ${command === "valve" ? "de válvula" : "de bomba"} asociado a ${source.tag}. Los interlocks permanecerán activos.`)) return;
  if (command === "valve") {
    const valve = source.type === "valve" ? source : simulator.equipment.get(manualAssociations[source.tag]?.valve);
    if (!valve) return interlockReject("No existe una válvula operable asociada", source.tag, "Verificar la narrativa de control");
    if (["TV-105", "TV-107"].includes(valve.tag) && ["TK-003", "TK-005"].includes(source.tag) && source.level < 15) return interlockReject("Nivel insuficiente para habilitar vapor", source.tag, "Alcanzar el nivel mínimo");
    valve.position = valve.position === "Abierta" ? "Cerrada" : "Abierta";
    valve.status = valve.position === "Abierta" ? "Operando" : "Disponible";
    simulator.log(`${valve.tag} ${valve.position.toLowerCase()} por comando manual desde ${source.tag}`);
    toast(`${valve.tag}: ${valve.position}.`);
  } else {
    const pump = source.type === "pump" ? source : simulator.equipment.get(manualAssociations[source.tag]?.pump);
    if (!pump) return interlockReject("No existe una bomba operable asociada", source.tag, "Verificar la narrativa de control");
    if (pump.tag === "P-001" && simulator.equipment.get("TK-002").level <= 5) return interlockReject("TK-002 sin nivel de succión", "P-001 / TK-002", "Llenar TK-002 y confirmar válvula de succión");
    if (pump.tag === "P-003" && simulator.equipment.get("E-001").temperature >= 35) return interlockReject("Mosto demasiado caliente para fermentación", "E-001 / P-003", "Reducir TT-109 por debajo de 35 °C");
    pump.status = pump.status === "Operando" ? "Detenida" : "Operando";
    if (pump.status === "Operando") pump.starts++;
    simulator.log(`${pump.tag} ${pump.status.toLowerCase()} por comando manual desde ${source.tag}`);
    toast(`${pump.tag}: ${pump.status}.`);
  }
  simulator.emitState();
  openEquipment(sourceTag);
}

function populateBatchForm() {
  $("#batch-form [name=id]").value = `DG-${new Date().toISOString().slice(2, 10).replaceAll("-", "")}-${String(simulator.batches.length + 1).padStart(2, "0")}`;
  $("#batch-recipe").innerHTML = Object.keys(demoConfig.recipes).map(name => `<option>${name}</option>`).join("");
  const options = items => items.length ? items.map(item => `<option value="${item.tag}">${item.displayTag || item.tag} · ${item.status}</option>`).join("") : `<option value="">Sin equipos disponibles</option>`;
  $("#batch-fermenter").innerHTML = options(simulator.availableFermenters);
  $("#batch-maturation").innerHTML = options(simulator.availableMaturation);
  $("#batch-validation").textContent = "";
}

function submitBatch(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  data.operator = username;
  try {
    simulator.createBatch(data);
    $("#batch-dialog").close();
    renderAll(); toast(`Lote ${data.id} creado y destinos reservados.`);
  } catch (error) { $("#batch-validation").textContent = error.message; }
}

function updateStatus() {
  const batch = simulator.activeBatch;
  $("#system-status").textContent = simulator.emergency ? "PARADA DE EMERGENCIA" : simulator.running ? "Secuencia en ejecución" : "Sistema preparado";
  $("#mode-label").textContent = simulator.mode.toUpperCase();
  $("#stage-label").textContent = simulator.currentStep()?.name.toUpperCase() || "EN ESPERA";
  $("#active-batch-label").textContent = batch?.id || "—";
  $("#emergency-btn").classList.toggle("active", simulator.emergency);
  $(".safety-strip").classList.toggle("emergency-active", simulator.emergency);
  $("#user-label").textContent = username;
}

function renderTrendSummary() {
  const range = $("#range-select").value;
  const values = trends.summary(range);
  const unit = demoConfig.tags[trends.selectedTag].unit;
  $("#trend-summary").innerHTML = Object.entries(values).map(([key, value]) => `<div class="trend-stat"><small>${{ current: "ACTUAL", min: "MÍNIMO", max: "MÁXIMO" }[key]}</small><strong>${value} ${unit}</strong></div>`).join("");
}

function renderAll() {
  renderHome(); renderMetrics(); renderMimic(); renderStageScreens(); renderEvents(); renderBatches(); renderRecipes();
  renderAlarmSummary(); updateAlarmEquipmentFilter(); renderAlarmTable(); renderCipTargets(); renderMaintenance(); updateStatus(); applyAccessControl();
}

function switchView(view, updateHash = true) {
  if (!$(`#view-${view}`)) view = "home";
  $$(".view").forEach(section => section.classList.toggle("active", section.id === `view-${view}`));
  $$(".nav-item").forEach(button => {
    const active = button.dataset.view === view;
    button.classList.toggle("active", active);
    active ? button.setAttribute("aria-current", "page") : button.removeAttribute("aria-current");
  });
  $("#view-title").textContent = $(`#view-${view}`).dataset.title;
  $("#sidebar").classList.remove("open");
  if (view === "trends" && trends.chart) { trends.chart.resize(); trends.select($("#tag-select").value, $("#range-select").value); }
  if (updateHash && location.hash !== `#${view}`) history.replaceState(null, "", `#${view}`);
}

function initNavigation() {
  $$(".nav-item").forEach(button => button.addEventListener("click", () => switchView(button.dataset.view)));
  $$("[data-go]").forEach(button => button.addEventListener("click", () => switchView(button.dataset.go)));
  $("#menu-toggle").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
  window.addEventListener("hashchange", () => switchView(location.hash.slice(1) || "home", false));
  switchView(location.hash.slice(1) || "home", false);
}

function initControls() {
  $$(".mode-switch button").forEach(button => button.addEventListener("click", () => {
    if (["maintenance", "simulation"].includes(button.dataset.mode) && !requirePermission(role, "configureEquipment", toast)) return;
    $$(".mode-switch button").forEach(item => item.classList.remove("active")); button.classList.add("active");
    simulator.setMode(button.dataset.mode);
  }));
  $("#start-btn").addEventListener("click", () => simulator.start());
  $("#stop-btn").addEventListener("click", () => { if (confirm("¿Solicitar parada controlada? Se inhibirán transferencias y se detendrán bombas.")) simulator.stop(); });
  $("#reset-btn").addEventListener("click", () => {
    if (!requirePermission(role, "resetSequence", toast)) return;
    simulator.emergency ? simulator.resetEmergency() : toast("Reset ejecutado: no había fallos enclavados.");
  });
  $("#emergency-btn").addEventListener("click", () => { if (confirm("CONFIRMAR PARADA DE EMERGENCIA. Se detendrán bombas y agitadores, y se cerrarán actuadores críticos.")) simulator.triggerEmergency(); });
  $("#new-batch-btn").addEventListener("click", () => { populateBatchForm(); $("#batch-dialog").showModal(); });
  $("#batch-form").addEventListener("submit", submitBatch);
  $("#role-select").value = role;
  $("#role-select").addEventListener("change", event => { role = event.target.value; safeStore("dagoca-role", role); renderAll(); toast(`Rol cambiado a ${role}.`); });
  $("#theme-toggle").addEventListener("click", () => {
    const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = theme; safeStore("dagoca-theme-v2", theme);
  });
  $("#sound-toggle").addEventListener("click", event => {
    soundEnabled = !soundEnabled; event.currentTarget.textContent = soundEnabled ? "🔊" : "🔇";
    safeStore("dagoca-sound", String(soundEnabled)); toast(soundEnabled ? "Aviso sonoro habilitado." : "Aviso sonoro silenciado.");
  });
  $("#sound-toggle").textContent = soundEnabled ? "🔊" : "🔇";
  $("#demo-alarm-btn").addEventListener("click", () => {
    if (simulator.mode !== "simulation" || !requirePermission(role, "forceSignal", toast)) return;
    alarms.generateDemo(simulator.activeBatch?.id);
  });
  ["alarm-priority", "alarm-equipment", "alarm-state", "alarm-search"].forEach(id => $(`#${id}`).addEventListener("input", renderAlarmTable));
  $("#start-cip-btn").addEventListener("click", startCip);
  $("#export-batch-btn").addEventListener("click", () => {
    const batch = simulator.activeBatch || simulator.batches[0];
    if (!batch) return toast("No hay lotes para exportar.", "error");
    exportBatchReport(batch, simulator.events);
  });
  $("#settings-form").addEventListener("submit", event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    username = data.username?.trim() || "Operador 01";
    safeStore("dagoca-user", username);
    if (hasPermission(role, "configureEquipment")) {
      PersistentState.write("dagoca-config", { fermenters: Number(data.fermenters), maturationTanks: Number(data.maturationTanks), stageSeconds: Number(data.stageSeconds) });
      toast("Configuración guardada. Recargue para aplicar cantidades de tanques.");
    } else toast("Usuario actualizado. El resto requiere rol Ingeniería.", "error");
    updateStatus();
  });
  $("#reset-simulation-btn").addEventListener("click", () => {
    if (!requirePermission(role, "resetSimulation", toast)) return;
    if (confirm("¿Restablecer toda la simulación? Esta acción elimina los datos locales y recarga la aplicación.")) {
      PersistentState.reset();
      location.reload();
    }
  });
  $("#close-drawer").addEventListener("click", closeDrawer); $("#drawer-backdrop").addEventListener("click", closeDrawer);
  document.addEventListener("keydown", event => { if (event.key === "Escape") closeDrawer(); });
}

function initTrends() {
  $("#tag-select").innerHTML = Object.entries(demoConfig.tags).map(([tag, meta]) => `<option value="${tag}">${tag} · ${meta.label}</option>`).join("");
  const success = trends.init($("#trend-chart"));
  $("#chart-fallback").hidden = success;
  $("#trend-chart").hidden = !success;
  const update = () => { trends.select($("#tag-select").value, $("#range-select").value); renderTrendSummary(); };
  $("#tag-select").addEventListener("change", update); $("#range-select").addEventListener("change", update);
  $("#pause-chart").addEventListener("click", event => {
    trends.paused = !trends.paused; event.currentTarget.textContent = trends.paused ? "▶ Reanudar" : "Ⅱ Pausar";
  });
  $("#export-csv").addEventListener("click", () => trends.exportCsv($("#range-select").value));
  renderTrendSummary();
  setInterval(() => { trends.refresh($("#range-select").value); renderTrendSummary(); }, 3000);
}

function initBus() {
  simulator.bus.on("state", renderAll);
  simulator.bus.on("event", renderEvents);
  simulator.bus.on("rejected", message => toast(message, "error"));
  simulator.bus.on("batch", renderAll);
  simulator.bus.on("alarms", () => {
    renderAlarmSummary(); updateAlarmEquipmentFilter(); renderAlarmTable(); renderMetrics();
    if (alarms.activeCritical && soundEnabled) beep();
  });
}

function beep() {
  try {
    const context = new AudioContext();
    const oscillator = context.createOscillator(); const gain = context.createGain();
    oscillator.frequency.value = 620; gain.gain.value = .035;
    oscillator.connect(gain).connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + .12);
  } catch { /* El navegador puede bloquear audio sin interacción previa. */ }
}

function init() {
  const savedRecipes = (() => { try { return JSON.parse(localStorage.getItem("dagoca-recipes")); } catch { return null; } })();
  if (savedRecipes) Object.entries(savedRecipes).forEach(([name, values]) => {
    if (demoConfig.recipes[name]) Object.assign(demoConfig.recipes[name], values);
  });
  document.documentElement.dataset.theme = localStorage.getItem("dagoca-theme-v2") || "light";
  const settings = PersistentState.read("dagoca-config", {});
  const savedCip = PersistentState.read("dagoca-cip", {});
  if (savedCip.running && Array.isArray(savedCip.route)) {
    savedCip.route.forEach(tag => {
      selectedCip.add(tag);
      const equipment = simulator.equipment.get(tag);
      if (equipment) { equipment.status = "En limpieza"; equipment.clean = false; equipment.cipStatus = "CIP INTERRUMPIDO"; }
    });
  }
  $("#settings-form [name=username]").value = username;
  $("#settings-form [name=fermenters]").value = settings.fermenters || demoConfig.plant.fermenters;
  $("#settings-form [name=maturationTanks]").value = settings.maturationTanks || demoConfig.plant.maturationTanks;
  $("#settings-form [name=stageSeconds]").value = settings.stageSeconds || demoConfig.simulation.secondsPerStage;
  $$(".mode-switch button").forEach(button => button.classList.toggle("active", button.dataset.mode === simulator.mode));
  dataProvider.connect().catch(() => toast("No fue posible iniciar el proveedor de simulación.", "error"));
  initNavigation(); initControls(); initTrends(); initBus(); renderCipSteps(); renderAll();
  $("#clock").textContent = new Date().toLocaleTimeString("es-CO");
  setInterval(() => $("#clock").textContent = new Date().toLocaleTimeString("es-CO"), 1000);
  simulator.startTimer();
}

init();
