# EnergyZero

Los precios dinámicos de la electricidad y del gas de los Países Bajos, publicados
por [EnergyZero](https://www.energyzero.nl), en Gladys: el precio de la hora actual,
las horas más baratas del día, un gráfico de precios de hoy y de mañana, y
disparadores de escena para poner en marcha sus aparatos cuando la electricidad es
más barata.

Esta integración no tiene relación con EnergyZero. Se ha desarrollado sin acceso a
la API real desde el entorno de desarrollo, con respuestas reales grabadas por la
biblioteca `energyzero`: sus comentarios son bienvenidos.

## Presentación

EnergyZero publica, sin cuenta ni clave:

- los **precios horarios de la electricidad** del mercado diario neerlandés (EPEX,
  zona NL), como precio de mercado o como precio final que paga un cliente de
  EnergyZero (precio de mercado, impuesto sobre la energía y costes de compra), con o
  sin IVA;
- el **precio diario del gas**, válido de 06:00 a 06:00.

Los precios de la electricidad de mañana se publican entre las 14:00 y las 15:00.
Los precios valen también para las marcas que compran su energía a través de
EnergyZero (ANWB Energie, Energie van Ons, Mijndomein Energie, SamSam, ZonderGas…).

Todas las horas se dan en hora de Ámsterdam, y un día va de medianoche a medianoche
en Ámsterdam, sea cual sea la zona horaria de su Gladys.

## Requisitos

- Gladys Assistant 5.1.0 o posterior.
- Acceso a internet desde Gladys hacia `public.api.energyzero.nl`.
- Nada más: ni cuenta, ni clave de API, ni hardware.

## Instalación

1. En Gladys, abra **Integraciones → Instalar desde GitHub** e introduzca
   `https://github.com/guim31/gladys-energyzero`.
2. Abra la integración, compruebe la configuración y guarde.
3. Abra la pestaña **Descubrir** y añada el dispositivo **EnergyZero**.
4. En un panel, añada el widget **Precios de la luz**.

## Configuración

| Campo                                  | Por defecto  | Función                                                                                  |
| -------------------------------------- | ------------ | ---------------------------------------------------------------------------------------- |
| Precio de la electricidad              | Precio final | Precio final al consumidor, o solo el precio de mercado EPEX day-ahead                   |
| Incluir el IVA                         | Sí           | Precios con el IVA neerlandés (21 %)                                                     |
| Precio del gas                         | Sí           | Leer también el precio del gas del día; cambiarlo añade o quita una función (actualizar) |
| Idioma de los nombres de las funciones | Francés      | Se usa al añadir el dispositivo: los nombres ya no cambian después                       |

El botón **Consultar los precios ahora** consulta EnergyZero en el momento y muestra
lo que publica para hoy y mañana: útil para comprobar la conexión.

## El dispositivo EnergyZero

Un único dispositivo, de solo lectura, actualizado por la propia integración cada
minuto (los precios se consultan en EnergyZero una vez por hora).

| Función                           | Tipo     | Valor                                                                         |
| --------------------------------- | -------- | ----------------------------------------------------------------------------- |
| Precio actual (€/kWh)             | Precio   | Precio de la hora actual                                                      |
| Precio próxima hora (€/kWh)       | Precio   | Precio de la hora siguiente (después de las 23:00, cuando se conoce mañana)   |
| Precio medio de hoy (€/kWh)       | Precio   | Media de las horas del día                                                    |
| Precio mínimo de hoy (€/kWh)      | Precio   | Hora más barata del día                                                       |
| Precio máximo de hoy (€/kWh)      | Precio   | Hora más cara del día                                                         |
| Hora más barata de hoy            | Texto    | Inicio de la hora más barata, `HH:MM`                                         |
| Hora más cara de hoy              | Texto    | Inicio de la hora más cara, `HH:MM`                                           |
| Rango de la hora (1 = más barata) | Contador | Rango de la hora actual en el día, de 1 a 24 (23 o 25 en los cambios de hora) |
| Precio del gas de hoy (€/m³)      | Precio   | Precio del gas del día gasista (06:00 a 06:00), si está activado              |

Gladys no tiene unidad €/kWh: los precios aparecen en euros y el nombre dice por qué
unidad. Cuando una función es la única de su tipo en el dispositivo, el panel muestra
la etiqueta genérica del tipo («Contador») en lugar de su nombre.

## Widget del panel

**Precios de la luz** muestra el tipo de precio, tres mosaicos (ahora, próxima hora,
media de hoy), el gráfico de hoy y de mañana con la hora más barata y la más cara de
cada día marcadas y una línea en la hora actual, y después la hora más barata de hoy
y de mañana, la media de mañana y el precio del gas. Antes de las 15:00 indica que
los precios de mañana llegan después de las 15:00.

## Disparadores de escena

Dos disparadores, en el editor de escenas bajo **EnergyZero**. Ambos se refieren a la
electricidad y a las horas del día en curso (de medianoche a medianoche).

### Empiezan las horas más baratas del día

Se dispara una vez al día, al inicio del tramo de horas consecutivas más barato del
día. Elija la duración del tramo: de 1 a 6 u 8 horas (1 hora es la hora más barata
del día). Variables: precio medio del tramo, hora de inicio y de fin.

### Empieza una de las horas más baratas

Se dispara al inicio de cada una de las N horas más baratas del día, consecutivas o
no. Elija N: de 1 a 6, 8, 10 o 12. Variables: precio de la hora, su rango, hora de
inicio y de fin.

Los disparadores salen cuando empieza la hora, con un máximo de 10 minutos de retraso
(reinicio de Gladys o de la integración): una hora que empezó hace más tiempo no
dispara nada. «El precio baja de X» no es un disparador: use la función **Precio
actual** con la condición de umbral del editor de escenas.

## Ejemplos de escenas

- **Lavavajillas en las 3 horas más baratas**: disparador _Empiezan las horas más
  baratas del día_, 3 horas → encender el enchufe del lavavajillas.
- **Termo eléctrico en las 4 horas más baratas**: disparador _Empieza una de las
  horas más baratas_, 4 → encender el termo; una segunda escena sobre _Rango de la
  hora_ mayor que 4 → apagarlo.
- **Aviso de hora cara**: cuando _Precio actual_ supera 0,40 → enviar el mensaje
  «La electricidad está cara ahora mismo, espere para poner la secadora».

## Actualización y uso de la API

EnergyZero no publica ninguna cuota para esta API pública. La integración la usa poco:

- dos peticiones por hora (electricidad, y gas si está activado), cada una con tres
  días (ayer, hoy, mañana);
- a partir de las 14:00, una petición de electricidad más cada 15 minutos hasta que
  se publican los precios de mañana, y después de nuevo una por hora;
- tras un fallo, nuevo intento a los 5, 10, 20, 40 y después 60 minutos; mientras
  tanto se siguen usando los últimos precios conocidos (los precios se conocen con un
  día de antelación).

Los estados solo se publican cuando cambian, con un recordatorio cada 6 horas.

## Solución de problemas

- **«No se puede acceder a EnergyZero»** en la pantalla de configuración: Gladys no
  tiene acceso a internet o EnergyZero tiene una incidencia. Se siguen usando los
  últimos precios conocidos; pulse **Consultar los precios ahora** para reintentar.
- **«no publica ningún precio de la electricidad para hoy»**: EnergyZero respondió
  sin precios para el día, lo que ocurre en una incidencia de publicación. La
  integración lo vuelve a intentar cada hora.
- **Ningún valor en el dispositivo**: añada primero el dispositivo desde la pestaña
  Descubrir; sus valores llegan en el acto.
- **Falta la función del gas o sigue apareciendo**: tras cambiar el ajuste del gas,
  abra la pestaña Descubrir y pulse **Actualizar** en el dispositivo.
- **Registros detallados**: defina `LOG_LEVEL=debug` en el contenedor para ver cada
  consulta.

## Limitaciones

- Solo precios horarios. El mercado diario neerlandés negocia cuartos de hora desde
  octubre de 2025: la integración muestra los precios horarios de EnergyZero.
- Solo los Países Bajos, precios de EnergyZero (y de las marcas a las que suministra).
  Su propio contrato puede tener otro margen.
- Los disparadores solo miran el día en curso: un tramo más barato nunca pasa la
  medianoche.
- Solo lectura: la integración no controla nada por sí misma.
- Los nombres de las funciones se fijan al añadir el dispositivo; cambiar el idioma
  después no los renombra.

## Comparación con Nord Pool

Una integración de Nord Pool da el precio bruto del mercado diario de una zona de
oferta, sin IVA ni impuestos. EnergyZero aporta, para los Países Bajos, el **precio
final al consumidor** (impuesto sobre la energía, costes de compra e IVA incluidos, lo
que paga un cliente de EnergyZero) y el **precio del gas**; su precio de mercado (EPEX
day-ahead, zona NL) es el mismo mercado que la zona NL de Nord Pool.
