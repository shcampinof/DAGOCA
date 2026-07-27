# Ajuste temporal de contexto - Proyecto de automatización de cervecería

Estado: vigente mientras se terminan de corregir los PFD, P&ID, GRAFCET, informe y SCADA.

Fecha de consolidación: 2026-07-27.

## 1. Propósito y regla de precedencia

Este documento registra las decisiones actuales del proyecto y debe utilizarse como fuente temporal de verdad cuando exista una contradicción con los archivos gráficos todavía no corregidos.

Orden de precedencia durante el periodo de ajuste:

1. Este documento de contexto.
2. Decisiones explícitas posteriores del equipo.
3. Versiones corregidas y aprobadas de PFD, P&ID y GRAFCET.
4. Versiones actuales de PFD, P&ID, GRAFCET e informe, únicamente para información que no contradiga los puntos aquí definidos.

No se deben renumerar los equipos ni los tags ya dibujados. Los equipos nuevos deben ampliar las series existentes.

## 2. Flujo definitivo del proceso

El flujo que debe representarse de forma consistente es:

```text
Filtrado y almacenamiento de agua
-> Maceración
-> Filtrado I
-> Cocción
-> Enfriamiento en E-001
-> Fermentación
-> Maduración
-> Filtrado final en TK-007
-> Embotellado
```

Decisiones obligatorias:

- Después de fermentación viene maduración.
- Después de maduración viene el filtrado final.
- `TK-007` es el tanque de filtrado final; debe identificarse como `TK-007 - Tanque de filtrado final`.
- No existe un tanque de enfriamiento entre cocción y fermentación.
- El mosto circula directamente desde `TK-005`, por `E-001`, hasta el fermentador seleccionado.
- `E-001` es un intercambiador de paso y no almacena producto.

## 3. Estrategia térmica

### 3.1 Etapas con calentamiento

El calentamiento mediante vapor aplica a las etapas que lo requieren, como maceración y cocción.

La secuencia del servicio térmico es:

```text
Vapor -> chaqueta del equipo -> transferencia de calor -> condensado
-> sistema de recuperación de condensado
```

### 3.2 Fermentación y maduración

En fermentación y maduración no existe calentamiento. Ambas etapas usan enfriamiento y control de temperatura mediante circulación de agua fría o agua helada por la chaqueta.

En el GRAFCET y en el SCADA se debe usar lenguaje como:

- `Habilitar control de temperatura`.
- `Habilitar enfriamiento`.
- `Abrir/modular válvula de agua fría`.
- `Temperatura en rango de operación`.

No se deben usar acciones como:

- `Calentar fermentador`.
- `Calentar tanque de maduración`.
- `Activar sistema de calentamiento` para fermentación o maduración.

### 3.3 Chiller y retorno del agua

El circuito de enfriamiento debe representarse como circuito con suministro y retorno:

```text
Chiller -> suministro de agua fría/helada -> equipo consumidor
-> retorno de agua al chiller
```

Esta consideración aplica al sistema de enfriamiento de `E-001` y a las chaquetas de los tanques de fermentación y maduración. El agua de enfriamiento no se mezcla con el mosto o la cerveza.

En los diagramas y en el SCADA deben diferenciarse visualmente:

- Suministro de agua fría o helada desde el chiller.
- Retorno de agua al chiller.
- Flujo de producto.

## 4. Condensado y desagüe

Las salidas que actualmente aparecen como `DESAGÜE` y que corresponden a la descarga de una chaqueta alimentada con vapor deben cambiarse por:

`CONDENSADO A SISTEMA DE RECUPERACIÓN`

Esta sustitución no debe aplicarse indiscriminadamente a toda salida inferior de un tanque. Deben mantenerse como desagüe las líneas que realmente conduzcan:

- Efluente del proceso de limpieza o CIP.
- Vaciado sanitario destinado al drenaje.
- Otros residuos de proceso cuya disposición aprobada sea el desagüe.

Por tanto, se deben conservar dos redes conceptualmente distintas:

