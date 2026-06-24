# obsi-math

🇪🇸 [Español](./README.es.md) · 🇬🇧 [English](./README.en.md)

Plugin de [Obsidian](https://obsidian.md) para graficar funciones matemáticas directamente en tus notas, usando bloques de código `obs-graph`. Renderiza la expresión en LaTeX, dibuja la gráfica con un motor WebGL + Canvas 2D (estilo Desmos), y calcula automáticamente raíces, vértices y la intersección con el eje Y.

![Vista general del plugin: LaTeX + gráfica de 1/(x-2) con asíntota vertical](assets/images/demo-asymptote.png)

---

## Características

- 📈 Graficado en tiempo real con motor WebGL (curvas) + Canvas 2D (ejes, grid, etiquetas).
- ✏️ Renderizado LaTeX de la expresión ingresada, incluyendo exponentes anidados y raíces de cualquier índice.
- 🔍 Zoom y pan interactivos con el mouse.
- 🖱️ Crosshair (retícula) interactivo: sigue el cursor y muestra `x` y `f(x)` en tiempo real, con un marcador sobre la curva.
- 📍 Detección automática de raíces, vértices (máximos/mínimos) e intersección Y (corte con el eje Y, `f(0)`), visualizados como marcadores naranjas sobre el plano. Al acercar el cursor a un punto notable aparece su etiqueta de coordenadas.
- ⚡ Asíntotas verticales detectadas y dibujadas como líneas punteadas, incluyendo los casos donde ambas ramas divergen en la misma dirección (`1/x²`, `x⁻⁴`, etc.).
- ⚠️ Clasificación de funciones no graficables en ℝ (*No definida en ℝ*, *Indefinida*, *Indeterminada*), con overlay informativo y plano interactivo.
- 🎨 Grid sutil, ejes discretos, márgenes y centrado correctos, sin deformación al redimensionar.
- 🔤 Entrada en LaTeX, Unicode (`π`, `√`, `×`, `÷`, `²`, `³`) y notación matemática estándar.
- 📐 Soporte para valor absoluto (`|x|`, `\left|…\right|`, `abs(x)`) y las seis funciones trigonométricas inversas (`arcsin`, `arccos`, `arctan`, `arccsc`, `arcsec`, `arccot`) en múltiples formas de entrada.

![Crosshair interactivo mostrando la posición del cursor, el valor de x y la evaluación de la función en tiempo real](assets/images/demo-crosshair.png)

![Puntos notables detectados automáticamente, con marcadores sobre raíces, vértices e intersección Y](assets/images/demo-notable-points.png)

![tan(x) con asíntotas verticales correctamente detectadas y dibujadas](assets/images/demo-tan.png)

---

## Instalación

### Manual

1. Descarga `main.js`, `manifest.json` y `styles.css` desde la última release.
2. Crea la carpeta `obsi-math` dentro de `<tu-vault>/.obsidian/plugins/`.
3. Copia ahí los archivos.
4. En Obsidian: **Configuración → Plugins de la comunidad** → activa **Obsi Math**.

### Desde código fuente

```bash
git clone https://github.com/RughustDev/obsi-math.git
cd obsi-math
npm install
npm run build
```

Copia el `main.js` generado (junto con `manifest.json` y `styles.css`) a la carpeta de plugins de tu vault.

---

## Uso

Crea un bloque de código con el lenguaje `obs-graph` y escribe tu función:

````markdown
```obs-graph
x^2 - 4
```
````

También puedes escribir la igualdad completa; el plugin toma el lado derecho automáticamente:

````markdown
```obs-graph
f(x) = sin(x) * 2
```
````

El bloque renderiza la expresión en LaTeX, la gráfica interactiva, y los puntos notables calculados: intersección Y, raíces reales y vértices.

**Más ejemplos:**

Asíntota vertical:

````markdown
```obs-graph
1/(x-2)
```
````

Valor absoluto:

````markdown
```obs-graph
|x^2 - 4|
```
````

Función trigonométrica inversa:

````markdown
```obs-graph
arctan(x)
```
````

Raíz de índice arbitrario:

````markdown
```obs-graph
\sqrt[3]{x}
```
````

Exponente anidado (se renderiza y evalúa como `x⁹`):

````markdown
```obs-graph
x^{3^{2}}
```
````

### Interacción con la gráfica

| Acción | Efecto |
|---|---|
| Mover el cursor | Muestra crosshair con `x` y `f(x)` en tiempo real |
| Acercar el cursor a un punto notable | Muestra etiqueta de coordenadas `(x, y)` |
| Arrastrar | Desplaza la vista (pan) |
| Rueda del mouse | Zoom in/out centrado en el cursor |

### Funciones con muchos puntos notables

En funciones periódicas como `sin(x)` o `tan(x)`, las raíces y vértices son infinitos y no se dibujan individualmente. En su lugar aparece un botón **ⓘ** en la esquina de la gráfica que muestra un resumen al pulsarlo.

![Resumen de puntos notables para funciones con raíces o vértices infinitos mediante el botón de información](assets/images/demo-summary.png)

### Funciones no graficables

Si la función no produce ningún valor real (por ejemplo `sqrt(-1)` o `log(x)/log(1)`), el plano aparece oscurecido con una etiqueta que indica la causa: *No definida en ℝ*, *Indefinida* o *Indeterminada*. El zoom y pan siguen activos.

Un bloque vacío muestra el mensaje *Sin función* en lugar de un error.

![Overlay informativo mostrado cuando la función no produce valores reales graficables](assets/images/demo-degenerate.png)

---

## Sintaxis de entrada

El plugin normaliza distintos formatos antes de evaluarlos con [mathjs](https://mathjs.org/):

| Tipo | Ejemplos |
|---|---|
| Unicode | `π`, `√`, `×`, `÷`, `²`, `³`, `∞` |
| LaTeX | `\frac{1}{2}`, `x^{2}`, `\sqrt{x}`, `\sqrt[3]{x}`, `\sin{x}`, `\log_{2}{x}`, `\left|x\right|` |
| Estándar | `sin(x)`, `cos(x)`, `log(x, 2)`, `sqrt(x)`, `abs(x)` |
| Inversas | `arcsin(x)`, `sin⁻¹(x)`, `asin(x)` (y análogas para cos, tan, csc, sec, cot) |

> ⚠️ **Trigonometría (grados vs. radianes):** si el argumento es un número literal (ej. `sin(30)`), se interpreta en **grados**; si el argumento contiene una variable (ej. `sin(x)`), se evalúa en **radianes**.

**Raíces de cualquier índice:** se soporta la notación `\sqrt[n]{x}` para raíces cúbicas, cuárticas, quintas, etc. Las raíces de índice impar con radicando negativo devuelven el valor real (ej. `\sqrt[3]{-8} = -2`).

![Raíz cúbica de x graficada, mostrando la rama negativa](assets/images/demo-cbrt.png)

**Valor absoluto:** se aceptan `|x|`, `\left|x\right|` y `abs(x)`. Las barras verticales se parsean con un algoritmo basado en pila, sin regex, para soportar correctamente expresiones internas complejas.

![Función de valor absoluto utilizando barras verticales en la entrada](assets/images/demo-absolute-value.png)

**Funciones trigonométricas inversas:** `arccsc`, `arcsec` y `arccot` no son nativas de mathjs; el plugin las implementa como wrappers de dominio real (`acsc(x) = asin(1/x)`, `acot(x) = π/2 − atan(x)`, etc.).

![Ejemplo de función trigonométrica inversa representada en la gráfica](assets/images/demo-inverse-trig.png)

**Números complejos:** no hay soporte. Si la función produce un resultado imaginario, el plano mostrará el overlay de función no graficable.

---

## Problemas conocidos

- El comportamiento visual de funciones con asíntotas densas (como `sec(10x)`) al hacer zoom out extremo es inherente a la naturaleza periódica de esas funciones; se ha mejorado notablemente pero no desaparece por completo.

### Corregido

- ~~**Renderizado LaTeX de `\sqrt`, `\log`, etc. sin llaves**~~
- ~~**Paréntesis extra en exponentes anidados**~~
- ~~**Desfase del cursor al hacer zoom**~~
- ~~**Asíntota falsa en funciones tipo `x^{2^{π}}`**~~
- ~~**Scrollbar horizontal espuria en el panel LaTeX**~~

---

## obs-system (deshabilitado temporalmente)

El plugin incluye un bloque `obs-system` para resolver y graficar sistemas de ecuaciones lineales, pero **está deshabilitado por ahora**: al usarlo solo se muestra un aviso.

Motivo: es una función muy básica todavía, con lag notable al hacer zoom o pan. El desarrollo está actualmente enfocado en pulir `obs-graph`, así que `obs-system` se retomará y mejorará más adelante.

Para reactivarlo durante desarrollo, en `main.ts`:

```typescript
private readonly OBS_SISTEMA_HABILITADO = false; // → true
```

---

## Desarrollo

Requisitos: Node.js, npm, TypeScript.

```bash
npm run build
```

Flujo recomendado: editar `main.ts` → compilar → copiar `main.js` a un vault de pruebas → verificar → respaldar si funciona, restaurar si falla.

> **Importante:** tanto `manifest.json` como `main.ts` deben guardarse en **UTF-8 sin BOM**. Un BOM al inicio de cualquiera de estos archivos puede romper el parseo en Obsidian o producir errores silenciosos en la compilación.

---

## Hoja de ruta

- [ ] Reactivar y pulir `obs-system` (rendimiento de zoom/pan).
- [ ] Panel de información integrado en la gráfica (reemplazar el panel inferior actual).
- [ ] Configuración global en el panel de ajustes de Obsidian (precisión decimal, tema).
- [ ] Selector de unidades trigonométricas (grados/radianes/gradianes).
- [ ] Soporte completo de entrada LaTeX enriquecida.

---

## Licencia

MIT — ver [LICENSE](./LICENSE).

## Repositorio

[github.com/RughustDev/obsi-math](https://github.com/RughustDev/obsi-math)