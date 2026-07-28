const STORAGE_SCHEMA_VERSION = 3;
const fermenterTags = Object.freeze(["TK-006A", "TK-006B", "TK-006C", "TK-006D", "TK-006E"]);
const maturationTags = Object.freeze(["TK-008A", "TK-008B", "TK-008C", "TK-008D", "TK-008E", "TK-008F", "TK-008G", "TK-008H", "TK-008I", "TK-008J"]);

const newTankInstrumentProfiles = Object.freeze({
  "TK-006C": { temperature: 128, high: 129, low: 130, cip: "YV-002A" },
  "TK-006D": { temperature: 131, high: 132, low: 133, cip: "YV-002B" },
  "TK-006E": { temperature: 134, high: 135, low: 136, cip: "YV-002C" },
  "TK-008E": { temperature: 137, high: 138, low: 139, cip: "YV-002D" },
  "TK-008F": { temperature: 140, high: 141, low: 142, cip: "YV-002E" },
  "TK-008G": { temperature: 143, high: 144, low: 145, cip: "YV-002F" },
  "TK-008H": { temperature: 146, high: 147, low: 148, cip: "YV-002G" },
  "TK-008I": { temperature: 149, high: 150, low: 151, cip: "YV-002H" },
  "TK-008J": { temperature: 152, high: 153, low: 154, cip: "YV-002I" }
});

const existingTankControlValves = Object.freeze({
  "TK-006A": "LV-111", "TK-006B": "LV-111",
  "TK-008A": "TV-113", "TK-008B": "TV-116", "TK-008C": "TV-119", "TK-008D": "TV-122"
});

function tankInstrumentTags(tag) {
  const profile = newTankInstrumentProfiles[tag];
  if (!profile) return [];
  return [
    `TE-${profile.temperature}`, `TT-${profile.temperature}`, `TC-${profile.temperature}`, `TV-${profile.temperature}`, `PI-${profile.temperature}`,
    `LSH-${profile.high}`, `LC-${profile.high}`, `LY-${profile.high}`, `LV-${profile.high}`,
    `LSL-${profile.low}`, `LC-${profile.low}`, `LY-${profile.low}`, `LV-${profile.low}`, profile.cip
  ];
}

function tankControlValve(tag) {
  const profile = newTankInstrumentProfiles[tag];
  return existingTankControlValves[tag] || (profile ? `TV-${profile.temperature}` : null);
}

const addedTrendTags = Object.fromEntries(Object.entries(newTankInstrumentProfiles).flatMap(([tag, profile]) => [
  [`TT-${profile.temperature}`, { label: `Temperatura ${tag}`, unit: "°C", setpoint: tag.startsWith("TK-006") ? 18 : 3, low: 0, high: tag.startsWith("TK-006") ? 22 : 6 }],
  [`PI-${profile.temperature}`, { label: `Presión ${tag}`, unit: "bar", setpoint: tag.startsWith("TK-006") ? 1.15 : 1, low: 0, high: 1.6 }]
]));

const demoConfig = {
  plant: { fermenters: 5, maturationTanks: 10, annualCapacityHl: 500, batchVolumeL: 481 },
  recipes: recipeBlueprints,
  simulation: { tickMs: 1000, secondsPerStage: 9, stableWindow: 3 },
  tags: {
    "TT-105": { label: "Temperatura de maceración", unit: "°C", setpoint: 66, low: 62, high: 72 },
    "AIT-105": { label: "pH de maceración · valor simulado", unit: "pH", setpoint: 5.3, low: 5.1, high: 5.6 },
    "TT-107": { label: "Temperatura de cocción", unit: "°C", setpoint: 100, low: 96, high: 104 },
    "TT-109": { label: "Temperatura de salida de E-001", unit: "°C", setpoint: 18, low: 14, high: 34.9 },
    "TT-111": { label: "Temperatura de fermentación", unit: "°C", setpoint: 18, low: 15, high: 22 },
    "PT-111": { label: "Presión de fermentación", unit: "bar", setpoint: 1.15, low: .7, high: 1.6 },
    "AIT-111": { label: "Densidad de fermentación · simulada", unit: "SG", setpoint: 1.012, low: 1.006, high: 1.06 },
    "TT-113": { label: "Temperatura TK-008A", unit: "°C", setpoint: 3, low: 0, high: 6 },
    "TT-116": { label: "Temperatura TK-008B", unit: "°C", setpoint: 3, low: 0, high: 6 },
    "TT-119": { label: "Temperatura TK-008C", unit: "°C", setpoint: 3, low: 0, high: 6 },
    "TT-122": { label: "Temperatura TK-008D", unit: "°C", setpoint: 3, low: 0, high: 6 },
    "AIT-125": { label: "Turbidez de TK-007 · valor simulado", unit: "NTU", setpoint: .8, low: 0, high: 1.2 },
    "PDT-125": { label: "Presión diferencial TK-007 · valor simulado", unit: "bar", setpoint: .3, low: 0, high: .8 },
    ...addedTrendTags
  }
};

class EventBus extends EventTarget {
  emit(name, detail) { this.dispatchEvent(new CustomEvent(name, { detail })); }
  on(name, handler) { this.addEventListener(name, event => handler(event.detail)); }
}

