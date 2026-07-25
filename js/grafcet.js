const grafcetBlueprint = [
  { group: "0.10", title: "Proceso base", steps: ["Limpieza inicial", "Preparación de agua", "Llenado de maceración", "Calentamiento", "Maceración", "Filtrado primario", "Cocción", "Reposo", "Enfriamiento", "Selección de fermentador"] },
  { group: "0.20", title: "Fermentación y maduración", steps: ["Fermentación", "Verificación de fin", "Selección de maduración", "Transferencia", "Maduración", "Liberación del fermentador", "Limpieza de fermentador y línea"] },
  { group: "0.30", title: "Filtrado final y limpieza", steps: ["Fin de maduración", "Transferencia al filtro", "Filtrado final", "Envío a embotellado", "Lavado de tanque y tubería", "Retorno a disponible"] }
];

function isDensityStable(samples, tolerance = 0.001, minimumSamples = 3) {
  if (!Array.isArray(samples) || samples.length < minimumSamples) return false;
  const recent = samples.slice(-minimumSamples);
  return Math.max(...recent) - Math.min(...recent) <= tolerance;
}
