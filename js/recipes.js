class Recipe {
  constructor(data) {
    Object.assign(this, data, { validation: data.validation || "VALOR DE SIMULACIÓN" });
  }
}

const recipeBlueprints = {
  "DAGOCA Clara": new Recipe({
    code: "RCP-CLA-01", color: "#d9a441", volume: 481,
    mashTemp: 66, mashMinimumMinutes: 60, mashPhMin: 5.2, mashPhMax: 5.5, mashPh: 5.3,
    boilMinutes: 60, boilTemp: 100, coolerMax: 19,
    fermentationTemp: 18, fermentationPressure: 1.15, initialDensity: 1.048,
    finalDensity: 1.010, fermentationMinimumHours: 120,
    maturationTemp: 3, maturationPressure: 1.2, maturationMinimumHours: 72,
    turbidityMax: 1.0
  }),
  "DAGOCA Ámbar": new Recipe({
    code: "RCP-AMB-01", color: "#9c5527", volume: 481,
    mashTemp: 68, mashMinimumMinutes: 65, mashPhMin: 5.2, mashPhMax: 5.6, mashPh: 5.4,
    boilMinutes: 70, boilTemp: 100, coolerMax: 18,
    fermentationTemp: 17, fermentationPressure: 1.1, initialDensity: 1.054,
    finalDensity: 1.012, fermentationMinimumHours: 144,
    maturationTemp: 2, maturationPressure: 1.2, maturationMinimumHours: 96,
    turbidityMax: 0.9
  })
};