class Equipment {
  constructor(tag, name, type = "tank", options = {}) {
    Object.assign(this, {
      tag, name, type, service: name, status: "Disponible",
      level: 0, temperature: 20, setpoint: null, pressure: 0, pressureIn: null, pressureOut: null,
      differentialPressure: null, ph: null, density: null, densitySamples: [], turbidity: null,
      turbidityIn: null, clean: true, closed: true, maintenance: false, maintenanceStatus: "DISPONIBLE",
      batchId: null, recipe: null, cipStatus: "LIMPIO", operatingHours: 0, starts: 0,
      lastMaintenance: "Pendiente", nextMaintenance: "Pendiente", quality: signalQuality.SIMULATED,
      instruments: [], history: []
    }, options);
  }
  get available() { return !this.batchId && this.clean && this.closed && !this.maintenance && !["En limpieza", "Alarma", "Fuera de servicio"].includes(this.status); }
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

class Sensor {
  constructor(tag, variable, unit, status = "PENDIENTE DE SELECCIÓN") {
    Object.assign(this, { tag, variable, unit, status, quality: signalQuality.SIMULATED });
  }
}

class Batch {
  constructor({ id, product, recipe, parameters, parameterLimits, volume, fermenter, maturation, operator = "Operador 01" }) {
    const commercialProfile = product || recipe;
    Object.assign(this, {
      id,
      product: commercialProfile,
      recipe: recipe || commercialProfile,
      parameters: cloneOperatingParameters(parameters, parameterLimits),
      volume: Number(volume),
      fermenter,
      maturation,
      operator,
      stage: "Preparado",
      stageIndex: -1,
      startedAt: null,
      elapsed: 0,
      status: "Programado",
      createdAt: new Date().toISOString(),
      sequenceId: "DAGOCA-BATCH-V1"
    });
  }
}

class SequenceStep {
  constructor(code, name, group, conditions = []) {
    Object.assign(this, { code, name, group, conditions, status: "pending" });
  }
}

const stageDefinitions = [
  { code: "CIP_INITIAL", name: "Limpieza inicial", group: "preparation", equipment: "CIP-01", conditions: ["Ciclo completo", "Ruta drenada"] },
  { code: "WATER_PREPARATION", name: "Filtrado y almacenamiento de agua", group: "brewhouse", equipment: "TK-001", conditions: ["TK-002 habilitado", "Volumen objetivo alcanzado"] },
  { code: "MASHING", name: "Maceración", group: "brewhouse", equipment: "TK-003", conditions: ["Tiempo mínimo", "Temperatura estable", "Adición de malta confirmada"] },
  { code: "PRIMARY_FILTRATION", name: "Filtrado I", group: "brewhouse", equipment: "TK-004", conditions: ["Ruta compatible", "TK-005 disponible"] },
  { code: "BOILING", name: "Cocción", group: "brewhouse", equipment: "TK-005", conditions: ["Tiempo mínimo", "Temperatura estable", "Adición de lúpulo confirmada"] },
  { code: "COOLING", name: "Enfriamiento", group: "cold", equipment: "E-001", conditions: ["Salida menor de 35 °C", "Fermentador disponible"] },
  { code: "FERMENTATION", name: "Fermentación", group: "cellar", equipment: "FERMENTER", conditions: ["Tiempo mínimo", "Temperatura correcta", "Presión correcta", "Densidad estable", "Madurador disponible"] },
  { code: "MATURATION", name: "Maduración", group: "cellar", equipment: "MATURATION", conditions: ["Tiempo mínimo", "Temperatura estable", "TK-007 disponible"] },
  { code: "FINAL_FILTRATION", name: "Filtrado final", group: "cellar", equipment: "TK-007", conditions: ["Ruta compatible", "Turbidez dentro de límite", "Embotellado disponible"] },
  { code: "PACKAGING", name: "Transferencia a embotellado", group: "packaging", equipment: "EMB-01", conditions: ["Transferencia completa", "Ruta drenada"] }
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
    const savedSettings = storage.read("dagoca-config", {});
    Object.assign(this.config.plant, {
      fermenters: 5,
      maturationTanks: 10
    });
    if (Number(savedSettings.stageSeconds)) this.config.simulation.secondsPerStage = Number(savedSettings.stageSeconds);
    this.mode = storage.read("dagoca-mode", "auto");
    this.running = false;
    this.emergency = false;
    this.stepMode = false;
    this.stageProgress = 0;
    this.controlTimer = { phase: "En espera", elapsedSimulationSeconds: 0, realDurationMinutes: 0 };
    this.conditions = {};
    this.events = storage.read("dagoca-events", []);
    const savedBatches = storage.read("dagoca-batches", []);
    const storedSchemaMarker = storage.read("dagoca-storage-schema", null);
    const storedSchemaVersion = Number(storedSchemaMarker == null && savedBatches.length ? 1 : storedSchemaMarker ?? STORAGE_SCHEMA_VERSION);
    let storageMigrated = storedSchemaVersion < STORAGE_SCHEMA_VERSION;
    this.batches = savedBatches.map(item => {
      const batch = Object.assign(new Batch({
        ...item,
        product: item.product || item.recipe,
        parameters: sanitizeOperatingParameters(item.parameters, baseOperatingParameters, this.config.engineeringLimits),
        parameterLimits: this.config.engineeringLimits
      }), item);
      batch.product ||= batch.recipe;
      batch.recipe ||= batch.product;
      batch.parameters = cloneOperatingParameters(batch.parameters, this.config.engineeringLimits);
      batch.volume = Number.isFinite(Number(batch.volume)) && Number(batch.volume) >= 50 && Number(batch.volume) <= 600 ? Number(batch.volume) : 481;
      batch.sequenceId = "DAGOCA-BATCH-V1";
      const legacy = { Preparado: "Programado", "En proceso": "EN PREPARACIÓN", Completado: "FINALIZADO", Cancelado: "CANCELADO" };
      batch.status = legacy[batch.status] || batch.status;
      const legacyDestinations = {
        "TF-01": "TK-006A", "TF-02": "TK-006B",
        "TM-01": "TK-008A", "TM-02": "TK-008B", "TM-03": "TK-008C", "TM-04": "TK-008D"
      };
      batch.fermenter = legacyDestinations[batch.fermenter] || batch.fermenter;
      batch.maturation = legacyDestinations[batch.maturation] || batch.maturation;
      const parsedStageIndex = Number(batch.stageIndex ?? -1);
      const oldStageIndex = Number.isInteger(parsedStageIndex) ? parsedStageIndex : -1;
      if (storedSchemaVersion < 2 && !["FINALIZADO", "Completado", "CANCELADO", "Cancelado"].includes(batch.status)) {
        batch.stageIndex = oldStageIndex === 7 || oldStageIndex === 8 ? 7 : oldStageIndex;
        if (oldStageIndex === 7 || oldStageIndex === 8) {
          batch.stage = "Maduración";
          batch.status = "EN MADURACIÓN";
        }
      } else {
        batch.stageIndex = oldStageIndex;
      }
      batch.stageIndex = Math.min(batch.stageIndex, stageDefinitions.length - 1);
      batch.sequenceVersion = STORAGE_SCHEMA_VERSION;
      return batch;
    });
    if (storageMigrated) {
      storage.write("dagoca-batches", this.batches);
      storage.write("dagoca-storage-schema", STORAGE_SCHEMA_VERSION);
      this.events.unshift({ time: new Date().toISOString(), message: "Estado local migrado a esquema v3: perfiles comerciales y parámetros operacionales por lote" });
      this.events = this.events.slice(0, 30);
      storage.write("dagoca-events", this.events);
    } else if (storedSchemaMarker == null) {
      storage.write("dagoca-storage-schema", STORAGE_SCHEMA_VERSION);
    }
    this.activeBatch = this.batches.find(batch => batch.stageIndex >= 0 && !["FINALIZADO", "Completado", "CANCELADO", "Cancelado"].includes(batch.status)) || null;
    this.equipment = this.createEquipment();
    this.restoreEquipmentState();
    this.restoreReservations();
    this.steps = stageDefinitions.map(step => new SequenceStep(step.code, step.name, step.group, step.conditions));
    this.interval = null;
    if (storageMigrated) {
      this.normalizeMigratedProcessState();
      this.persist();
    }
    this.updateStepStatus();
  }

