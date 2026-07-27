const equipmentServices = Object.freeze({
  "TK-001": "Filtrado de agua", "TK-002": "Almacenamiento de agua filtrada", "TK-003": "Maceración",
  "TK-004": "Filtrado I", "TK-005": "Cocción", "E-001": "Enfriamiento",
  "TK-006A": "Fermentación A", "TK-006B": "Fermentación B", "TK-007": "Filtrado II",
  "TK-008A": "Maduración A", "TK-008B": "Maduración B", "TK-008C": "Maduración C", "TK-008D": "Maduración D",
  "EMB-01": "Embotellado", "CIP-01": "Limpieza"
});

function qualityLabel(quality = signalQuality.SIMULATED) {
  return `<span class="quality ${quality.toLowerCase()}">${quality}</span>`;
}
