const equipmentServices = Object.freeze({
  T1: "Filtrado de agua", T2: "Almacenamiento de agua filtrada", T3: "Maceración",
  T4: "Filtrado primario", T5: "Cocción", IC1: "Enfriamiento",
  T7: "Filtrado final", "EMB-01": "Embotellado", "CIP-01": "Limpieza"
});

function qualityLabel(quality = signalQuality.SIMULATED) {
  return `<span class="quality ${quality.toLowerCase()}">${quality}</span>`;
}
