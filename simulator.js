const demoConfig = {
  plant: { fermenters: 5, maturationTanks: 5, annualCapacityHl: 500, batchVolumeL: 481 },
  recipes: {
    "Sabor A": { color: "#e5a94a", mashTemp: 66, mashPh: 5.3, boilTemp: 100, coolerMax: 20, fermentationTemp: 19, fermentationPressure: 1.15, finalDensity: 1.012, maturationTemp: 3, maturationPressure: 1.25, turbidityMax: 1.2 },
    "Sabor B": { color: "#b97947", mashTemp: 68, mashPh: 5.4, boilTemp: 100, coolerMax: 18, fermentationTemp: 17, fermentationPressure: 1.1, finalDensity: 1.009, maturationTemp: 2, maturationPressure: 1.2, turbidityMax: .9 }
  },
  simulation: { tickMs: 1000, secondsPerStage: 9, stableWindow: 3 },
  tags: {
    "TT-T3": { label: "Temperatura de maceración", unit: "°C", setpoint: 66, low: 62, high: 72 },
    "AIT-pH-T3": { label: "pH de maceración", unit: "pH", setpoint: 5.3, low: 5.1, high: 5.6 },
    "TT-T5": { label: "Temperatura de cocción", unit: "°C", setpoint: 100, low: 96, high: 104 },
    "TT-IC1": { label: "Salida del enfriador", unit: "°C", setpoint: 18, low: 14, high: 20 },
    "TT-TF": { label: "Temperatura fermentador", unit: "°C", setpoint: 18, low: 15, high: 22 },
    "PT-TF": { label: "Presión fermentador", unit: "bar", setpoint: 1.15, low: .7, high: 1.6 },
    "AIT-SG-TF": { label: "Densidad fermentador", unit: "SG", setpoint: 1.012, low: 1.006, high: 1.06 },
    "TT-TM": { label: "Temperatura maduración", unit: "°C", setpoint: 3, low: 0, high: 6 },
    "PT-TM": { label: "Presión maduración", unit: "bar", setpoint: 1.2, low: .7, high: 1.6 },
    "AIT-TU-T7": { label: "Turbidez filtrado final", unit: "NTU", setpoint: .8, low: 0, high: 1.2 }
  }
};

class EventBus extends EventTarget {
  emit(name, detail) { this.dispatchEvent(new CustomEvent(name, { detail })); }
  on(name, handler) { this.addEventListener(name, event => handler(event.detail)); }
}

class Equipment {
  constructor(tag, name, type = "tank", options = {}) {
    Object.assign(this, { tag, name, type, status: "Disponible", level: 0, temperature: 20, pressure: 0, ph: null, density: null, turbidity: null, clean: true, closed: true, maintenance: false, batchId: null, history: [] }, options);
  }
  get available() { return !this.batchId && this.clean && this.closed && !this.maintenance && !["En limpieza", "Alarma"].includes(this.status); }
}

class Tank extends Equipment {
  constructor(tag, name, options = {}) { super(tag, name, "tank", options); }
}

class Valve extends Equipment {
  constructor(tag, options = {}) { super(tag, `Válvula ${tag}`, "valve", { position: "Cerrada", ...options }); }
}

class Pump extends Equipment {
  constructor(tag, options = {}) { super(tag, `Bomba ${tag}`, "pump", { status: "Detenida", ...options }); }
}

class Batch {
  constructor({ id, recipe, volume, fermenter, maturation }) {
    Object.assign(this, { id, recipe, volume: Number(volume), fermenter, maturation, stage: "Preparado", stageIndex: -1, startedAt: null, elapsed: 0, status: "Preparado" });
  }
}

class GrafcetStep {
  constructor(code, name, group, conditions = []) {
    Object.assign(this, { code, name, group, conditions, status: "pending" });
  }
}

