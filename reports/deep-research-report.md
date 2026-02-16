# Tecnologías para un motor de juegos de mesa en el navegador en 2026

## Resumen ejecutivo y recomendación principal

Tu lista de requisitos describe, en la práctica, una **UI tipo “mesa”** (tabletop) con **muchos elementos interactivos** (cartas, fichas, pilas, tableros), **pan/zoom**, **drag & drop**, **animaciones** y **explicaciones contextualizadas** (por qué una acción es legal/ilegal). Eso se parece más a un “editor/escenario 2D” que a una página web clásica.

La opción más sólida en 2026, si quieres evitar un motor “grande” pero no quieres sufrir con límites del DOM, es una arquitectura híbrida:

- **Mesa (tablero) renderizada en GPU** con **entity["organization","PixiJS","2d web graphics library"] v8** (o WebGL por defecto, WebGPU cuando sea viable) y una cámara 2D (pan/zoom). Pixi está diseñado precisamente como librería de render 2D con renderers WebGL/WebGPU. citeturn7search10turn0search0turn3search19  
- **HUD/UI en DOM** (acciones disponibles, log, scoreboard, botones, “Aceptar/Cancelar”, paneles) con **entity["organization","React","js ui library"] y, si quieres SSR/deploy fácil, **entity["organization","Next.js","react framework"] + **entity["company","Vercel","web hosting platform"]. En Next moderno, esto se resuelve con componentes “client” y/o imports sin SSR cuando uses APIs del navegador (WebGL, canvas, etc.). citeturn5search6turn5search23turn5search3  
- Tooltips/overlays accesibles en DOM (no en canvas) con **entity["organization","React Aria","accessible react hooks"] o **entity["organization","Floating UI","floating element library"] para posicionamiento/colisiones. citeturn2search2turn1search15turn1search1  

La razón de fondo: si tu objetivo es “**cualquier juego de mesa/cartas**”, tu carga real no es “hacer un flip de carta”; es construir un **sistema genérico de representación y layout** (zonas, pilas, manos, rejillas, snaps, focus/selección, z-order, hit-testing, overlays). En ese mundo, **Pixi** te da el “piso” correcto (render + escena + eventos). Y el DOM te da lo correcto para HUD y accesibilidad.

Hay, además, una prueba fuerte de adecuación: **entity["video_game","Foundry Virtual Tabletop","virtual tabletop software"]** (una plataforma de “virtual tabletop”) implementa su superficie visual con un canvas WebGL usando PixiJS. citeturn7search0turn7search1turn7search12  

## Criterios técnicos derivados de tus requisitos

Tus requisitos se pueden traducir a criterios de selección muy concretos:

**Interacción intensa en 2D con transformaciones globales (pan/zoom)**
- Necesitas administrar un espacio “mundo/mesa” y un espacio “pantalla”, con **transformaciones** consistentes para: arrastrar, soltar, hover, tooltips, highlights y snapping. (En Konva/Pixi/Phaser esto encaja naturalmente; en DOM puro se vuelve frágil a escala.)

**Muchos elementos y cambios frecuentes**
- Cartas (con estados: boca arriba/abajo, rotación, apilado), fichas, marcadores, contadores… y reordenaciones continuas (z-index lógico).  
- A medida que el número de nodos crece, el DOM puede penalizar interactividad y render. Google recomienda evitar un DOM excesivo porque afecta rendimiento, interactividad y memoria; Lighthouse incluso audita tamaño del DOM y advierte/penaliza a partir de ciertos umbrales. citeturn9search13turn9search16  

**Animaciones “baratas” y reversiones**
- “Flips”, “snap back”, “ghost piece”, “highlight pulsing”, “deal cards”… requieren un motor de animación (o al menos un scheduler) que no peleé con layout CSS.

**Explicación de reglas y por qué falla una acción**
- Esto es clave para tu visión: tu simulador debe producir no solo “false”, sino una estructura explicable: prerrequisitos fallidos, recursos insuficientes, targets inválidos, etc. Es más fácil plasmarlo en un HUD/tooltip DOM (texto nítido, scroll, enlaces, etc.) que dentro de un canvas.

