# DAGOCA SCADA

SCADA web interactivo para supervisar una cervecería artesanal por lotes. La interfaz reproduce la distribución funcional de los P&ID del proyecto, muestra equipos, tuberías, actuadores, variables, setpoints, alarmas e interlocks y se ejecuta sin backend en GitHub Pages.

Sitio: <https://shcampinof.github.io/DAGOCA/>

> Es una simulación de supervisión. No controla equipos reales ni sustituye protecciones eléctricas, mecánicas, sanitarias o instrumentadas de seguridad.

## Ejecución

Puede abrirse `index.html` directamente o mediante un servidor estático:

```powershell
python -m http.server 8000
```

Después abra `http://localhost:8000`.

## Pantallas

| Pantalla | Contenido principal |
|---|---|
| Vista general | Estado de planta, lote, etapa, alarmas y ruta completa por ocho etapas |
| Agua | TK-001, TK-002, LV-100, P-001 y control de nivel |
| Maceración | TK-003, AG1, vapor, TC-105, tiempos y confirmación de malta |
| Filtrado I | TK-004, niveles, LC-106, PI-106 y P-002 |
| Cocción | TK-005, vapor, TC-107, tiempos, lúpulo y P-003 |
| Enfriamiento | E-001, TC-109, TV-109, PI-109 y permiso a fermentación |
| Fermentación | TK-006A/B, temperatura, presión, densidad y disponibilidad |
| Filtrado II | TK-007, niveles e instrumentación simulada pendiente |
| Maduración | TK-008A/B/C/D y lazos individuales de agua helada |
| CIP y limpieza | P-000, rutas, fases, retorno, drenaje y bloqueos |
| Lotes | Creación, asignación y trazabilidad |
| Históricos | Tendencias locales PV/SP y exportación CSV |
| Alarmas | Ciclo de vida, filtros y reconocimiento |
| Mantenimiento | Disponibilidad y estado de activos |
| Configuración | Sesión, simulación y diagnóstico exclusivo de Ingeniería |

## Equipos y tags principales

| Tag | Servicio |
|---|---|
| TK-001 | Filtrado de agua |
| TK-002 | Almacenamiento de agua |
| P-001 | Transferencia a maceración |
| TK-003 | Maceración |
| TK-004 | Filtrado I |
| P-002 | Transferencia a cocción |
| TK-005 | Cocción |
| P-003 | Transferencia por enfriamiento |
| E-001 | Intercambiador de calor |
| TK-006A / TK-006B | Fermentación |
| TK-007 | Filtrado II |
| TK-008A / B / C / D | Maduración |
| P-000 | Bomba del circuito CIP |

## Interlocks implementados

| Acción | Condición de bloqueo |
|---|---|
| Iniciar o continuar | Parada de emergencia enclavada |
| Operar en automático | Modo mantenimiento activo |
| Operar bomba manual | Equipo sucio, en CIP o sin permiso |
| Arrancar P-001 | TK-002 sin nivel de succión |
| Habilitar vapor | TK-003 o TK-005 sin nivel mínimo |
| Transferir a fermentación | TT-109 igual o superior a 35 °C |
| Reservar destino | Tanque ocupado, sucio, abierto o en mantenimiento |
| Iniciar CIP | Equipo con lote o ruta de producción activa |
| Reiniciar | Requiere rol y liberación de emergencia |

## Arquitectura

La aplicación utiliza HTML, CSS y JavaScript sin framework, Chart.js local, rutas relativas y `localStorage`.

- `js/sequence.js`: lógica secuencial interna y traducción a mensajes operativos. No existe una pantalla GRAFCET.
- `js/data-provider.js`: contrato de datos y `SimulationDataProvider`. Incluye clases de extensión para OPC UA, WebSocket y gateway EtherNet/IP.
- `js/process.js`: modelo de equipos, lotes, interlocks y simulación.
- `js/alarms.js`: ciclo de vida de alarmas.
- `js/history.js`: históricos, PV/SP y CSV.
- `js/cip.js`: fases y rutas CIP.
- `PENDIENTES_PROCESO.md`: conflictos documentales y datos no confirmados.

PLC previsto: Allen-Bradley CompactLogix 5380 5069-L320ER con Studio 5000. El navegador no debe conectarse directamente al PLC; la conexión futura requiere gateway y backend.

## Publicación

GitHub Pages publica automáticamente la rama `main`. Para actualizar el sitio:

```powershell
git add .
git commit -m "Descripción del cambio"
git push origin main
```

Tras el `push`, espere a que termine el workflow de Pages y recargue el sitio.
