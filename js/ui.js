const equipmentServices = Object.freeze({
  "TK-001": "Filtrado de agua", "TK-002": "Almacenamiento de agua filtrada", "TK-003": "Maceración",
  "TK-004": "Filtrado I", "TK-005": "Cocción", "E-001": "Enfriamiento",
  ...Object.fromEntries(fermenterTags.map(tag => [tag, `Fermentación ${tag.at(-1)}`])),
  "TK-007": "Tanque de filtrado final",
  ...Object.fromEntries(maturationTags.map(tag => [tag, `Maduración ${tag.at(-1)}`])),
  "EMB-01": "Embotellado", "CIP-01": "Limpieza"
});

function qualityLabel(quality = signalQuality.SIMULATED) {
  return `<span class="quality ${quality.toLowerCase()}">${quality}</span>`;
}
