class ProductProfile {
  constructor(data) {
    Object.assign(this, data, {
      sequence: "DAGOCA-BATCH-V1",
      validation: data.validation || "Perfil comercial aprobado para el prototipo"
    });
    Object.freeze(this);
  }
}

const productProfiles = Object.freeze({
  "DAGOCA Dorada Cítrica": new ProductProfile({
    code: "PRD-DOR-01",
    name: "Dorada Cítrica",
    character: "Ligera y cítrica",
    color: "#d9a441",
    description: "Perfil dorado de cuerpo ligero y final fresco.",
    manualAddition: "Cáscara cítrica preparada — adición manual en cocción.",
    productionNote: "Registrar la adición manual en la trazabilidad del lote."
  }),
  "DAGOCA Ámbar Caramelo": new ProductProfile({
    code: "PRD-AMB-01",
    name: "Ámbar Caramelo",
    character: "Maltosa y acaramelada",
    color: "#a8602d",
    description: "Perfil ámbar con carácter de maltas caramelo.",
    manualAddition: "Selección de maltas caramelo — carga manual en maceración.",
    productionNote: "La identidad proviene de materias primas; no cambia la secuencia."
  }),
  "DAGOCA Oscura Cacao": new ProductProfile({
    code: "PRD-OSC-01",
    name: "Oscura Cacao",
    character: "Tostada y cacao",
    color: "#654236",
    description: "Perfil oscuro con notas tostadas y de cacao.",
    manualAddition: "Cacao preparado — adición manual registrada por el operador.",
    productionNote: "No existe dosificación automática asociada al sabor."
  })
});

const operatingParameterDefinitions = Object.freeze({
  mashTemp: Object.freeze({ label: "SP de maceración", unit: "°C", base: 66, min: 62, max: 72, usualMin: 64, usualMax: 68, step: .1, role: "Operador" }),
  mashMinutes: Object.freeze({ label: "Permanencia de maceración", unit: "min", base: 60, min: 0, max: 120, usualMin: 45, usualMax: 90, step: 1, role: "Operador" }),
  boilTemp: Object.freeze({ label: "SP de cocción", unit: "°C", base: 100, min: 96, max: 104, usualMin: 98, usualMax: 102, step: .1, role: "Operador" }),
  boilMinutes: Object.freeze({ label: "Duración de cocción", unit: "min", base: 60, min: 0, max: 180, usualMin: 45, usualMax: 90, step: 1, role: "Operador" }),
  postBoilWaitMinutes: Object.freeze({ label: "Espera posterior a cocción", unit: "min", base: 15, min: 0, max: 60, usualMin: 0, usualMax: 30, step: 1, role: "Operador" }),
  coolerOutletTemp: Object.freeze({ label: "SP de salida E-001", unit: "°C", base: 18, min: 4, max: 34.9, usualMin: 12, usualMax: 24, step: .1, role: "Operador" }),
  fermentationTemp: Object.freeze({ label: "SP de fermentación", unit: "°C", base: 18, min: 15, max: 22, usualMin: 16, usualMax: 20, step: .1, role: "Operador" }),
  maturationTemp: Object.freeze({ label: "SP de maduración", unit: "°C", base: 3, min: 1, max: 4, usualMin: 1, usualMax: 4, step: .1, role: "Operador" }),
  maturationDays: Object.freeze({ label: "Duración real de maduración", unit: "días", base: 14, min: 14, max: 60, usualMin: 14, usualMax: 30, step: 1, role: "Operador" })
});

const baseOperatingParameters = Object.freeze(Object.fromEntries(
  Object.entries(operatingParameterDefinitions).map(([key, definition]) => [key, definition.base])
));

function finiteNumber(value) {
  if (value === "" || value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sanitizeEngineeringLimits(candidate = {}) {
  return Object.fromEntries(Object.entries(operatingParameterDefinitions).map(([key, definition]) => {
    const stored = candidate?.[key] || {};
    let min = finiteNumber(stored.min);
    let max = finiteNumber(stored.max);
    if (min == null || max == null || min >= max) ({ min, max } = definition);
    if (key === "coolerOutletTemp") max = Math.min(34.9, max);
    if (key === "maturationDays") min = Math.max(14, min);
    if (min >= max) ({ min, max } = definition);
    return [key, { min, max }];
  }));
}

function sanitizeOperatingParameters(candidate = {}, fallback = baseOperatingParameters, limits = sanitizeEngineeringLimits()) {
  return Object.fromEntries(Object.entries(operatingParameterDefinitions).map(([key, definition]) => {
    const range = limits[key] || definition;
    const fallbackNumber = finiteNumber(fallback?.[key]);
    const safeFallback = fallbackNumber != null && fallbackNumber >= range.min && fallbackNumber <= range.max
      ? fallbackNumber
      : definition.base;
    const value = finiteNumber(candidate?.[key]);
    return [key, value != null && value >= range.min && value <= range.max ? value : safeFallback];
  }));
}

function validateOperatingParameters(candidate = {}, limits = sanitizeEngineeringLimits()) {
  const errors = {};
  Object.entries(operatingParameterDefinitions).forEach(([key, definition]) => {
    const value = finiteNumber(candidate[key]);
    const range = limits[key] || definition;
    if (value == null || value < range.min || value > range.max) {
      errors[key] = `${definition.label}: use ${range.min}–${range.max} ${definition.unit}.`;
    }
  });
  return errors;
}

function cloneOperatingParameters(parameters, limits = sanitizeEngineeringLimits()) {
  return Object.freeze({ ...sanitizeOperatingParameters(parameters, baseOperatingParameters, limits) });
}

// Alias conservado para integraciones existentes. Contiene únicamente los tres perfiles activos.
const recipeBlueprints = productProfiles;
