# Pendientes de proceso e ingeniería

Este registro evita presentar como definitivos datos que no están confirmados de forma coherente por el documento del proyecto, los P&ID y los GRAFCET suministrados.

## Criterio aplicado en el SCADA

- Los P&ID001, P&ID002 y P&ID003 son la referencia visual y de tags.
- El documento del proyecto define el orden funcional de las ocho etapas.
- Los GRAFCET I y II se usan únicamente como referencia de la secuencia interna.
- Los valores no confirmados se identifican como `PENDIENTE DE VALIDACIÓN`, `VALOR DE SIMULACIÓN` o `INSTRUMENTO PENDIENTE DE SELECCIÓN`.

## Inconsistencias detectadas

| Tema | Evidencia | Tratamiento |
|---|---|---|
| Cantidad de fermentadores | P&ID002 muestra TK-006A y TK-006B; los GRAFCET contienen ramas para cinco tanques. | El SCADA representa dos fermentadores, conforme al P&ID vigente. |
| Orden de Filtrado II y Maduración | El documento del proyecto ordena Fermentación → Filtrado II → Maduración; textos del GRAFCET presentan ramas y nombres contradictorios. | Se implementa el orden del documento y la conexión se representa según P&ID003. Requiere validación de narrativa de control. |
| Nombres de operaciones en GRAFCET | Aparecen textos repetidos como “Maceración” en ramas posteriores y referencias a un tanque de enfriamiento. | No se muestran al operador. Se traducen a lenguaje operacional y se registra esta discrepancia. |
| Equipo de enfriamiento | El documento inicial usa IC1; P&ID002 usa E-001. | Se usa E-001, intercambiador de calor. No se representa un tanque de enfriamiento. |
| Identificación histórica de bombas | El documento académico usa B1/B2/B3; los P&ID usan P-001/P-002/P-003. | Se usan los tags P-001, P-002 y P-003. |
| Señales de fermentación | P&ID002 contiene numeraciones diferentes entre TK-006A y TK-006B y el texto extraído no permite confirmar todos los rangos. | Se muestran tags confirmados y valores simulados; rangos definitivos quedan pendientes. |

## Datos pendientes de validación

- Setpoints y tolerancias de todas las recetas.
- Confirmación del rango de pH y selección de su instrumento.
- Límites y ventana de estabilidad de densidad.
- Tiempos definitivos de fermentación y maduración.
- Tipo y tecnología definitiva de Filtrado II.
- Presión de entrada, presión de salida, presión diferencial y turbidez de TK-007.
- Modelos y hojas de datos de instrumentos no seleccionados.
- Presiones de operación y alivio definitivas.
- Volúmenes útiles y dimensiones finales de los equipos.
- Curvas de P-001, P-002 y P-003.
- Kv/Cv y acción de falla de las válvulas de control.
- Parámetros, fases, concentraciones, temperaturas y tiempos de CIP.
- Confirmación de la bomba usada después de Filtrado II en la narrativa de control.
- Definición de la línea receptora después de maduración/embotellado.
- Confirmación de señales de posición para cada válvula y realimentación de marcha para cada motor.

## Arquitectura de comunicación pendiente

El navegador no se conecta directamente al PLC. La arquitectura prevista es:

`CompactLogix 5380 5069-L320ER → FactoryTalk Linx/Kepware/gateway → backend → WebSocket → SCADA web`

La selección del gateway, el mapa de tags, las políticas de escritura, autenticación, registro de auditoría y ciberseguridad deben definirse antes de una conexión real.
