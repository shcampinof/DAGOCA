const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
function readLocalObject(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value && typeof value === "object" ? value : fallback;
  } catch { return fallback; }
}
let engineeringLimits = sanitizeEngineeringLimits(readLocalObject("dagoca-engineering-limits", {}));
let productionDefaults = sanitizeOperatingParameters(
  readLocalObject("dagoca-production-defaults", {}),
  baseOperatingParameters,
  engineeringLimits
);
demoConfig.engineeringLimits = engineeringLimits;
const simulator = new ScadaSimulator(demoConfig);
const alarms = new AlarmManager(simulator.bus);
const trends = new TrendManager(demoConfig, simulator);
let role = localStorage.getItem("dagoca-role") || "Operador";
let username = localStorage.getItem("dagoca-user") || "Operador 01";
let soundEnabled = localStorage.getItem("dagoca-sound") !== "false";
let cipTimer = null;
let cipRunning = false;
let selectedCip = new Set();
let equipmentFocusReturn = null;

const stageEquipmentTags = ["CIP-01", "TK-001", "TK-003", "TK-004", "TK-005", "E-001", "FERMENTER", "MATURATION", "TK-007", "EMB-01"];
const dataProvider = new SimulationDataProvider(simulator);

function safeStore(key, value) {
  try { localStorage.setItem(key, value); } catch { toast("No fue posible guardar la preferencia local.", "error"); }
}

function operatorSequenceState() {
  if (typeof getOperatorSequenceState === "function") return getOperatorSequenceState(simulator);
  const step = simulator.currentStep();
  return {
    code: step?.code || "IDLE",
    status: step?.name || "Planta disponible",
    action: simulator.running ? "Secuencia en ejecución" : "Sin acción automática",
    next: step ? "Completar condiciones de la etapa" : "Crear o seleccionar un lote",
    fulfilled: [],
    pending: simulator.relevantConditionKeys?.() || []
  };
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
    ${shape === "cooler" ? `<span class="vessel-wrap exchanger-wrap" aria-hidden="true">
      <svg class="heat-exchanger-symbol" viewBox="0 0 140 92" focusable="false">
        <path class="exchanger-nozzle" d="M0 46H17M123 46H140M70 0V15M70 77V92"></path>
        <path class="exchanger-shell" d="M17 13H123L137 46L123 79H17L3 46Z"></path>
        <circle class="exchanger-core" cx="70" cy="46" r="31"></circle>
        <path class="exchanger-element" d="M83 27H69L54 46L69 65H83"></path>
      </svg>
    </span>` : `<span class="vessel-wrap">
      <span class="vessel-top"></span>
      <span class="vessel-body">
        <i class="liquid ${process.toLowerCase()}" style="height:${equipment.level}%"></i>
        ${equipment.tag === "TK-003" ? '<i class="agitator">↻</i>' : ""}
        ${shape === "filter" ? '<i class="filter-plates"></i>' : ""}
      </span>
      <span class="vessel-cone"></span><span class="leg left"></span><span class="leg right"></span>
    </span>`}
    ${showGauge && shape !== "cooler" ? `<span class="classic-gauge"><i style="height:${equipment.level}%"></i><b>100</b><b>50</b><b>0</b></span>` : ""}
    <span class="unit-tag">${displayTag}</span>
    <span class="unit-readings"><b>${equipment.temperature?.toFixed?.(1) ?? equipment.temperature} °C</b><small>${secondary}</small></span>
    <span class="classic-status ${statusClass}"><i></i>${status}</span>
  </button>`;
}

function renderMimicLegacy() {
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
      <svg class="process-pipes" viewBox="0 0 1200 900" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="pipeMetal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fafafa"/><stop offset=".45" stop-color="#777"/><stop offset=".7" stop-color="#f5f5f5"/><stop offset="1" stop-color="#555"/></linearGradient>
          <marker id="productArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 10 5 0 10Z" fill="#8b5b22"/></marker>
          <marker id="waterArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 10 5 0 10Z" fill="#257b8b"/></marker>
          <marker id="coldArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 10 5 0 10Z" fill="#00a9c2"/></marker>
          <marker id="returnArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 10 5 0 10Z" fill="#445fb5"/></marker>
        </defs>
        <path class="pipe" d="M28 184H108 M214 184H264 M382 184H432 M550 184H600 M718 184H770 M886 184H926"/>
        <path class="pipe" d="M1040 184H1110V328H300"/>
        <path class="pipe ${active >= 5 && active <= 6 ? "product-flow" : ""}" d="M300 328V350 M405 328V350 M510 328V350 M615 328V350 M720 328V350"/>
        <path class="pipe ${active === 7 ? "product-flow" : ""}" d="M300 523V548H760"/>
        <path class="pipe ${active === 8 ? "product-flow" : ""}" d="M760 690V790H330"/>
        <path class="pipe ${active === 9 ? "product-flow" : ""}" d="M410 790H1035"/>
        <path class="cold-supply" d="M1160 82H980V260H720 M980 260V525H760 M980 260V525H300" marker-end="url(#coldArrow)"/>
        <path class="cold-return" d="M720 278H1000V105H1160 M300 540H1015V125H1160 M760 540H1030V145H1160" marker-end="url(#returnArrow)"/>
        <path class="cip-pipe ${cipRunning ? "cip-flowing" : ""}" d="M46 875H1130V835 M190 875V810 M585 875V700 M900 875V700"/>
        <path class="route-direction water" d="M214 184H255" marker-end="url(#waterArrow)"/>
        <path class="route-direction product" d="M382 184H423 M550 184H591 M718 184H761 M886 184H917" marker-end="url(#productArrow)"/>
        <path class="route-direction product" d="M1090 250V312H910" marker-end="url(#productArrow)"/>
        <path class="route-direction product" d="M580 548H875" marker-end="url(#productArrow)"/>
      </svg>
      <div class="route-tag water-route">AGUA DE PROCESO →</div>
      <div class="route-tag product-route">MOSTO / PRODUCTO →</div>
      <div class="route-tag cold-supply-label">CHILLER · SUMINISTRO FRÍO →</div>
      <div class="route-tag cold-return-label">← RETORNO AL CHILLER</div>
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
      <div class="bank maturation-bank">
        <div class="bank-header"><b>COLECTOR TK-008</b><span>Selección de maduración</span></div>
        <div class="classic-tank-row">${maturation.map(e => classicUnit(e, { compact: true, process: "cerveza", showGauge: false })).join("")}</div>
      </div>
      <div class="filter2-bank">
        <div class="bank-header"><b>TK-007 · FILTRADO FINAL</b></div>
        ${classicUnit(get("TK-007"), { compact: true, shape: "filter", process: "cerveza", showGauge: false })}
      </div>
      <div class="final-skid">
        <div class="pump-set">
          ${["P-001", "P-002", "P-003"].map((tag, index) => `<button class="pump-symbol ${simulator.running && active >= index * 2 ? "run" : ""}" data-equipment="${tag}"><i>▶</i><b>${tag}</b><small>${get(tag).status}</small></button>`).join("")}
        </div>
        <button class="bottling-machine ${active === 9 ? "active" : ""}" data-equipment="EMB-01"><i>▥ ▥ ▥</i><b>EMBOTELLADO</b><small>EMB-01 · ${get("EMB-01").status}</small></button>
      </div>
      <div class="cip-classic"><b>CIP-01</b><span class="cip-reservoir">CIP</span><span>RETORNO DE LIMPIEZA</span></div>
    </div>`;
  $$(".equipment").forEach(button => button.addEventListener("click", () => openEquipment(button.dataset.equipment)));
  $$("#plant-mimic [data-equipment]").forEach(button => button.addEventListener("click", () => openEquipment(button.dataset.equipment)));
}

function synopticState(equipment) {
  if (equipment.status === "Alarma") return { key: "alarm", label: "Alarma" };
  if (equipment.maintenance) return { key: "maintenance", label: "Mantenimiento" };
  if (equipment.status === "En limpieza" || equipment.cipStatus?.startsWith("CIP")) return { key: "cip", label: "CIP" };
  if (equipment.status === "Operando") return { key: "operating", label: "Operando" };
  if (equipment.batchId || ["Reservado", "Asignado"].includes(equipment.status)) return { key: "reserved", label: "Reservado" };
  if (!equipment.clean || equipment.status === "Sucio") return { key: "dirty", label: "Sucio" };
  if (equipment.available || equipment.status === "Disponible") return { key: "available", label: "Disponible" };
  return { key: "waiting", label: equipment.status || "En espera" };
}

function synopticReading(equipment) {
  if (equipment.tag === "E-001") return { label: "Salida", value: equipment.temperature, unit: "°C" };
  if (equipment.tag === "TK-007" && equipment.turbidity != null) return { label: "Turbidez", value: equipment.turbidity, unit: "NTU" };
  if (equipment.type === "filter" || ["TK-001", "TK-002"].includes(equipment.tag)) return { label: "Nivel", value: equipment.level, unit: "%" };
  if (equipment.temperature != null) return { label: "Temperatura", value: equipment.temperature, unit: "°C" };
  return { label: "Estado", value: equipment.status, unit: "" };
}

function synopticLiquidClass(tag) {
  if (["TK-001", "TK-002"].includes(tag)) return "liquid-water";
  if (["TK-003", "TK-004", "TK-005"].includes(tag)) return "liquid-wort";
  return "liquid-beer";
}