  createEquipment() {
    const items = [
      new Equipment("TK-001", "Filtrado de agua", "filter", {
        status: "Disponible",
        instruments: [new Sensor("LSL-100", "Nivel bajo", "%"), new Sensor("LSH-100", "Nivel alto", "%"), new Sensor("LC-100", "Control de nivel", "%")]
      }),
      new Tank("TK-002", "Almacenamiento de agua", {
        temperature: 18,
        instruments: [new Sensor("LSL-100", "Nivel bajo", "%"), new Sensor("LSH-100", "Nivel alto", "%"), new Sensor("LY-100", "Relé de nivel", "")]
      }),
      new Tank("TK-003", "Maceración", {
        ph: 5.3,
        setpoint: 66,
        instruments: [new Sensor("LSL-104", "Nivel bajo", "%"), new Sensor("LSH-104", "Nivel alto", "%"), new Sensor("TE-105", "Elemento de temperatura", "°C"), new Sensor("TT-105", "Temperatura", "°C"), new Sensor("TC-105", "Control de temperatura", "°C")]
      }),
      new Equipment("TK-004", "Filtrado I", "filter", {
        instruments: [new Sensor("LSL-106", "Nivel bajo", "%"), new Sensor("LSH-106", "Nivel alto", "%"), new Sensor("LC-106", "Control de nivel", "%"), new Sensor("PI-106", "Presión", "bar")]
      }),
      new Tank("TK-005", "Cocción", {
        temperature: 20,
        setpoint: 100,
        instruments: [new Sensor("LSL-108", "Nivel bajo", "%"), new Sensor("TE-107", "Elemento de temperatura", "°C"), new Sensor("TT-107", "Temperatura", "°C"), new Sensor("TC-107", "Control de temperatura", "°C")]
      }),
      new Equipment("E-001", "Intercambiador de calor", "cooler", {
        temperature: 18,
        temperatureIn: 80,
        setpoint: 18,
        instruments: [new Sensor("TT-109", "Temperatura de salida", "°C"), new Sensor("TC-109", "Control de temperatura", "°C"), new Sensor("TV-109", "Válvula de agua fría", "%"), new Sensor("PI-109", "Presión", "bar")]
      }),
      new Equipment("TK-007", "Tanque de filtrado final", "filter", {
        turbidity: .7, turbidityIn: 2.4, pressureIn: 1.5, pressureOut: 1.2, differentialPressure: .3,
        instruments: [new Sensor("LSH-125", "Nivel alto", "%"), new Sensor("LSL-125", "Nivel bajo", "%"), new Sensor("LC-125", "Control de nivel", "%"), new Sensor("LY-125", "Relé de nivel", "")]
      }),
      new Equipment("EMB-01", "Embotellado", "bottling"),
      new Equipment("CIP-01", "Estación CIP", "cip"),
      new Pump("P-000"), new Pump("P-001"), new Pump("P-002"), new Pump("P-003"), new Pump("P-004"),
      new Equipment("AG1", "Agitador TK-003", "agitator", { status: "Detenido" }),
      new Valve("LV-100"), new Valve("LV-104"), new Valve("TV-105"), new Valve("TV-107"), new Valve("TV-109"), new Valve("LV-108"), new Valve("LV-111"),
      new Valve("LV-125"), new Valve("TV-113"), new Valve("TV-116"), new Valve("TV-119"), new Valve("TV-122")
    ];
    fermenterTags.slice(0, this.config.plant.fermenters).forEach((tag, index) => {
      const profile = newTankInstrumentProfiles[tag];
      const instruments = profile ? this.createNewTankSensors(profile) : [
        new Sensor(index ? "LSL-110" : "LSL-112", "Nivel bajo", "%"),
        new Sensor(index ? "LSH-108" : "LSH-111", "Nivel alto", "%"),
        new Sensor("TT-111", "Temperatura", "°C"), new Sensor("TC-111", "Control de temperatura", "°C"),
        new Sensor("PT-111", "Presión", "bar"), new Sensor("AIT-111", "Densidad", "SG", "PARÁMETRO PRELIMINAR — PENDIENTE DE VALIDACIÓN")
      ];
      items.push(new Tank(tag, `Fermentador ${String.fromCharCode(65 + index)}`, {
        density: 1.05, pressure: 0, temperature: 18, setpoint: 18, instruments
      }));
      if (profile) this.createNewTankValves(profile).forEach(valve => items.push(valve));
    });
    const temperatureLoops = ["113", "116", "119", "122"];
    maturationTags.slice(0, this.config.plant.maturationTanks).forEach((tag, index) => {
      const profile = newTankInstrumentProfiles[tag];
      const instruments = profile ? this.createNewTankSensors(profile) : [
        new Sensor(`TT-${temperatureLoops[index]}`, "Temperatura", "°C"),
        new Sensor(`TC-${temperatureLoops[index]}`, "Control de temperatura", "°C"),
        new Sensor(`PI-${temperatureLoops[index]}`, "Presión", "bar")
      ];
      items.push(new Tank(tag, `Maduración ${String.fromCharCode(65 + index)}`, {
        pressure: 0, temperature: 3, setpoint: 3, instruments
      }));
      if (profile) this.createNewTankValves(profile).forEach(valve => items.push(valve));
    });
    return new Map(items.map(item => [item.tag, item]));
  }