const stageDefinitions = [
  { code: "0.10.0", name: "Limpieza inicial", group: "0.10", equipment: "CIP-01", conditions: ["Ciclo completo", "Ruta drenada", "Sin alarmas críticas"] },
  { code: "0.10.1", name: "Preparación de agua T1 + T2", group: "0.10", equipment: "T1", conditions: ["T2 habilitado", "Volumen objetivo alcanzado"] },
  { code: "0.10.2", name: "Maceración", group: "0.10", equipment: "T3", conditions: ["Tiempo mínimo", "Temperatura estable", "pH en receta", "Conversión confirmada"] },
  { code: "0.10.3", name: "Filtrado primario", group: "0.10", equipment: "T4", conditions: ["Ruta compatible", "Turbidez primaria aceptada"] },
  { code: "0.10.4", name: "Cocción", group: "0.10", equipment: "T5", conditions: ["Tiempo mínimo", "Temperatura estable"] },
  { code: "0.10.5", name: "Enfriamiento y selección TF", group: "0.10", equipment: "IC1", conditions: ["Salida ≤ límite", "Fermentador disponible"] },
  { code: "0.20.0", name: "Fermentación", group: "0.20", equipment: "TF", conditions: ["Tiempo mínimo", "Temperatura correcta", "Presión correcta", "Densidad estable"] },
  { code: "0.20.1", name: "Transferencia a maduración", group: "0.20", equipment: "TM", conditions: ["Tanque limpio y cerrado", "Ruta confirmada"] },
  { code: "0.20.2", name: "Lavado TF y tubería", group: "0.20", equipment: "CIP-01", conditions: ["Fermentador drenado", "Retorno CIP verificado"] },
  { code: "0.30.0", name: "Maduración", group: "0.30", equipment: "TM", conditions: ["Tiempo mínimo", "Temperatura estable", "Turbidez bajo límite"] },
  { code: "0.30.1", name: "Filtrado final T7", group: "0.30", equipment: "T7", conditions: ["Filtro disponible", "Turbidez final aceptada", "Línea receptora lista"] },
  { code: "0.30.2", name: "Embotellado y lavado", group: "0.30", equipment: "EMB-01", conditions: ["Transferencia completa", "Ruta drenada"] }
];

const storage = {
  read(key, fallback) {
    try { const value = localStorage.getItem(key); return value ? JSON.parse(value) : fallback; }
    catch { return fallback; }
  },
  write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch { return false; }
  }
};

class ScadaSimulator {
  constructor(config = demoConfig) {
    this.config = config;
    this.bus = new EventBus();
    this.mode = "auto";
    this.running = false;
    this.emergency = false;
    this.stepMode = false;
    this.stageProgress = 0;
    this.conditions = {};
    this.events = storage.read("dagoca-events", []);
    this.batches = storage.read("dagoca-batches", []).map(item => Object.assign(new Batch(item), item));
    this.activeBatch = this.batches.find(batch => batch.status === "En proceso") || null;
    this.equipment = this.createEquipment();
    this.restoreReservations();
    this.steps = stageDefinitions.map(step => new GrafcetStep(step.code, step.name, step.group, step.conditions));
    this.interval = null;
    this.updateStepStatus();
  }

  createEquipment() {
    const items = [
      new Equipment("T1", "Filtro de agua", "filter", { status: "Disponible" }),
      new Tank("T2", "Agua filtrada", { temperature: 18 }),
      new Tank("T3", "Macerador", { ph: 5.3 }),
      new Equipment("T4", "Filtro primario", "filter"),
      new Tank("T5", "Cocción", { temperature: 20 }),
      new Equipment("IC1", "Enfriador", "cooler", { temperature: 18 }),
      new Equipment("T7", "Filtrado final", "filter", { turbidity: .7 }),
      new Equipment("EMB-01", "Embotellado", "bottling"),
      new Equipment("CIP-01", "Skid CIP", "cip"),
      new Pump("B1"), new Pump("B2"), new Pump("B3"),
      new Valve("XV-101"), new Valve("XV-201"), new Valve("XV-301")
    ];
    for (let i = 1; i <= this.config.plant.fermenters; i++) items.push(new Tank(`TF-${String(i).padStart(2, "0")}`, `Fermentador ${i}`, { density: 1.05, pressure: 0, temperature: 18 }));
    for (let i = 1; i <= this.config.plant.maturationTanks; i++) items.push(new Tank(`TM-${String(i).padStart(2, "0")}`, `Maduración ${i}`, { turbidity: 2.4, pressure: 0, temperature: 3 }));
    return new Map(items.map(item => [item.tag, item]));
  }

  restoreReservations() {
    this.batches.filter(batch => !["Completado", "Cancelado"].includes(batch.status)).forEach(batch => {
      [batch.fermenter, batch.maturation].forEach(tag => {
        const equipment = this.equipment.get(tag);
        if (equipment) { equipment.batchId = batch.id; equipment.status = batch.status === "En proceso" ? "Reservado" : "Asignado"; }
      });
    });
  }