function synopticVesselSymbol(equipment) {
  const level = Number.isFinite(Number(equipment.level))
    ? Math.max(0, Math.min(100, Number(equipment.level)))
    : null;
  const internals = equipment.tag === "TK-001"
    ? '<span class="vessel-internals filter-bed"></span>'
    : equipment.tag === "TK-003"
      ? '<span class="vessel-internals agitator-shaft"><i></i></span>'
      : equipment.tag === "TK-004"
        ? '<span class="vessel-internals false-bottom"></span>'
        : equipment.tag === "TK-005"
          ? '<span class="vessel-internals kettle-coil"></span>'
          : equipment.tag === "TK-007"
            ? '<span class="vessel-internals final-filter"></span>'
            : "";
  return `<span class="synoptic-symbol vessel-symbol ${synopticLiquidClass(equipment.tag)}" aria-hidden="true">
    <span class="vessel-dome"></span>
    <span class="vessel-shell">${level == null ? "" : `<i class="synoptic-level" style="height:${level}%"></i>`}<i class="steel-highlight"></i>${internals}</span>
    <span class="vessel-bottom"></span><span class="vessel-legs"><i></i><i></i></span>
  </span>`;
}

function synopticEquipment(tag, options = {}) {
  const equipment = simulator.equipment.get(tag);
  const state = synopticState(equipment);
  const reading = synopticReading(equipment);
  const displayTag = equipment.displayTag || equipment.tag;
  const shape = options.exchanger ? "exchanger" : options.filter ? "filter" : options.packaging ? "packaging" : "tank";
  const role = {
    "TK-001": "water-filter",
    "TK-002": "storage",
    "TK-003": "mash-tun",
    "TK-004": "lauter-tun",
    "TK-005": "kettle",
    "TK-007": "filtered-receiver",
    "E-001": "plate-exchanger",
    "EMB-01": "bottling",
  }[tag] || "process-vessel";
  const symbol = options.exchanger
    ? `<span class="synoptic-symbol exchanger-symbol" aria-hidden="true"><svg viewBox="0 0 132 78"><path class="exchanger-frame" d="M14 8H118L128 39 118 70H14L4 39Z"/><path class="exchanger-plate" d="M39 17L27 61M51 17L39 61M63 17L51 61M75 17L63 61M87 17L75 61M99 17L87 61"/><path class="exchanger-flow" d="M29 27H101M101 51H29"/><circle cx="22" cy="27" r="3"/><circle cx="110" cy="51" r="3"/></svg></span>`
    : options.packaging
      ? '<span class="synoptic-symbol packaging-symbol" aria-hidden="true"><span class="filler-head"></span><i></i><i></i><i></i><span class="package-conveyor"></span></span>'
      : synopticVesselSymbol(equipment);
  return `<button class="synoptic-equipment ${shape} role-${role} state-${state.key}" data-equipment="${tag}" aria-label="${displayTag}, ${equipment.name}, ${state.label}">
    ${symbol}
    <strong>${displayTag}</strong><span class="synoptic-name">${equipment.name}</span>
    <span class="synoptic-value"><small>${reading.label}</small><b>${typeof reading.value === "number" ? reading.value.toFixed(reading.unit === "%" ? 0 : 1) : reading.value} ${reading.unit}</b></span>
    <span class="synoptic-state"><i></i>${state.label}</span>
    <span class="synoptic-lot">${equipment.batchId ? `Lote ${equipment.batchId}` : "Sin lote"}</span>
  </button>`;
}

function synopticTank(tag) {
  const equipment = simulator.equipment.get(tag);
  const state = synopticState(equipment);
  const level = Number.isFinite(Number(equipment.level))
    ? Math.max(0, Math.min(100, Number(equipment.level)))
    : null;
  const valve = tankControlValve(tag);
  return `<button class="bank-tank state-${state.key}" data-equipment="${tag}" aria-label="${tag}, ${state.label}, ${equipment.temperature.toFixed(1)} °C">
    <span class="tank-branch" aria-hidden="true"><i title="${valve || "Ramal de proceso"}"></i></span>
    <span class="bank-vessel liquid-beer" aria-hidden="true"><span class="bank-dome"></span><span class="bank-shell">${level == null ? "" : `<i class="synoptic-level" style="height:${level}%"></i>`}<i class="steel-highlight"></i></span><span class="bank-cone"></span><span class="bank-legs"><i></i><i></i></span></span>
    <strong>${equipment.displayTag || tag}</strong><span>${equipment.temperature.toFixed(1)} °C</span>
    <small><i></i>${state.label}</small><em>${equipment.batchId || "Sin lote"}</em>
  </button>`;
}

function synopticPump(tag, service, active = false) {
  const pump = simulator.equipment.get(tag);
  const running = pump.status === "Operando";
  return `<button class="synoptic-pump ${running ? "run" : ""} ${active ? "route-active" : ""}" data-equipment="${tag}" aria-label="${tag}, ${service}, ${pump.status}">
    <span class="pump-glyph" aria-hidden="true"><i></i></span><strong>${tag}</strong><span class="pump-status"><i></i>${pump.status}</span><small>${service}</small>
  </button>`;
}

function pipeConnector(media, label, active = false) {
  return `<span class="synoptic-pipe ${media} ${active ? "active" : ""}" aria-label="${label}"><i></i><b>${label}</b></span>`;
}

function plantGeneralState() {
  if (simulator.emergency || alarms.activeCritical) return { key: "alarm", label: "Alarma activa" };
  if (cipRunning) return { key: "cip", label: "Limpieza activa" };
  if (simulator.running && simulator.activeBatch) return { key: "operating", label: "Lote en proceso" };
  if (simulator.activeBatch || simulator.batches.some(batch => batch.status === "Programado")) return { key: "ready", label: "Lista para operar" };
  return { key: "waiting", label: "Planta detenida" };
}

