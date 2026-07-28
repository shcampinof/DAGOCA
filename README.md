# DAGOCA SCADA

Prototipo profesional de supervisión y control para una línea de elaboración de cerveza por lotes. La HMI representa la secuencia común de producción, equipos, transferencias, lazos, alarmas, interlocks e históricos definidos para DAGOCA.

La aplicación se ejecuta en el navegador sin backend. Todas las señales se identifican como `SIMULATED`; no hay un PLC conectado y el prototipo no controla una planta real.

## Operación representada

Agua → Maceración → Filtrado I → Cocción → E-001 → Fermentación → Maduración → TK-007 Filtrado final → Embotellado.

| Área | Equipos y funciones principales |
|---|---|
| Agua | TK-001, TK-002, LV-100 y P-001 |
| Maceración | TK-003, AG1, vapor a chaqueta y TC-105 |
| Filtrado I | TK-004, LC-106, PI-106 y P-002 |
| Cocción | TK-005, vapor a chaqueta, TC-107 y P-003 |
| Enfriamiento | E-001 como intercambiador de paso, TC-109 y circuito de chiller |
| Fermentación | TK-006A–E, cinco lazos independientes de enfriamiento |
| Maduración | TK-008A–J, diez lazos independientes de enfriamiento |
| Filtrado final | P-004, TK-007, nivel, turbidez y diferencial preliminares |
| Empaque | Transferencia de TK-007 a EMB-01 |
| CIP | P-000, selección de ruta, fases, retorno y drenaje |

Las bombas mantienen su función documental: P-001 transfiere agua de TK-002 a maceración; P-002 transfiere desde Filtrado I a cocción; P-003 transfiere desde cocción a E-001; P-004 transfiere desde maduración a TK-007; P-000 pertenece al circuito CIP.

## Productos y parámetros de lote

Existen exactamente tres perfiles comerciales activos:

- DAGOCA Dorada Cítrica.
- DAGOCA Ámbar Caramelo.
- DAGOCA Oscura Cacao.

Los perfiles aportan identidad, color, descripción y una adición manual diferenciadora. Los tres usan la secuencia `DAGOCA-BATCH-V1`, los mismos GRAFCET, interlocks, transferencias y lazos. No se crean actuadores ni ramas de control por sabor.

Cada orden conserva una copia inmutable de sus parámetros operacionales:

| Parámetro | Unidad | Base | Mínimo | Máximo | Ajuste |
|---|---:|---:|---:|---:|---|
| SP de maceración | °C | 66 | 62 | 72 | Operador antes del lote |
| Permanencia de maceración | min | 60 | 0 | 120 | Operador antes del lote |
| SP de cocción | °C | 100 | 96 | 104 | Operador antes del lote |
| Duración de cocción | min | 60 | 0 | 180 | Operador antes del lote |
| Espera posterior | min | 15 | 0 | 60 | Operador antes del lote |
| SP de salida E-001 | °C | 18 | 4 | 34,9 | Operador antes del lote |
| SP de fermentación | °C | 18 | 15 | 22 | Operador antes del lote |
| SP de maduración | °C | 3 | 1 | 4 | Operador antes del lote |
| Duración real de maduración | días | 14 | 14 | 60 | Operador antes del lote |

El Operador configura valores dentro de la ventana habitual; una orden fuera de esa ventana requiere sesión de Supervisor. El Supervisor también modifica o restablece valores base para órdenes futuras. Ingeniería puede modificar límites y parámetros de diagnóstico. La duración real se mantiene separada de los segundos por etapa usados para acelerar la ejecución del prototipo.

## Persistencia y migración

`localStorage` usa `dagoca-storage-schema = 3`. Al abrir datos anteriores:

- se conservan lotes y referencias históricas con nombres como “DAGOCA Clara” o “DAGOCA Ámbar”;
- se incorpora una copia sanitizada de los parámetros base cuando el lote antiguo no la tiene;
- valores ausentes, no numéricos o fuera de límites se reemplazan por valores base válidos;
- la selección comercial de lotes históricos no se cambia retroactivamente;
- solo los tres perfiles actuales aparecen al crear órdenes nuevas.

## Ejecución y validación

Abra `index.html` mediante un servidor estático, por ejemplo:

```bash
python -m http.server 4173
```

Validaciones:

```bash
node --check js/*.js
node tests/smoke.js
```

## Límites del prototipo

Las señales, tendencias y variables de calidad son generadas por software. La conexión PLC no está configurada. Los parámetros marcados como preliminares, la tecnología del filtrado final y los parámetros CIP requieren validación de ingeniería. La HMI no sustituye protecciones mecánicas, circuitos instrumentados de seguridad ni la validación sanitaria del proceso.
