# DAGOCA · Sistema SCADA

Prototipo académico e interactivo de supervisión para una cervecería artesanal. Simula una producción de dos lotes semanales de aproximadamente 481 L, desde la preparación de agua hasta el embotellado y la limpieza CIP.

El resumen de planta utiliza un mímico SCADA tradicional: depósitos metálicos, niveles, colectores, tuberías, válvulas, bombas, pilotos, placas de identificación y displays de instrumentación. Todos estos elementos reaccionan al mismo estado de simulación.

La interfaz utiliza IBM Plex Sans e IBM Plex Mono, tipografías abiertas bajo licencia SIL Open Font License. Si no existe conexión para cargarlas desde Google Fonts, se aplican fuentes de sistema compatibles.

> **Importante:** este software no controla equipos reales, no implementa funciones instrumentadas de seguridad y no sustituye protecciones eléctricas, mecánicas o de presión. Todos los valores son parámetros de simulación.

## Ejecución local

El proyecto no necesita instalación ni compilación. Puede abrir `index.html` directamente con doble clic; la navegación, los controles y el simulador funcionan bajo el protocolo local `file://`.

Para una ejecución equivalente a GitHub Pages también puede servirlo por HTTP:

```bash
python -m http.server 8080
```

Abra `http://localhost:8080`. También puede usar cualquier servidor estático, por ejemplo la extensión Live Server de VS Code.

Las tendencias cargan Chart.js desde CDN. Si el navegador bloquea ese recurso al abrir el archivo local, la interfaz muestra un aviso y el resto del SCADA continúa funcionando. La aplicación usa HTML, CSS, JavaScript y SVG propios, sin frameworks.

## Demostración sugerida

1. Abra **Lotes y recetas** y cree un lote. Solo aparecen fermentadores y tanques de maduración limpios, cerrados y disponibles.
2. Pulse **Iniciar**. En automático, la secuencia avanza cuando se satisfacen sus condiciones simuladas.
3. Abra **GRAFCET** para observar el paso activo, las transiciones y la causa exacta de cualquier espera.
4. Active **Modo paso a paso** si desea aprobar cada transición manualmente.
5. Revise **Tendencias**, cambie el tag y el rango, pause la actualización o exporte el histórico a CSV.
6. En **Alarmas**, genere eventos, aplique filtros y reconózcalos. Reconocer no normaliza la condición.
7. Use la parada de emergencia para comprobar el enclavamiento y la baliza crítica; luego pulse **Reset**.
8. Al terminar un lote, seleccione los equipos sucios en **Limpieza CIP** y ejecute el ciclo.

La secuencia está acelerada para demostración. Fermentación y maduración no avanzan solo por tiempo: también comprueban temperatura, presión, estabilidad de densidad o turbidez, según corresponda.

## Estructura

```text
.
├── .github/workflows/deploy-pages.yml  # Despliegue automático
├── assets/favicon.svg                   # Identidad SVG propia
├── index.html                           # Estructura semántica y vistas
├── styles.css                           # Sistema visual responsive
├── app.js                               # UI, eventos y persistencia
├── simulator.js                         # Equipos, lotes y máquina de estados
├── alarms.js                            # Modelo y gestión de alarmas
├── charts.js                            # Tendencias y exportación CSV
└── README.md
```

## Configuración de la simulación

La configuración central está en el objeto `demoConfig` al inicio de `simulator.js`.

Para cambiar la cantidad de tanques:

```js
plant: {
  fermenters: 5,
  maturationTanks: 5
}
```

No hay vistas acopladas al valor cinco; los colectores y selectores se generan desde esa configuración.

Las recetas `Sabor A` y `Sabor B`, los setpoints y los límites de tendencia también están en `demoConfig`. En la interfaz, un usuario con rol **Supervisor** puede modificar la temperatura de maceración. La preferencia se conserva en `localStorage`.

## Persistencia

Se guardan de forma defensiva:

- lotes y último lote activo;
- alarmas y reconocimientos;
- eventos recientes;
- tema oscuro/claro;
- rol y sonido;
- parámetros de receta editados.

Si `localStorage` contiene datos corruptos o no está disponible, la aplicación usa valores seguros y continúa operando.

## Despliegue en GitHub Pages

El workflow incluido publica la raíz del repositorio cuando hay un `push` a `main`.

```bash
git init
git add .
git commit -m "feat: prototipo SCADA DAGOCA"
git branch -M main
git remote add origin https://github.com/USUARIO/REPOSITORIO.git
git push -u origin main
```

En GitHub, abra **Settings → Pages** y seleccione **GitHub Actions** como fuente. La URL quedará disponible al terminar la acción `Deploy DAGOCA to GitHub Pages`.

## Límites de ingeniería

Son demostrativos: tiempos comprimidos, recetas, temperaturas, presiones, pH, densidad, turbidez, límites de alarma, lógica CIP, disponibilidad del filtro tangencial/crossflow y cualquier interlock representado. Un proyecto real requiere análisis de riesgos, P&ID aprobado, matriz causa-efecto, selección de instrumentación, validación sanitaria, pruebas FAT/SAT y control en PLC/SIS certificado.

El simulador académico sí mantiene coherencia visual y lógica entre el mímico, el GRAFCET, las alarmas, los lotes, el estado de los equipos y las tendencias.
