import { Plugin, Notice } from "obsidian";

import { GraphEngine } from "./src/engines/obs-graph/GraphEngine";
import { MotorExperimental } from "./src/host-obsidian/MotorExperimental";
import { registrarFuenteLora } from "./src/host-obsidian/fuentes";
import { fijarIdioma, t } from "./src/i18n";
import {
  AJUSTES_POR_DEFECTO,
  PestanaAjustesLMath,
  type AjustesTransformaciones,
  type PluginConAjustes,
} from "./src/host-obsidian/ajustes";
// Los nombres bajo los que responde cada bloque. Desde la 2.0.0, uno solo: el nuevo. La tabla
// vivía en `migracion/`, con el escáner y el reescritor que convertían las notas de `obs-*` a
// `_*`; esa campaña terminó y su código salió del árbol publicado —está guardado en
// `.dev/migracion/`, ver el LEEME de esa carpeta—, pero la tabla no era migración: es lo que
// registra los bloques, y se quedó.
import { nombresDe } from "./src/host-obsidian/nombresBloque";

// ─────────────────────────────────────────────
// Plugin principal
// ─────────────────────────────────────────────
export default class LMathPlugin extends Plugin implements PluginConAjustes {
  // Selector del motor para el bloque obs-graph. `true` → motor nuevo (src/core/);
  // `false` → GraphEngine antiguo (intacto, reactivable con esta sola bandera).
  // El bloque obs-system usa SIEMPRE el motor nuevo: el SystemEngine antiguo, que
  // resolvía las implícitas por marching squares, quedó retirado y no tiene vuelta atrás.
  private readonly MOTOR_EXPERIMENTAL = true;

  // Preferencias persistentes (loadData/saveData). Se cargan en onload; los motores las
  // leen VIVAS por un getter (`() => this.ajustes`), así un cambio en la pestaña de
  // configuración afecta a los bloques que se re-rendericen sin recargar el plugin.
  ajustes: AjustesTransformaciones = { ...AJUSTES_POR_DEFECTO };

  // Bloques ya montados que quieren enterarse de un cambio de ajustes. Es una lista propia y no
  // un evento del workspace de Obsidian porque el emisor y los oyentes son todos nuestros: un
  // `Set` de funciones se tipa solo, se da de baja solo y no compite por un nombre de evento
  // global. Los bloques se apuntan al montarse y se borran al desmontarse (ver
  // `registrarRecarga` en MotorExperimental), así que aquí nunca queda nada de una nota cerrada.
  private readonly oyentesAjustes = new Set<() => void>();

  alCambiarAjustes(oyente: () => void): () => void {
    this.oyentesAjustes.add(oyente);
    return () => { this.oyentesAjustes.delete(oyente); };
  }

  notificarCambioDeAjustes(): void {
    // Sobre una COPIA: cada oyente se da de baja y se vuelve a apuntar mientras se recorre (un
    // bloque que se rehace crea uno nuevo), y mutar el Set en mitad de su propia iteración es
    // justo la forma de saltarse la mitad de los bloques.
    for (const oyente of [...this.oyentesAjustes]) oyente();
  }

  /**
   * Registra UN bloque bajo los nombres que `nombresDe` dé por vigentes. Desde la 2.0.0 es uno
   * solo, el nuevo; en la 1.5.0 eran dos, y el bucle es lo que sobrevive de aquella transición.
   *
   * El try/catch no es decorativo. El identificador de bloque es una clave global compartida por
   * todos los plugins instalados: si otro ya tomó uno de estos nombres, la llamada puede lanzar.
   * Sin el catch esa excepción aborta `onload()` entera y se cae TODO el plugin —incluidos los
   * `obs-*`, que llevan funcionando desde la 1.0.0— por culpa de un nombre nuevo. Con él se
   * pierde solo ese nombre, queda dicho en la consola, y las notas de la gente siguen rindiendo.
   */
  private registrarBloque(
    viejo: string,
    manejador: Parameters<typeof this.registerMarkdownCodeBlockProcessor>[1]
  ): void {
    for (const nombre of nombresDe(viejo)) {
      try {
        this.registerMarkdownCodeBlockProcessor(nombre, manejador);
      } catch (e) {
        console.warn(`LMath: no se pudo registrar el bloque "${nombre}"`, e);
      }
    }
  }

