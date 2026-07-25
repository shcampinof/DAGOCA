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

const stageEquipmentTags = ["CIP-01", "T1", "T3", "T4", "T5", "IC1", "TF", "TM", "CIP-01", "TM", "T7", "EMB-01"];

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
  const fermenters = [...simulator.equipment.values()].filter(e => e.tag.startsWith("TF-"));
  const maturation = [...simulator.equipment.values()].filter(e => e.tag.startsWith("TM-"));
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
        ${classicUnit(get("T1"), { shape: "filter", process: "agua" })}
        ${classicUnit(get("T2"), { process: "agua" })}
        ${classicUnit(get("T3"), { process: "mosto" })}
        ${classicUnit(get("T4"), { shape: "filter", process: "mosto" })}
        ${classicUnit(get("T5"), { process: "mosto" })}
        ${classicUnit(get("IC1"), { shape: "cooler", process: "refrigerante" })}
      </div>
      <div class="valve-row top-valves">
        ${["V2", "XV-003", "XV-004"].map((tag, index) => `<button class="valve-symbol ${simulator.running && active >= index * 2 ? "open" : ""}" data-equipment="${tag}" title="${tag}"><i></i><b>${tag}</b></button>`).join("")}
      </div>
      <button class="inline-actuator inline-b1 ${get("B1").status === "Operando" ? "run" : ""}" data-equipment="B1" title="B1 · Transferencia T2 a T3"><i>▶</i><b>B1</b></button>
      <button class="inline-actuator inline-ag1 ${get("AG1").status === "Operando" ? "run" : ""}" data-equipment="AG1" title="AG1 · Agitador de maceración"><i>↻</i><b>AG1</b></button>
      <div class="bank fermenter-bank">
        <div class="bank-header"><b>COLECTOR T6</b><span>Selección automática de fermentador</span></div>
        <div class="classic-tank-row">${fermenters.map(e => classicUnit(e, { compact: true, process: "cerveza", showGauge: false })).join("")}</div>
      </div>
      <div class="bank maturation-bank">
        <div class="bank-header"><b>COLECTOR TM</b><span>Transferencia a maduración</span></div>
        <div class="classic-tank-row">${maturation.map(e => classicUnit(e, { compact: true, process: "cerveza", showGauge: false })).join("")}</div>
      </div>
      <div class="final-skid">
        ${classicUnit(get("T7"), { compact: true, shape: "filter", process: "cerveza", showGauge: false })}
        <div class="pump-set">
          ${["B1", "B2", "B3"].map((tag, index) => `<button class="pump-symbol ${simulator.running && active >= index * 4 ? "run" : ""}" data-equipment="${tag}"><i>▶</i><b>${tag}</b><small>${get(tag).status}</small></button>`).join("")}
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
  const available = [...simulator.equipment.values()].filter(e => e.available).length;
  const activeAlarms = alarms.alarms.filter(a => !["CERRADA", "Normalizada"].includes(a.state)).length;
  const weeklyLiters = simulator.batches.filter(b => b.startedAt && Date.now() - new Date(b.startedAt).getTime() < 7 * 86400000).reduce((sum, b) => sum + b.volume, 0);
  const cards = [
    ["Estado de planta", simulator.emergency ? "EMERGENCIA" : simulator.running ? "EN PRODUCCIÓN" : "DISPONIBLE", simulator.mode.toUpperCase(), "#18795c"],
    ["Lote activo", batch?.id || "SIN LOTE", batch?.recipe || "Sin receta asignada", "#2e6f9e"],
    ["Etapa", simulator.currentStep()?.name || "EN ESPERA", formatTime(simulator.stageProgress, true), "#b6782e"],
    ["Alarmas", activeAlarms, "Activas en el sistema", "#c23b45"],
    ["Producción semanal", `${weeklyLiters} L`, `${simulator.batches.length} lotes registrados`, "#257b8b"],
    ["Equipos disponibles", available, `${simulator.equipment.size} equipos configurados`, "#61727e"],
    ["CIP", cipRunning ? "ACTIVO" : "DISPONIBLE", cipRunning ? "Ruta bloqueada" : "Sin rutas en limpieza", "#2e6f9e"],
    ["Calidad de señal", "SIMULATED", "Sin conexión PLC", "#77559a"]
  ];
  $("#home-metrics").innerHTML = cards.map(([label, value, detail, color]) => `<div class="metric" style="--accent:${color}"><span>${label}</span><strong>${value}</strong><small>${detail}</small></div>`).join("");
  $("#home-status").innerHTML = `<dl class="status-list"><dt>Modo</dt><dd>${simulator.mode.toUpperCase()}</dd><dt>Receta programada</dt><dd>${batch?.recipe || "—"}</dd><dt>Fermentador</dt><dd>${batch?.fermenter || "—"}</dd><dt>Maduración</dt><dd>${batch?.maturation || "—"}</dd></dl>`;
  $("#home-events").innerHTML = simulator.events.slice(0, 6).map(event => `<li><time>${new Date(event.time).toLocaleTimeString("es-CO")}</time><span>${event.message}</span></li>`).join("") || "<li>Sin eventos registrados.</li>";
}