| Red | Origen | Destino |
|---|---|---|
| Condensado | Chaquetas calentadas con vapor | Sistema de recuperación de condensado |
| Desagüe de limpieza | Retorno o descarga del proceso CIP | Sistema de drenaje o tratamiento definido |

En el P&ID, el retorno de condensado debe contemplar la simbología y los elementos requeridos por el diseño, por ejemplo aislamiento, purgador de vapor o trampa de condensado y prevención de retorno, sin confundirlos con la descarga CIP.

## 5. Número definitivo de tanques y justificación

La planta trabajará cinco días por semana y se proyecta fabricar un lote por día. Cada lote ocupa aproximadamente:

- Un fermentador durante una semana.
- Un tanque de maduración durante dos semanas.

El escalonamiento semanal es:

| Semana de producción | Fermentación ocupada | Maduración ocupada |
|---|---:|---:|
| Semana 1 | 5 lotes | 0 lotes |
| Semana 2 | 5 lotes nuevos | 5 lotes de la semana 1 |
| Semana 3 en adelante | 5 lotes nuevos | 10 lotes de las dos semanas anteriores |

Por esta razón, la capacidad simultánea requerida es:

- 5 tanques de fermentación.
- 10 tanques de maduración.

La imagen suministrada por el equipo ilustra este solapamiento: una etapa semanal de fermentación y dos etapas semanales de maduración por cada lote producido.

## 6. Nomenclatura de equipos

Se conservan los números funcionales actuales y se amplían solamente los sufijos alfabéticos.

### 6.1 Fermentadores

| Equipo | Descripción |
|---|---|
| `TK-006A` | Fermentador 1 existente |
| `TK-006B` | Fermentador 2 existente |
| `TK-006C` | Fermentador 3 nuevo |
| `TK-006D` | Fermentador 4 nuevo |
| `TK-006E` | Fermentador 5 nuevo |

### 6.2 Tanques de maduración

| Equipo | Descripción |
|---|---|
| `TK-008A` | Tanque de maduración 1 existente |
| `TK-008B` | Tanque de maduración 2 existente |
| `TK-008C` | Tanque de maduración 3 existente |
| `TK-008D` | Tanque de maduración 4 existente |
| `TK-008E` | Tanque de maduración 5 nuevo |
| `TK-008F` | Tanque de maduración 6 nuevo |
| `TK-008G` | Tanque de maduración 7 nuevo |
| `TK-008H` | Tanque de maduración 8 nuevo |
| `TK-008I` | Tanque de maduración 9 nuevo |
| `TK-008J` | Tanque de maduración 10 nuevo |

`TK-007` conserva su número y se define como tanque de filtrado final. No se debe renumerar a causa de la ampliación.

## 7. Política de tags

- Todos los tags que ya existen en los P&ID se conservan exactamente.
- No se corrige ni reorganiza la numeración existente aunque no sea consecutiva.
- Cada instrumento, controlador y válvula de un equipo nuevo debe tener un tag único.
- Los tanques nuevos no reciben motores o agitadores si estos no forman parte del diseño aprobado.
- La propuesta siguiente reserva los lazos desde el 128 para evitar colisiones con los tags 001 a 127 ya usados.
- La asignación debe validarse en AutoCAD Plant 3D antes de declararla definitiva.

### 7.1 Tags propuestos para los equipos nuevos