  createNewTankSensors(profile) {
    return [
      new Sensor(`TE-${profile.temperature}`, "Elemento de temperatura", "°C"),
      new Sensor(`TT-${profile.temperature}`, "Temperatura", "°C"),
      new Sensor(`TC-${profile.temperature}`, "Control de enfriamiento", "°C"),
      new Sensor(`TV-${profile.temperature}`, "Válvula de agua fría", "%"),
      new Sensor(`PI-${profile.temperature}`, "Presión", "bar"),
      new Sensor(`LSH-${profile.high}`, "Nivel alto", "%"), new Sensor(`LC-${profile.high}`, "Control de nivel alto/entrada", "%"),
      new Sensor(`LY-${profile.high}`, "Relé de nivel alto/entrada", ""), new Sensor(`LV-${profile.high}`, "Válvula de entrada", "%"),
      new Sensor(`LSL-${profile.low}`, "Nivel bajo", "%"), new Sensor(`LC-${profile.low}`, "Control de nivel bajo/salida", "%"),
      new Sensor(`LY-${profile.low}`, "Relé de nivel bajo/salida", ""), new Sensor(`LV-${profile.low}`, "Válvula de salida", "%"),
      new Sensor(profile.cip, "Válvula CIP", "")
    ];
  }

  createNewTankValves(profile) {
    return [new Valve(`TV-${profile.temperature}`), new Valve(`LV-${profile.high}`), new Valve(`LV-${profile.low}`), new Valve(profile.cip)];
  }

  restoreReservations() {
    this.batches.filter(batch => !["FINALIZADO", "Completado", "CANCELADO", "Cancelado"].includes(batch.status)).forEach(batch => {
      [batch.fermenter, batch.maturation].forEach(tag => {
        const equipment = this.equipment.get(tag);
        if (equipment) { equipment.batchId = batch.id; equipment.status = batch.status === "En proceso" ? "Reservado" : "Asignado"; }
      });
    });
  }

  restoreEquipmentState() {
    const saved = storage.read("dagoca-equipment", {});
    const legacyTags = {
      T1: "TK-001", T2: "TK-002", T3: "TK-003", T4: "TK-004", T5: "TK-005", IC1: "E-001", T7: "TK-007",
      B1: "P-001", B2: "P-002", B3: "P-003",
      "TF-01": "TK-006A", "TF-02": "TK-006B",
      "TM-01": "TK-008A", "TM-02": "TK-008B", "TM-03": "TK-008C", "TM-04": "TK-008D"
    };
    Object.entries(saved).forEach(([tag, state]) => {
      const equipment = this.equipment.get(legacyTags[tag] || tag);
      if (!equipment || !state || typeof state !== "object") return;
      const safe = { ...state };
      ["level", "temperature", "pressure", "ph", "density", "turbidity", "operatingHours", "starts"].forEach(key => {
        if (key in safe && !Number.isFinite(Number(safe[key]))) delete safe[key];
        else if (key in safe) safe[key] = Number(safe[key]);
      });
      if ("level" in safe) safe.level = Math.max(0, Math.min(100, safe.level));
      Object.assign(equipment, safe);
    });
  }

