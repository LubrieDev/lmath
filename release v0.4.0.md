# Obsi Math v0.4.0 — Revisión Mayor del Motor de Graficación y Análisis Matemático

Esta versión representa una refactorización profunda de Obsi Math, abarcando el parser matemático, el análisis numérico, la detección de singularidades, el motor de renderizado WebGL y la experiencia de usuario.

---

## Añadido

### Matemáticas y parsing

- Nuevo parser de fracciones LaTeX anidadas (`\frac{}`) con balanceo de llaves y soporte recursivo.
- Soporte para exponentes racionales mediante evaluación con raíces reales (`nthRoot`).
- Conversión de raíces n-ésimas LaTeX `\sqrt[n]{x}` → `nthRoot(x, n)` con índice arbitrario.
- Conversión de exponentes fraccionarios `x^{m/n}` y `x^{\frac{m}{n}}` → `\sqrt[n]{x^m}`, graficables también para bases negativas donde la raíz es real.
- Compatibilidad ampliada con entrada LaTeX, Unicode y notación matemática estándar.
- Manejo correcto de exponentes anidados complejos.
- Conversión automática de `ln` (sin backslash) a `log`, además de `\ln`.
- Corrección de raíces impares con radicandos negativos, evitando resultados complejos innecesarios.
- Soporte para valor absoluto: `|x|`, `\left|…\right|`, `abs(x)` y expresiones anidadas como `||x|-1|`, normalizados internamente a `abs(…)`.
- Soporte para las seis funciones trigonométricas inversas en múltiples formas de entrada:
  - `arcsin` / `asin` / `sin⁻¹` → `asin`
  - `arccos` / `acos` / `cos⁻¹` → `acos`
  - `arctan` / `atan` / `tan⁻¹` → `atan`
  - `arccsc` / `acsc` / `csc⁻¹` → `acsc`
  - `arcsec` / `asec` / `sec⁻¹` → `asec`
  - `arccot` / `acot` / `cot⁻¹` → `acot`
- Wrappers de dominio real para `acsc`, `asec` y `acot` (no disponibles de forma nativa en mathjs).

### Análisis numérico

- Nueva función de refinamiento de raíces basada en bisección de alta precisión.
- Distinción explícita entre raíces reales y polos durante la convergencia.
- Detección de funciones degeneradas clasificadas en tres categorías:
  - Indefinidas.
  - No definidas en ℝ.
  - Indeterminadas.
- Sistema de clasificación y agrupación de puntos notables con tres estados: `normal`, `infinitas`, `demasiadas`.
- Umbral periódico para distinguir funciones que oscilan de verdad (`sin(x)` → infinitas raíces) de funciones que solo ondean (`x+sin(x)` → raíz única).
- Resumen automático para funciones con infinitas raíces o cantidades excesivas de puntos destacados.
- Fusión automática de raíces, vértices e intersección Y para evitar duplicados.

### Motor gráfico

- Detección de asíntotas verticales de misma rama (`1/x²`, `x⁻⁴`, etc.) mediante escaneo independiente del muestreo.
- Separación explícita entre overflow numérico y discontinuidades reales.
- Forzado de ramas al borde del viewport en polos para que la curva trepe visualmente hasta el límite.
- Muestreo adaptativo según el contexto de renderizado.
- Sistema de calidad dinámica para zoom y pan.
- Renderizado especializado para funciones degeneradas.
- Prevención de redibujados innecesarios.

### Interfaz