| Tanque | Temperatura | Presión | Nivel alto y entrada | Nivel bajo y salida | Válvula CIP | Motor |
|---|---|---|---|---|---|---|
| `TK-006C` | `TE-128`, `TT-128`, `TC-128`, `TV-128` | `PI-128` | `LSH-129`, `LC-129`, `LY-129`, `LV-129` | `LSL-130`, `LC-130`, `LY-130`, `LV-130` | `YV-002A` | No aplica |
| `TK-006D` | `TE-131`, `TT-131`, `TC-131`, `TV-131` | `PI-131` | `LSH-132`, `LC-132`, `LY-132`, `LV-132` | `LSL-133`, `LC-133`, `LY-133`, `LV-133` | `YV-002B` | No aplica |
| `TK-006E` | `TE-134`, `TT-134`, `TC-134`, `TV-134` | `PI-134` | `LSH-135`, `LC-135`, `LY-135`, `LV-135` | `LSL-136`, `LC-136`, `LY-136`, `LV-136` | `YV-002C` | No aplica |
| `TK-008E` | `TE-137`, `TT-137`, `TC-137`, `TV-137` | `PI-137` | `LSH-138`, `LC-138`, `LY-138`, `LV-138` | `LSL-139`, `LC-139`, `LY-139`, `LV-139` | `YV-002D` | No aplica |
| `TK-008F` | `TE-140`, `TT-140`, `TC-140`, `TV-140` | `PI-140` | `LSH-141`, `LC-141`, `LY-141`, `LV-141` | `LSL-142`, `LC-142`, `LY-142`, `LV-142` | `YV-002E` | No aplica |
| `TK-008G` | `TE-143`, `TT-143`, `TC-143`, `TV-143` | `PI-143` | `LSH-144`, `LC-144`, `LY-144`, `LV-144` | `LSL-145`, `LC-145`, `LY-145`, `LV-145` | `YV-002F` | No aplica |
| `TK-008H` | `TE-146`, `TT-146`, `TC-146`, `TV-146` | `PI-146` | `LSH-147`, `LC-147`, `LY-147`, `LV-147` | `LSL-148`, `LC-148`, `LY-148`, `LV-148` | `YV-002G` | No aplica |
| `TK-008I` | `TE-149`, `TT-149`, `TC-149`, `TV-149` | `PI-149` | `LSH-150`, `LC-150`, `LY-150`, `LV-150` | `LSL-151`, `LC-151`, `LY-151`, `LV-151` | `YV-002H` | No aplica |
| `TK-008J` | `TE-152`, `TT-152`, `TC-152`, `TV-152` | `PI-152` | `LSH-153`, `LC-153`, `LY-153`, `LV-153` | `LSL-154`, `LC-154`, `LY-154`, `LV-154` | `YV-002I` | No aplica |

Nota: los sufijos de las válvulas CIP propuestas deben contrastarse con todas las hojas del proyecto completo de Plant 3D. Si existe una colisión no visible en los PDF actuales, se asignará el siguiente tag libre sin modificar los tags existentes.

## 8. Correcciones obligatorias del GRAFCET

El GRAFCET debe actualizarse con estas reglas:

1. Mantener la secuencia `Fermentación -> Maduración -> Filtrado final`.
2. Eliminar cualquier mención a un tanque de enfriamiento.
3. Representar `TK-005 -> E-001 -> TK-006 seleccionado`.
4. Sustituir calentamiento por enfriamiento o control de temperatura en fermentación.
5. Sustituir calentamiento por enfriamiento o control de temperatura en maduración.
6. Corregir `maceración` por `maduración` cuando la etapa está después de fermentación.
7. Incorporar cinco ramas o una selección parametrizada para `TK-006A` a `TK-006E`.
8. Incorporar diez ramas o una selección parametrizada para `TK-008A` a `TK-008J`.
9. Usar los tags existentes para los equipos actuales y los tags nuevos aprobados para la ampliación.
10. Evitar textos provisionales, signos de interrogación, condiciones ambiguas y numeración duplicada.

La transición desde enfriamiento debe basarse en condiciones verificables, por ejemplo temperatura de salida de `E-001` dentro de rango, fermentador seleccionado disponible y transferencia completada.

## 9. Correcciones obligatorias del PFD y P&ID

### PFD

- Identificar explícitamente `TK-007` como tanque de filtrado final.
- Representar cinco fermentadores o indicar claramente una unidad típica multiplicada por cinco.
- Representar diez tanques de maduración o indicar claramente una unidad típica multiplicada por diez.
- Mostrar el retorno del agua de enfriamiento al chiller.
- Diferenciar condensado recuperado, drenaje CIP y flujo de producto.
- Mantener la dirección correcta del proceso entre hojas.