  normalizeMigratedProcessState() {
    if (!this.activeBatch || this.activeBatch.stageIndex !== 7) return;
    const fermenter = this.equipment.get(this.activeBatch.fermenter);
    const maturation = this.equipment.get(this.activeBatch.maturation);
    const finalFilter = this.equipment.get("TK-007");
    if (fermenter) {
      fermenter.level = 0;
      fermenter.clean = false;
      fermenter.status = "Sucio";
    }
    if (maturation) {
      maturation.level = 90;
      maturation.batchId = this.activeBatch.id;
      maturation.status = "Reservado";
    }
    if (finalFilter) {
      finalFilter.level = 0;
      finalFilter.batchId = null;
      finalFilter.status = finalFilter.maintenance ? "En mantenimiento" : finalFilter.clean ? "Disponible" : "Sucio";
    }
  }

  get tanks() { return [...this.equipment.values()].filter(item => item.type === "tank"); }
  get availableFermenters() { return this.tanks.filter(item => item.tag.startsWith("TK-006") && item.available); }
  get availableMaturation() { return this.tanks.filter(item => item.tag.startsWith("TK-008") && item.available); }
  get activeStage() { return this.activeBatch?.stageIndex ?? -1; }

  createBatch(data) {
    if (this.batches.some(batch => batch.id === data.id)) throw new Error("El ID del lote ya existe.");
    const tf = this.equipment.get(data.fermenter);
    const tm = this.equipment.get(data.maturation);
    if (!tf?.available) throw new Error("El fermentador no está disponible, limpio y cerrado.");
    if (!tm?.available) throw new Error("El tanque de maduración no está disponible, limpio y cerrado.");
    if (!productProfiles[data.product || data.recipe]) throw new Error("Seleccione uno de los tres perfiles de producto activos.");
    const limits = this.config.engineeringLimits || sanitizeEngineeringLimits();
    const errors = validateOperatingParameters(data.parameters || data, limits);
    if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
    const batch = new Batch({
      ...data,
      product: data.product || data.recipe,
      recipe: data.product || data.recipe,
      parameters: sanitizeOperatingParameters(data.parameters || data, baseOperatingParameters, limits),
      parameterLimits: limits
    });
    this.batches.unshift(batch);
    tf.batchId = batch.id; tf.status = "Reservado";
    tm.batchId = batch.id; tm.status = "Reservado";
    this.log(`Lote ${batch.id} creado · ${batch.product} · SP maceración ${batch.parameters.mashTemp} °C · cocción ${batch.parameters.boilTemp} °C · E-001 ${batch.parameters.coolerOutletTemp} °C · maduración ${batch.parameters.maturationDays} días`);
    this.persist();
    this.bus.emit("batch", batch);
    return batch;
  }

  updateBatchProduct(batchId, product) {
    const batch = this.batches.find(item => item.id === batchId);
    if (!batch) throw new Error("Lote no encontrado.");
    if (batch.startedAt || batch.stageIndex >= 0) throw new Error("El producto queda bloqueado al iniciar el lote.");
    if (!productProfiles[product]) throw new Error("Perfil de producto no válido.");
    batch.product = product;
    batch.recipe = product;
    this.persist();
    return batch;
  }

  effectiveSetpoint(tag) {
    const parameters = this.activeBatch?.parameters || baseOperatingParameters;
    const mapping = {
      "TT-105": "mashTemp",
      "TT-107": "boilTemp",
      "TT-109": "coolerOutletTemp",
      "TT-111": "fermentationTemp",
      "TT-113": "maturationTemp",
      "TT-116": "maturationTemp",
      "TT-119": "maturationTemp",
      "TT-122": "maturationTemp"
    };
    const profile = Object.entries(newTankInstrumentProfiles).find(([, item]) => tag === `TT-${item.temperature}`);
    const key = profile ? (profile[0].startsWith("TK-006") ? "fermentationTemp" : "maturationTemp") : mapping[tag];
    return key ? parameters[key] : this.config.tags[tag]?.setpoint;
  }

  start() {
    if (this.emergency) return this.reject("Resetee la parada de emergencia antes de iniciar.");
    if (this.mode === "maintenance") return this.reject("Modo mantenimiento activo. La secuencia automática está bloqueada.");
    if (!this.activeBatch) {
      this.activeBatch = this.batches.find(batch => ["Preparado", "Programado"].includes(batch.status));
      if (!this.activeBatch) return this.reject("Cree un lote antes de iniciar la producción.");
      this.activeBatch.status = "EN PREPARACIÓN";
      this.activeBatch.startedAt ||= new Date().toISOString();
      this.activeBatch.stageIndex = Math.max(0, this.activeBatch.stageIndex);
    }
    const current = this.currentEquipment();
    if (current && (!current.clean || current.status === "En limpieza")) return this.reject(`${current.tag} está sucio o en limpieza. Interlock activo.`);
    this.running = true;
    this.stageProgress = 0;
    this.controlTimer = { phase: "Aceleración de etapa", elapsedSimulationSeconds: 0, realDurationMinutes: this.realStageDurationMinutes() };
    this.applyStage();
    this.log(`Secuencia iniciada en ${this.currentStep().name}`);
    this.startTimer();
    this.emitState();
    return true;
  }

  stop() {
    if (!this.running) return this.reject("La secuencia ya está detenida.");
    this.running = false;
    [...this.equipment.values()].filter(e => e.type === "pump").forEach(p => p.status = "Detenida");
    [...this.equipment.values()].filter(e => e.type === "valve").forEach(v => { v.position = "Cerrada"; v.status = "Disponible"; });
    this.log("Parada controlada completada: transferencias inhibidas, bombas detenidas y válvulas cerradas");
    this.emitState();
    return true;
  }