function renderMimic() {
  const active = simulator.activeStage;
  const plantState = plantGeneralState();
  $("#plant-mimic").innerHTML = `<div class="continuous-synoptic">
    <header class="synoptic-head">
      <div><strong>DAGOCA · DISTRIBUCIÓN GENERAL DE PLANTA</strong><small>Sinóptico operacional · flujo de izquierda a derecha</small></div>
      <div class="general-state state-${plantState.key}"><i></i><span>Estado general</span><b>${plantState.label}</b><small>${simulator.currentStep()?.name || "Sin etapa activa"} · ${simulator.activeBatch?.id || "Sin lote"}</small></div>
    </header>
    <div class="synoptic-legend" aria-label="Leyenda de tuberías y estados">
      <span class="water">Agua de proceso</span><span class="wort">Mosto</span><span class="beer">Cerveza</span>
      <span class="cold">Suministro chiller</span><span class="cold-return">Retorno chiller</span>
      <span class="steam">Vapor</span><span class="condensate">Condensado</span><span class="cip">CIP / retorno</span>
    </div>
    <div class="synoptic-canvas">
      <div class="upper-process-line">
        <section class="synoptic-area area-water">
          <h3>ÁREA 01 · SERVICIOS Y AGUA</h3>
          <div class="area-equipment-line">
            ${synopticEquipment("TK-001", { filter: true })}
            ${pipeConnector("water", "Agua filtrada", active === 1)}
            ${synopticEquipment("TK-002")}
          </div>
        </section>
        <div class="inter-area-transfer water-transfer">${synopticPump("P-001", "TK-002 → TK-003", active === 2)}${pipeConnector("water", "A maceración", active === 2)}</div>
        <section class="synoptic-area area-brewhouse">
          <h3>ÁREA 02 · ELABORACIÓN</h3>
          <div class="area-equipment-line">
            ${synopticEquipment("TK-003")}
            ${pipeConnector("wort", "Mosto", active === 3)}
            ${synopticEquipment("TK-004", { filter: true })}
            <span class="pump-on-pipe">${synopticPump("P-002", "TK-004 → TK-005", active === 4)}</span>
            ${pipeConnector("wort", "A cocción", active === 4)}
            ${synopticEquipment("TK-005")}
          </div>
          <div class="thermal-services"><span class="steam">Vapor → chaquetas TK-003 / TK-005</span><span class="condensate">Condensado → recuperación</span></div>
        </section>
        <div class="inter-area-transfer wort-transfer">${synopticPump("P-003", "TK-005 → E-001", active === 5)}${pipeConnector("wort", "Mosto caliente", active === 5)}</div>
        <section class="synoptic-area area-cooling">
          <h3>ÁREA 03 · ENFRIAMIENTO Y TRANSFERENCIA</h3>
          <div class="area-equipment-line">${synopticEquipment("E-001", { exchanger: true })}</div>
          <div class="cooling-service-lines"><span class="cold">Suministro chiller → E-001</span><span class="cold-return">E-001 → retorno</span></div>
        </section>
      </div>

      <div class="cold-transfer-route ${active === 5 || active === 6 ? "active" : ""}"><span>Producto enfriado desde E-001</span><i></i><b>↓ Al fermentador seleccionado</b></div>

      <div class="cellar-process-line">
        <section class="synoptic-area tank-bank fermentation-bank">
          <div class="bank-title"><h3>ÁREA 04 · FERMENTACIÓN</h3><button class="text-button" data-go="fermentation">Abrir vista detallada →</button></div>
          <div class="parallel-collector beer"><span>COLECTOR DE FERMENTACIÓN · equipos en paralelo</span><i></i></div>
          <div class="bank-tank-strip">${fermenterTags.map(synopticTank).join("")}</div>
          <div class="bank-service-lines"><span class="cold">Suministro chiller</span><span class="cold-return">Retorno al chiller</span></div>
        </section>
        <div class="cellar-transfer">${pipeConnector("beer", "Fermentador seleccionado → madurador seleccionado", active === 7)}</div>
        <section class="synoptic-area tank-bank maturation-bank">
          <div class="bank-title"><h3>ÁREA 05 · MADURACIÓN</h3><button class="text-button" data-go="maturation">Abrir vista detallada →</button></div>
          <div class="parallel-collector beer"><span>COLECTOR DE MADURACIÓN · equipos en paralelo</span><i></i></div>
          <div class="bank-tank-strip maturation-strip">${maturationTags.map(synopticTank).join("")}</div>
          <div class="bank-service-lines"><span class="cold">Suministro chiller</span><span class="cold-return">Retorno al chiller</span></div>
        </section>
      </div>

      <div class="maturation-drop-route ${active === 8 ? "active" : ""}"><span>Salida del madurador seleccionado</span><i></i><b>↓ A filtrado final</b></div>

      <div class="lower-process-line">
        <section class="synoptic-area cip-zone">
          <h3>SISTEMA CIP · SERVICIO INDEPENDIENTE</h3>
          <div class="cip-station-symbol"><b>CIP-01</b><span>Preparación y retorno</span>${synopticPump("P-000", "Circuito CIP", active === 0)}</div>
          <div class="cip-route-available">Ruta CIP disponible · línea discontinua</div>
        </section>
        <section class="synoptic-area final-process">
          <h3>ÁREA 06 · FILTRADO FINAL Y EMPAQUE</h3>
          <div class="area-equipment-line">
            ${synopticPump("P-004", "Maduración → TK-007", active === 8)}
            ${pipeConnector("beer", "Cerveza", active === 8)}
            ${synopticEquipment("TK-007", { filter: true })}
            ${pipeConnector("beer", "Producto filtrado", active === 9)}
            ${synopticEquipment("EMB-01", { packaging: true })}
          </div>
        </section>
      </div>
    </div>
  </div>`;
  $$("#plant-mimic [data-equipment]").forEach(button => button.addEventListener("click", () => openEquipment(button.dataset.equipment)));
  $$("#plant-mimic [data-go]").forEach(button => button.addEventListener("click", () => switchView(button.dataset.go)));
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
  const activeAlarms = alarms.alarms.filter(a => a.state.startsWith("ACTIVA")).length;
  const stageDuration = demoConfig.simulation.secondsPerStage;
  const progress = batch ? Math.min(100, Math.round(simulator.stageProgress / stageDuration * 100)) : null;
  const remaining = batch ? Math.max(0, stageDuration - simulator.stageProgress) : null;
  const modeLabels = { auto: "AUTOMÁTICO", manual: "MANUAL", maintenance: "MANTENIMIENTO", simulation: "SIMULACIÓN" };
  const plantState = simulator.emergency ? "EMERGENCIA" : cipRunning ? "EN LIMPIEZA" : simulator.running ? "OPERANDO" : "PARADA";
  const cards = [
    ["Modo de operación", cipRunning ? "LIMPIEZA" : modeLabels[simulator.mode] || simulator.mode.toUpperCase(), simulator.running ? "Secuencia habilitada" : "Secuencia detenida", "#2e6f9e"],
    ["Estado de planta", plantState, simulator.emergency ? "Interlock general activo" : "Supervisión disponible", "#18795c"],
    ["Lote activo", batch?.id || "SIN LOTE", batch?.product || batch?.recipe || "Sin producto asignado", "#2e6f9e"],
    ["Etapa actual", simulator.currentStep()?.name || "EN ESPERA", remaining == null ? "Sin datos" : `${formatTime(remaining, true)} restantes`, "#b6782e"],
    ["Alarmas activas", activeAlarms, activeAlarms ? "Requieren revisión" : "Sin alarmas activas", "#c23b45"],
    ["Progreso de etapa", progress == null ? "SIN DATOS" : `${progress}%`, batch ? `${formatTime(simulator.stageProgress, true)} transcurridos` : "Cree un lote para comenzar", "#18795c"]
  ];
  $("#home-metrics").innerHTML = cards.map(([label, value, detail, color]) => `<div class="metric" style="--accent:${color}"><span>${label}</span><strong>${value}</strong><small>${detail}</small></div>`).join("");
  const productionAssets = [...simulator.equipment.values()].filter(item =>
    item.tag.startsWith("TK-") || item.tag === "E-001" || item.tag === "EMB-01"
  );
  const occupied = productionAssets.filter(item => item.batchId).length;
  const available = productionAssets.filter(item => item.available).length;
  const inCip = productionAssets.filter(item => item.status === "En limpieza" || item.cipStatus?.startsWith("CIP")).length;
  const inMaintenance = productionAssets.filter(item => item.maintenance).length;
  const nextMovement = batch ? operatorSequenceState().next : "Crear y autorizar un lote";
  $("#home-operations").innerHTML = `
    <div class="operations-counts">
      <span><b>${occupied}</b> ocupados</span><span><b>${available}</b> disponibles</span>
      <span><b>${inCip}</b> en CIP</span><span><b>${inMaintenance}</b> en mantenimiento</span>
    </div>
    <dl class="operations-detail">
      <dt>Próximo movimiento</dt><dd>${nextMovement}</dd>
      <dt>Fermentador seleccionado</dt><dd>${batch?.fermenter || "Sin lote"}</dd>
      <dt>Madurador seleccionado</dt><dd>${batch?.maturation || "Sin lote"}</dd>
      <dt>Estado CIP</dt><dd>${cipRunning ? "Ciclo en ejecución" : "Sistema disponible"}</dd>
    </dl>`;
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
    origin: "TK-002 + malta manual", destination: "TK-004", loop: "TC-105", pv: "Temperatura TK-003", sp: "Parámetro preliminar — pendiente de validación",
    note: "Vapor hacia la chaqueta; condensado separado del desagüe CIP."
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
    origin: "TK-004 + lúpulo manual", destination: "E-001", loop: "TC-107", pv: "Temperatura TK-005", sp: "Parámetro preliminar — pendiente de validación",
    note: "Vapor hacia la chaqueta y condensado al sistema de recuperación."
  },
  cooling: {
    index: 5, title: "Enfriamiento", short: "Enfriamiento", media: "glycol",
    tags: ["E-001"], actuators: ["P-003", "TV-109"],
    instruments: ["TT-109", "TC-109", "TV-109", "PI-109"],
    origin: "TK-005", destination: "TK-006A / B / C / D / E", loop: "TC-109", pv: "Temperatura de salida", sp: "Parámetro preliminar — pendiente de validación",
    note: "E-001 es de paso: producto separado del suministro y retorno al chiller."
  },
  fermentation: {
    index: 6, title: "Fermentación", short: "Fermentación", media: "beer",
    tags: [...fermenterTags], actuators: [...new Set(fermenterTags.map(tankControlValve).filter(Boolean))],
    instruments: ["LSH-111", "LSL-112", "TT-111", "TC-111", "PT-111", "AIT-111", ...fermenterTags.flatMap(tankInstrumentTags)],
    origin: "E-001 + levadura manual", destination: () => simulator.activeBatch?.maturation || "Madurador seleccionado", loop: "Control de enfriamiento por tanque", pv: "Temperatura del tanque asignado", sp: "Pendiente de validación",
    note: "Cinco fermentadores; solo enfriamiento con suministro y retorno al chiller."
  },
  maturation: {
    index: 7, title: "Maduración", short: "Maduración", media: "beer",
    tags: [...maturationTags], actuators: maturationTags.map(tankControlValve).filter(Boolean),
    instruments: [
      "TT-113", "TC-113", "PI-113", "TT-116", "TC-116", "PI-116",
      "TT-119", "TC-119", "PI-119", "TT-122", "TC-122", "PI-122",
      ...maturationTags.flatMap(tankInstrumentTags)
    ],
    origin: () => simulator.activeBatch?.fermenter || "Fermentador seleccionado", destination: "TK-007", loop: "Control de enfriamiento por tanque", pv: "Temperatura por tanque", sp: "1–4 °C recomendado",
    note: "Diez maduradores; solo enfriamiento con suministro y retorno al chiller."
  },
  filter2: {
    index: 8, title: "TK-007 – Tanque de filtrado final", short: "Filtrado final", media: "beer",
    tags: ["TK-007"], actuators: ["P-004", "LV-125"],
    instruments: ["LSH-125", "LSL-125", "LC-125", "LY-125", "AIT-125", "PDT-125"],
    origin: () => simulator.activeBatch?.maturation || "Madurador seleccionado", destination: "Embotellado", loop: "LC-125", pv: "Nivel TK-007", sp: "Pendiente de validación",
    note: "ΔP, turbidez y tecnología específica del filtro continúan pendientes."
  },
  packaging: {
    index: 9, title: "Embotellado", short: "Embotellado", media: "beer",
    tags: ["EMB-01"], actuators: ["LV-125"],
    instruments: [],
    origin: "TK-007", destination: "Línea de embotellado", loop: "Transferencia de producto", pv: "Estado de línea", sp: "Transferencia completa",
    note: "Etapa final posterior al filtrado final en TK-007."
  }
});

function stageText(value) {
  return typeof value === "function" ? value() : value;
}

function getStageAlarmCount(spec) {
  return alarms.alarms.filter(alarm => alarm.state.startsWith("ACTIVA") && (
    alarm.equipment === spec.short ||
    alarm.equipment === spec.title ||
    [...spec.tags, ...spec.actuators].some(tag => alarm.equipment === tag || alarm.tag.includes(tag.replace("TK-", "")))
  )).length;
}

function homeEquipmentState(items, active, alarmCount) {
  if (alarmCount) return { key: "alarm", label: `${alarmCount} alarma${alarmCount === 1 ? "" : "s"}` };
  if (items.some(item => item.status === "En limpieza" || item.cipStatus?.startsWith("CIP"))) return { key: "cip", label: "En limpieza CIP" };
  if (items.some(item => item.maintenance)) return { key: "maintenance", label: "En mantenimiento" };
  if (active && simulator.running) return { key: "operating", label: "Operando normalmente" };
  if (active || items.some(item => item.batchId || ["Reservado", "Asignado", "Sucio"].includes(item.status))) {
    return { key: "waiting", label: active ? "Etapa en espera" : items.find(item => item.batchId)?.status || "Condición pendiente" };
  }
  return { key: "available", label: "Disponible" };
}