- Crosshair interactivo con seguimiento de coordenadas.
- Lectura dinámica de `x` y `f(x)` bajo el cursor.
- Distinción en el crosshair entre desbordamiento numérico (`f(x) > 10³⁰⁸`) y divergencia real (`f(x) → ±∞`) para valores no representables como `double`.
- Marcador visual sobre la curva en la posición del cursor.
- Sistema visual de puntos notables sobre el plano (marcadores naranjas de tamaño constante con el zoom).
- Etiquetas de coordenadas que aparecen solo al acercar el cursor a un punto notable (≤ 16 px), con prevención automática de superposición.
- Botón informativo ⓘ para resúmenes de puntos notables en funciones periódicas o de alta densidad (el panel `obsi-math-info` está oculto por CSS, por lo que el resumen se muestra mediante este botón/popover).
- Overlay informativo para funciones no graficables: el plano cartesiano permanece oscurecido pero interactivo (zoom/pan), con la etiqueta formal flotando delante.
- Mensaje específico "Sin función" para bloques `obs-graph` vacíos, en lugar de tratarlos como indeterminados.
- Mejoras visuales en el panel LaTeX:
  - Fade lateral dinámico según posición de scroll.
  - Scroll horizontal con la rueda del ratón, con desplazamiento limitado por evento (±40 px) para uniformar el comportamiento entre dispositivos.
  - Actualización automática tras cambios de tamaño y carga de fuentes.

---

## Mejorado

### Parsing matemático

- Procesamiento correcto de fracciones LaTeX anidadas con balanceo de llaves.
- Evaluación correcta de exponentes racionales mediante raíces reales.
- Compatibilidad ampliada con expresiones LaTeX complejas y exponentes anidados.
- Normalización más robusta de la entrada matemática.
- Renderizado LaTeX de funciones inversas: `asin` → `\arcsin`, `acsc` → `\text{arccsc}`, etc.

### Análisis numérico

- Resolución de muestreo aumentada de 200 a 1000 muestras.
- Detección de raíces completamente reescrita con mayor precisión.
- Detección de vértices resistente a singularidades cercanas.
- Eliminación de falsos extremos generados por asíntotas.
- Mejor clasificación de funciones periódicas y conjuntos densos de puntos notables.

### Renderizado

- Calidad adaptativa durante interacción y render final.
- Manejo más preciso de polos cercanos al borde del viewport.
- Mejor comportamiento de las asíntotas durante zoom out.
- Mejor rendimiento durante cambios de tamaño.
- Mejor respuesta durante pan y zoom continuos.

### Experiencia de usuario

- Panel LaTeX más robusto frente a cambios de tamaño y carga de fuentes.
- Mejor presentación de expresiones vacías.
- Mejor visualización de información matemática relevante sobre el plano.

### Bloques y nomenclatura

- Bloque `obs-math` renombrado a `obs-graph` (refleja que por ahora solo grafica funciones).
- Bloque `obs-sistema` renombrado a `obs-system` (permanece deshabilitado).

---

## Corregido

### WebGL y ciclo de vida

- Fuga de contextos WebGL al rerenderizar bloques (`Too many active WebGL contexts`).
- Limpieza automática de contextos WebGL al desmontar bloques.
- Limpieza automática de listeners registrados.
- Limpieza automática de timers pendientes.
- Prevención de renderizados sobre contextos ya destruidos.

### Singularidades y asíntotas

- Falsas asíntotas producidas por overflow numérico (`x^1000`, `x^6000` y similares).
- Pérdida de polos de misma rama al depender del muestreo durante zoom y pan.
- Asíntota vertical de misma rama (`x^{-2}`, `x^{-4}`, `1/x²`…) desaparecía al navegar el plano; resuelta con un escaneo dedicado independiente del muestreo.
- Asíntota fantasma en `√x` (y `log x`, etc.): el borde de dominio se trataba como polo. Ahora solo es polo si el lado finito escapa del viewport o el tramo cruza.
- Falso polo en `x^{2^{\pi}}` al desplazar la vista por encima del eje X: la detección dependía de la posición relativa al viewport. Corregida con un sondeo de divergencia independiente del viewport.
- Falsa asíntota en `\log_{1}(x)`: ahora se clasifica como función degenerada (indefinida) y no se monta el motor de curva.
- Clasificación incorrecta de divergencias cerca del borde del dominio.
- Casos donde el detector confundía crecimiento extremo con discontinuidades reales.

### Parsing y evaluación