  async onload() {

    // Ajustes persistentes ANTES de registrar los motores (los capturan por referencia) y
    // ANTES de cualquier texto de interfaz: `cargarAjustes` fija el idioma activo (i18n) a
    // partir de la preferencia guardada, así el aviso y la pestaña ya salen en ese idioma.
    await this.cargarAjustes();
    new Notice(t().aviso.cargado);

    // Aquí hubo un aviso del renombrado en cada carga, mientras duró la transición a `_*`. Se
    // retiró con ella: la 2.0.0 es la versión que la 1.5.0 anunció, ya no registra los nombres
    // viejos, y no queda transición de la que avisar.
    this.addSettingTab(new PestanaAjustesLMath(this.app, this));

    // Fuente Lora para el texto de la interfaz del plugin (se aplica en styles.css,
    // acotada a .lmath-grafica). Sin await: no bloquea la carga; hasta que
    // resuelve, la UI usa el fallback del stack CSS.
    void registrarFuenteLora(this);

    // Getter de ajustes VIVOS compartido por los motores (ver arriba).
    const ajustes = () => this.ajustes;

    // ── Bloque obs-graph (UNA función) ─────────
    // La bandera decide el motor; GraphEngine permanece intacto como fallback.
    const graphEngine = new GraphEngine(this);
    const motorGraph = new MotorExperimental(this, "graph", ajustes);
    this.registrarBloque("obs-graph", (source, el, ctx) =>
      this.MOTOR_EXPERIMENTAL
        ? motorGraph.process(source, el, ctx)
        : graphEngine.process(source, el, ctx)
    );

    // ── Bloque obs-system (SISTEMA de ecuaciones) ──
    // Motor nuevo: cada ecuación con su mejor proveedor (continuación/separable/…),
    // sin marching squares. (Panel de solución/intersecciones: trabajo futuro.)
    const motorSistema = new MotorExperimental(this, "system", ajustes);
    this.registrarBloque("obs-system", (source, el, ctx) =>
      motorSistema.process(source, el, ctx)
    );

    // ── Bloque obs-derivate (DERIVADA de una función) ──
    // Como obs-graph (una función, motor nuevo) pero el plano grafica la DERIVADA
    // f'(x) de lo escrito; el panel alterna [Original] (operador d/dx sin evaluar) y
    // [Derivada] (f'(x) = …). Deriva simbólicamente con mathjs (src/derivar.ts).
    const motorDerivada = new MotorExperimental(this, "derivate", ajustes);
    this.registrarBloque("obs-derivate", (source, el, ctx) =>
      motorDerivada.process(source, el, ctx)
    );

    // ── Bloque obs-integral (INTEGRAL DEFINIDA de una función) ──
    // Como obs-graph (una función, motor nuevo) pero el plano grafica el INTEGRANDO f(x) de
    // `\int_a^b f dx` y SOMBREA la región entre a y b; el panel alterna [Operador] (∫ₐᵇ f dx
    // sin evaluar, con el integrando simplificado) y [Valor] (`∫ₐᵇ f dx = <área con signo>`,
    // o una etiqueta si diverge / sale de dominio / los límites no son numéricos). El área se
    // calcula numéricamente (mathjs no integra simbólicamente): src/integral.ts + areaBajoRama.
    const motorIntegral = new MotorExperimental(this, "integral", ajustes);
    this.registrarBloque("obs-integral", (source, el, ctx) =>
      motorIntegral.process(source, el, ctx)
    );

    // ── Bloque obs-trig (CÍRCULO TRIGONOMÉTRICO) ──
    // El único bloque que no usa el motor de curvas: su geometría es analítica cerrada y la
    // pinta un renderizador propio (src/trig/), con el encuadre FIJO en el círculo unidad. Un
    // bloque vacío ya rinde un círculo funcional a 30°: aquí no falta contenido, el círculo
    // unidad ES el contenido.
    const motorTrig = new MotorExperimental(this, "trig", ajustes);
    this.registrarBloque("obs-trig", (source, el, ctx) =>
      motorTrig.process(source, el, ctx)
    );

    // ── Bloque obs-vector (NOTACIÓN VECTORIAL) ──
    // UNA TARJETA POR LÍNEA, no una fórmula por bloque: cada línea declara una cosa distinta
    // (`v=(3,2)` un vector, `A=(1,2)` un punto, `F(x,y)=(-y,x)` un campo) y se tipografía como
    // lo que es —la flecha de `\vec{}` solo sobre los vectores—. El plano aparece SOLO si hay
    // algo que dibujar: con puntos y vectores numéricos salen sus flechas; con un campo o con
    // notación suelta (`\nabla f(x,y)`) el bloque es solo la tarjeta, a todo lo ancho.
    const motorVector = new MotorExperimental(this, "vector", ajustes);
    this.registrarBloque("obs-vector", (source, el, ctx) =>
      motorVector.process(source, el, ctx)
    );

  }

  /** Carga las preferencias (loadData) copiando SOLO las claves vigentes (las de
   *  AJUSTES_POR_DEFECTO) y de tipo correcto; las ausentes toman su default. NO se fusiona
   *  el objeto del disco entero: un ajuste RETIRADO del código (`simplificarAuto`, de cuando
   *  Simplificar era opcional) quedaba en el data.json del vault, el merge ciego lo
   *  re-adoptaba y guardarAjustes() lo re-persistía para siempre. */
  async cargarAjustes(): Promise<void> {
    const disco = ((await this.loadData()) ?? {}) as Record<string, unknown>;
    const ajustes = { ...AJUSTES_POR_DEFECTO };
    for (const k of Object.keys(ajustes) as (keyof AjustesTransformaciones)[]) {
      if (typeof disco[k] === typeof ajustes[k]) (ajustes[k] as unknown) = disco[k];
    }
    this.ajustes = ajustes;
    // Activa el idioma de la interfaz (i18n) según la preferencia cargada. Debe correr aquí,
    // en cuanto los ajustes están listos, para que TODO texto posterior (aviso, pestaña,
    // bloques) use el idioma correcto. `fijarIdioma` valida y cae a inglés si es desconocido.
    fijarIdioma(this.ajustes.idioma);
    // Si el disco traía claves fósiles, se re-persiste ya filtrado: el data.json queda
    // limpio en esta misma carga, no en el siguiente cambio de ajustes.
    if (Object.keys(disco).some((k) => !(k in ajustes))) await this.guardarAjustes();
  }

  /** Persiste las preferencias actuales (saveData). La llama la pestaña de ajustes. */
  async guardarAjustes(): Promise<void> {
    await this.saveData(this.ajustes);
  }
}

// https://github.com/LubrieDev/lmath