function homeStageReading(key, items) {
  const batch = simulator.activeBatch;
  const preferredTag = key === "fermentation" ? batch?.fermenter : key === "maturation" ? batch?.maturation : null;
  const selected = simulator.equipment.get(preferredTag) || items.find(item => item.status === "Operando" || item.batchId) || items[0];
  const readings = {
    water: ["Nivel TK-002", `${simulator.equipment.get("TK-002")?.level ?? 0} %`, simulator.equipment.get("TK-002")?.level ?? 0],
    mashing: ["Temperatura", `${simulator.equipment.get("TK-003")?.temperature?.toFixed?.(1) ?? "—"} °C`, simulator.equipment.get("TK-003")?.level ?? 0],
    filter1: ["Nivel", `${simulator.equipment.get("TK-004")?.level ?? 0} %`, simulator.equipment.get("TK-004")?.level ?? 0],
    boiling: ["Temperatura", `${simulator.equipment.get("TK-005")?.temperature?.toFixed?.(1) ?? "—"} °C`, simulator.equipment.get("TK-005")?.level ?? 0],
    cooling: ["Temperatura de salida", `${simulator.equipment.get("E-001")?.temperature?.toFixed?.(1) ?? "—"} °C`, null],
    fermentation: ["Temperatura", `${selected?.temperature?.toFixed?.(1) ?? "—"} °C`, selected?.level ?? 0],
    maturation: ["Temperatura", `${selected?.temperature?.toFixed?.(1) ?? "—"} °C`, selected?.level ?? 0],
    filter2: ["Nivel TK-007", `${simulator.equipment.get("TK-007")?.level ?? 0} %`, simulator.equipment.get("TK-007")?.level ?? 0],
    packaging: ["Estado de línea", simulator.equipment.get("EMB-01")?.status || "Disponible", null]
  };
  const [label, value, level] = readings[key];
  return { label, value, level, selected };
}

function homeGroupSummary(items) {
  const inCip = items.filter(item => item.status === "En limpieza" || item.cipStatus?.startsWith("CIP")).length;
  return {
    occupied: items.filter(item => item.batchId).length,
    available: items.filter(item => item.available).length,
    inCip
  };
}

function homeStageSymbol(key, level = 0) {
  if (key === "cooling") return `<span class="home-stage-symbol exchanger" aria-hidden="true"><svg viewBox="0 0 92 58"><path d="M10 8H82L90 29L82 50H10L2 29Z"></path><circle cx="46" cy="29" r="19"></circle><path class="core" d="M55 17H46L36 29L46 41H55"></path></svg></span>`;
  if (key === "packaging") return `<span class="home-stage-symbol packaging" aria-hidden="true"><i></i><i></i><i></i><b></b></span>`;
  if (key === "fermentation") return `<span class="home-stage-symbol group fermenters" aria-hidden="true"><i></i><i></i><i></i><b>×5</b></span>`;
  if (key === "maturation") return `<span class="home-stage-symbol group maturation" aria-hidden="true"><i></i><i></i><i></i><b>×10</b></span>`;
  const shape = ["filter1", "filter2"].includes(key) ? "filter" : "tank";
  return `<span class="home-stage-symbol ${shape}" aria-hidden="true"><i class="symbol-level" style="height:${Math.max(0, Math.min(100, level))}%"></i>${shape === "filter" ? "<b></b>" : ""}</span>`;
}

function homeStageNode(key, spec, position, column, row) {
  const items = spec.tags.map(tag => simulator.equipment.get(tag)).filter(Boolean);
  const active = simulator.activeStage === spec.index;
  const alarmCount = getStageAlarmCount(spec);
  const state = homeEquipmentState(items, active, alarmCount);
  const reading = homeStageReading(key, items);
  const group = ["fermentation", "maturation"].includes(key) ? homeGroupSummary(items) : null;
  const tagLabel = key === "fermentation" ? "TK-006A–E · 5 equipos" :
    key === "maturation" ? "TK-008A–J · 10 equipos" :
    key === "filter2" ? "TK-007 · Tanque de filtrado final" : spec.tags.join(" · ");
  const batchId = reading.selected?.batchId || items.find(item => item.batchId)?.batchId || (active ? simulator.activeBatch?.id : null);
  return `<button class="home-process-node state-${state.key} ${active ? "current" : ""}" style="grid-column:${column};grid-row:${row}" data-go="${key}" aria-label="${spec.short}. ${state.label}. Abrir detalle">
    <span class="node-sequence">${String(position + 1).padStart(2, "0")}</span>
    <span class="node-alarm">${alarmCount ? `▲ ${alarmCount}` : "● OK"}</span>
    <span class="node-title">${spec.short}</span>
    <span class="node-tag">${tagLabel}</span>
    ${homeStageSymbol(key, reading.level)}
    <span class="node-reading"><small>${reading.label}</small><strong>${reading.value}</strong></span>
    ${group ? `<span class="node-group">${group.occupied} ocupados · ${group.available} disponibles · ${group.inCip} CIP</span>` : ""}
    <span class="node-state"><i></i>${state.label}</span>
    <span class="node-batch">Lote: ${batchId || "Sin lote"}</span>
  </button>`;
}

function homeConnector(direction, media, column, row, label) {
  return `<span class="home-flow-connector ${direction} ${media}" style="grid-column:${column};grid-row:${row}" aria-label="${label}"><i></i></span>`;
}