- Fracciones anidadas mal interpretadas por expresiones regulares simples (`\frac{x^{2}-1}{x-1}` fallaba con "Unexpected operator {"). Resuelto con parser de llaves balanceadas.
- Crash "Colon : expected after object key" en exponentes anidados (`x^{3^{\pi}}`): la regex plana se cortaba en la primera `}`. Resuelto con `convertirExponentes()` recursivo.
- `\sqrt{x}` se renderizaba en rojo como `\sqrtx`: `limpiarTex` colapsaba las llaves del argumento de un comando. Corregido excluyendo las llaves precedidas por comando, `^`, `_` o `}`.
- `\sqrt[3]{8}` y similares no reconocían el índice de la raíz.
- `ln(x)` sin backslash no se reconocía (mathjs usa `log` para el logaritmo natural).
- Paréntesis redundantes en el LaTeX renderizado (`x^{\left(3^{\left(\pi\right)}\right)}`): cambiado de `toTex({parenthesis:"keep"})` a `"auto"`.
- Manejo incorrecto de raíces racionales sobre bases negativas.
- Renderizado incorrecto de expresiones vacías.
- Casos donde JavaScript generaba números complejos innecesariamente.
- `\arctan{x}` y variantes con argumento entre llaves LaTeX fallaban con "Unexpected operator {". La conversión `{…}` → `(…)` ahora cubre también las seis funciones inversas, con soporte para fracciones internas.

### Análisis numérico y puntos notables

- `f(x) = 0` (función idénticamente nula) producía miles de "raíces". Ahora se detecta como tal y solo deja un marcador en la intersección Y `(0, 0)`.
- Falsas raíces marcadas en los polos de `tan(x)` y similares: `refinarRaiz()` descarta los cruces donde la función diverge.
- Raíces que se perdían en funciones oscilantes por el muestreo grueso (resolución 200 → 1000).
- Clasificación de funciones periódicas afinada: se usa detección de trigonometría (`tieneTrigonometria`) más un mínimo de oscilaciones, para no marcar `x + sin(x)` (una sola raíz) como "infinitas".
- Vértices falsos generados por picos de asíntota: `detectarVertices()` exige pendiente suave a ambos lados y ausencia de polo en el vecindario.
- Vértices reales que desaparecían al quedar junto a una raíz (curva que apenas cruza el eje, baja a un mínimo poco profundo y vuelve a subir, p.ej. `2/(2x+1)+(x³−3)/π`): la tolerancia de fusión de `construirPuntosNotables()` era `0.15` (≈ 7× el paso de muestreo) y absorbía el mínimo en la raíz vecina. Reducida a `0.05`, de modo que solo se fusionan los puntos que son realmente el mismo (raíz doble tangente al eje, vértice en el origen que coincide con la intersección Y).
- Posición imprecisa del marcador de vértice: caía sobre la rejilla de muestreo (p.ej. x=0.80 en lugar del mínimo real x=0.792). `detectarVertices()` ahora refina con interpolación parabólica sobre las tres muestras vecinas y sitúa el marcador en el extremo exacto.
- `acot(x)` usaba `atan(1/x)` como wrapper, produciendo una discontinuidad en x=0. Corregido a `π/2 − atan(x)`, rango continuo (0, π) conforme a la convención estándar.
- `normalizarTrigonometria` casaba `sin(` dentro de `asin(` y convertía incorrectamente el argumento a grados. Corregido con guarda de frontera izquierda.

### Interfaz

- Scrollbar horizontal espuria en el panel LaTeX: la causa raíz era el contenedor de MathJax (`mjx-container`, el motor que usa este Obsidian), que trae su propio `overflow-x:auto` y mostraba una barra nativa redundante. Resuelto en `styles.css` anulando ese overflow (`overflow:visible !important` sobre `mjx-container`/`mjx-math`, y también los selectores de KaTeX por compatibilidad). Como guard secundario, el contenedor aplica una tolerancia de 3 px (`scrollWidth − clientWidth ≤ 3 px` se trata como sin overflow real).
- Texto y plano aplastados horizontalmente al estirarse el bitmap interno al ancho del panel. Corregido ajustando la resolución interna del canvas al tamaño real en pantalla mediante `ResizeObserver`.

