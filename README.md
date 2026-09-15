# Tetris

Implementación del clásico **Tetris** en JavaScript vanilla, usando HTML5 Canvas y CSS. Sin dependencias externas, sin frameworks, sin proceso de build: solo abrir y jugar.

![Tech](https://img.shields.io/badge/HTML5-Canvas-orange)
![Tech](https://img.shields.io/badge/CSS3-blueviolet)
![Tech](https://img.shields.io/badge/JavaScript-Vanilla-yellow)

---

## Tabla de contenidos

- [Tetris](#tetris)
  - [Tabla de contenidos](#tabla-de-contenidos)
  - [Qué hace el proyecto](#qué-hace-el-proyecto)
  - [Cómo ejecutar el juego](#cómo-ejecutar-el-juego)
    - [Opción 1: abrir el archivo directamente](#opción-1-abrir-el-archivo-directamente)
    - [Opción 2: servidor local (recomendado)](#opción-2-servidor-local-recomendado)
  - [Controles](#controles)
    - [Móvil (táctil)](#móvil-táctil)
  - [Power-ups](#power-ups)
  - [Tabla de récords](#tabla-de-récords)
  - [Cómo funciona](#cómo-funciona)
    - [1. `index.html`](#1-indexhtml)
    - [2. `style.css`](#2-stylecss)
    - [3. `game.js`](#3-gamejs)
    - [Flujo del juego](#flujo-del-juego)
  - [Tecnologías](#tecnologías)
  - [Estructura del proyecto](#estructura-del-proyecto)
  - [Personalización](#personalización)
  - [Licencia](#licencia)

---

## Qué hace el proyecto

Es una versión jugable del Tetris clásico con todas las mecánicas que esperarías:

- Tablero de **10 × 20** celdas.
- Las **7 piezas estándar** (I, O, T, S, Z, J, L) con colores diferenciados.
- **Rotación** con _wall kicks_ básicos (pequeños desplazamientos para que la pieza pueda rotar pegada a la pared).
- **Soft drop** (bajada acelerada) y **hard drop** (caída instantánea).
- **Pieza fantasma** (_ghost piece_): muestra dónde aterrizará la pieza actual.
- **Vista previa** de la siguiente pieza.
- **Sistema de puntuación** clásico de Tetris (100 / 300 / 500 / 800 multiplicado por nivel).
- **Niveles** que aumentan cada 10 líneas y aceleran la caída.
- **Pausa** y **Game Over** con opción de reinicio.
- **Sistema de power-ups**: cada 10 líneas una pieza llega con un bloque especial marcado (💣 ⚡ 🎨 ⬇ ❄) que solo se activa al eliminarlo en una línea, con **cascadas** puntuables y feedback visual y sonoro.
- **Tabla de récords local**: top 5 puntuaciones guardadas en `localStorage`, visibles en la pantalla de inicio y en el game over, con combo máximo y líneas máximas de golpe.

---

## Cómo ejecutar el juego

No hay nada que instalar ni compilar. Tienes dos opciones:

### Opción 1: abrir el archivo directamente

```bash
open index.html        # macOS
xdg-open index.html    # Linux
start index.html       # Windows
```

### Opción 2: servidor local (recomendado)

Cualquier servidor estático funciona. Algunos ejemplos:

```bash
# Con Python 3
python3 -m http.server 8000

# Con Node.js (npx)
npx serve .

# Con PHP
php -S localhost:8000
```

Después abre `http://localhost:8000` en el navegador.

---

## Controles

| Tecla     | Acción                            |
| --------- | --------------------------------- |
| `←` / `→` | Mover la pieza horizontalmente    |
| `↑` o `X` | Rotar la pieza en sentido horario |
| `↓`       | Soft drop (bajar más rápido)      |
| `Espacio` | Hard drop (caída instantánea)     |
| `P`       | Pausar / reanudar                 |

### Móvil (táctil)

En pantallas pequeñas (o cualquier dispositivo táctil) el layout se reorganiza —marcadores arriba, tablero centrado— y aparecen botones en pantalla:

| Botón       | Acción                        |
| ----------- | ----------------------------- |
| `←` `→`     | Mover (se repiten al mantener) |
| `↓`         | Soft drop (se repite al mantener) |
| `⟳`         | Rotar                         |
| `⤓`         | Hard drop                     |
| `⏸`         | Pausar / reanudar             |

También funcionan los gestos sobre el tablero:

- **Deslizar ← / →**: mueve la pieza una celda cada ~24 px arrastrados.
- **Deslizar ↓**: hard drop.
- **Tocar**: rota.

---

## Power-ups

Cada **10 líneas** eliminadas, la siguiente pieza generada llega con **uno** de sus cuatro bloques marcado con el icono de un power-up. Es un tetromino normal: el resto de bloques se comporta como siempre.

El efecto **no se dispara al fijar la pieza**, sino al eliminar el bloque marcado en una línea completa. El jugador decide dónde colocarlo. El origen del efecto es la celda que ocupaba ese bloque.

| Power-up      | Efecto                                                                              |
| ------------- | ----------------------------------------------------------------------------------- |
| 💣 **Bomba**  | Destruye el área 3×3 centrada en el origen (recortada en los bordes, no se propaga). |
| ⚡ **Rayo**   | Limpia la fila y la columna completas del origen (cruz).                             |
| 🎨 **Tinte**  | Todos los bloques del color del origen pasan a ser comodines; persisten hasta ser eliminados. |
| ⬇ **Gravedad** | Compacta el tablero: cada bloque cae hasta apoyarse, eliminando huecos internos (caída por columna, no _sticky_). |
| ❄ **Congelar** | Pausa la caída automática durante 5 s. Se puede seguir moviendo, rotando y haciendo hard drop. |

Reglas del sistema:

- **Uno a la vez**: si queda un power-up sin consumir, no aparece otro; el contador de líneas se pospone, no se pierde.
- **Sin repeticiones**: nunca sale el mismo tipo dos veces seguidas.
- **Orden de resolución**: line clear normal → efecto → gravedad/colapso → puntuación.
- **Cascadas**: si Gravedad o Bomba completan líneas nuevas al colapsar, esas líneas también se eliminan y puntúan con un multiplicador **×1.5 acumulativo** por cascada.
- **Congelar durante Congelar** reinicia el temporizador (no se acumula); la pausa manual (`P`) y el _game over_ también lo congelan o lo cancelan.
- El panel lateral muestra el power-up pendiente y la cuenta atrás de Congelar.

Toda la parametrización vive en el objeto `PU` de `game.js`:

| Parámetro           | Significado                                | Por defecto |
| ------------------- | ------------------------------------------ | ----------- |
| `linesPerPowerup`   | Líneas entre apariciones                   | `10`        |
| `bombRadius`        | Radio de la Bomba (`1` ⇒ área 3×3)         | `1`         |
| `freezeMs`          | Duración de Congelar en ms                 | `5000`      |
| `cascadeMultiplier` | Multiplicador acumulativo por cascada      | `1.5`       |
| `gravityMode`       | Modo de caída de Gravedad                  | `'column'`  |
| `maxCascades`       | Tope de seguridad de cascadas encadenadas  | `20`        |
| `fxMs`              | Duración máxima de la animación en ms      | `400`       |
| `sound`             | Activa o silencia los efectos de sonido    | `true`      |

---

## Tabla de récords

El juego guarda las **5 mejores puntuaciones** en `localStorage` (clave `tetris-highscores`), sin backend ni cuentas de usuario.

- **Pantalla de inicio**: antes de jugar, `#start-screen` muestra la tabla de récords sobre un tablero recién inicializado y en pausa. El botón **Jugar** arranca la partida real.
- **Al perder**: si la puntuación final entra en el top 5, aparece un campo de texto (máx. 10 caracteres) para guardar el nombre del jugador; si no entra, no se muestra ningún campo. El último nombre usado se recuerda en `localStorage` (`tetris-last-name`) como sugerencia para la próxima vez.
- **Resaltado**: al guardar, la fila recién insertada se resalta en la tabla del game over.
- **Reset**: un botón "Resetear récords" (en la pantalla de inicio y en el game over) borra toda la tabla tras confirmar con un `confirm()`.
- **Estadísticas por partida**: cada entrada guarda, además del nombre, la puntuación, las líneas y el nivel, el **mejor combo** (líneas seguidas eliminadas sin fallar una pieza) y las **máximas líneas eliminadas de golpe** en esa partida.

Toda la lógica vive en la sección `// ---- records ----` de `game.js`: `loadScores` / `saveScores` leen y escriben en `localStorage` de forma defensiva (con `try/catch` y validación de forma, por si el dato es de una versión anterior o está corrupto), `qualifies` decide si una puntuación entra en el top 5, y `renderScores` pinta la tabla con `textContent`/`createElement` (nunca `innerHTML`) para evitar inyectar HTML desde el nombre introducido por el jugador.

---

## Cómo funciona

El juego se compone de tres archivos que cooperan:

### 1. `index.html`

Define la estructura visual:

- Un `<canvas id="board">` de **300 × 600** píxeles donde se renderiza el tablero.
- Un panel lateral con `SCORE`, `LINES`, `LEVEL`, `POWER-UP`, vista de la siguiente pieza y la lista de controles.
- Un overlay para los estados **PAUSA** y **GAME OVER**.

### 2. `style.css`

Aporta el aspecto visual con estética _dark / retro arcade_: fondo oscuro, tipografía monoespaciada para los marcadores y _backdrop blur_ en los overlays.

### 3. `game.js`

Contiene toda la lógica del juego. A grandes rasgos:

- **Modelo del tablero**: una matriz `ROWS × COLS` donde cada celda guarda `0` (vacía) o un índice de color (1–7) que identifica la pieza.
- **Piezas**: definidas como matrices cuadradas. Para rotar se calcula la transposición + reverso de filas (`rotateCW`).
- **Detección de colisiones** (`collide`): comprueba que ninguna celda de la pieza salga del tablero ni se solape con bloques ya fijados.
- **Wall kicks** (`tryRotate`): si la rotación choca, intenta desplazar la pieza ±1 y ±2 columnas antes de descartar el giro.
- **Game loop** (`loop`): basado en `requestAnimationFrame`, acumula el tiempo transcurrido y baja la pieza una fila cuando se supera `dropInterval`.
- **Limpieza de líneas** (`resolveClears`): las filas completas se **vacían sin colapsar** (así las coordenadas de origen de los power-ups siguen siendo válidas), se aplican los efectos, se colapsan las filas y se puntúa; si el colapso genera filas nuevas, se repite el ciclo como cascada.
- **Power-ups**: dos rejillas paralelas al tablero, `marks` (id del power-up por celda) y `wilds` (comodines de Tinte), se mueven junto a `board` en todos los colapsos. La marca viaja con su bloque al rotar (`tryRotate` gira `current.marks` con el mismo `rotateCW`).
- **Puntuación**: usa la tabla clásica `[0, 100, 300, 500, 800]` multiplicada por el nivel actual; el hard drop suma 2 puntos por celda recorrida y el soft drop 1 punto por fila.
- **Nivel y velocidad**: el nivel sube cada 10 líneas; la velocidad de caída se calcula como `max(100, 1000 − (level − 1) × 90)` milisegundos.
- **Ghost piece** (`ghostY`): proyecta la posición final de la pieza actual hacia abajo y la dibuja con `globalAlpha = 0.2`.

### Flujo del juego

```
init()
  ├─ createBoard()                  → matriz vacía
  ├─ next = randomPiece()
  ├─ spawn()                        → mueve next a current y genera nueva next
  └─ requestAnimationFrame(loop)
        ↓
   loop(timestamp)
     ├─ acumula dt
     ├─ si dt ≥ dropInterval → baja la pieza o llama a lockPiece()
     ├─ draw()  (grid + tablero + ghost + pieza actual)
     └─ requestAnimationFrame(loop)

   keydown → mover / rotar / soft-drop / hard-drop / pausa
```

Cuando una pieza recién generada ya colisiona al aparecer (`spawn`), se dispara `endGame()` y se muestra el overlay de **Game Over**.

---

## Tecnologías

- **HTML5** — marcado y dos elementos `<canvas>` (tablero y vista previa).
- **CSS3** — _flexbox_, variables de color, `backdrop-filter` y `box-shadow`.
- **JavaScript (ES6+) vanilla** — `const`/`let`, _arrow functions_, _spread operator_, `Array.from`, _template literals_…
- **Canvas 2D API** — para todo el renderizado del juego.
- **`requestAnimationFrame`** — para el bucle de juego sincronizado con el navegador.

**Sin dependencias.** No hay `package.json`, ni bundler, ni transpilador.

---

## Estructura del proyecto

```
03-tetris/
├── index.html      # Estructura del DOM y canvas
├── style.css       # Estilos del juego (dark theme)
├── game.js         # Toda la lógica del Tetris y los power-ups (~700 líneas)
└── README.md
```

---

## Personalización

Algunos parámetros fáciles de tunear en `game.js`:

| Constante      | Significado                              | Por defecto           |
| -------------- | ---------------------------------------- | --------------------- |
| `COLS`         | Columnas del tablero                     | `10`                  |
| `ROWS`         | Filas del tablero                        | `20`                  |
| `BLOCK`        | Tamaño en píxeles de cada celda          | `30`                  |
| `COLORS`       | Paleta de colores por tipo de pieza      | 7 colores             |
| `LINE_SCORES`  | Puntos por 1, 2, 3 o 4 líneas eliminadas | `[0,100,300,500,800]` |
| `dropInterval` | Velocidad inicial de caída en ms         | `1000`                |
| `PU`           | Configuración de los power-ups           | ver [Power-ups](#power-ups) |

> Si cambias `COLS`, `ROWS` o `BLOCK`, recuerda ajustar también `width` y `height` del `<canvas id="board">` en `index.html` para que coincida (`COLS × BLOCK` × `ROWS × BLOCK`).

---

## Licencia

Proyecto de uso libre con fines educativos y de práctica.