**Arquitectura desacoplada**
- Quieres GameSpecDoc YAML → compile a TS GameDefs → simulación agnóstica. Eso encaja bien con un render agnóstico: la UI debe consumir un “RenderSpec” generado desde el estado, no “lógica del juego”.

## Opciones de renderizado para la “mesa” en 2026

### entity["organization","PixiJS","2d web graphics library"] v8 como motor de render 2D (recomendado)

**Qué te da**
- Renderers de Pixi que dibujan tu escena en un canvas usando **WebGL/WebGL2 o WebGPU** (y la base comparte sistemas: canvas, textura, eventos). citeturn7search10turn3search3turn0search4  
- Un renderer WebGPU explícito en la API (y la posibilidad de inicializarlo). citeturn0search0turn1search32  
- Un sistema de eventos moderno: Pixi v8 sustituye el InteractionManager legacy por un modelo de eventos federados “tipo DOM” (pointer events, bubbling/capturing, etc.) y modos de evento (`eventMode`) para controlar hit-testing y emisión. citeturn2search0turn2search15turn2search22  
- Modularidad: Pixi v8 se construye alrededor de extensiones/sistemas, lo que favorece un core “ligero” y extensible. citeturn0search36turn2search0  

**Por qué encaja con tu caso**
- Tu “mesa” es, esencialmente, una escena 2D con sprites, contenedores, capas y efectos. Pixi está optimizado para eso y tiene una adopción real en productos de tabletop: Foundry VTT usa PixiJS para su canvas WebGL y estructura la mesa en capas/objetos interactivos. citeturn7search0turn7search12turn7search1  

**Integración con React**
- Puedes integrarlo de dos maneras:
  - Pixi “imperativo” (recomendable para un motor genérico): React se queda en HUD, Pixi maneja la escena, y tú haces el diff/actualización de sprites.
  - Declarativo con **@pixi/react**: está presentado como librería lista para producción, con soporte para React v19 y Pixi v8. citeturn0search9turn0search21turn0search1  

**Cámara (pan/zoom)**
- Históricamente se ha usado **pixi-viewport** para cámara 2D con drag, wheel-zoom, deceleración, etc. (proporciona plugins como “Decelerate” y métodos de zoom). citeturn1search0turn1search9turn8search20  
- Riesgo a vigilar: pixi-viewport es útil y popular, pero su integración con Pixi v8 ha tenido fricción y issues abiertos (p.ej. ejemplos rotos para v8 o roturas con versiones concretas). citeturn8search0turn8search17turn8search6  
- Alternativa práctica: cámara propia mínima (un contenedor “world” con `position`+`scale`, zoom relativo al puntero), que es suficiente para mouse-only y reduce dependencia.

**Compatibilidad de render**
- Pixi incluye **auto-detección** del renderer más apropiado; documenta que prioriza WebGL por ser el API “más probado” y que en el futuro priorizará WebGPU cuando esté más estable/ubicuo. citeturn3search19  
- Además, Pixi v8.16.0 anunció un **renderer Canvas experimental** para entornos sin WebGL/WebGPU, útil como “escape hatch” en hardware/entornos restrictivos. citeturn0search28turn8search4  

image_group{"layout":"carousel","aspect_ratio":"16:9","query":["Foundry Virtual Tabletop canvas screenshot","PixiJS v8 WebGPU demo screenshot","Phaser 3 card game example screenshot","Konva.js stage zooming relative to pointer demo screenshot"],"num_per_query":1}

### entity["organization","Phaser","html5 game framework"] 3 como framework 2D “todo incluido” (segunda mejor, más opinado)