function renderStageOverview() {
  const entries = Object.entries(stageScreens);
  const byKey = Object.fromEntries(entries);
  $("#stage-overview").innerHTML = `
    <div class="overview-route-head"><div><strong>SINÓPTICO GENERAL</strong><span>Flujo operacional simplificado</span></div><button class="text-button" data-go="process">Vista de planta detallada →</button></div>
    <div class="home-process-canvas">
      <div class="home-process-grid">
        ${homeStageNode("water", byKey.water, 0, 1, 1)}
        ${homeConnector("forward", "water", 2, 1, "Agua hacia maceración")}
        ${homeStageNode("mashing", byKey.mashing, 1, 3, 1)}
        ${homeConnector("forward", "wort", 4, 1, "Mosto hacia Filtrado I")}
        ${homeStageNode("filter1", byKey.filter1, 2, 5, 1)}
        ${homeConnector("forward", "wort", 6, 1, "Mosto hacia cocción")}
        ${homeStageNode("boiling", byKey.boiling, 3, 7, 1)}
        ${homeConnector("forward", "wort", 8, 1, "Mosto hacia E-001")}
        ${homeStageNode("cooling", byKey.cooling, 4, 9, 1)}
        ${homeConnector("down", "product", 9, 2, "E-001 hacia fermentación")}
        ${homeStageNode("fermentation", byKey.fermentation, 5, 9, 3)}
        ${homeConnector("reverse", "beer", 8, 3, "Cerveza hacia maduración")}
        ${homeStageNode("maturation", byKey.maturation, 6, 7, 3)}
        ${homeConnector("reverse", "beer", 6, 3, "Cerveza hacia filtrado final")}
        ${homeStageNode("filter2", byKey.filter2, 7, 5, 3)}
        ${homeConnector("reverse", "beer", 4, 3, "Cerveza hacia embotellado")}
        ${homeStageNode("packaging", byKey.packaging, 8, 3, 3)}
      </div>
      <div class="home-service-summary" aria-label="Servicios industriales">
        <span class="service product"><i></i>Producto</span>
        <span class="service steam"><i></i>Vapor → TK-003 / TK-005</span>
        <span class="service condensate"><i></i>Condensado → recuperación</span>
        <span class="service cold-supply"><i></i>Suministro del chiller</span>
        <span class="service cold-return"><i></i>Retorno al chiller</span>
        <span class="service cip"><i></i>CIP ${cipRunning ? "activo" : "disponible"} · Desagüe CIP independiente</span>
      </div>
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
  const sequence = operatorSequenceState();
  const isActive = simulator.activeStage === spec.index;
  const progress = Math.min(100, Math.round(simulator.stageProgress / demoConfig.simulation.secondsPerStage * 100));
  const pendingText = isActive ? simulator.blockReason() : simulator.activeStage < spec.index ? "Esperando etapa anterior" : "Etapa completada";
  return `<div class="panel-heading"><div><p class="eyebrow">ESTADO DE LA ETAPA</p><h2>${isActive ? sequence.status : spec.title}</h2></div><span class="badge ${isActive ? "Reconocida" : ""}">${isActive ? "EN CURSO" : simulator.activeStage > spec.index ? "COMPLETADA" : "DISPONIBLE"}</span></div>
    <dl class="stage-state-values">
      <dt>Acción activa</dt><dd>${isActive ? sequence.action : "Sin acción automática"}</dd>
      <dt>Tiempo acelerado</dt><dd>${isActive ? `${formatTime(simulator.stageProgress)} / ${formatTime(demoConfig.simulation.secondsPerStage)}` : "Sin etapa activa"}</dd>
      <dt>Tiempo real configurado</dt><dd>${isActive && simulator.realStageDurationMinutes() != null ? `${simulator.realStageDurationMinutes()} min` : "No aplica"}</dd>
      <dt>Fase del temporizador</dt><dd>${isActive ? simulator.controlTimer.phase : "En espera"}</dd>
      <dt>Condición para continuar</dt><dd>${pendingText}</dd>
      <dt>Interlock activo</dt><dd>${simulator.emergency ? "Parada de emergencia" : isActive && !simulator.canAdvance() ? pendingText : "Ninguno"}</dd>
      <dt>Próximo destino</dt><dd>${stageText(spec.destination)}</dd>
    </dl>
    <div class="stage-progress"><i style="width:${isActive ? progress : simulator.activeStage > spec.index ? 100 : 0}%"></i></div>`;
}

function renderStageScreen(key, spec) {
  const target = $(`#stage-${key}`);
  if (!target) return;
  const stageActive = simulator.running && simulator.activeStage === spec.index;
  const equipment = spec.tags.map(tag => simulator.equipment.get(tag)).filter(Boolean);
  const selectedEquipment = key === "fermentation"
    ? simulator.equipment.get(simulator.activeBatch?.fermenter) || equipment[0]
    : key === "maturation"
      ? simulator.equipment.get(simulator.activeBatch?.maturation) || equipment[0]
      : equipment[0];
  const alarmCount = getStageAlarmCount(spec);
  const pvIsLevel = ["water", "filter1", "filter2"].includes(key);
  const pvIsStatus = key === "packaging";
  const pvValue = pvIsLevel ? selectedEquipment?.level : pvIsStatus ? selectedEquipment?.status : selectedEquipment?.temperature?.toFixed?.(1);
  const pvUnit = pvIsLevel ? "%" : pvIsStatus ? "" : "°C";
  const parameterKey = { mashing: "mashTemp", boiling: "boilTemp", cooling: "coolerOutletTemp", fermentation: "fermentationTemp", maturation: "maturationTemp" }[key];
  const effectiveSp = parameterKey ? (simulator.activeBatch?.parameters?.[parameterKey] ?? productionDefaults[parameterKey]) : selectedEquipment?.setpoint;
  const loopError = !pvIsStatus && Number.isFinite(Number(pvValue)) && Number.isFinite(Number(effectiveSp))
    ? (Number(effectiveSp) - Number(pvValue)).toFixed(1)
    : "Sin datos";
  const parallelBank = ["fermentation", "maturation"].includes(key);
  const routeEquipment = parallelBank
    ? `<div class="stage-parallel-bank" aria-label="${spec.short}: equipos en paralelo">${equipment.map(item => classicUnit(item, { compact: true, process: spec.media, showGauge: false })).join("")}</div>`
    : equipment.map((item, index) => `${classicUnit(item, { compact: equipment.length > 2, shape: item.type === "filter" ? "filter" : item.type === "cooler" ? "cooler" : "tank", process: spec.media, showGauge: equipment.length <= 2 })}${index < equipment.length - 1 ? '<i class="route-line"></i>' : ""}`).join("");
  target.innerHTML = `
    <div class="stage-screen-head">
      <div><p class="eyebrow">ÁREA DE PROCESO · P&ID</p><h2>${spec.title}</h2><p>${stageText(spec.origin)} → ${stageText(spec.destination)}</p></div>
      <div class="stage-head-status"><span><i class="status-dot ${alarmCount ? "alarm" : stageActive ? "running" : "ready"}"></i>${alarmCount ? `${alarmCount} alarma(s)` : stageActive ? "Etapa en operación" : "Sin alarmas activas"}</span><button class="btn" data-go="home">Vista general</button></div>
    </div>
    <div class="stage-workspace">
      <article class="stage-mimic panel">
        <div class="mimic-title"><b>RUTA DE PROCESO</b><span>${spec.note}</span></div>
        <div class="stage-route route-${spec.media} ${parallelBank ? "parallel" : equipment.length > 5 ? "many" : ""} ${stageActive ? "active" : ""}">
          <span class="route-terminal">${stageText(spec.origin)}</span>
          <i class="route-line"></i>
          ${routeEquipment}
          <i class="route-line"></i>
          <span class="route-terminal">${stageText(spec.destination)}</span>
        </div>
        <div class="stage-actuators">${spec.actuators.map(tag => actuatorMarkup(tag, stageActive)).join("")}</div>
        <div class="utility-lines">
          <span class="utility cip">CIP · línea discontinua</span>
          <span class="utility drain">Desagüe CIP · línea gris</span>
          ${["mashing", "boiling"].includes(key) ? '<span class="utility steam">Vapor hacia chaqueta</span><span class="utility condensate">Condensado a sistema de recuperación</span>' : ""}
          ${["cooling", "fermentation", "maturation"].includes(key) ? '<span class="utility glycol">Suministro frío desde chiller</span><span class="utility cold-return">Retorno al chiller</span>' : ""}
        </div>
      </article>
      <aside class="panel stage-state-panel">${stageStateMarkup(spec)}</aside>
    </div>
    <div class="stage-data-grid">
      <article class="panel loop-panel">
        <div class="panel-heading"><div><p class="eyebrow">LAZO DE CONTROL</p><h2>${spec.loop}</h2></div><span class="badge">AUTO</span></div>
        <div class="loop-values">
          <span>PV<strong>${pvValue ?? "Sin datos"} ${pvUnit}</strong></span>
          <span>SP<strong>${effectiveSp ?? spec.sp} ${parameterKey ? "°C" : ""}</strong></span>
          <span>Salida<strong>${stageActive ? Math.min(100, 18 + simulator.stageProgress * 7) : 0} %</strong></span>
          <span>Error<strong>${loopError} ${loopError !== "Sin datos" ? pvUnit : ""}</strong></span>
        </div>
        <div class="mini-trend" aria-label="Minigráfica PV y SP"><i></i><b></b></div>
      </article>
      <article class="panel">
        <div class="panel-heading"><div><p class="eyebrow">INSTRUMENTACIÓN</p><h2>Señales visibles</h2></div></div>
        <div class="tag-matrix">${spec.instruments.map(tag => `<span><code>${tag}</code><small>${tag.startsWith("AIT-125") || tag.startsWith("PDT-125") || tag === "AIT-111" ? "Parámetro preliminar — pendiente de validación" : "SIMULATED"}</small></span>`).join("")}</div>
      </article>
      <article class="panel">
        <div class="panel-heading"><div><p class="eyebrow">LOTE E INTERLOCKS</p><h2>Condiciones operativas</h2></div></div>
        <dl class="stage-state-values"><dt>Lote</dt><dd>${simulator.activeBatch?.id || "Sin lote"}</dd><dt>Producto</dt><dd>${simulator.activeBatch?.product || simulator.activeBatch?.recipe || "Sin producto"}</dd><dt>Origen</dt><dd>${stageText(spec.origin)}</dd><dt>Destino</dt><dd>${stageText(spec.destination)}</dd><dt>CIP</dt><dd>${equipment.some(item => item.cipStatus !== "LIMPIO") ? "ACTIVO / PENDIENTE" : "Disponible"}</dd></dl>
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
    const sequence = operatorSequenceState();
    const signals = typeof engineeringSignalNames === "object" && engineeringSignalNames ? engineeringSignalNames : {};
    diagnostics.innerHTML = `<div class="panel-heading"><div><p class="eyebrow">DIAGNÓSTICO DE INGENIERÍA</p><h2>Secuencia y comunicaciones</h2></div></div>
      <dl class="status-list"><dt>SEQUENCE_STEP</dt><dd>${sequence.code}</dd><dt>Proveedor de datos</dt><dd>SimulationDataProvider</dd><dt>PLC previsto</dt><dd>5069-L320ER</dd><dt>Protocolo</dt><dd>EtherNet/IP vía gateway</dd></dl>
      <div class="tag-matrix">${Object.entries(signals).map(([tag, label]) => `<span><code>${tag}</code><small>${label}</small></span>`).join("")}</div>`;
  }
}

function renderEvents() {
  $("#event-list").innerHTML = simulator.events.slice(0, 8).map(event => `<li><time>${new Date(event.time).toLocaleTimeString("es-CO")}</time><span>${event.message}</span></li>`).join("") || "<li><span>Sin eventos registrados.</span></li>";
}

function renderBatches() {
  $("#batch-table").innerHTML = simulator.batches.map(batch => `<tr>
    <td><code>${batch.id}</code></td><td>${new Date(batch.startedAt || batch.createdAt).toLocaleDateString("es-CO")}</td><td title="${Object.entries(batch.parameters || {}).map(([key, value]) => `${key}: ${value}`).join(" · ")}">${batch.product || batch.recipe}</td><td>${batch.volume} L</td>
    <td><span class="badge">${batch.status.toUpperCase()}</span></td>
    <td>${batch.startedAt ? new Date(batch.startedAt).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" }) : "—"}</td>
    <td><span class="badge ${batch.status.startsWith("EN ") ? "Reconocida" : "Normalizada"}">${batch.stage}</span></td>
    <td>${formatTime(batch.elapsed)}</td><td>${batch.fermenter} → ${batch.maturation}</td><td>${batch.operator || username}</td>
  </tr>`).join("") || `<tr><td colspan="10" class="empty-row">No hay lotes. Cree el primero para iniciar la producción.</td></tr>`;
}

function renderRecipes() {
  $("#recipe-cards").innerHTML = Object.entries(productProfiles).map(([name, profile]) => `<article class="recipe-card" style="--profile-color:${profile.color}">
    <div class="product-identity"><i></i><div><small>${profile.code}</small><h3>${name}</h3><p>${profile.character}</p></div></div>
    <p>${profile.description}</p>
    <div class="recipe-stats">
      <span>Adición diferenciadora<strong>${profile.manualAddition}</strong></span>
      <span>Secuencia común<strong>${profile.sequence}</strong></span>
      <span>Observación<strong>${profile.productionNote}</strong></span>
      <span>Control<strong>Parámetros definidos por lote</strong></span>
    </div>
  </article>`).join("");
}

function parameterInput(key, value, range, context) {
  const definition = operatingParameterDefinitions[key];
  return `<label class="parameter-field" data-parameter="${key}">
    <span>${definition.label}</span>
    <span class="input-with-unit"><input name="${key}" type="number" value="${value}" min="${range.min}" max="${range.max}" step="${definition.step}" required aria-describedby="${context}-${key}-help"><b>${definition.unit}</b></span>
    <small id="${context}-${key}-help">Habitual ${definition.usualMin}–${definition.usualMax}; ingeniería ${range.min}–${range.max} ${definition.unit}</small>
  </label>`;
}

function renderBatchParameterFields(values = productionDefaults) {
  $("#batch-parameter-fields").innerHTML = Object.keys(operatingParameterDefinitions)
    .map(key => parameterInput(key, values[key], engineeringLimits[key], "batch"))
    .join("");
  bindParameterValidation($("#batch-form"), $("#batch-validation"));
}

function renderBaseParameterFields() {
  const engineering = hasPermission(role, "editLimits");
  $("#base-parameter-fields").innerHTML = `<div class="parameter-table">
    <div class="parameter-table-head"><span>Parámetro</span><span>Valor base</span><span>Límite mín.</span><span>Límite máx.</span></div>
    ${Object.entries(operatingParameterDefinitions).map(([key, definition]) => `<div class="parameter-table-row" data-parameter="${key}">
      <label for="base-${key}">${definition.label}<small>${definition.unit} · ajuste de lote: Operador</small></label>
      <input id="base-${key}" name="${key}" type="number" value="${productionDefaults[key]}" min="${engineeringLimits[key].min}" max="${engineeringLimits[key].max}" step="${definition.step}" required>
      <input name="${key}Min" type="number" value="${engineeringLimits[key].min}" step="${definition.step}" ${engineering ? "" : "disabled"} aria-label="Límite mínimo de ${definition.label}">
      <input name="${key}Max" type="number" value="${engineeringLimits[key].max}" step="${definition.step}" ${engineering ? "" : "disabled"} aria-label="Límite máximo de ${definition.label}">
    </div>`).join("")}
  </div>
  <p class="role-note">${engineering ? "Ingeniería: los límites están habilitados." : "Supervisor: puede ajustar valores base. Los límites requieren rol Ingeniería."}</p>`;
}

function validateParameterForm(form, target) {
  const values = Object.fromEntries(new FormData(form));
  const errors = validateOperatingParameters(values, engineeringLimits);
  if (role === "Operador") {
    Object.entries(operatingParameterDefinitions).forEach(([key, definition]) => {
      const value = Number(values[key]);
      if (!errors[key] && (value < definition.usualMin || value > definition.usualMax)) {
        errors[key] = `${definition.label}: el valor fuera del ajuste habitual ${definition.usualMin}–${definition.usualMax} ${definition.unit} requiere autorización de Supervisor.`;
      }
    });
  }
  form.querySelectorAll("[data-parameter]").forEach(field => field.classList.toggle("invalid", Boolean(errors[field.dataset.parameter])));
  target.textContent = Object.values(errors)[0] || "";
  return { valid: !Object.keys(errors).length, values: sanitizeOperatingParameters(values, productionDefaults, engineeringLimits) };
}

function bindParameterValidation(form, target) {
  form.querySelectorAll("[data-parameter] input").forEach(input => input.addEventListener("input", () => validateParameterForm(form, target)));
}

function openProductionDefaults() {
  if (!requirePermission(role, "editProductionDefaults", toast)) return;
  renderBaseParameterFields();
  $("#parameters-validation").textContent = "";
  $("#parameters-dialog").showModal();
}

function renderAlarmSummary() {
  const data = [
    ["Críticas", alarms.alarms.filter(a => a.priority === "Crítica" && a.state.startsWith("ACTIVA")).length, "#c23b45"],
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
  const occupied = [...selectedCip].find(tag => {
    const equipment = simulator.equipment.get(tag);
    return equipment?.batchId || equipment?.status === "Operando";
  });
  if (occupied) {
    const equipment = simulator.equipment.get(occupied);
    const assignment = equipment?.batchId ? ` asignado al lote ${equipment.batchId}` : " en producción";
    return toast(`Interlock: ${occupied} está${assignment}.`, "error");
  }
  const duration = Number(new FormData($("#cip-config")).get("duration")) || 8;
  cipRunning = true;
  PersistentState.write("dagoca-cip", { running: true, route: [...selectedCip], phase: 0, startedAt: new Date().toISOString() });
  [...selectedCip].forEach(tag => { const e = simulator.equipment.get(tag); e.status = "En limpieza"; e.clean = false; e.cipStatus = "CIP"; });
  let step = 0, phaseTick = 0;
  $("#cip-flow").classList.add("flowing");
  $("#cip-status").textContent = "Ciclo en curso";
  renderCipTargets(); renderCipSteps(step); renderHome(); renderStageOverview();
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
      renderHome(); renderStageOverview();
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
  $("#production-defaults-btn").disabled = !hasPermission(role, "editProductionDefaults");
  $$("[data-mode=maintenance], [data-mode=simulation]").forEach(button => button.disabled = !hasPermission(role, "configureEquipment"));
  $("#simulation-badge").classList.toggle("active", simulator.mode === "simulation");
}

function equipmentDetailVisual(equipment) {
  const tag = equipment.tag;
  if (equipment.type === "pump") {
    return `<div class="detail-visual detail-pump ${equipment.status === "Operando" ? "run" : ""}" aria-hidden="true"><span class="detail-pump-volute"><i></i></span><span class="detail-pump-base"></span></div>`;
  }
  if (equipment.type === "cooler") {
    return `<div class="detail-visual detail-exchanger" aria-hidden="true"><svg viewBox="0 0 132 96"><path class="detail-exchanger-frame" d="M15 12H117L128 48 117 84H15L4 48Z"/><path class="detail-exchanger-plates" d="M37 22L25 74M49 22L37 74M61 22L49 74M73 22L61 74M85 22L73 74M97 22L85 74M109 22L97 74"/><path class="detail-exchanger-cold" d="M26 33H108M108 63H26"/><circle cx="20" cy="33" r="3"/><circle cx="114" cy="63" r="3"/></svg></div>`;
  }
  if (equipment.type === "valve") {
    return `<div class="detail-visual detail-valve ${equipment.position === "Abierta" ? "open" : "closed"}" aria-hidden="true"><span><i></i><i></i></span><b>${equipment.position || "Sin posición"}</b></div>`;
  }
  if (equipment.type === "agitator") {
    return `<div class="detail-visual detail-agitator ${equipment.status === "Operando" ? "run" : ""}" aria-hidden="true"><span class="detail-motor"><i></i></span><span class="detail-shaft"></span><span class="detail-impeller"></span></div>`;
  }
  if (equipment.type === "bottling") {
    return `<div class="detail-visual detail-bottling" aria-hidden="true"><span class="detail-filler-head"></span><i></i><i></i><i></i><span class="detail-conveyor"></span></div>`;
  }
  if (equipment.type === "cip") {
    return `<div class="detail-visual detail-cip" aria-hidden="true"><span>CIP</span><i></i><b>RETORNO</b></div>`;
  }

  const level = Number.isFinite(Number(equipment.level))
    ? Math.max(0, Math.min(100, Number(equipment.level)))
    : null;
  const liquid = ["TK-001", "TK-002"].includes(tag) ? "liquid-water" : ["TK-003", "TK-004", "TK-005"].includes(tag) ? "liquid-wort" : "liquid-beer";
  const role = tag === "TK-001" ? "water-filter"
    : tag === "TK-002" ? "storage"
      : tag === "TK-003" ? "mash-tun"
        : tag === "TK-004" ? "lauter-tun"
          : tag === "TK-005" ? "kettle"
            : tag === "TK-007" ? "filtered-receiver"
              : tag.startsWith("TK-006") || tag.startsWith("TK-008") ? "cellar"
                : "tank";
  const internals = role === "water-filter" ? '<span class="detail-vessel-internals filter-bed"></span>'
    : role === "mash-tun" ? '<span class="detail-vessel-internals agitator-shaft"><i></i></span>'
      : role === "lauter-tun" ? '<span class="detail-vessel-internals false-bottom"></span>'
        : role === "kettle" ? '<span class="detail-vessel-internals kettle-coil"></span>'
          : role === "filtered-receiver" ? '<span class="detail-vessel-internals final-filter"></span>'
            : "";
  return `<div class="detail-visual detail-vessel detail-${role} ${liquid}" aria-hidden="true">
    <span class="detail-vessel-dome"></span>
    <span class="detail-vessel-shell">${level == null ? "" : `<i class="detail-level" style="height:${level}%"></i>`}<i class="detail-steel-highlight"></i>${internals}</span>
    <span class="detail-vessel-bottom"></span><span class="detail-vessel-legs"><i></i><i></i></span>
  </div>`;
}

function equipmentDetailVariables(equipment) {
  const variables = [];
  const add = (label, value, unit = "") => {
    if (value != null) variables.push([label, value, unit]);
  };
  const tag = equipment.tag;

  if (tag === "TK-001") {
    add("Nivel", equipment.level, "%");
  } else if (tag === "TK-002") {
    add("Nivel", equipment.level, "%");
    add("Temperatura", equipment.temperature, "°C");
  } else if (tag === "TK-003") {
    add("Nivel", equipment.level, "%");
    add("Temperatura", equipment.temperature, "°C");
    add("Setpoint", equipment.setpoint, "°C");
    add("pH", equipment.ph, "pH");
  } else if (tag === "TK-004") {
    add("Nivel", equipment.level, "%");
    add("Presión", equipment.pressure, "bar");
  } else if (tag === "TK-005") {
    add("Nivel", equipment.level, "%");
    add("Temperatura", equipment.temperature, "°C");
    add("Setpoint", equipment.setpoint, "°C");
  } else if (tag === "E-001") {
    add("Temperatura de entrada", equipment.temperatureIn, "°C");
    add("Temperatura de salida", equipment.temperature, "°C");
    add("Setpoint de salida", equipment.setpoint, "°C");
    add("Presión", equipment.pressure, "bar");
  } else if (tag === "TK-007") {
    add("Nivel", equipment.level, "%");
    add("Turbidez de entrada", equipment.turbidityIn, "NTU");
    add("Turbidez de salida", equipment.turbidity, "NTU");
    add("Presión de entrada", equipment.pressureIn, "bar");
    add("Presión de salida", equipment.pressureOut, "bar");
    add("ΔP filtro", equipment.differentialPressure, "bar");
  } else if (tag.startsWith("TK-006") || tag.startsWith("TK-008")) {
    add("Nivel", equipment.level, "%");
    add("Temperatura", equipment.temperature, "°C");
    add("Setpoint", equipment.setpoint, "°C");
    add("Presión", equipment.pressure, "bar");
    if (tag.startsWith("TK-006")) add("Densidad", equipment.density, "SG");
  } else if (equipment.type === "pump" || equipment.type === "agitator") {
    add("Estado", equipment.status);
    add("Arranques", equipment.starts);
    add("Horas de operación", equipment.operatingHours, "h");
  } else if (equipment.type === "valve") {
    add("Posición", equipment.position);
    add("Estado", equipment.status);
  } else if (equipment.type === "bottling" || equipment.type === "cip") {
    add("Estado", equipment.status);
    add("Horas de operación", equipment.operatingHours, "h");
  }
  return variables;
}

function openEquipment(tag) {
  const equipment = simulator.equipment.get(tag);
  if (!equipment) return;
  equipmentFocusReturn = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  $("#drawer-title").textContent = `${equipment.displayTag || equipment.tag} · ${equipment.name}`;
  const related = alarms.alarms.filter(alarm => alarm.equipment === equipment.tag || alarm.tag.includes(equipment.tag)).slice(0, 3);
  const activeBatch = simulator.batches.find(batch => batch.id === equipment.batchId);
  const variables = equipmentDetailVariables(equipment);
  const detailState = synopticState(equipment);
  const cellarDetails = cellarOperationalDetails(equipment);
  const association = manualAssociations[equipment.tag] || {};
  const canOperateValve = equipment.type === "valve" || Boolean(association.valve);
  const canOperateDrive = ["pump", "agitator"].includes(equipment.type) || Boolean(association.pump);
  const manualActions = [
    canOperateValve ? `<button class="btn" data-manual-command="valve" data-target="${equipment.tag}" ${!["manual", "simulation"].includes(simulator.mode) || simulator.emergency ? "disabled" : ""}>Conmutar válvula</button>` : "",
    canOperateDrive ? `<button class="btn" data-manual-command="drive" data-target="${equipment.tag}" ${!["manual", "simulation"].includes(simulator.mode) || simulator.emergency || !equipment.clean ? "disabled" : ""}>${equipment.type === "agitator" ? "Conmutar agitador" : "Conmutar bomba"}</button>` : ""
  ].filter(Boolean).join("");
  $("#drawer-content").innerHTML = `<div class="detail-hero">
    ${equipmentDetailVisual(equipment)}
    <div><p class="detail-status state-${detailState.key}"><i></i>${detailState.label}</p><p class="detail-meta">Servicio: ${equipmentServices[equipment.tag] || equipment.service}<br>Lote: ${equipment.batchId || "Sin asignar"} · Producto: ${activeBatch?.product || activeBatch?.recipe || "Sin producto"}<br>CIP: ${equipment.cipStatus} · Modo: ${simulator.mode.toUpperCase()}</p>${qualityLabel(equipment.quality)}</div>
  </div>
  <div class="detail-grid">${variables.map(([label, value, unit]) => detailValue(label, `${value} ${unit}`)).join("")}${activeBatch ? detailValue("Tiempo en etapa", formatTime(simulator.stageProgress)) : ""}${detailValue("Último mantenimiento", equipment.lastMaintenance)}</div>
  ${cellarDetails}
  <h3>Instrumentación asociada</h3><div class="instrument-list">${equipment.instruments.length ? equipment.instruments.map(sensor => `<p><code>${sensor.tag}</code><span>${sensor.variable} · ${sensor.status}</span>${qualityLabel(sensor.quality)}</p>`).join("") : `<p><span>INSTRUMENTO PENDIENTE DE SELECCIÓN</span>${qualityLabel()}</p>`}</div>
  <h3>Alarmas relacionadas</h3><div>${related.length ? related.map(a => `<p class="engineering-note">${a.tag} · ${a.description}</p>`).join("") : '<p class="detail-muted">Sin alarmas relacionadas.</p>'}</div>
  <h3>Actuadores asociados</h3><p class="detail-muted">${associatedActuatorText(equipment.tag)}</p>
  ${manualActions ? `<h3>Comandos manuales</h3><div class="drawer-actions">${manualActions}</div>` : ""}
  <p class="engineering-note" style="margin-top:12px">La HMI no sustituye protecciones mecánicas de presión ni circuitos instrumentados de seguridad.</p>`;
  $("#equipment-drawer").classList.add("open");
  $("#equipment-drawer").setAttribute("aria-hidden", "false");
  $$("[data-manual-command]").forEach(button => button.addEventListener("click", () => manualCommand(button.dataset.manualCommand, button.dataset.target)));
  $("#close-drawer").focus();
}

function detailValue(label, value) { return `<div class="detail-value"><span>${label}</span><strong>${value}</strong></div>`; }
function cellarOperationalDetails(equipment) {
  if (!equipment.tag.startsWith("TK-006") && !equipment.tag.startsWith("TK-008")) return "";
  const association = manualAssociations[equipment.tag];
  const valve = simulator.equipment.get(association?.valve);
  const batch = simulator.batches.find(item => item.id === equipment.batchId);
  const selected = batch && [batch.fermenter, batch.maturation].includes(equipment.tag);
  const remaining = selected && simulator.activeBatch?.id === batch.id
    ? Math.max(0, demoConfig.simulation.secondsPerStage - simulator.stageProgress)
    : null;
  return `<h3>Permisos, interlocks y control térmico</h3>
    <dl class="stage-state-values">
      <dt>Selección</dt><dd>${selected ? `Asignado a ${batch.id}` : "No seleccionado"}</dd>
      <dt>Permiso de llenado</dt><dd>${equipment.clean && equipment.closed && !equipment.maintenance ? "HABILITADO" : "BLOQUEADO"}</dd>
      <dt>Permiso de descarga</dt><dd>${equipment.level > 5 && equipment.closed && !equipment.maintenance ? "HABILITADO" : "BLOQUEADO"}</dd>
      <dt>Nivel alto / bajo</dt><dd>${equipment.level >= 90 ? "LSH ACTIVO" : "LSH normal"} · ${equipment.level <= 5 ? "LSL ACTIVO" : "LSL normal"}</dd>
      <dt>Válvula de enfriamiento</dt><dd>${association?.valve || "—"} · orden ${valve?.position || "—"} · realimentación ${valve?.status || "—"}</dd>
      <dt>Tiempo restante</dt><dd>${remaining == null ? "—" : formatTime(remaining)}</dd>
      <dt>Interlock</dt><dd>${equipment.maintenance ? "Mantenimiento / fuera de servicio" : equipment.cipStatus !== "LIMPIO" ? "CIP pendiente" : "Sin bloqueo propio"}</dd>
    </dl>`;
}
function closeDrawer() {
  const drawer = $("#equipment-drawer");
  if (!drawer.classList.contains("open")) return;
  drawer.classList.remove("open");
  drawer.setAttribute("aria-hidden", "true");
  equipmentFocusReturn?.focus?.();
  equipmentFocusReturn = null;
}

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
  ...Object.fromEntries(fermenterTags.map(tag => [tag, { valve: tankControlValve(tag) }])),
  "TK-007": { pump: "P-004", valve: "LV-125" },
  ...Object.fromEntries(maturationTags.map(tag => [tag, { pump: "P-004", valve: tankControlValve(tag) }]))
});

function associatedActuatorText(tag) {
  const association = manualAssociations[tag];
  const parts = [];
  if (association?.valve) parts.push(`Válvula: ${association.valve}`);
  if (association?.pump) parts.push(`Bomba: ${association.pump}`);
  if (tag === "TK-003") parts.push("Agitador: AG1");
  return parts.join(" · ") || "Sin actuadores manuales asociados.";
}

function manualCommand(command, sourceTag) {
  if (!["manual", "simulation"].includes(simulator.mode)) return toast("Seleccione modo Manual o Simulación para operar actuadores.", "error");
  if (!requirePermission(role, "manualOperation", toast)) return;
  if (simulator.emergency) return toast("Comando rechazado: parada de emergencia activa.", "error");
  const source = simulator.equipment.get(sourceTag);
  if (!source) return toast("Equipo no disponible.", "error");
  if (!source.clean || source.status === "En limpieza") return interlockReject("Equipo o línea en CIP", source.tag, "Finalizar y drenar la ruta CIP");
  if (!confirm(`Confirmar comando ${command === "valve" ? "de válvula" : "de accionamiento"} asociado a ${source.tag}. Los interlocks permanecerán activos.`)) return;
  if (command === "valve") {
    const valve = source.type === "valve" ? source : simulator.equipment.get(manualAssociations[source.tag]?.valve);
    if (!valve) return interlockReject("No existe una válvula operable asociada", source.tag, "Verificar la narrativa de control");
    const steamVesselTag = { "TV-105": "TK-003", "TV-107": "TK-005" }[valve.tag];
    const steamVessel = steamVesselTag ? simulator.equipment.get(steamVesselTag) : null;
    if (steamVessel && steamVessel.level < 15) return interlockReject("Nivel insuficiente para habilitar vapor", `${steamVessel.tag} / ${valve.tag}`, "Alcanzar el nivel mínimo");
    valve.position = valve.position === "Abierta" ? "Cerrada" : "Abierta";
    valve.status = valve.position === "Abierta" ? "Operando" : "Disponible";
    simulator.log(`${valve.tag} ${valve.position.toLowerCase()} por comando manual desde ${source.tag}`);
    toast(`${valve.tag}: ${valve.position}.`);
  } else {
    const drive = ["pump", "agitator"].includes(source.type) ? source : simulator.equipment.get(manualAssociations[source.tag]?.pump);
    if (!drive) return interlockReject("No existe un accionamiento operable asociado", source.tag, "Verificar la narrativa de control");
    const fixedSuctionTag = { "P-001": "TK-002", "P-002": "TK-004", "P-003": "TK-005" }[drive.tag];
    const selectedMaturationTag = source.tag.startsWith("TK-008") ? source.tag : simulator.activeBatch?.maturation;
    const suctionTag = drive.tag === "P-004" ? selectedMaturationTag : fixedSuctionTag;
    const suction = suctionTag ? simulator.equipment.get(suctionTag) : null;
    if (drive.type === "pump" && drive.tag !== "P-000" && (!suction || suction.level <= 5)) {
      return interlockReject("Equipo de succión sin nivel o ruta sin seleccionar", `${drive.tag} / ${suctionTag || "origen no seleccionado"}`, "Confirmar selección, nivel y válvula de succión");
    }
    if (drive.tag === "AG1" && simulator.equipment.get("TK-003").level < 15) return interlockReject("Nivel insuficiente para agitación", "AG1 / TK-003", "Alcanzar el nivel mínimo");
    if (drive.tag === "P-003" && simulator.equipment.get("E-001").temperature >= 35) return interlockReject("Mosto demasiado caliente para fermentación", "E-001 / P-003", "Reducir TT-109 por debajo de 35 °C");
    if (drive.tag === "P-004" && !simulator.equipment.get("TK-007").available) return interlockReject("TK-007 no disponible", "P-004 / TK-007", "Confirmar limpieza, cierre y disponibilidad de TK-007");
    drive.status = drive.status === "Operando" ? "Detenida" : "Operando";
    if (drive.status === "Operando") drive.starts++;
    simulator.log(`${drive.tag} ${drive.status.toLowerCase()} por comando manual desde ${source.tag}`);
    toast(`${drive.tag}: ${drive.status}.`);
  }
  simulator.emitState();
  openEquipment(sourceTag);
}

function populateBatchForm() {
  $("#batch-form [name=id]").value = `DG-${new Date().toISOString().slice(2, 10).replaceAll("-", "")}-${String(simulator.batches.length + 1).padStart(2, "0")}`;
  $("#batch-recipe").innerHTML = Object.keys(productProfiles).map(name => `<option value="${name}">${name}</option>`).join("");
  const options = items => items.length ? items.map(item => `<option value="${item.tag}">${item.displayTag || item.tag} · ${item.status}</option>`).join("") : `<option value="">Sin equipos disponibles</option>`;
  $("#batch-fermenter").innerHTML = options(simulator.availableFermenters);
  $("#batch-maturation").innerHTML = options(simulator.availableMaturation);
  renderBatchParameterFields();
  $("#batch-validation").textContent = "";
}

function submitBatch(event) {
  event.preventDefault();
  if (!requirePermission(role, "configureBatch", toast)) return;
  const data = Object.fromEntries(new FormData(event.currentTarget));
  const validation = validateParameterForm(event.currentTarget, $("#batch-validation"));
  if (!validation.valid) return;
  data.parameters = validation.values;
  data.recipe = data.product;
  data.operator = username;
  try {
    simulator.createBatch(data);
    $("#batch-dialog").close();
    renderAll(); toast(`Lote ${data.id} creado con producto y parámetros congelados.`);
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
  $$(".mode-switch button").forEach(button => {
    const active = button.dataset.mode === simulator.mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
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
  $("#menu-toggle").setAttribute("aria-expanded", "false");
  $("#menu-toggle").setAttribute("aria-label", "Abrir menú");
  if (view === "trends" && trends.chart) { trends.chart.resize(); trends.select($("#tag-select").value, $("#range-select").value); }
  if (updateHash && location.hash !== `#${view}`) history.replaceState(null, "", `#${view}`);
}

function initNavigation() {
  const shell = $(".app-shell");
  const collapseButton = $("#sidebar-collapse");
  const setSidebarCollapsed = (collapsed, persist = true) => {
    shell.classList.toggle("sidebar-collapsed", collapsed);
    collapseButton.setAttribute("aria-expanded", String(!collapsed));
    collapseButton.setAttribute("aria-label", collapsed ? "Expandir panel lateral" : "Minimizar panel lateral");
    collapseButton.title = collapsed ? "Expandir panel lateral" : "Minimizar panel lateral";
    collapseButton.querySelector("span").textContent = collapsed ? "»" : "«";
    if (persist) safeStore("dagoca-sidebar-collapsed", String(collapsed));
  };
  $$(".nav-item").forEach(button => {
    button.title = button.textContent.replace(/\s+/g, " ").trim();
    button.addEventListener("click", () => switchView(button.dataset.view));
  });
  setSidebarCollapsed(localStorage.getItem("dagoca-sidebar-collapsed") === "true", false);
  collapseButton.addEventListener("click", () => setSidebarCollapsed(!shell.classList.contains("sidebar-collapsed")));
  $$("[data-go]").forEach(button => button.addEventListener("click", () => switchView(button.dataset.go)));
  $("#menu-toggle").addEventListener("click", event => {
    const open = $("#sidebar").classList.toggle("open");
    event.currentTarget.setAttribute("aria-expanded", String(open));
    event.currentTarget.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
  });
  window.addEventListener("hashchange", () => switchView(location.hash.slice(1) || "home", false));
  switchView(location.hash.slice(1) || "home", false);
}

function initControls() {
  $$(".mode-switch button").forEach(button => button.addEventListener("click", () => {
    if (["maintenance", "simulation"].includes(button.dataset.mode) && !requirePermission(role, "configureEquipment", toast)) return;
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
  $("#production-defaults-btn").addEventListener("click", openProductionDefaults);
  $("#parameters-form").addEventListener("submit", event => {
    event.preventDefault();
    if (!requirePermission(role, "editProductionDefaults", toast)) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    if (hasPermission(role, "editLimits")) {
      const candidateLimits = Object.fromEntries(Object.keys(operatingParameterDefinitions).map(key => [key, {
        min: values[`${key}Min`],
        max: values[`${key}Max`]
      }]));
      engineeringLimits = sanitizeEngineeringLimits(candidateLimits);
      simulator.config.engineeringLimits = engineeringLimits;
      safeStore("dagoca-engineering-limits", JSON.stringify(engineeringLimits));
    }
    const errors = validateOperatingParameters(values, engineeringLimits);
    if (Object.keys(errors).length) {
      $("#parameters-validation").textContent = Object.values(errors)[0];
      return;
    }
    productionDefaults = sanitizeOperatingParameters(values, baseOperatingParameters, engineeringLimits);
    safeStore("dagoca-production-defaults", JSON.stringify(productionDefaults));
    $("#parameters-dialog").close();
    toast("Parámetros base guardados para órdenes futuras.");
  });
  $("#reset-production-defaults").addEventListener("click", () => {
    if (!requirePermission(role, "resetProductionDefaults", toast)) return;
    if (!confirm("¿Restablecer los valores base de producción? Los lotes existentes no cambiarán.")) return;
    productionDefaults = sanitizeOperatingParameters(baseOperatingParameters, baseOperatingParameters, engineeringLimits);
    safeStore("dagoca-production-defaults", JSON.stringify(productionDefaults));
    renderBaseParameterFields();
    toast("Valores base restablecidos.");
  });
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
      PersistentState.write("dagoca-config", { fermenters: 5, maturationTanks: 10, stageSeconds: Number(data.stageSeconds) });
      toast("Configuración guardada. La capacidad permanece fijada en 5 fermentadores y 10 maduradores.");
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
    renderAlarmSummary(); updateAlarmEquipmentFilter(); renderAlarmTable(); renderMetrics(); renderHome(); renderStageOverview();
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
  // Las recetas antiguas permanecen referenciadas en lotes históricos; no se combinan
  // con los perfiles comerciales activos ni con los parámetros base sanitizados.
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
  $("#settings-form [name=fermenters]").value = demoConfig.plant.fermenters;
  $("#settings-form [name=maturationTanks]").value = demoConfig.plant.maturationTanks;
  $("#settings-form [name=stageSeconds]").value = settings.stageSeconds || demoConfig.simulation.secondsPerStage;
  $("#menu-toggle").setAttribute("aria-expanded", "false");
  dataProvider.connect().catch(() => toast("No fue posible iniciar el proveedor de simulación.", "error"));
  initNavigation(); initControls(); initTrends(); initBus(); renderCipSteps(); renderAll();
  $("#clock").textContent = new Date().toLocaleTimeString("es-CO");
  setInterval(() => $("#clock").textContent = new Date().toLocaleTimeString("es-CO"), 1000);
  simulator.startTimer();
}

init();
