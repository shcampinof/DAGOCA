const operatorSequence = Object.freeze([
  {
    code: "CIP_INITIAL",
    stage: "cip",
    status: "Preparando la planta",
    action: "Ejecutando limpieza inicial",
    next: "Preparar agua de proceso",
    conditions: ["Ruta CIP confirmada", "Ciclo completo", "Ruta drenada"]
  },
  {
    code: "WATER_PREPARATION",
    stage: "water",
    status: "Preparando agua",
    action: "Filtrando y almacenando agua",
    next: "Llenar TK-003",
    conditions: ["TK-002 disponible", "Nivel objetivo alcanzado", "P-001 habilitada"]
  },
  {
    code: "MASHING",
    stage: "mashing",
    status: "Maceración en curso",
    action: "Calentando y agitando el mosto",
    next: "Transferir a TK-004",
    conditions: ["Nivel operativo", "Temperatura alcanzada", "Malta confirmada", "Tiempo cumplido"]
  },
  {
    code: "PRIMARY_FILTRATION",
    stage: "filter1",
    status: "Filtrado I en curso",
    action: "Filtrando el mosto en TK-004",
    next: "Transferir a TK-005",
    conditions: ["TK-004 con nivel", "P-002 habilitada", "TK-005 disponible"]
  },
  {
    code: "BOILING",
    stage: "boiling",
    status: "Cocción en curso",
    action: "Controlando temperatura y tiempo",
    next: "Enviar mosto a E-001",
    conditions: ["Nivel operativo", "Lúpulo confirmado", "Temperatura alcanzada", "Tiempo cumplido"]
  },
  {
    code: "COOLING",
    stage: "cooling",
    status: "Enfriando mosto",
    action: "Regulando agua fría en E-001",
    next: "Transferir al fermentador seleccionado",
    conditions: ["Flujo confirmado", "Salida menor de 35 °C", "Fermentador disponible"]
  },
  {
    code: "FERMENTATION",
    stage: "fermentation",
    status: "Fermentación en curso",
    action: "Controlando temperatura, presión y densidad",
    next: "Transferir a TK-007",
    conditions: ["Tiempo mínimo", "Temperatura correcta", "Presión correcta", "Densidad estable"]
  },
  {
    code: "SECONDARY_FILTRATION",
    stage: "filter2",
    status: "Filtrado II en curso",
    action: "Filtrando cerveza en TK-007",
    next: "Transferir a maduración",
    conditions: ["TK-007 disponible", "Nivel operativo", "Tanque de maduración disponible"]
  },
  {
    code: "MATURATION",
    stage: "maturation",
    status: "Maduración en curso",
    action: "Controlando temperatura del tanque asignado",
    next: "Liberar lote para embotellado",
    conditions: ["Tiempo mínimo", "Temperatura estable", "Autorización de transferencia"]
  },
  {
    code: "PACKAGING",
    stage: "packaging",
    status: "Lote listo para empaque",
    action: "Transfiriendo a embotellado",
    next: "Limpieza final",
    conditions: ["Línea receptora disponible", "Transferencia completa", "Ruta drenada"]
  }
]);

function isDensityStable(samples, tolerance = 0.001, minimumSamples = 3) {
  if (!Array.isArray(samples) || samples.length < minimumSamples) return false;
  const recent = samples.slice(-minimumSamples);
  return Math.max(...recent) - Math.min(...recent) <= tolerance;
}

function getOperatorSequenceState(simulator) {
  const index = Math.max(0, simulator.activeStage);
  const definition = operatorSequence[index] || {
    code: "IDLE",
    stage: "idle",
    status: "Planta disponible",
    action: "Esperando inicio de lote",
    next: "Crear o seleccionar un lote",
    conditions: ["Lote autorizado"]
  };
  const relevant = simulator.relevantConditionKeys?.() || [];
  const fulfilled = relevant.filter(key => simulator.conditions[key]);
  const pending = relevant.filter(key => !simulator.conditions[key]);
  return { ...definition, fulfilled, pending };
}

const engineeringSignalNames = Object.freeze({
  P001_COMMAND: "Comando de marcha de P-001",
  CTT105: "Temperatura de maceración alcanzada",
  TIMMAC: "Tiempo de maceración",
  LV104_COMMAND: "Comando de válvula de transferencia",
  SEQUENCE_STEP: "Estado interno de secuencia"
});