**Qué te da**
- Phaser se define como framework HTML5 open-source con render Canvas y WebGL. citeturn3search0turn3search4  
- Estructura basada en **Scenes** (cargar, menú, nivel, etc.), que puede ser útil o una camisa de fuerza según tu filosofía. citeturn3search8turn3search32  
- Sistema de input unificado y eventos de arrastre (`dragstart`, `drag`, `drop`, etc.) gestionados por el Input Plugin. citeturn3search6turn3search2  
- Tween Manager integrado para animaciones de propiedades (posición, alpha, etc.). citeturn3search5turn3search36  

**Si tu prioridad es “hacerlo funcionar rápido”**
- Phaser te puede acelerar muchísimo un “primer juego” visual: drag & drop + tweens + cámaras + asset pipeline. Y hay patrones directos para flip de carta (escalar a 0, cambiar textura/frame, escalar de vuelta). citeturn3search1turn3search5  

**Por qué puede ser subóptimo para tu visión**
- Tu simulación y definición de juegos ya existe y es agnóstica; Phaser tiende a empujarte hacia “la forma Phaser” (Scenes, ciclo de vida, patterns del framework). Esto no es malo, pero es más “framework” que “renderer”, y aumenta el riesgo de que tu motor termine siendo “tu motor + Phaser”, en vez de “tu motor con un renderer intercambiable”.

### entity["organization","Konva","js canvas 2d library"] para Canvas 2D retenido, más “UI/edición” que “mesa GPU”

**Qué te da**
- Konva extiende canvas 2D para interactividad; organiza Stage/Layers y, crucialmente, usa **dos canvases por layer**: uno visible y otro “hit graph” oculto para detección de eventos. citeturn2search26  
- Soporta eventos de drag and drop (dragstart, dragmove, dragend) nativamente. citeturn2search1  
- Tiene demos explícitas para zoom relativo al puntero y gestos. citeturn0search11turn0search19  
- Reconoce que, al crecer complejidad o número de shapes, hay impacto y proporciona consejos de rendimiento. citeturn2search5  

**Cuándo elegirlo**
- Si tu prioridad es un “editor” de tablero (mucho shape vectorial, handles, selección tipo diagrama, cajas de selección, etc.).  
- Si el look and feel es más “app de edición” que “mesa con sprites y efectos”.

**Dónde suele perder frente a Pixi**
- Cuando quieres un “tabletop” con muchas imágenes/sprites, efectos, y animaciones suaves con bajo coste. Canvas 2D es viable, pero normalmente el techo de rendimiento/efectos se alcanza antes que con pipeline GPU.

### DOM/SVG-first para todo (solo si tienes límites claros de escala)

Es tentador usar divs absolutamente posicionados, CSS transforms y z-index, y para juegos pequeños puede ir muy bien. Pero para “motor universal” tiene riesgos estructurales:

- Un DOM grande y cambiante afecta la interactividad: el navegador recalcula estilos/posiciones con más frecuencia, y la memoria se dispara. Google documenta estos problemas y Lighthouse audita DOM excesivo por impacto en rendimiento, memoria e interacción. citeturn9search13turn9search16  
- Con pan/zoom global + hit-testing + z-order + drag, terminas re-implementando muchas piezas de un motor 2D, pero con peores herramientas (debugging de transforms anidadas, edge cases de pointer events, etc.).  

La forma más realista de que DOM-first funcione a largo plazo en tu visión es: “DOM para HUD” + “canvas para mesa”, es decir, híbrido.

## Capa HUD, tooltips, drag y explicaciones de acciones

Una decisión clave: **no intentes que el canvas sea también tu “UI de texto”**. Tu UX lo pide en DOM.

**Tooltips y popovers**
- Para tooltips, **React Aria** documenta comportamiento de “warmup/cooldown” en hover y accesibilidad (asociación con trigger, foco, etc.). citeturn2search2turn2search6  
- Para cumplir expectativas de accesibilidad, la referencia de MDN sobre el rol ARIA tooltip explica semántica, cierre con Escape, y por qué no debe contener elementos interactivos. citeturn2search13  
- Para posicionamiento robusto (evitar colisiones con el viewport, flip automático), **Floating UI** está precisamente diseñado para tooltips/popovers/dropdowns y tiene docs específicas de tooltip. citeturn1search1turn1search15turn1search4  