  get tanks() { return [...this.equipment.values()].filter(item => item.type === "tank"); }
  get availableFermenters() { return this.tanks.filter(item => item.tag.startsWith("TF-") && item.available); }
  get availableMaturation() { return this.tanks.filter(item => item.tag.startsWith("TM-") && item.available); }
  get activeStage() { return this.activeBatch?.stageIndex ?? -1; }

  createBatch(data) {
    if (this.batches.some(batch => batch.id === data.id)) throw new Error("El ID del lote ya existe.");
    const tf = this.equipment.get(data.fermenter);
    const tm = this.equipment.get(data.maturation);
    if (!tf?.available) throw new Error("El fermentador no está disponible, limpio y cerrado.");
    if (!tm?.available) throw new Error("El tanque de maduración no está disponible, limpio y cerrado.");
    const batch = new Batch(data);
    this.batches.unshift(batch);
    tf.batchId = batch.id; tf.status = "Reservado";
    tm.batchId = batch.id; tm.status = "Reservado";
    this.log(`Lote ${batch.id} creado · ${batch.recipe}`);
    this.persist();
    this.bus.emit("batch", batch);
    return batch;
  }

  start() {
    if (this.emergency) return this.reject("Resetee la parada de emergencia antes de iniciar.");
    if (!this.activeBatch) {
      this.activeBatch = this.batches.find(batch => batch.status === "Preparado");
      if (!this.activeBatch) return this.reject("Cree un lote antes de iniciar la producción.");
      this.activeBatch.status = "En proceso";
      this.activeBatch.startedAt ||= new Date().toISOString();
      this.activeBatch.stageIndex = Math.max(0, this.activeBatch.stageIndex);
    }
    const current = this.currentEquipment();
    if (current && (!current.clean || current.status === "En limpieza")) return this.reject(`${current.tag} está sucio o en limpieza. Interlock activo.`);
    this.running = true;
    this.stageProgress = 0;
    this.applyStage();
    this.log(`Secuencia iniciada en ${this.currentStep().name}`);
    this.startTimer();
    this.emitState();
    return true;
  }

  stop() {
    if (!this.running) return this.reject("La secuencia ya está detenida.");
    this.running = false;
    this.log("Parada controlada solicitada");
    this.emitState();
    return true;
  }

  triggerEmergency() {
    this.emergency = true; this.running = false;
    [...this.equipment.values()].filter(e => e.type === "pump").forEach(p => p.status = "Detenida");
    this.log("PARADA DE EMERGENCIA activada");
    this.bus.emit("emergency", true);
    this.emitState();
  }

  resetEmergency() {
    if (!this.emergency) return this.reject("No existe una parada de emergencia activa.");
    this.emergency = false;
    this.log("Parada de emergencia reseteada · verificación requerida");
    this.bus.emit("emergency", false);
    this.emitState();
    return true;
  }

  setMode(mode) {
    this.mode = mode;
    this.log(`Modo de operación: ${mode === "auto" ? "Automático" : "Manual"}`);
    this.emitState();
  }

  tick() {
    if (!this.running || !this.activeBatch || this.emergency) return;
    this.activeBatch.elapsed++;
    this.stageProgress++;
    this.updateProcessValues();
    this.updateConditions();
    if (this.mode === "auto" && !this.stepMode && this.canAdvance()) this.advance();
    this.emitState();
  }

  updateConditions() {
    const ratio = this.stageProgress / this.config.simulation.secondsPerStage;
    const index = this.activeStage;
    this.conditions = {
      timeMinimum: ratio >= .72,
      stableTemperature: ratio >= .58,
      phInRecipe: index !== 2 || ratio >= .48,
      conversionConfirmed: index !== 2 || ratio >= .68,
      coolerOk: index !== 5 || ratio >= .62,
      destinationAvailable: Boolean(this.equipment.get(this.activeBatch.fermenter)?.closed),
      pressureOk: ratio >= .5,
      densityStable: index !== 6 || ratio >= .78,
      turbidityOk: ![9, 10].includes(index) || ratio >= .75,
      routeReady: ratio >= .55,
      cleanComplete: ratio >= .76
    };
  }