function renderMiniGrafcet() {
  const groups = [
    ["0.10", "Elaboración y selección", [0, 5]],
    ["0.20", "Fermentación y transferencia", [6, 8]],
    ["0.30", "Maduración y filtrado final", [9, 11]]
  ];
  $("#mini-grafcet").innerHTML = groups.map(([code, name, range]) => {
    const active = simulator.activeStage >= range[0] && simulator.activeStage <= range[1];
    const done = simulator.activeStage > range[1] || simulator.activeBatch?.status === "Completado";
    return `<div class="mini-step ${active ? "active" : ""}"><strong>${code}</strong><span>${name}</span><small>${done ? "✓ Completo" : active ? "● Activo" : "Pendiente"}</small></div>`;
  }).join("");
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

function renderGrafcet() {
  const ranges = { "0.10": [0, 5], "0.20": [6, 8], "0.30": [9, 11] };
  $("#grafcet-board").innerHTML = grafcetBlueprint.map(block => {
    const [start, end] = ranges[block.group];
    const groupActive = simulator.activeStage >= start && simulator.activeStage <= end;
    const groupComplete = simulator.activeStage > end;
    const progress = groupActive ? (simulator.activeStage - start + Math.min(1, simulator.stageProgress / demoConfig.simulation.secondsPerStage)) / (end - start + 1) : groupComplete ? 1 : 0;
    const activeIndex = groupActive ? Math.min(block.steps.length - 1, Math.floor(progress * block.steps.length)) : -1;
    return `<div class="grafcet-column"><h3>GRAFCET ${block.group} · ${block.title}</h3>${block.steps.map((name, index) => {
      const complete = groupComplete || (groupActive && index < activeIndex);
      const active = groupActive && index === activeIndex;
      const status = complete ? "complete" : active ? "active" : "pending";
      const transitionClass = complete ? "satisfied" : active && simulator.emergency ? "blocked" : active ? "pending" : "pending";
      const text = complete ? "Condiciones cumplidas" : active ? `${simulator.blockReason()} · T ${formatTime(simulator.stageProgress, true)}` : "Etapa futura";
      return `<article class="grafcet-step ${status} ${simulator.emergency && active ? "blocked" : ""}"><header><strong>${block.group}.${String(index + 1).padStart(2, "0")}</strong><span class="badge">${status.toUpperCase()}</span></header><p>${name}</p><div class="transition ${transitionClass}"><span>${complete ? "✓" : active ? "◷" : "—"}</span><span>${text}</span></div></article>`;
    }).join("")}</div>`;
  }).join("");
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
  const targets = [...simulator.equipment.values()].filter(item => ["tank", "filter"].includes(item.type) && item.tag !== "T1");
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
  $("#advance-btn").disabled = !hasPermission(role, "authorizeTransition");
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
  <h3>Actuadores asociados</h3><p style="color:var(--muted);font-size:10px">Válvulas: V2 · XV-003 · XV-004 · XV-006<br>Bombas: B1 · B2 · B3 · Agitador: AG1</p>
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

function manualCommand(command, sourceTag) {
  if (!["manual", "simulation"].includes(simulator.mode)) return toast("Seleccione modo Manual o Simulación para operar actuadores.", "error");
  if (!requirePermission(role, "manualOperation", toast)) return;
  if (simulator.emergency) return toast("Comando rechazado: parada de emergencia activa.", "error");
  const source = simulator.equipment.get(sourceTag);
  if (!source) return toast("Equipo no disponible.", "error");
  if (!source.clean || source.status === "En limpieza") return interlockReject("Equipo o línea en CIP", source.tag, "Finalizar y drenar la ruta CIP");
  if (!confirm(`Confirmar comando ${command === "valve" ? "de válvula" : "de bomba"} asociado a ${source.tag}. Los interlocks permanecerán activos.`)) return;
  if (command === "valve") {
    const valve = source.type === "valve" ? source : [...simulator.equipment.values()].find(item => item.type === "valve");
    if (valve.tag === "XV-004" && ["T3", "T5"].includes(source.tag) && source.level < 15) return interlockReject("Nivel insuficiente para habilitar calentamiento", source.tag, "Alcanzar el nivel mínimo");
    valve.position = valve.position === "Abierta" ? "Cerrada" : "Abierta";
    valve.status = valve.position === "Abierta" ? "Operando" : "Disponible";
    simulator.log(`${valve.tag} ${valve.position.toLowerCase()} por comando manual desde ${source.tag}`);
    toast(`${valve.tag}: ${valve.position}.`);
  } else {
    const pump = source.type === "pump" ? source : [...simulator.equipment.values()].find(item => item.type === "pump");
    if (pump.tag === "B1" && simulator.equipment.get("T2").level <= 5) return interlockReject("T2 sin nivel de succión", "B1 / T2", "Llenar T2 y confirmar válvula de succión");
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
  renderHome(); renderMetrics(); renderMimic(); renderMiniGrafcet(); renderEvents(); renderBatches(); renderRecipes(); renderGrafcet();
  renderAlarmSummary(); updateAlarmEquipmentFilter(); renderAlarmTable(); renderCipTargets(); renderMaintenance(); updateStatus(); applyAccessControl();
}

function switchView(view, updateHash = true) {
  if (!$(`#view-${view}`)) view = "overview";
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
  $("#advance-btn").addEventListener("click", () => { if (requirePermission(role, "authorizeTransition", toast)) simulator.advance(); });
  $("#step-mode").addEventListener("change", event => { simulator.stepMode = event.target.checked; simulator.emitState(); });
  $("#grafcet-pause").addEventListener("click", () => simulator.stop());
  $("#grafcet-resume").addEventListener("click", () => simulator.start());
  $("#speed-btn").addEventListener("click", event => {
    if (!requirePermission(role, "editSimulation", toast)) return;
    const accelerated = demoConfig.simulation.tickMs === 330;
    demoConfig.simulation.tickMs = accelerated ? 1000 : 330;
    if (simulator.interval) { clearInterval(simulator.interval); simulator.interval = null; simulator.startTimer(); }
    event.currentTarget.textContent = accelerated ? "Acelerar ×3" : "Velocidad normal";
    toast(accelerated ? "Velocidad normal restaurada." : "Simulación acelerada ×3.");
  });
  $("#grafcet-reset").addEventListener("click", () => {
    if (requirePermission(role, "resetSequence", toast) && confirm("¿Reiniciar la secuencia activa desde limpieza inicial?")) simulator.resetSequence();
  });
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
  initNavigation(); initControls(); initTrends(); initBus(); renderCipSteps(); renderAll();
  $("#clock").textContent = new Date().toLocaleTimeString("es-CO");
  setInterval(() => $("#clock").textContent = new Date().toLocaleTimeString("es-CO"), 1000);
  simulator.startTimer();
}

init();