**Drag & drop**
- En la “mesa” (Pixi/Phaser/Konva), es mejor implementar drag con el sistema de eventos del renderer (pointerdown/move/up) que intentar reutilizar drag HTML. Pixi, por ejemplo, está diseñado para eventos de puntero con `eventMode` y listeners tipo pointerdown. citeturn2search0  
- En el DOM (por ejemplo, una mano de cartas como lista, o un builder de GameSpecDoc), **entity["organization","dnd-kit","drag and drop toolkit"]** es una opción moderna: sensores (mouse/pointer/touch/teclado), extensibilidad y enfoque en performance/accesibilidad. citeturn1search10turn1search18turn1search26  

**Next.js/Vercel para desplegar sin dolor**
- Next documenta explícitamente el uso de `'use client'` para componentes que necesitan APIs del navegador, y también recomienda imports sin SSR para dependencias client-only. citeturn5search6turn5search23  
- Vercel documenta integración directa para proyectos Next. citeturn5search3turn5search20  

## Arquitectura recomendada para YAML → GameDef → simulación → UI

### Separación estricta de “estado del juego” y “estado de interacción”

Para que tu motor sea universal, te conviene una separación en tres capas:

1) **Estado canónico (simulación)**  
   Tu sim debe ser la única fuente de verdad del juego (cartas en zonas, contadores, turnos, fases).  

2) **Estado de UI/Interacción (efímero)**  
   Cosas como: “pieza agarrada”, “acción seleccionada”, “tooltip abierto”, “arrastre en curso”, “zona destino en hover”. Esto no debe vivir dentro del estado del juego porque no es parte de las reglas.

3) **RenderSpec o ViewModel derivado**
   Un “contrato” agnóstico que el renderer entiende (sin lógica de juego), p.ej.:
   - `entities`: cada carta/ficha con `id`, `spriteKey`, `transform`, `z`, `hitShape`, `badges`, `highlightState`.
   - `zones`: mano, mazo, descarte, tablero; cada zona con layout y constraints.
   - `uiHints`: acciones disponibles, priorización, mensajes.
   - `explanations`: para cada acción, lista estructurada de requisitos y fallos (esto alimenta tooltips tipo “por qué no puedes”).

Esto te permite cambiar renderer (Pixi/Phaser/Konva) sin reescribir el motor.

### Simulación en hilo separado (muy recomendable si “simular” es pesado)

Aunque tu UI sea mouse-only, tu motor puede hacer cosas costosas: IA, cálculo de acciones legales, validación, re-simulación al hover para explicar fallos, etc. En web, el hilo principal es crítico para la fluidez.

- **Web Workers** permiten ejecutar scripts en un hilo aparte sin bloquear la UI. MDN lo presenta explícitamente como solución para tareas costosas sin congelar la interfaz. citeturn5search0turn5search4  
- Para render intensivo o ciertos pipelines, **OffscreenCanvas** permite renderizar fuera del DOM e incluso desde un worker (cuando el entorno lo soporta). MDN describe la idea de “desacoplar DOM y Canvas” y ejecutar en worker; y web.dev explica cómo OffscreenCanvas evita jank cuando el main thread está ocupado. citeturn5search1turn9search28turn5search14  

En tu caso, una división típica viable es:
- Worker: sim + cálculo de acciones legales + explicación detallada.
- Main thread: Pixi/React + input + animaciones + tooltips.

## Riesgos, compatibilidad y trampas comunes en 2026

### WebGPU está avanzado, pero no es “universal” todavía

En febrero de 2026, WebGPU ya tiene un nivel de soporte alto en Chromium, pero con matices:

- “Can I use” reporta uso global de WebGPU alrededor del 77.78% y soporte en Chrome/Edge desde versiones modernas; Safari aparece como soporte parcial en ciertas versiones; y Firefox aparece como “disabled by default” en la tabla. citeturn4view0  
- MDN describe WebGPU como sucesor de WebGL con mejor compatibilidad con GPUs modernas y capacidades avanzadas. citeturn1search32  

Implicación práctica: **no construyas tu motor sobre WebGPU “a pelo”** si tu objetivo es “run anywhere”. Usar Pixi y dejar que el renderer auto-detecte (y caiga a WebGL) es una estrategia más realista. citeturn3search19turn0search4  

### PixiJS v8 + WebGPU: muy prometedor, pero vigila fallback y bugs específicos

Pixi v8 abraza WebGPU y mantiene WebGL; pero hay señales típicas de tecnología en transición:
- Se han reportado issues de “fallo de render por WebGPU sin fallback a WebGL” en ciertos entornos. citeturn3search31  
- También hay reportes de comportamientos anómalos bajo WebGPU que no ocurren en WebGL (por ejemplo, actualizaciones de texto). citeturn0search32  

Esto no invalida Pixi; de hecho, refuerza el enfoque pragmático: **WebGL como baseline**, WebGPU como acelerador cuando sea estable en tu matriz objetivo, y un mecanismo de logging/telemetría para detectar fallos de renderer.

### Cámara/pan-zoom: el “plugin externo” es útil pero añade riesgo

pixi-viewport te da mucho valor rápido (drag, wheel zoom, deceleración). citeturn8search2turn1search0turn1search9  
Pero su historia con Pixi v8 muestra que:
- Hubo fricción por ejemplos y compatibilidad con v8. citeturn8search0  
- Hay issues abiertos sobre roturas con versiones de Pixi 8.x. citeturn8search17  

Con mouse-only, tu coste de implementar cámara propia es relativamente bajo, y puede ser una apuesta más estable si quieres maximizar control y minimizar dependencia.

### Renderizar todo en DOM: el techo llega antes de lo que parece

Si aspiras a “cualquier juego” (incluyendo juegos con muchos tokens o piezas), el DOM grande se vuelve una carga:
- Google documenta que un DOM grande puede ralentizar render/interactividad y aumentar coste de memoria; y Lighthouse lo audita. citeturn9search13turn9search16  

Conclusión: DOM-first solo es sensato si impones límites estrictos (pocas piezas, pocas animaciones, zoom/pan simple) o si aceptas introducir técnicas tipo “virtualización” (que, en un tablero libremente navegable, es más compleja que una lista).

## Conclusión: qué elegir según tu tolerancia a “motor” y tu ambición

Si tu objetivo real es un “motor universal” (juegos de cartas y de tablero arbitrarios) con UI fluida y extensible, la opción más coherente en 2026 es:

- Mesa GPU con **PixiJS v8** (WebGL baseline + WebGPU donde aplique), por ser un renderer 2D con eventos modernos y evidencia de uso en un producto tabletop (“Foundry VTT”). citeturn7search10turn2search0turn7search12  
- HUD/tooltips/paneles en DOM con React, usando React Aria y/o Floating UI para tooltips robustos. citeturn2search2turn1search15turn2search13  
- Si despliegas con Next/Vercel, resuelve el límite SSR con `'use client'` y dynamic imports sin SSR para lo que toque canvas/WebGL. citeturn5search6turn5search23turn5search3  

Elegiría **Phaser 3** si tu prioridad fuese “quiero un framework que me resuelva más ‘cosas de juego’ ya” (tweens, escenas, input, etc.) y no te importa asumir su estructura. citeturn3search8turn3search2turn3search5  

Elegiría **Konva** si tu prioridad fuese un **editor visual** o una experiencia más cercana a “dibujo/diagramación interactiva”, aprovechando su Stage/Layers y su técnica de hit detection con canvas oculto. citeturn2search26turn2search1turn2search5  

Y evitaría “DOM para todo” como base de un motor universal por el riesgo de techo de rendimiento/interactividad asociado a DOM grande y altamente dinámico. citeturn9search13turn9search16