### Rendimiento

- Congelamiento de Obsidian e "Invalid array length" al graficar funciones de crecimiento extremo (`x^{3^{\pi}}` ≈ x^31.5): la bisección adaptativa caía en recursión catastrófica (>50 millones de evaluaciones). Resuelto evitando subdividir cuando ambos extremos del tramo quedan fuera del mismo lado del viewport.
- Redibujados redundantes durante eventos de redimensionamiento sin cambios reales de tamaño.
- Timers huérfanos tras desmontar componentes.
- Actualizaciones innecesarias del pipeline de renderizado.
- Operaciones de repintado evitables durante interacciones repetidas.

---

## Notas técnicas para desarrolladores

### Nuevas funciones principales

| Función | Responsabilidad |
|---|---|
| `convertirFracciones()` | Parser recursivo de `\frac{}` con balanceo de llaves |
| `convertirExponentes()` | Parser recursivo de exponentes `^{}` con llaves anidadas |
| `encontrarLlaveCierre()` | Localiza la `}` que cierra una `{` (conteo balanceado) |
| `convertirValorAbsoluto()` | Parser de barras `|…|` basado en pila, sin regex |
| `normalizarFuncionesInversas()` | Mapeo de `arcsin`/`sin⁻¹`/`sin^{-1}` → `asin` y análogas |
| `tieneTrigonometria()` | Detecta si la expresión contiene una llamada trigonométrica directa |
| `estadoGrupo()` | Clasifica un grupo de puntos notables en `normal`/`infinitas`/`demasiadas` |
| `embellecerInversasLatex()` | Reescritura de salida MathJS a `\arcsin`, `\text{arccsc}`, etc. |
| `refinarRaiz()` | Bisección de 60 iteraciones con distinción raíz/polo |
| `detectarRaices()` | Detección de cruces del eje X excluyendo polos |
| `detectarVertices()` | Detección de extremos resistente a singularidades |
| `clasificarDegenerada()` | Clasificación de funciones no graficables en ℝ |
| `construirPuntosNotables()` | Fusión y deduplicación de puntos notables |
| `esDesbordamiento()` | Distinción entre overflow numérico y divergencia real |
| `esOverflowPersistente()` | Verificación de overflow persistente en discontinuidades |
| `detectarAsintotasMismaRama()` | Detección de polos donde ambas ramas divergen en igual dirección |
| `dibujarCrosshair()` | Renderizado del crosshair y etiquetas de coordenadas |
| `dibujarPuntoMarcador()` | Marcador circular reutilizable para crosshair y puntos notables |
| `dibujarEtiquetaPunto()` | Etiquetas con sistema anti-superposición (`solapanRect`) |
| `dibujarPuntosNotables()` | Renderizado de marcadores sobre el plano |

### Arquitectura de renderizado

- Gestión correcta del ciclo de vida mediante `MarkdownRenderChild`.
- Liberación explícita de contextos usando la extensión `WEBGL_lose_context`.
- Registro centralizado de recursos mediante `limpieza.register()`.
- Renderizado multicapa:
  - **WebGL** — curvas de función.
  - **Canvas 2D** — ejes, grid, etiquetas y puntos notables.
  - **Canvas independiente** — crosshair (permite repintado sin afectar las capas inferiores).

### Pendiente conocido

- Los wrappers de `acsc`, `asec` y `acot` están inyectados en `evalX` pero no en el evaluador de `obs-system`. Si se reactiva ese bloque, extender la inyección correspondientemente.

---

## Sin cambios relevantes

- El bloque `obs-system` permanece deshabilitado temporalmente.
- La lógica de resolución de sistemas lineales (eliminación gaussiana) no fue modificada.
- Las funciones de presentación LaTeX permanecen esencialmente iguales, salvo las mejoras asociadas al nuevo parser de fracciones.