  triggerEmergency() {
    this.emergency = true; this.running = false;
    [...this.equipment.values()].filter(e => e.type === "pump").forEach(p => p.status = "Detenida");
    [...this.equipment.values()].filter(e => e.type === "valve").forEach(v => { v.position = "Cerrada"; v.status = "Disponible"; });
    const agitator = this.equipment.get("AG1");
    if (agitator) agitator.status = "Detenido";
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

  resetSequence() {
    if (!this.activeBatch) return this.reject("No hay una secuencia activa para reiniciar.");
    this.running = false;
    this.activeBatch.stageIndex = 0;
    this.activeBatch.stage = this.steps[0].name;
    this.stageProgress = 0;
    this.controlTimer = { phase: "Aceleración de etapa", elapsedSimulationSeconds: 0, realDurationMinutes: this.realStageDurationMinutes() };
    this.conditions = {};
    this.applyStage();
    this.log(`Secuencia del lote ${this.activeBatch.id} reiniciada`);
    this.emitState();
    return true;
  }

  setMode(mode) {
    this.mode = mode;
    storage.write("dagoca-mode", mode);
    const labels = { auto: "Automático", manual: "Manual", maintenance: "Mantenimiento", simulation: "Simulación" };
    if (mode === "maintenance") this.running = false;
    this.log(`Modo de operación: ${labels[mode] || mode}`);
    this.emitState();
  }

  tick() {
    if (!this.running || !this.activeBatch || this.emergency) return;
    this.activeBatch.elapsed++;
    this.stageProgress++;
    this.updateControlTimer();
    this.updateProcessValues();
    this.updateConditions();
    if (this.mode === "auto" && !this.stepMode && this.canAdvance()) this.advance();
    this.emitState();
  }

  updateConditions() {
    const ratio = this.stageProgress / this.config.simulation.secondsPerStage;
    const index = this.activeStage;
    const parameters = this.activeBatch?.parameters || baseOperatingParameters;
    const timeThreshold = index === 2
      ? (parameters.mashMinutes === 0 ? .58 : .85)
      : index === 4
        ? (parameters.boilMinutes === 0 ? .58 : .78)
        : .72;
    this.conditions = {
      timeMinimum: ratio >= timeThreshold,
      stableTemperature: ratio >= .58,
      postBoilWaitComplete: index !== 4 || ratio >= (parameters.postBoilWaitMinutes === 0 ? timeThreshold : .92),
      phInRecipe: index !== 2 || ratio >= .48,
      conversionConfirmed: index !== 2 || ratio >= .68,
      coolerOk: index !== 5 || (ratio >= .62 && this.equipment.get("E-001").temperature < 35),
      destinationAvailable: Boolean(this.equipment.get(this.activeBatch.fermenter)?.closed),
      maturationAvailable: Boolean(this.equipment.get(this.activeBatch.maturation)?.closed),
      finalFilterAvailable: Boolean(this.equipment.get("TK-007")?.available || this.equipment.get("TK-007")?.batchId === this.activeBatch.id),
      packagingAvailable: Boolean(this.equipment.get("EMB-01") && !this.equipment.get("EMB-01").maintenance),
      pressureOk: ratio >= .5,
      densityStable: index !== 6 || isDensityStable(this.equipment.get(this.activeBatch.fermenter)?.densitySamples || [], .0015, this.config.simulation.stableWindow),
      turbidityOk: index !== 8 || ratio >= .75,
      routeReady: ratio >= .55,
      cleanComplete: ratio >= .76
    };
  }

  canAdvance() {
    const i = this.activeStage;
    const c = this.conditions;
    const rules = {
      0: c.cleanComplete, 1: c.timeMinimum, 2: c.timeMinimum && c.stableTemperature && c.phInRecipe && c.conversionConfirmed,
      3: c.timeMinimum && c.routeReady, 4: c.timeMinimum && c.stableTemperature && c.postBoilWaitComplete,
      5: c.coolerOk && c.destinationAvailable,
      6: c.timeMinimum && c.stableTemperature && c.pressureOk && c.densityStable && c.maturationAvailable,
      7: c.timeMinimum && c.stableTemperature && c.finalFilterAvailable,
      8: c.routeReady && c.turbidityOk && c.packagingAvailable,
      9: c.timeMinimum && c.cleanComplete
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
      ["postBoilWaitComplete", "espera posterior a cocción no cumplida"],
      ["phInRecipe", "pH fuera de receta"], ["conversionConfirmed", "conversión de almidón no confirmada"],
      ["coolerOk", "temperatura de salida de E-001 igual o superior a 35 °C"], ["destinationAvailable", "fermentador de destino no disponible"],
      ["maturationAvailable", "tanque de maduración no disponible"],
      ["finalFilterAvailable", "TK-007 no está disponible, limpio y cerrado"],
      ["packagingAvailable", "línea de embotellado no disponible"],
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
      3: ["timeMinimum", "routeReady"], 4: ["timeMinimum", "stableTemperature", "postBoilWaitComplete"], 5: ["coolerOk", "destinationAvailable"],
      6: ["timeMinimum", "stableTemperature", "pressureOk", "densityStable", "maturationAvailable"],
      7: ["timeMinimum", "stableTemperature", "finalFilterAvailable"],
      8: ["routeReady", "turbidityOk", "packagingAvailable"],
      9: ["timeMinimum", "cleanComplete"]
    }[this.activeStage] || [];
  }

  currentStep() { return this.steps[this.activeStage]; }
  realStageDurationMinutes() {
    const p = this.activeBatch?.parameters || baseOperatingParameters;
    return { 2: p.mashMinutes, 4: p.boilMinutes + p.postBoilWaitMinutes, 7: p.maturationDays * 1440 }[this.activeStage] || null;
  }

  updateControlTimer() {
    const ratio = this.stageProgress / this.config.simulation.secondsPerStage;
    const p = this.activeBatch?.parameters || baseOperatingParameters;
    let phase = "Aceleración de etapa";
    let realDurationMinutes = this.realStageDurationMinutes();
    if (this.activeStage === 2) phase = ratio < .58 ? "Alcanzando SP" : "Permanencia de maceración";
    if (this.activeStage === 4) phase = ratio < .58 ? "Alcanzando SP" : ratio < .78 ? "Tiempo de cocción" : "Espera posterior";
    if (this.activeStage === 4 && ratio >= .78) realDurationMinutes = p.postBoilWaitMinutes;
    this.controlTimer = { phase, elapsedSimulationSeconds: this.stageProgress, realDurationMinutes };
  }
  currentEquipment() {
    const step = this.currentStep();
    if (!step) return null;
    let tag = step.equipment;
    if (tag === "FERMENTER") tag = this.activeBatch?.fermenter;
    if (tag === "MATURATION") tag = this.activeBatch?.maturation;
    return this.equipment.get(tag);
  }

  applyStage() {
    const parameters = this.activeBatch?.parameters;
    if (parameters) {
      this.equipment.get("TK-003").setpoint = parameters.mashTemp;
      this.equipment.get("TK-005").setpoint = parameters.boilTemp;
      this.equipment.get("E-001").setpoint = parameters.coolerOutletTemp;
      const fermenter = this.equipment.get(this.activeBatch.fermenter);
      const maturation = this.equipment.get(this.activeBatch.maturation);
      if (fermenter) fermenter.setpoint = parameters.fermentationTemp;
      if (maturation) maturation.setpoint = parameters.maturationTemp;
    }
    [...this.equipment.values()].forEach(e => {
      if (e.status === "Operando") e.status = e.batchId ? "Reservado" : "Disponible";
    });
    [...this.equipment.values()].filter(e => e.type === "pump").forEach(pump => pump.status = "Detenida");
    [...this.equipment.values()].filter(e => e.type === "valve").forEach(valve => {
      valve.status = "Disponible";
      valve.position = "Cerrada";
    });
    const agitator = this.equipment.get("AG1");
    if (agitator) agitator.status = "Detenido";
    const activeActuators = {
      0: ["P-000"],
      1: ["LV-100"],
      2: ["P-001", "AG1", "TV-105"],
      3: ["LV-104", "P-002"],
      4: ["TV-107"],
      5: ["P-003", "TV-109"],
      6: [tankControlValve(this.activeBatch?.fermenter)].filter(Boolean),
      7: [tankControlValve(this.activeBatch?.maturation)].filter(Boolean),
      8: ["P-004", "LV-125"],
      9: ["LV-125"]
    }[this.activeStage] || [];
    activeActuators.forEach(tag => {
      const actuator = this.equipment.get(tag);
      if (!actuator) return;
      actuator.status = "Operando";
      if (actuator.type === "valve") actuator.position = "Abierta";
    });
    const equipment = this.currentEquipment();
    if (equipment) {
      equipment.status = "Operando";
      equipment.batchId ||= this.activeBatch.id;
    }
    this.activeBatch.stage = this.currentStep()?.name || "Completado";
    this.activeBatch.status = [
      "EN PREPARACIÓN", "EN PREPARACIÓN", "EN MACERACIÓN", "EN FILTRADO I",
      "EN COCCIÓN", "EN ENFRIAMIENTO", "EN FERMENTACIÓN", "EN MADURACIÓN",
      "EN FILTRADO FINAL", "LISTO PARA EMBOTELLADO"
    ][this.activeStage] || this.activeBatch.status;
    if (this.activeStage === 6) {
      const tf = this.equipment.get(this.activeBatch.fermenter);
      tf.level = 92; tf.pressure = .8; tf.density = 1.05;
    }
    if (this.activeStage === 7) {
      const tf = this.equipment.get(this.activeBatch.fermenter);
      tf.level = 0; tf.clean = false; tf.status = "Sucio";
      const tm = this.equipment.get(this.activeBatch.maturation);
      tm.level = 90; tm.status = "Operando";
    }
    if (this.activeStage === 8) {
      const tm = this.equipment.get(this.activeBatch.maturation);
      const filter = this.equipment.get("TK-007");
      tm.level = 0; tm.clean = false; tm.status = "Sucio";
      filter.level = 90; filter.status = "Operando"; filter.batchId = this.activeBatch.id;
    }
    if (this.activeStage === 9) {
      const filter = this.equipment.get("TK-007");
      filter.level = 0; filter.clean = false; filter.status = "Sucio";
    }
    this.updateStepStatus();
  }

  updateProcessValues() {
    const parameters = this.activeBatch.parameters;
    const ratio = Math.min(1, this.stageProgress / this.config.simulation.secondsPerStage);
    const current = this.currentEquipment();
    if (current && current.type !== "bottling") current.level = Math.round(this.activeStage === 9 ? 90 * (1 - ratio) : Math.min(92, 12 + ratio * 80));
    const level = (tag, value) => { const item = this.equipment.get(tag); if (item) item.level = Math.max(0, Math.min(100, Math.round(value))); };
    if (this.activeStage === 1) { level("TK-001", 72); level("TK-002", 15 + 77 * ratio); }
    if (this.activeStage === 2) { level("TK-002", 92 - 80 * ratio); level("TK-003", 12 + 80 * ratio); }
    if (this.activeStage === 3) { level("TK-003", 92 - 82 * ratio); level("TK-004", 10 + 82 * ratio); }
    if (this.activeStage === 4) { level("TK-004", 92 - 82 * ratio); level("TK-005", 10 + 82 * ratio); }
    if (this.activeStage === 5) level("TK-005", 92 - 82 * ratio);
    if (this.activeStage === 7) level(this.activeBatch.maturation, 90);
    if (this.activeStage === 8) { level(this.activeBatch.maturation, 92 - 82 * ratio); level("TK-007", 10 + 82 * ratio); }
    if (this.activeStage === 9) level("TK-007", 92 - 92 * ratio);
    const jitter = magnitude => (Math.random() - .5) * magnitude;
    const t3 = this.equipment.get("TK-003");
    const t5 = this.equipment.get("TK-005");
    const ic1 = this.equipment.get("E-001");
    t3.setpoint = parameters.mashTemp;
    t5.setpoint = parameters.boilTemp;
    ic1.setpoint = parameters.coolerOutletTemp;
    t3.temperature = +(20 + (parameters.mashTemp - 20) * (this.activeStage >= 2 ? Math.min(1, ratio * 1.6) : 0) + jitter(.3)).toFixed(1);
    t3.ph = +(5.3 + jitter(.05)).toFixed(2);
    t5.temperature = +(20 + (parameters.boilTemp - 20) * (this.activeStage >= 4 ? Math.min(1, ratio * 1.7) : 0) + jitter(.4)).toFixed(1);
    ic1.temperature = +(80 - (80 - parameters.coolerOutletTemp + 1) * (this.activeStage >= 5 ? Math.min(1, ratio * 1.8) : 0) + jitter(.3)).toFixed(1);
    const tf = this.equipment.get(this.activeBatch.fermenter);
    const tm = this.equipment.get(this.activeBatch.maturation);
    if (this.activeStage >= 6) {
      tf.setpoint = parameters.fermentationTemp;
      tf.temperature = +(parameters.fermentationTemp + jitter(.25)).toFixed(1);
      tf.pressure = +(.8 + (1.15 - .8) * ratio + jitter(.03)).toFixed(2);
      tf.density = +(1.05 - (1.05 - 1.012) * ratio + jitter(.0006)).toFixed(3);
      tf.densitySamples.push(tf.density);
      tf.densitySamples = tf.densitySamples.slice(-20);
    }
    if (this.activeStage >= 7) {
      tm.setpoint = parameters.maturationTemp;
      tm.temperature = +(parameters.maturationTemp + jitter(.18)).toFixed(1);
      tm.pressure = +(1.2 + jitter(.03)).toFixed(2);
      tm.turbidity = +(2.4 - (2.4 - .9 + .15) * ratio + jitter(.05)).toFixed(2);
    }
    if (this.activeStage >= 8) this.equipment.get("TK-007").turbidity = +(2 - 1.35 * ratio + jitter(.05)).toFixed(2);
  }

  updateStepStatus() {
    this.steps.forEach((step, index) => step.status = index < this.activeStage ? "complete" : index === this.activeStage ? "active" : "pending");
  }

  completeBatch() {
    const batch = this.activeBatch;
    batch.status = "FINALIZADO"; batch.stage = "Finalizado";
    [batch.fermenter, batch.maturation, "TK-007"].forEach(tag => {
      const equipment = this.equipment.get(tag);
      if (equipment) {
        equipment.status = "Sucio"; equipment.clean = false; equipment.level = 0; equipment.batchId = null;
      }
    });
    const packaging = this.equipment.get("EMB-01");
    if (packaging) { packaging.status = "Disponible"; packaging.batchId = null; }
    this.running = false; this.activeBatch = null; this.stageProgress = 0;
    this.log(`Lote ${batch.id} completado · equipos pendientes de CIP`);
    this.updateStepStatus(); this.persist(); this.emitState();
  }

  markClean(tags) {
    tags.forEach(tag => {
      const equipment = this.equipment.get(tag);
      if (equipment) { equipment.clean = true; equipment.cipStatus = "LIMPIO"; equipment.status = equipment.batchId ? "Reservado" : "Disponible"; }
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
  persist() {
    storage.write("dagoca-batches", this.batches);
    const equipmentState = {};
    this.equipment.forEach((equipment, tag) => {
      equipmentState[tag] = {
        status: equipment.status, level: equipment.level, temperature: equipment.temperature,
        pressure: equipment.pressure, ph: equipment.ph, density: equipment.density, turbidity: equipment.turbidity,
        clean: equipment.clean, closed: equipment.closed, maintenance: equipment.maintenance,
        maintenanceStatus: equipment.maintenanceStatus, batchId: equipment.batchId, cipStatus: equipment.cipStatus,
        operatingHours: equipment.operatingHours, starts: equipment.starts
      };
    });
    storage.write("dagoca-equipment", equipmentState);
  }
  emitState() { this.updateStepStatus(); this.persist(); this.bus.emit("state", this.snapshot()); }
  snapshot() { return { running: this.running, emergency: this.emergency, mode: this.mode, activeBatch: this.activeBatch, activeStage: this.activeStage, stageProgress: this.stageProgress, controlTimer: this.controlTimer, conditions: this.conditions }; }
}
