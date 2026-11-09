/**
 * Offline Bundled React 18.3.1 & ReactDOM 18.3.1 Compatible Runtime
 * Zero-CDN Local Production Runtime with Fiber Reconciliation, Hooks, Memo, Portals & Full SVG Namespace Support
 */
(function (global) {
  'use strict';

  const REACT_ELEMENT_TYPE = typeof Symbol === 'function' && Symbol.for ? Symbol.for('react.element') : 0xeac7;
  const REACT_PORTAL_TYPE = typeof Symbol === 'function' && Symbol.for ? Symbol.for('react.portal') : 0xeaca;
  const REACT_FRAGMENT_TYPE = typeof Symbol === 'function' && Symbol.for ? Symbol.for('react.fragment') : 0xeacb;
  const REACT_CONTEXT_TYPE = typeof Symbol === 'function' && Symbol.for ? Symbol.for('react.context') : 0xeacc;
  const REACT_PROVIDER_TYPE = typeof Symbol === 'function' && Symbol.for ? Symbol.for('react.provider') : 0xeacd;
  const REACT_MEMO_TYPE = typeof Symbol === 'function' && Symbol.for ? Symbol.for('react.memo') : 0xead3;
  const REACT_FORWARD_REF_TYPE = typeof Symbol === 'function' && Symbol.for ? Symbol.for('react.forward_ref') : 0xead0;

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const SVG_TAGS = new Set([
    'svg', 'animate', 'animateMotion', 'animateTransform', 'circle', 'clipPath', 'defs', 'desc',
    'ellipse', 'feBlend', 'feColorMatrix', 'feComponentTransfer', 'feComposite', 'feConvolveMatrix',
    'feDiffuseLighting', 'feDisplacementMap', 'feDistantLight', 'feDropShadow', 'feFlood', 'feFuncA',
    'feFuncB', 'feFuncG', 'feFuncR', 'feGaussianBlur', 'feImage', 'feMerge', 'feMergeNode',
    'feMorphology', 'feOffset', 'fePointLight', 'feSpecularLighting', 'feSpotLight', 'feTile',
    'feTurbulence', 'filter', 'foreignObject', 'g', 'image', 'line', 'linearGradient', 'marker',
    'mask', 'metadata', 'mpath', 'path', 'pattern', 'polygon', 'polyline', 'radialGradient',
    'rect', 'set', 'stop', 'switch', 'symbol', 'text', 'textPath', 'title', 'tspan', 'use', 'view'
  ]);

  const SVG_CAMEL_ATTRS = {
    accentHeight: 'accent-height', alignmentBaseline: 'alignment-baseline', arabicForm: 'arabic-form',
    baselineShift: 'baseline-shift', capHeight: 'cap-height', clipPath: 'clip-path', clipRule: 'clip-rule',
    colorInterpolation: 'color-interpolation', colorInterpolationFilters: 'color-interpolation-filters',
    colorProfile: 'color-profile', colorRendering: 'color-rendering', dominantBaseline: 'dominant-baseline',
    enableBackground: 'enable-background', fillOpacity: 'fill-opacity', fillRule: 'fill-rule',
    floodColor: 'flood-color', floodOpacity: 'flood-opacity', fontFamily: 'font-family',
    fontSize: 'font-size', fontSizeAdjust: 'font-size-adjust', fontStretch: 'font-stretch',
    fontStyle: 'font-style', fontVariant: 'font-variant', fontWeight: 'font-weight',
    glyphName: 'glyph-name', glyphOrientationHorizontal: 'glyph-orientation-horizontal',
    glyphOrientationVertical: 'glyph-orientation-vertical', horizAdvX: 'horiz-adv-x',
    horizOriginX: 'horiz-origin-x', imageRendering: 'image-rendering', letterSpacing: 'letter-spacing',
    lightingColor: 'lighting-color', markerEnd: 'marker-end', markerMid: 'marker-mid',
    markerStart: 'marker-start', overlinePosition: 'overline-position', overlineThickness: 'overline-thickness',
    paintOrder: 'paint-order', panose1: 'panose-1', pointerEvents: 'pointer-events',
    renderingIntent: 'rendering-intent', shapeRendering: 'shape-rendering', stopColor: 'stop-color',
    stopOpacity: 'stop-opacity', strikethroughPosition: 'strikethrough-position',
    strikethroughThickness: 'strikethrough-thickness', strokeDasharray: 'stroke-dasharray',
    strokeDashoffset: 'stroke-dashoffset', strokeLinecap: 'stroke-linecap', strokeLinejoin: 'stroke-linejoin',
    strokeMiterlimit: 'stroke-miterlimit', strokeOpacity: 'stroke-opacity', strokeWidth: 'stroke-width',
    textAnchor: 'text-anchor', textDecoration: 'text-decoration', textRendering: 'text-rendering',
    underlinePosition: 'underline-position', underlineThickness: 'underline-thickness',
    unicodeBidi: 'unicode-bidi', unicodeRange: 'unicode-range', unitsPerEm: 'units-per-em',
    vAlphabetic: 'v-alphabetic', vHanging: 'v-hanging', vIdeographic: 'v-ideographic',
    vMathematical: 'v-mathematical', vectorEffect: 'vector-effect', vertAdvY: 'vert-adv-y',
    vertOriginX: 'vert-origin-x', vertOriginY: 'vert-origin-y', wordSpacing: 'word-spacing',
    writingMode: 'writing-mode', xHeight: 'x-height'
  };

  const UNITLESS_CSS = new Set([
    'animationIterationCount', 'aspectRatio', 'borderImageOutset', 'borderImageSlice', 'borderImageWidth',
    'boxFlex', 'boxFlexGroup', 'boxOrdinalGroup', 'columnCount', 'columns', 'flex', 'flexGrow',
    'flexPositive', 'flexShrink', 'flexNegative', 'flexOrder', 'gridArea', 'gridRow', 'gridRowEnd',
    'gridRowSpan', 'gridRowStart', 'gridColumn', 'gridColumnEnd', 'gridColumnSpan', 'gridColumnStart',
    'fontWeight', 'lineClamp', 'lineHeight', 'opacity', 'order', 'orphans', 'tabSize', 'widows',
    'zIndex', 'zoom', 'fillOpacity', 'floodOpacity', 'stopOpacity', 'strokeDasharray', 'strokeDashoffset',
    'strokeMiterlimit', 'strokeOpacity', 'strokeWidth', 'scale'
  ]);

  function flattenChildren(children, out) {
    for (let i = 0; i < children.length; i++) {
      const c = children[i];
      if (Array.isArray(c)) {
        flattenChildren(c, out);
      } else if (c === null || c === undefined || typeof c === 'boolean') {
        out.push(null);
      } else if (typeof c === 'string' || typeof c === 'number') {
        out.push({ $$typeof: REACT_ELEMENT_TYPE, type: '#text', key: null, ref: null, props: { nodeValue: String(c) } });
      } else {
        out.push(c);
      }
    }
    return out;
  }

  function createElement(type, config, ...children) {
    const props = {};
    let key = null;
    let ref = null;
    if (config != null) {
      if (config.ref !== undefined) ref = config.ref;
      if (config.key !== undefined) key = '' + config.key;
      for (const propName in config) {
        if (Object.prototype.hasOwnProperty.call(config, propName) && propName !== 'key' && propName !== 'ref') {
          props[propName] = config[propName];
        }
      }
    }
    if (children.length === 1) {
      props.children = children[0];
    } else if (children.length > 1) {
      props.children = children;
    }
    if (type && type.defaultProps) {
      const defaultProps = type.defaultProps;
      for (const propName in defaultProps) {
        if (props[propName] === undefined) {
          props[propName] = defaultProps[propName];
        }
      }
    }
    return { $$typeof: REACT_ELEMENT_TYPE, type, key, ref, props };
  }

  function cloneElement(element, config, ...children) {
    if (!element) return null;
    const props = Object.assign({}, element.props);
    let key = element.key;
    let ref = element.ref;
    if (config != null) {
      if (config.ref !== undefined) ref = config.ref;
      if (config.key !== undefined) key = '' + config.key;
      for (const propName in config) {
        if (Object.prototype.hasOwnProperty.call(config, propName) && propName !== 'key' && propName !== 'ref') {
          props[propName] = config[propName];
        }
      }
    }
    if (children.length === 1) {
      props.children = children[0];
    } else if (children.length > 1) {
      props.children = children;
    }
    return { $$typeof: REACT_ELEMENT_TYPE, type: element.type, key, ref, props };
  }

  function isValidElement(object) {
    return typeof object === 'object' && object !== null && object.$$typeof === REACT_ELEMENT_TYPE;
  }

  function memo(type, compare) {
    return { $$typeof: REACT_MEMO_TYPE, type, compare: compare || null };
  }

  function forwardRef(render) {
    return { $$typeof: REACT_FORWARD_REF_TYPE, render };
  }

  function createContext(defaultValue) {
    const context = {
      $$typeof: REACT_CONTEXT_TYPE,
      _currentValue: defaultValue,
      Provider: null,
      Consumer: null
    };
    context.Provider = { $$typeof: REACT_PROVIDER_TYPE, _context: context };
    context.Consumer = context;
    return context;
  }

  function createPortal(children, containerInfo, key = null) {
    return {
      $$typeof: REACT_PORTAL_TYPE,
      key: key == null ? null : '' + key,
      children,
      containerInfo
    };
  }

  function shallowEqual(objA, objB) {
    if (Object.is(objA, objB)) return true;
    if (typeof objA !== 'object' || objA === null || typeof objB !== 'object' || objB === null) return false;
    const keysA = Object.keys(objA);
    const keysB = Object.keys(objB);
    if (keysA.length !== keysB.length) return false;
    for (let i = 0; i < keysA.length; i++) {
      const k = keysA[i];
      if (!Object.prototype.hasOwnProperty.call(objB, k) || !Object.is(objA[k], objB[k])) {
        return false;
      }
    }
    return true;
  }

  // Active component state & effect queues
  let currentComponent = null;
  let hookIndex = 0;
  let idCounter = 0;
  const dirtyComponents = new Set();
  let isScheduled = false;
  let isFlushing = false;
  const pendingLayoutEffects = [];
  const pendingPassiveEffects = [];

  function scheduleUpdate(comp) {
    if (comp.unmounted) return;
    comp.dirty = true;
    dirtyComponents.add(comp);
    if (!isScheduled && !isFlushing) {
      isScheduled = true;
      queueMicrotask(flushUpdates);
    }
  }

  function flushEffects(list) {
    const items = list.splice(0, list.length);
    for (let i = 0; i < items.length; i++) {
      const { comp, hook } = items[i];
      if (comp.unmounted) continue;
      if (typeof hook.cleanup === 'function') {
        try { hook.cleanup(); } catch (err) { console.error(err); }
        hook.cleanup = null;
      }
      try {
        const res = hook.effect();
        if (typeof res === 'function') hook.cleanup = res;
      } catch (err) {
        console.error(err);
      }
    }
  }

  function schedulePassiveEffects() {
    if (pendingPassiveEffects.length === 0) return;
    flushEffects(pendingPassiveEffects);
    if (dirtyComponents.size > 0 && !isFlushing) {
      flushUpdates();
    }
  }

  function flushUpdates() {
    if (isFlushing) return;
    isFlushing = true;
    isScheduled = false;
    try {
      let guard = 0;
      while ((dirtyComponents.size > 0 || pendingPassiveEffects.length > 0) && guard < 50) {
        guard++;
        if (dirtyComponents.size > 0) {
          const batch = Array.from(dirtyComponents).sort((a, b) => a.depth - b.depth);
          dirtyComponents.clear();
          for (let i = 0; i < batch.length; i++) {
            const comp = batch[i];
            if (!comp.unmounted && comp.dirty) {
              rerenderComponent(comp);
            }
          }
        }
        flushEffects(pendingLayoutEffects);
        if (pendingPassiveEffects.length > 0) {
          flushEffects(pendingPassiveEffects);
        }
      }
    } finally {
      isFlushing = false;
    }
  }

  function flushSync(fn) {
    const res = typeof fn === 'function' ? fn() : undefined;
    flushUpdates();
    return res;
  }

  function getHook() {
    if (!currentComponent) {
      throw new Error('Hooks can only be called inside the body of a function component.');
    }
    const hooks = currentComponent.hooks;
    const idx = hookIndex++;
    if (idx >= hooks.length) {
      hooks.push({});
    }
    return { hook: hooks[idx], comp: currentComponent };
  }

  function depsChanged(oldDeps, newDeps) {
    if (!oldDeps || !newDeps || oldDeps.length !== newDeps.length) return true;
    for (let i = 0; i < newDeps.length; i++) {
      if (!Object.is(oldDeps[i], newDeps[i])) return true;
    }
    return false;
  }

  function useState(initialState) {
    const { hook, comp } = getHook();
    if (!('state' in hook)) {
      hook.state = typeof initialState === 'function' ? initialState() : initialState;
      hook.setState = (action) => {
        const nextState = typeof action === 'function' ? action(hook.state) : action;
        if (!Object.is(hook.state, nextState)) {
          hook.state = nextState;
          scheduleUpdate(comp);
        }
      };
    }
    return [hook.state, hook.setState];
  }

  function useReducer(reducer, initialArg, init) {
    const { hook, comp } = getHook();
    if (!('state' in hook)) {
      hook.state = typeof init === 'function' ? init(initialArg) : initialArg;
      hook.dispatch = (action) => {
        const nextState = reducer(hook.state, action);
        if (!Object.is(hook.state, nextState)) {
          hook.state = nextState;
          scheduleUpdate(comp);
        }
      };
    }
    return [hook.state, hook.dispatch];
  }

  function useRef(initialValue) {
    const { hook } = getHook();
    if (!('ref' in hook)) {
      hook.ref = { current: initialValue };
    }
    return hook.ref;
  }

  function useMemo(factory, deps) {
    const { hook } = getHook();
    if (!('value' in hook) || depsChanged(hook.deps, deps)) {
      hook.deps = deps;
      hook.value = factory();
    }
    return hook.value;
  }

  function useCallback(callback, deps) {
    return useMemo(() => callback, deps);
  }

  function useDeferredValue(value) {
    return value;
  }

  function useTransition() {
    return [false, (cb) => { if (typeof cb === 'function') cb(); }];
  }

  function useId() {
    const { hook } = getHook();
    if (!('id' in hook)) {
      hook.id = ':r' + (++idCounter) + ':';
    }
    return hook.id;
  }

  function useContext(context) {
    return context ? context._currentValue : undefined;
  }

  function useEffect(effect, deps) {
    const { hook, comp } = getHook();
    if (!(' initialized' in hook) || depsChanged(hook.deps, deps)) {
      hook[' initialized'] = true;
      hook.deps = deps;
      hook.effect = effect;
      pendingPassiveEffects.push({ comp, hook });
    }
  }

  function useLayoutEffect(effect, deps) {
    const { hook, comp } = getHook();
    if (!(' initialized' in hook) || depsChanged(hook.deps, deps)) {
      hook[' initialized'] = true;
      hook.deps = deps;
      hook.effect = effect;
      pendingLayoutEffects.push({ comp, hook });
    }
  }

  function assignRef(ref, value) {
    if (!ref) return;
    if (typeof ref === 'function') {
      try { ref(value); } catch (e) { console.error(e); }
    } else if (typeof ref === 'object') {
      ref.current = value;
    }
  }

  function normalizeEventName(propName) {
    let capture = false;
    let base = propName;
    if (base.endsWith('Capture') && base !== 'onGotPointerCapture' && base !== 'onLostPointerCapture') {
      capture = true;
      base = base.slice(0, -7);
    }
    let evt = base.slice(2).toLowerCase();
    if (evt === 'doubleclick') evt = 'dblclick';
    return { evt, capture };
  }

  function updateDomProps(dom, oldProps, newProps, isSvg) {
    // 1. Remove old props
    for (const k in oldProps) {
      if (k === 'children' || k === 'key' || k === 'ref' || k === 'dangerouslySetInnerHTML') continue;
      if (!(k in newProps)) {
        if (k === 'style') {
          dom.removeAttribute('style');
        } else if (k.startsWith('on') && k.length > 2 && k[2] === k[2].toUpperCase()) {
          if (dom.__evMap) {
            const { evt, capture } = normalizeEventName(k);
            const key = evt + (capture ? '_cap' : '');
            if (dom.__evMap[key]) {
              dom.__evMap[key].fn = null;
            }
          }
        } else if (k === 'className' || k === 'class') {
          if (isSvg) dom.removeAttribute('class');
          else dom.className = '';
        } else {
          const attrName = isSvg && SVG_CAMEL_ATTRS[k] ? SVG_CAMEL_ATTRS[k] : k;
          dom.removeAttribute(attrName);
        }
      }
    }

    // 2. Set new/changed props
    for (const k in newProps) {
      if (k === 'children' || k === 'key' || k === 'ref') continue;
      const val = newProps[k];
      const oldVal = oldProps[k];
      if (Object.is(val, oldVal) && k !== 'value' && k !== 'checked') continue;

      if (k === 'dangerouslySetInnerHTML') {
        const htmlStr = val && val.__html != null ? String(val.__html) : '';
        const oldHtmlStr = oldVal && oldVal.__html != null ? String(oldVal.__html) : null;
        if (htmlStr !== oldHtmlStr) {
          dom.innerHTML = htmlStr;
        }
      } else if (k === 'style') {
        if (oldVal && typeof oldVal === 'object') {
          for (const sk in oldVal) {
            if (!val || !(sk in val)) {
              if (sk.startsWith('--')) dom.style.removeProperty(sk);
              else dom.style[sk] = '';
            }
          }
        }
        if (typeof val === 'string') {
          dom.style.cssText = val;
        } else if (val && typeof val === 'object') {
          for (const sk in val) {
            const sv = val[sk];
            if (sv === null || sv === undefined || sv === false) {
              if (sk.startsWith('--')) dom.style.removeProperty(sk);
              else dom.style[sk] = '';
            } else if (sk.startsWith('--')) {
              dom.style.setProperty(sk, String(sv));
            } else if (typeof sv === 'number' && sv !== 0 && !UNITLESS_CSS.has(sk)) {
              dom.style[sk] = sv + 'px';
            } else {
              dom.style[sk] = String(sv);
            }
          }
        } else {
          dom.removeAttribute('style');
        }
      } else if (k.startsWith('on') && k.length > 2 && k[2] === k[2].toUpperCase()) {
        if (!dom.__evMap) dom.__evMap = {};
        const { evt, capture } = normalizeEventName(k);
        const key = evt + (capture ? '_cap' : '');
        if (!dom.__evMap[key]) {
          const entry = { fn: typeof val === 'function' ? val : null };
          const listener = (e) => {
            if (typeof entry.fn === 'function') {
              if (e.nativeEvent === undefined) e.nativeEvent = e;
              return entry.fn(e);
            }
          };
          dom.__evMap[key] = entry;
          dom.addEventListener(evt, listener, capture);
          if (evt === 'change' && (dom.tagName === 'INPUT' || dom.tagName === 'TEXTAREA')) {
            dom.addEventListener('input', listener, capture);
          }
        } else {
          dom.__evMap[key].fn = typeof val === 'function' ? val : null;
        }
      } else if (k === 'className' || k === 'class') {
        const clsStr = val == null || val === false ? '' : String(val);
        if (isSvg) {
          if (clsStr) dom.setAttribute('class', clsStr);
          else dom.removeAttribute('class');
        } else {
          dom.className = clsStr;
        }
      } else if (k === 'autoFocus') {
        if (val && typeof dom.focus === 'function') {
          queueMicrotask(() => { try { dom.focus(); } catch (e) {} });
        }
      } else if (!isSvg && (k === 'disabled' || k === 'checked' || k === 'readOnly' || k === 'multiple' || k === 'selected')) {
        dom[k] = Boolean(val);
        if (!val) dom.removeAttribute(k);
      } else if (!isSvg && k === 'value' && (dom.tagName === 'INPUT' || dom.tagName === 'TEXTAREA' || dom.tagName === 'SELECT')) {
        const strVal = val == null ? '' : String(val);
        if (dom.value !== strVal) dom.value = strVal;
      } else {
        if (val === null || val === undefined || val === false) {
          const attrName = isSvg && SVG_CAMEL_ATTRS[k] ? SVG_CAMEL_ATTRS[k] : k;
          dom.removeAttribute(attrName);
        } else {
          const attrName = isSvg && SVG_CAMEL_ATTRS[k] ? SVG_CAMEL_ATTRS[k] : k;
          const attrVal = val === true && !k.startsWith('aria-') && !k.startsWith('data-') && k !== 'draggable' ? '' : String(val);
          dom.setAttribute(attrName, attrVal);
        }
      }
    }
  }

  function getFirstDom(fiber) {
    if (!fiber || fiber.isPortal) return null;
    if (fiber.dom) return fiber.dom;
    if (fiber.childFiber) return getFirstDom(fiber.childFiber);
    if (fiber.children) {
      for (let i = 0; i < fiber.children.length; i++) {
        const d = getFirstDom(fiber.children[i]);
        if (d) return d;
      }
    }
    return null;
  }

  function getLastDom(fiber) {
    if (!fiber || fiber.isPortal) return null;
    if (fiber.dom) return fiber.dom;
    if (fiber.childFiber) return getLastDom(fiber.childFiber);
    if (fiber.children) {
      for (let i = fiber.children.length - 1; i >= 0; i--) {
        const d = getLastDom(fiber.children[i]);
        if (d) return d;
      }
    }
    return null;
  }

  function collectDoms(fiber, out) {
    if (!fiber || fiber.isPortal) return out;
    if (fiber.dom) {
      out.push(fiber.dom);
      return out;
    }
    if (fiber.childFiber) {
      collectDoms(fiber.childFiber, out);
    }
    if (fiber.children) {
      for (let i = 0; i < fiber.children.length; i++) {
        collectDoms(fiber.children[i], out);
      }
    }
    return out;
  }

  function unmountFiber(fiber, removeFromDom = true) {
    if (!fiber) return;
    if (fiber.ref) {
      assignRef(fiber.ref, null);
    }
    if (fiber.instance) {
      fiber.instance.unmounted = true;
      dirtyComponents.delete(fiber.instance);
      const hooks = fiber.instance.hooks;
      for (let i = 0; i < hooks.length; i++) {
        if (typeof hooks[i].cleanup === 'function') {
          try { hooks[i].cleanup(); } catch (e) { console.error(e); }
          hooks[i].cleanup = null;
        }
      }
    }
    if (fiber.childFiber) {
      unmountFiber(fiber.childFiber, removeFromDom && !fiber.dom && !fiber.isPortal);
    }
    if (fiber.children) {
      for (let i = 0; i < fiber.children.length; i++) {
        unmountFiber(fiber.children[i], removeFromDom && !fiber.dom && !fiber.isPortal);
      }
    }
    if (fiber.isPortal && fiber.children) {
      for (let i = 0; i < fiber.children.length; i++) {
        const doms = collectDoms(fiber.children[i], []);
        for (let j = 0; j < doms.length; j++) {
          if (doms[j].parentNode) doms[j].parentNode.removeChild(doms[j]);
        }
      }
    } else if (removeFromDom && fiber.dom && fiber.dom.parentNode) {
      fiber.dom.parentNode.removeChild(fiber.dom);
    }
  }

  function sameTypeAndKey(oldFiber, vnode) {
    if (!oldFiber || !vnode) return false;
    if (oldFiber.key !== vnode.key) return false;
    if (oldFiber.type === vnode.type) return true;
    if (oldFiber.type && vnode.type && typeof oldFiber.type === 'object' && typeof vnode.type === 'object') {
      if (oldFiber.type.$$typeof === REACT_MEMO_TYPE && vnode.type.$$typeof === REACT_MEMO_TYPE) {
        return oldFiber.type.type === vnode.type.type;
      }
    }
    return false;
  }

  function renderFunctionComponent(comp, renderFn, props, refOrUndefined) {
    const prevComp = currentComponent;
    const prevIdx = hookIndex;
    currentComponent = comp;
    hookIndex = 0;
    comp.dirty = false;
    let rendered = null;
    try {
      rendered = renderFn(props, refOrUndefined);
    } finally {
      currentComponent = prevComp;
      hookIndex = prevIdx;
    }
    if (Array.isArray(rendered)) {
      rendered = { $$typeof: REACT_ELEMENT_TYPE, type: REACT_FRAGMENT_TYPE, key: null, ref: null, props: { children: rendered } };
    } else if (typeof rendered === 'string' || typeof rendered === 'number') {
      rendered = { $$typeof: REACT_ELEMENT_TYPE, type: '#text', key: null, ref: null, props: { nodeValue: String(rendered) } };
    } else if (!rendered || typeof rendered === 'boolean') {
      rendered = null;
    }
    return rendered;
  }

  function rerenderComponent(comp) {
    if (comp.unmounted) return;
    const fiber = comp.fiber;
    const rendered = renderFunctionComponent(comp, comp.renderFn, fiber.props, comp.forwardRef ? fiber.ref : undefined);
    fiber.childFiber = reconcileSingle(comp.parentDom, fiber.childFiber, rendered, comp.isSvg, comp.depth + 1, comp.anchorGetter ? comp.anchorGetter() : null);
  }

  function reconcileSingle(parentDom, oldFiber, vnode, isSvg, depth, beforeNode = null) {
    if (vnode == null || typeof vnode === 'boolean') {
      if (oldFiber) unmountFiber(oldFiber, true);
      return null;
    }

    if (typeof vnode === 'string' || typeof vnode === 'number') {
      vnode = { $$typeof: REACT_ELEMENT_TYPE, type: '#text', key: null, ref: null, props: { nodeValue: String(vnode) } };
    } else if (Array.isArray(vnode)) {
      vnode = { $$typeof: REACT_ELEMENT_TYPE, type: REACT_FRAGMENT_TYPE, key: null, ref: null, props: { children: vnode } };
    }

    // Portal
    if (vnode.$$typeof === REACT_PORTAL_TYPE) {
      const targetDom = vnode.containerInfo;
      const nextChildren = flattenChildren(
        vnode.children === undefined ? [] : Array.isArray(vnode.children) ? vnode.children : [vnode.children],
        []
      );
      if (oldFiber && oldFiber.isPortal && oldFiber.containerInfo === targetDom) {
        oldFiber.children = reconcileChildrenArray(targetDom, oldFiber.children || [], nextChildren, false, depth + 1, null);
        return oldFiber;
      }
      if (oldFiber) unmountFiber(oldFiber, true);
      const fiber = {
        type: REACT_PORTAL_TYPE,
        key: vnode.key,
        isPortal: true,
        containerInfo: targetDom,
        children: []
      };
      fiber.children = reconcileChildrenArray(targetDom, [], nextChildren, false, depth + 1, null);
      return fiber;
    }

    // Text node
    if (vnode.type === '#text') {
      if (oldFiber && oldFiber.type === '#text') {
        if (oldFiber.props.nodeValue !== vnode.props.nodeValue) {
          oldFiber.dom.nodeValue = vnode.props.nodeValue;
          oldFiber.props = vnode.props;
        }
        return oldFiber;
      }
      if (oldFiber) unmountFiber(oldFiber, true);
      const dom = document.createTextNode(vnode.props.nodeValue);
      parentDom.insertBefore(dom, beforeNode);
      return { type: '#text', key: vnode.key, props: vnode.props, dom };
    }

    // Fragment
    if (vnode.type === REACT_FRAGMENT_TYPE) {
      const rawChildren = vnode.props && vnode.props.children !== undefined
        ? (Array.isArray(vnode.props.children) ? vnode.props.children : [vnode.props.children])
        : [];
      const nextChildren = flattenChildren(rawChildren, []);
      if (oldFiber && oldFiber.type === REACT_FRAGMENT_TYPE && oldFiber.key === vnode.key) {
        oldFiber.props = vnode.props;
        oldFiber.children = reconcileChildrenArray(parentDom, oldFiber.children || [], nextChildren, isSvg, depth + 1, beforeNode);
        return oldFiber;
      }
      if (oldFiber) unmountFiber(oldFiber, true);
      const fiber = { type: REACT_FRAGMENT_TYPE, key: vnode.key, props: vnode.props, children: [] };
      fiber.children = reconcileChildrenArray(parentDom, [], nextChildren, isSvg, depth + 1, beforeNode);
      return fiber;
    }

    // Context Provider
    if (vnode.type && typeof vnode.type === 'object' && vnode.type.$$typeof === REACT_PROVIDER_TYPE) {
      const ctx = vnode.type._context;
      ctx._currentValue = vnode.props.value;
      const rawChildren = vnode.props && vnode.props.children !== undefined
        ? (Array.isArray(vnode.props.children) ? vnode.props.children : [vnode.props.children])
        : [];
      const nextChildren = flattenChildren(rawChildren, []);
      if (oldFiber && oldFiber.type === vnode.type && oldFiber.key === vnode.key) {
        oldFiber.props = vnode.props;
        oldFiber.children = reconcileChildrenArray(parentDom, oldFiber.children || [], nextChildren, isSvg, depth + 1, beforeNode);
        return oldFiber;
      }
      if (oldFiber) unmountFiber(oldFiber, true);
      const fiber = { type: vnode.type, key: vnode.key, props: vnode.props, children: [] };
      fiber.children = reconcileChildrenArray(parentDom, [], nextChildren, isSvg, depth + 1, beforeNode);
      return fiber;
    }

    // Function / Memo / ForwardRef Component
    const isMemo = vnode.type && typeof vnode.type === 'object' && vnode.type.$$typeof === REACT_MEMO_TYPE;
    const isForwardRef = vnode.type && typeof vnode.type === 'object' && vnode.type.$$typeof === REACT_FORWARD_REF_TYPE;
    const isFunc = typeof vnode.type === 'function' || isMemo || isForwardRef;

    if (isFunc) {
      const renderFn = isMemo ? vnode.type.type : isForwardRef ? vnode.type.render : vnode.type;
      const compareFn = isMemo ? (vnode.type.compare || shallowEqual) : null;

      if (sameTypeAndKey(oldFiber, vnode) && oldFiber.instance) {
        const comp = oldFiber.instance;
        comp.parentDom = parentDom;
        comp.isSvg = isSvg;
        comp.depth = depth;
        if (beforeNode !== null) {
          comp.anchorGetter = () => beforeNode && beforeNode.parentNode === parentDom ? beforeNode : null;
        }
        if (isMemo && !comp.dirty && compareFn(oldFiber.props, vnode.props)) {
          return oldFiber;
        }
        oldFiber.props = vnode.props;
        oldFiber.ref = vnode.ref;
        const rendered = renderFunctionComponent(comp, renderFn, vnode.props, isForwardRef ? vnode.ref : undefined);
        oldFiber.childFiber = reconcileSingle(parentDom, oldFiber.childFiber, rendered, isSvg, depth + 1, beforeNode);
        return oldFiber;
      }

      if (oldFiber) unmountFiber(oldFiber, true);
      const fiber = {
        type: vnode.type,
        key: vnode.key,
        ref: vnode.ref,
        props: vnode.props,
        instance: null,
        childFiber: null
      };
      const comp = {
        hooks: [],
        fiber,
        renderFn,
        forwardRef: isForwardRef,
        parentDom,
        isSvg,
        depth,
        dirty: false,
        unmounted: false,
        anchorGetter: () => beforeNode && beforeNode.parentNode === parentDom ? beforeNode : null
      };
      fiber.instance = comp;
      const rendered = renderFunctionComponent(comp, renderFn, vnode.props, isForwardRef ? vnode.ref : undefined);
      fiber.childFiber = reconcileSingle(parentDom, null, rendered, isSvg, depth + 1, beforeNode);
      return fiber;
    }

    // Host DOM Element ('div', 'svg', 'path', 'canvas', etc.)
    if (typeof vnode.type === 'string') {
      const tag = vnode.type;
      const nextIsSvg = tag === 'svg' ? true : (isSvg && tag !== 'foreignObject');
      const rawChildren = vnode.props && vnode.props.children !== undefined
        ? (Array.isArray(vnode.props.children) ? vnode.props.children : [vnode.props.children])
        : [];
      const nextChildren = vnode.props && vnode.props.dangerouslySetInnerHTML
        ? []
        : flattenChildren(rawChildren, []);

      if (sameTypeAndKey(oldFiber, vnode) && oldFiber.dom) {
        const dom = oldFiber.dom;
        updateDomProps(dom, oldFiber.props, vnode.props, nextIsSvg);
        if (oldFiber.ref !== vnode.ref) {
          assignRef(oldFiber.ref, null);
          assignRef(vnode.ref, dom);
        }
        oldFiber.props = vnode.props;
        oldFiber.ref = vnode.ref;
        if (!vnode.props || !vnode.props.dangerouslySetInnerHTML) {
          oldFiber.children = reconcileChildrenArray(dom, oldFiber.children || [], nextChildren, tag === 'foreignObject' ? false : nextIsSvg, depth + 1, null);
        }
        return oldFiber;
      }

      if (oldFiber) unmountFiber(oldFiber, true);
      const dom = nextIsSvg
        ? document.createElementNS(SVG_NS, tag)
        : document.createElement(tag);
      updateDomProps(dom, {}, vnode.props, nextIsSvg);
      const fiber = {
        type: tag,
        key: vnode.key,
        ref: vnode.ref,
        props: vnode.props,
        dom,
        children: []
      };
      if (!vnode.props || !vnode.props.dangerouslySetInnerHTML) {
        fiber.children = reconcileChildrenArray(dom, [], nextChildren, tag === 'foreignObject' ? false : nextIsSvg, depth + 1, null);
      }
      parentDom.insertBefore(dom, beforeNode);
      if (vnode.ref) {
        assignRef(vnode.ref, dom);
      }
      return fiber;
    }

    return null;
  }

  function reconcileChildrenArray(parentDom, oldFibers, newVNodes, isSvg, depth, outerBeforeNode) {
    const result = new Array(newVNodes.length);
    const keyedOld = new Map();
    const usedOldIndices = new Set();

    for (let i = 0; i < oldFibers.length; i++) {
      const f = oldFibers[i];
      if (f && f.key != null) {
        keyedOld.set(f.key, { fiber: f, index: i });
      }
    }

    for (let i = 0; i < newVNodes.length; i++) {
      const vnode = newVNodes[i];
      if (!vnode) {
        result[i] = null;
        continue;
      }
      let matchedOld = null;
      if (vnode.key != null) {
        const entry = keyedOld.get(vnode.key);
        if (entry && sameTypeAndKey(entry.fiber, vnode)) {
          matchedOld = entry.fiber;
          usedOldIndices.add(entry.index);
        }
      } else if (i < oldFibers.length && !usedOldIndices.has(i)) {
        const cand = oldFibers[i];
        if (cand && cand.key == null && sameTypeAndKey(cand, vnode)) {
          matchedOld = cand;
          usedOldIndices.add(i);
        }
      }
      result[i] = { matchedOld, vnode };
    }

    // Unmount any old fibers that were not matched
    for (let i = 0; i < oldFibers.length; i++) {
      if (oldFibers[i] && !usedOldIndices.has(i)) {
        unmountFiber(oldFibers[i], true);
      }
    }

    // Reconcile from right to left so we always have the accurate nextSibling anchor in parentDom!
    let nextSiblingDom = outerBeforeNode;
    for (let i = newVNodes.length - 1; i >= 0; i--) {
      const slot = result[i];
      if (!slot) {
        result[i] = null;
        continue;
      }
      const fiber = reconcileSingle(parentDom, slot.matchedOld, slot.vnode, isSvg, depth, nextSiblingDom);
      result[i] = fiber;
      if (fiber) {
        const lastDom = getLastDom(fiber);
        // Ensure keyed/moved existing DOM nodes are in the right order before nextSiblingDom
        if (slot.matchedOld && lastDom && lastDom.parentNode === parentDom && lastDom.nextSibling !== nextSiblingDom) {
          const doms = collectDoms(fiber, []);
          for (let d = 0; d < doms.length; d++) {
            if (doms[d].parentNode === parentDom && doms[d] !== nextSiblingDom) {
              parentDom.insertBefore(doms[d], nextSiblingDom);
            }
          }
        }
        const firstDom = getFirstDom(fiber);
        if (firstDom && firstDom.parentNode === parentDom) {
          nextSiblingDom = firstDom;
        }
        if (fiber.instance) {
          const capturedNext = nextSiblingDom;
          fiber.instance.anchorGetter = () => {
            for (let k = i + 1; k < result.length; k++) {
              const d = getFirstDom(result[k]);
              if (d && d.parentNode === parentDom) return d;
            }
            return outerBeforeNode;
          };
        }
      }
    }

    return result;
  }

  function createRoot(container) {
    let rootFiber = null;
    return {
      render(element) {
        rootFiber = reconcileSingle(container, rootFiber, element, false, 0, null);
        flushEffects(pendingLayoutEffects);
        schedulePassiveEffects();
      },
      unmount() {
        if (rootFiber) {
          unmountFiber(rootFiber, true);
          rootFiber = null;
        }
      }
    };
  }

  const Children = {
    map(children, fn) {
      if (children == null) return children;
      const arr = Array.isArray(children) ? children : [children];
      return arr.map(fn);
    },
    forEach(children, fn) {
      if (children == null) return;
      const arr = Array.isArray(children) ? children : [children];
      arr.forEach(fn);
    },
    count(children) {
      if (children == null) return 0;
      return Array.isArray(children) ? children.length : 1;
    },
    toArray(children) {
      if (children == null) return [];
      return Array.isArray(children) ? children.slice() : [children];
    },
    only(children) {
      if (!isValidElement(children)) throw new Error('React.Children.only expected to receive a single React element child.');
      return children;
    }
  };

  const React = {
    version: '18.3.1',
    Fragment: REACT_FRAGMENT_TYPE,
    StrictMode: REACT_FRAGMENT_TYPE,
    createElement,
    cloneElement,
    isValidElement,
    Children,
    memo,
    forwardRef,
    createContext,
    useState,
    useReducer,
    useRef,
    useEffect,
    useLayoutEffect,
    useMemo,
    useCallback,
    useDeferredValue,
    useTransition,
    useId,
    useContext,
    createRef: () => ({ current: null })
  };

  const ReactDOM = {
    version: '18.3.1',
    createRoot,
    createPortal,
    flushSync,
    render(element, container) {
      const r = createRoot(container);
      r.render(element);
      return r;
    }
  };

  global.React = React;
  global.ReactDOM = ReactDOM;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { React, ReactDOM };
  }
})(typeof window !== 'undefined' ? window : globalThis);
