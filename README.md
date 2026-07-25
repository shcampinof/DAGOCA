# DAGOCA · Sistema SCADA

Sistema web académico de supervisión y control para una cervecería artesanal. Representa la preparación de agua, maceración, filtrado primario, cocción, enfriamiento, fermentación, maduración, filtrado final, embotellado y limpieza CIP.

> No controla equipos reales ni sustituye protecciones eléctricas, mecánicas, sanitarias o instrumentadas de seguridad. Todas las señales se identifican como `SIMULATED`.

## Ejecutar

Puede abrir `index.html` directamente o servir el directorio:

```bash
python -m http.server 8080
```

Después abra `http://localhost:8080`. Chart.js está almacenado en `vendor/chart.umd.min.js`; las tendencias no dependen de un CDN.

## Estructura

```text
.
├── index.html
├── css/
│   └── styles.css
├── js/
│   ├── app.js
│   ├── state.js
│   ├── process.js
│   ├── grafcet.js
│   ├── alarms.js
│   ├── history.js
│   ├── batches.js
│   ├── recipes.js
│   ├── cip.js
│   ├── permissions.js
│   └── ui.js
├── vendor/
│   └── chart.umd.min.js
├── assets/
└── .github/workflows/deploy-pages.yml
```

## Pantallas

- Vista general con estado de planta, producción semanal, lote, etapa, alarmas, disponibilidad y CIP.
- Proceso con mímico interactivo, tanques configurables y rutas de agua, producto y limpieza.
- GRAFCET 0.10, 0.20 y 0.30 con pasos, transiciones, bloqueos y temporizadores.
- Lotes con asignación exclusiva de fermentador y tanque de maduración.
- Recetas DAGOCA Clara y DAGOCA Ámbar.
- Tendencias e históricos con Chart.js local y exportación CSV.
- Alarmas con reconocimiento, normalización y cierre.
- CIP con ocho fases y bloqueo de equipos.
- Mantenimiento, configuración y diagnóstico básico.

## Simulador

La máquina de estados está en `js/process.js`. Los tiempos están comprimidos para presentación. Las transiciones combinan tiempo y condiciones de proceso:

- Maceración: nivel, temperatura, pH y conversión confirmada.
- Enfriamiento: temperatura de salida y fermentador disponible.
- Fermentación: tiempo, temperatura, presión y estabilidad de densidad.
- Maduración: tiempo, temperatura y turbidez.
- Filtrado final: ruta, disponibilidad y turbidez.

La estabilidad de densidad se evalúa con `isDensityStable()` sobre una ventana configurable de muestras.

## Roles

| Función | Operador | Supervisor | Ingeniería |
|---|:---:|:---:|:---:|
| Ver proceso e históricos | ✓ | ✓ | ✓ |
| Iniciar lotes y reconocer alarmas | ✓ | ✓ | ✓ |
| Operación manual bajo interlocks | ✓ | ✓ | ✓ |
| Editar recetas y parámetros CIP | — | ✓ | ✓ |
| Autorizar transición y resetear secuencia | — | ✓ | ✓ |
| Cerrar alarmas normalizadas | — | ✓ | ✓ |
| Forzar alarmas en simulación | — | — | ✓ |
| Configurar equipos y cantidades | — | — | ✓ |
| Restablecer datos locales | — | — | ✓ |

## Interlocks implementados

| Comando o transición | Condición que bloquea |
|---|---|
| Arranque B1 | T2 sin nivel de succión |
| Calentamiento | Tanque por debajo del nivel mínimo |
| Crear lote | Fermentador o maduración ocupado, sucio, abierto o en mantenimiento |
| Producción | Equipo seleccionado en CIP |
| Operación manual | Emergencia activa o modo incompatible |
| Secuencia automática | Modo mantenimiento |
| Fermentación a maduración | Densidad inestable, presión/temperatura incorrecta o destino no disponible |
| Maduración a filtrado | Tiempo, temperatura o turbidez fuera de condición |
| Reset de emergencia | Requiere rol Supervisor o Ingeniería |

Cuando un comando se rechaza, la interfaz informa motivo, equipo responsable y acción requerida.

## Persistencia

`localStorage` conserva usuario, rol, modo, configuración, lotes, recetas, alarmas, históricos, equipos, GRAFCET mediante el estado del lote, eventos y estado CIP. El botón **Restablecer simulación**, disponible para Ingeniería, elimina las claves `dagoca-*` después de solicitar confirmación.

## Parámetros pendientes

Requieren validación de ingeniería:

- tiempos, temperaturas y límites definitivos de receta;
- tolerancia y ventana de estabilidad de densidad;
- concentración, conductividad y temperatura CIP;
- límites de presión diferencial y turbidez de T7;
- selección final de instrumentos y rangos;
- matriz causa-efecto, rutas de válvulas y análisis de riesgos;
- estrategia de filtración tangencial/crossflow.

## Publicar en GitHub Pages

Los cambios en `main` se despliegan automáticamente:

```bash
git add .
git commit -m "descripción del cambio"
git push
```

El workflow de `.github/workflows/deploy-pages.yml` publica la raíz del repositorio. La URL de producción es:

https://shcampinof.github.io/DAGOCA/