### P&ID

- Conservar todos los tags existentes.
- Agregar equipos e instrumentos nuevos sin duplicar tags.
- Agregar suministro y retorno del agua fría o helada.
- Cambiar a `CONDENSADO A SISTEMA DE RECUPERACIÓN` las salidas de las chaquetas de vapor actualmente rotuladas como desagüe.
- Conservar como desagüe las descargas reales del proceso de limpieza.
- Identificar y detallar la función de filtrado de `TK-007`.
- Verificar que las válvulas, líneas de selección, señales, alarmas e interlocks soporten cinco fermentadores y diez maduradores.

## 10. Criterios que debe cumplir el SCADA

El SCADA debe reflejar el proceso físico y no conservar supuestos de versiones anteriores.

### 10.1 Sinóptico general

- Mostrar el orden completo y correcto del proceso.
- No mostrar un tanque de enfriamiento.
- Mostrar `E-001` entre `TK-005` y los fermentadores.
- Mostrar `TK-007` como filtrado final después de maduración.
- Mostrar cinco fermentadores y diez maduradores, o componentes repetibles con acceso individual.
- Mostrar suministro y retorno del agua hacia el chiller.
- Mostrar condensado hacia recuperación separado del drenaje CIP.

### 10.2 Pantallas de fermentación y maduración

Cada tanque debe tener, como mínimo:

- Identificación única.
- Estado: disponible, seleccionado, llenando, en proceso, terminado, transfiriendo, CIP, alarma o fuera de servicio.
- Temperatura de proceso, setpoint y estado del lazo.
- Orden y realimentación de la válvula de enfriamiento.
- Nivel alto y nivel bajo.
- Presión cuando esté instrumentada.
- Tiempo transcurrido y tiempo restante.
- Permisos e interlocks de llenado y descarga.
- Alarmas propias sin reutilizar tags de otro tanque.

No debe existir ningún texto, icono, color o comando que indique calentamiento en fermentación o maduración.

### 10.3 Datos, simulación e historial

- Ampliar modelos, arrays, objetos o estructuras a 5 fermentadores y 10 maduradores.
- Evitar copiar y pegar estados independientes si se puede usar una estructura parametrizada por tag.
- Actualizar datos simulados, API, tópicos OPC UA/MQTT y mapeos PLC cuando existan.
- Incorporar los nuevos tags a alarmas, tendencias, históricos, recetas, reportes y pruebas.
- No romper los nombres ni las rutas de datos de los equipos existentes.

## 11. Validación cruzada

Antes de cerrar la corrección, comprobar:

| Validación | Resultado esperado |
|---|---|
| Flujo de proceso | Fermentación antes de maduración y filtrado final después de maduración |
| Enfriamiento previo | Solo `E-001`, sin tanque de enfriamiento |
| Fermentación | 5 tanques, solo enfriamiento |
| Maduración | 10 tanques, solo enfriamiento |
| Filtrado final | `TK-007` identificado y ubicado después de maduración |
| Vapor | Entra a chaquetas de calentamiento |
| Condensado | Sale hacia sistema de recuperación |
| CIP | Su descarga permanece diferenciada como desagüe |
| Chiller | Suministro y retorno visibles |
| Tags existentes | Sin cambios |
| Tags nuevos | Únicos y sin colisiones |
| SCADA | Pantallas, alarmas, tendencias y simulación coherentes |

## 12. Prompt para ajustar el SCADA con Codex

