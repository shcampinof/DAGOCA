# Pendientes de proceso e ingeniería

Este registro mantiene únicamente los datos que siguen sin definición aprobada. Mientras se armonizan los PFD, P&ID, GRAFCET e informe, prevalece `AJUSTE_CONTEXTO_PROYECTO_CERVECERIA.md`.

## Criterio aplicado en el SCADA

- El flujo vigente es `Agua → Maceración → Filtrado I → Cocción → E-001 → Fermentación → Maduración → TK-007 Filtrado final → Embotellado`.
- La capacidad vigente es de cinco fermentadores (`TK-006A` a `TK-006E`) y diez maduradores (`TK-008A` a `TK-008J`).
- `E-001` es un intercambiador de paso; no existe un tanque de enfriamiento.
- Fermentación y maduración usan únicamente enfriamiento y control de temperatura.
- Los tags existentes se conservan. Los tags propuestos desde 128 amplían las series sin renumerar instrumentos actuales.
- Condensado de chaquetas de vapor y desagüe CIP se representan como redes distintas.

La cantidad de tanques y el orden entre fermentación, maduración y filtrado final ya no son pendientes.

## Datos pendientes de validación

- Fluido definitivo de refrigeración: agua fría, agua helada o mezcla con glicol.
- Validación en el proyecto completo de AutoCAD Plant 3D de los tags propuestos desde 128 y de `YV-002A` a `YV-002I`.
- Tecnología, detalle constructivo e instrumentación definitiva del filtrado final en `TK-007`.
- Presión de entrada, presión de salida, presión diferencial y turbidez definitivas de `TK-007`.
- Setpoints y tolerancias definitivos de las recetas.
- Confirmación del rango de pH y selección de su instrumento.
- Límites y ventana de estabilidad de densidad.
- Tiempos definitivos de fermentación y maduración.
- Modelos, rangos y hojas de datos de instrumentos no seleccionados.
- Presiones de operación y alivio definitivas.
- Volúmenes útiles y dimensiones finales de los equipos.
- Curvas de `P-001`, `P-002` y `P-003`.
- Kv/Cv y acción de falla de las válvulas de control.
- Parámetros, fases, concentraciones, temperaturas y tiempos de CIP.
- Definición detallada de la línea de embotellado y sus realimentaciones.
- Confirmación de señales de posición para cada válvula y realimentación de marcha para cada motor.

## Arquitectura de comunicación pendiente

El navegador no se conecta directamente al PLC. La arquitectura prevista es:

`CompactLogix 5380 5069-L320ER → FactoryTalk Linx/Kepware/gateway → backend → WebSocket → SCADA web`

La selección del gateway, el mapa de tags, las políticas de escritura, autenticación, registro de auditoría y ciberseguridad deben definirse antes de una conexión real.