  canAdvance() {
    const i = this.activeStage;
    const c = this.conditions;
    const rules = {
      0: c.cleanComplete, 1: c.timeMinimum, 2: c.timeMinimum && c.stableTemperature && c.phInRecipe && c.conversionConfirmed,
      3: c.timeMinimum && c.routeReady, 4: c.timeMinimum && c.stableTemperature,
      5: c.coolerOk && c.destinationAvailable, 6: c.timeMinimum && c.stableTemperature && c.pressureOk && c.densityStable,
      7: c.destinationAvailable && c.routeReady, 8: c.cleanComplete, 9: c.timeMinimum && c.stableTemperature && c.turbidityOk,
      10: c.routeReady && c.turbidityOk, 11: c.timeMinimum && c.cleanComplete
    };
    return Boolean(rules[i]);
  }

  advance(force = false) {
    if (!this.activeBatch) return this.reject("No hay lote activo.");
    if (!this.running) return this.reject("La secuencia está detenida.");
    if (!force && !this.canAdvance()) return this.reject(`Transición bloqueada: ${this.blockReason()}`);
    const completed = this.currentStep();
    if (completed) this.log(`${completed.code} ${completed.name} completado`);
    if (this.activeStage >= this.steps.length - 1) return this.completeBatch();
    this.activeBatch.stageIndex++;
    this.stageProgress = 0;
    this.conditions = {};
    this.applyStage();
    this.persist();
    this.emitState();
    return true;
  }

  blockReason() {
    const step = this.currentStep();
    if (!step) return "secuencia sin iniciar";
    const checks = [
      ["timeMinimum", "tiempo mínimo no cumplido"], ["stableTemperature", "temperatura aún no estable"],
      ["phInRecipe", "pH fuera de receta"], ["conversionConfirmed", "conversión de almidón no confirmada"],
      ["coolerOk", "temperatura de salida de IC1 sobre el límite"], ["destinationAvailable", "tanque de destino no disponible"],
      ["pressureOk", "presión fuera de ventana"], ["densityStable", "densidad sin estabilidad en la ventana configurada"],
      ["turbidityOk", "turbidez sobre el límite"], ["routeReady", "ruta de válvulas o equipo receptor no confirmado"],
      ["cleanComplete", "ciclo de limpieza o drenaje incompleto"]
    ];
    const relevant = this.relevantConditionKeys();
    return checks.find(([key]) => relevant.includes(key) && !this.conditions[key])?.[1] || "condiciones de proceso pendientes";
  }

  relevantConditionKeys() {
    return {
      0: ["cleanComplete"], 1: ["timeMinimum"], 2: ["timeMinimum", "stableTemperature", "phInRecipe", "conversionConfirmed"],
      3: ["timeMinimum", "routeReady"], 4: ["timeMinimum", "stableTemperature"], 5: ["coolerOk", "destinationAvailable"],
      6: ["timeMinimum", "stableTemperature", "pressureOk", "densityStable"], 7: ["destinationAvailable", "routeReady"],
      8: ["cleanComplete"], 9: ["timeMinimum", "stableTemperature", "turbidityOk"], 10: ["routeReady", "turbidityOk"],
      11: ["timeMinimum", "cleanComplete"]
    }[this.activeStage] || [];
  }

  currentStep() { return this.steps[this.activeStage]; }
  currentEquipment() {
    const step = this.currentStep();
    if (!step) return null;
    let tag = step.equipment;
    if (tag === "TF") tag = this.activeBatch?.fermenter;
    if (tag === "TM") tag = this.activeBatch?.maturation;
    return this.equipment.get(tag);
  }

  applyStage() {
    [...this.equipment.values()].forEach(e => {
      if (e.status === "Operando") e.status = e.batchId ? "Reservado" : "Disponible";
    });
    const equipment = this.currentEquipment();
    if (equipment) {
      equipment.status = "Operando";
      equipment.batchId ||= this.activeBatch.id;
    }
    this.activeBatch.stage = this.currentStep()?.name || "Completado";
    if (this.activeStage === 6) {
      const tf = this.equipment.get(this.activeBatch.fermenter);
      tf.level = 92; tf.pressure = .8; tf.density = 1.05;
    }
    if (this.activeStage === 7) {
      const tf = this.equipment.get(this.activeBatch.fermenter);
      const tm = this.equipment.get(this.activeBatch.maturation);
      tf.level = 0; tf.clean = false; tf.status = "Sucio";
      tm.level = 90; tm.status = "Operando";
    }
    if (this.activeStage === 10) {
      const tm = this.equipment.get(this.activeBatch.maturation);
      tm.level = 20;
    }
    this.updateStepStatus();
  }