```text
Actúa como ingeniero de automatización y desarrollador senior del SCADA de esta
cervecería. Inspecciona primero todo el repositorio y localiza la arquitectura,
las vistas del proceso, componentes reutilizables, modelos de datos, tags,
simulación, API o comunicaciones, alarmas, tendencias, pruebas y documentación.
No supongas nombres de archivos ni tecnologías antes de inspeccionarlos.

Usa como fuente de verdad el archivo
AJUSTE_CONTEXTO_PROYECTO_CERVECERIA.md. Si el código actual contradice ese
archivo, aplica el contexto corregido. Conserva todos los tags existentes y no
renumeres equipos ya implementados.

Implementa estos cambios:

1. Corrige el flujo a:
   Agua -> Maceración -> Filtrado I -> Cocción -> E-001 -> Fermentación
   -> Maduración -> Filtrado final TK-007 -> Embotellado.
2. Elimina del SCADA cualquier tanque de enfriamiento. E-001 es un
   intercambiador de paso entre TK-005 y el fermentador seleccionado.
3. En fermentación y maduración no hay calentamiento. Sustituye textos,
   comandos, iconos, estados, variables y animaciones de calentamiento por
   control de enfriamiento/temperatura mediante agua fría o helada.
4. Amplía fermentación a TK-006A, TK-006B, TK-006C, TK-006D y TK-006E.
5. Amplía maduración a TK-008A hasta TK-008J.
6. Identifica TK-007 como "Tanque de filtrado final" y ubícalo después de
   maduración.
7. Representa el circuito del chiller con suministro y retorno de agua en
   E-001 y en las chaquetas de fermentación y maduración.
8. Donde el SCADA muestre descargas de chaquetas calentadas con vapor, cambia
   "Desagüe" por "Condensado a sistema de recuperación". No cambies las
   descargas reales de CIP, que deben permanecer como desagüe.
9. Para los equipos nuevos usa los tags propuestos en el documento de contexto,
   pero comprueba primero que no colisionen con ningún tag existente en el
   repositorio. Si encuentras una colisión, conserva el tag existente y asigna
   al nuevo elemento el siguiente identificador libre; documenta el ajuste.
10. Actualiza de manera integral pantallas, navegación, modelos de datos,
    arrays/objetos, datos simulados, mapeos PLC/OPC UA/MQTT si existen,
    alarmas, tendencias, históricos, recetas, reportes y pruebas.
11. Usa componentes parametrizados para los equipos repetidos cuando la
    arquitectura actual lo permita, preservando el estilo visual y el
    comportamiento existente.
12. Cada fermentador y madurador debe mostrar identidad, estado, temperatura,
    setpoint, salida/estado del control de enfriamiento, nivel alto/bajo,
    presión si aplica, temporización, permisos, interlocks y alarmas.

Restricciones:

- No cambies tags existentes.
- No inventes calentamiento para fermentación o maduración.
- No mezcles producto, agua de enfriamiento, condensado y drenaje CIP.
- No hagas un rediseño visual general que no sea necesario.
- Conserva compatibilidad con el backend y las comunicaciones actuales.
- No ocultes errores existentes relacionados con estos cambios.

Forma de trabajo:

1. Presenta un inventario breve de archivos y módulos afectados.
2. Implementa los cambios.
3. Ejecuta lint, typecheck, pruebas y build disponibles.
4. Revisa visualmente las pantallas principales si el proyecto permite preview.
5. Entrega un resumen de archivos modificados, decisiones tomadas, tags
   agregados, validaciones ejecutadas y pendientes reales.

Criterios de aceptación:

- Se visualizan 5 fermentadores y 10 maduradores con identidad y estado propios.
- No aparece un tanque de enfriamiento.
- No aparece calentamiento en fermentación o maduración.
- TK-007 aparece como filtrado final después de maduración.
- El chiller tiene suministro y retorno visibles.
- Condensado recuperado y drenaje CIP están claramente separados.
- No se modificó ni duplicó ningún tag existente.
- Compilación y pruebas finalizan correctamente, o se documenta con precisión
  cualquier bloqueo preexistente.
```

## 13. Pendientes de aprobación

- Confirmar el fluido definitivo de refrigeración: agua fría, agua helada o mezcla con glicol.
- Validar en el proyecto completo de Plant 3D que los tags propuestos desde 128 y las válvulas CIP no colisionen.
- Definir el detalle constructivo y la instrumentación específica del filtrado en `TK-007`.
- Actualizar los archivos fuente y retirar este estado temporal cuando exista una versión armonizada y aprobada de todos los documentos.