  updateProcessValues() {
    const recipe = this.config.recipes[this.activeBatch.recipe];
    const ratio = Math.min(1, this.stageProgress / this.config.simulation.secondsPerStage);
    const current = this.currentEquipment();
    if (current) current.level = Math.round(this.activeStage === 11 ? 90 * (1 - ratio) : Math.min(92, 12 + ratio * 80));
    const jitter = magnitude => (Math.random() - .5) * magnitude;
    const t3 = this.equipment.get("T3");
    const t5 = this.equipment.get("T5");
    const ic1 = this.equipment.get("IC1");
    t3.temperature = +(20 + (recipe.mashTemp - 20) * (this.activeStage >= 2 ? Math.min(1, ratio * 1.6) : 0) + jitter(.3)).toFixed(1);
    t3.ph = +(recipe.mashPh + jitter(.05)).toFixed(2);
    t5.temperature = +(20 + (recipe.boilTemp - 20) * (this.activeStage >= 4 ? Math.min(1, ratio * 1.7) : 0) + jitter(.4)).toFixed(1);
    ic1.temperature = +(80 - (80 - recipe.coolerMax + 1) * (this.activeStage >= 5 ? Math.min(1, ratio * 1.8) : 0) + jitter(.3)).toFixed(1);
    const tf = this.equipment.get(this.activeBatch.fermenter);
    const tm = this.equipment.get(this.activeBatch.maturation);
    if (this.activeStage >= 6) {
      tf.temperature = +(recipe.fermentationTemp + jitter(.25)).toFixed(1);
      tf.pressure = +(.8 + (recipe.fermentationPressure - .8) * ratio + jitter(.03)).toFixed(2);
      tf.density = +(1.05 - (1.05 - recipe.finalDensity) * ratio + jitter(.0006)).toFixed(3);
    }
    if (this.activeStage >= 9) {
      tm.temperature = +(recipe.maturationTemp + jitter(.18)).toFixed(1);
      tm.pressure = +(recipe.maturationPressure + jitter(.03)).toFixed(2);
      tm.turbidity = +(2.4 - (2.4 - recipe.turbidityMax + .15) * ratio + jitter(.05)).toFixed(2);
    }
    this.equipment.get("T7").turbidity = +(2 - 1.35 * ratio + jitter(.05)).toFixed(2);
  }

  updateStepStatus() {
    this.steps.forEach((step, index) => step.status = index < this.activeStage ? "complete" : index === this.activeStage ? "active" : "pending");
  }

  completeBatch() {
    const batch = this.activeBatch;
    batch.status = "Completado"; batch.stage = "Completado";
    [batch.fermenter, batch.maturation].forEach(tag => {
      const equipment = this.equipment.get(tag);
      equipment.status = "Sucio"; equipment.clean = false; equipment.level = 0; equipment.batchId = null;
    });
    this.running = false; this.activeBatch = null; this.stageProgress = 0;
    this.log(`Lote ${batch.id} completado · equipos pendientes de CIP`);
    this.updateStepStatus(); this.persist(); this.emitState();
  }

  markClean(tags) {
    tags.forEach(tag => {
      const equipment = this.equipment.get(tag);
      if (equipment) { equipment.clean = true; equipment.status = equipment.batchId ? "Reservado" : "Disponible"; }
    });
    this.log(`CIP completado: ${tags.join(", ")}`);
    this.emitState();
  }

  startTimer() {
    if (this.interval) return;
    this.interval = setInterval(() => this.tick(), this.config.simulation.tickMs);
  }

  reject(message) { this.bus.emit("rejected", message); return false; }
  log(message) {
    const event = { time: new Date().toISOString(), message };
    this.events.unshift(event); this.events = this.events.slice(0, 30);
    storage.write("dagoca-events", this.events);
    this.bus.emit("event", event);
  }
  persist() { storage.write("dagoca-batches", this.batches); }
  emitState() { this.updateStepStatus(); this.persist(); this.bus.emit("state", this.snapshot()); }
  snapshot() { return { running: this.running, emergency: this.emergency, mode: this.mode, activeBatch: this.activeBatch, activeStage: this.activeStage, stageProgress: this.stageProgress, conditions: this.conditions }; }
}
