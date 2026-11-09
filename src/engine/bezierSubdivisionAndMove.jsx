/**
 * @file src/engine/bezierSubdivisionAndMove.jsx
 * @description Subdivisi kurva De Casteljau (Split Segment / Insert Node) & translasi geometri
 */
import { lerp, uid, P, rd, cl } from './vectorPrimitives.jsx';
import { mapGrad } from './gradientEngine.jsx';
import { TBB } from './spatialIndexAndHitTest.jsx';
import { GEOMETRY_CACHE } from '../renderer/geometryCache.jsx';
import { parsePath } from './svgPathParser.jsx';
import { serializePath } from './svgPathSerializer.jsx';

/* ---- splitSeg: Subdivisi De Casteljau & Kolinier (Node baru SELALU punya handle Bézier tanpa mengubah bentuk) ---- */
function splitSeg(a, b, t) {
  if (!a.handleOut && !b.handleIn) {
    /* Pada segmen lurus: bagi di titik s, lalu beri handleIn & handleOut kolinier (1/3 jarak segmen)
       agar node baru otomatis memiliki handle Bézier tanpa membelokkan garis sedikit pun */
    const s = lerp(a, b, t);
    const hIn = lerp(s, a, 1 / 3);
    const hOut = lerp(s, b, 1 / 3);
    return {
      a: {
        ...a,
        handleOut: lerp(a, s, 1 / 3)
      },
      n: {
        id: uid(),
        x: s.x,
        y: s.y,
        type: Math.abs(t - 0.5) < 1e-3 ? 'symmetric' : 'smooth',
        handleIn: hIn,
        handleOut: hOut
      },
      b: {
        ...b,
        handleIn: lerp(s, b, 2 / 3)
      }
    };
  }
  const p1 = a.handleOut || P(a),
    p2 = b.handleIn || P(b);
  const q0 = lerp(P(a), p1, t),
    q1 = lerp(p1, p2, t),
    q2 = lerp(p2, P(b), t);
  const r0 = lerp(q0, q1, t),
    r1 = lerp(q1, q2, t),
    s = lerp(r0, r1, t);
  return {
    a: {
      ...a,
      handleOut: q0
    },
    n: {
      id: uid(),
      x: s.x,
      y: s.y,
      type: 'smooth',
      handleIn: r0,
      handleOut: r1
    },
    b: {
      ...b,
      handleIn: q2
    }
  };
}
function insertNode(o, subId, i, t) {
  return {
    ...o,
    subs: o.subs.map(sp => {
      if (sp.id !== subId) return sp;
      const nodes = sp.nodes.slice(),
        n = nodes.length,
        j = (i + 1) % n,
        r = splitSeg(nodes[i], nodes[j], t);
      nodes[i] = r.a;
      nodes[j] = r.b;
      if (j === 0) nodes.push(r.n);else nodes.splice(i + 1, 0, r.n);
      return {
        ...sp,
        nodes
      };
    })
  };
}
function insertMid(o, ids) {
  let cnt = 0;
  const r = {
    ...o,
    subs: o.subs.map(sp => {
      const n = sp.nodes.length,
        idx = [];
      for (let i = 0; i < (sp.closed ? n : n - 1); i++) if (ids.has(sp.nodes[i].id) && ids.has(sp.nodes[(i + 1) % n].id)) idx.push(i);
      let cur = sp;
      idx.reverse().forEach(i => {
        cur = insertNode({
          subs: [cur]
        }, sp.id, i, 0.5).subs[0];
        cnt++;
      });
      return cur;
    })
  };
  return {
    o: r,
    cnt
  };
}
function segPoint(a, b, t) {
  if (!a.handleOut && !b.handleIn) return lerp(a, b, t);
  const p1 = a.handleOut || P(a),
    p2 = b.handleIn || P(b),
    u = 1 - t;
  return {
    x: u * u * u * a.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * b.x,
    y: u * u * u * a.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * b.y
  };
}
/* petakan metadata fillet (c + handle-nya, pvOut, nxIn) dengan fungsi titik fn; k = faktor skala radius */
/* petakan metadata fillet (c + handle-nya, pvOut, nxIn) dengan fungsi titik fn; k = faktor skala radius */
const mapFil = (fil, fn, k = 1) => !fil ? null : {
  ...fil,
  r: fil.r * k,
  c: fil.c && {
    ...fn(fil.c),
    handleIn: fil.c.handleIn ? fn(fil.c.handleIn) : null,
    handleOut: fil.c.handleOut ? fn(fil.c.handleOut) : null
  },
  pvOut: fil.pvOut ? fn(fil.pvOut) : null,
  nxIn: fil.nxIn ? fn(fil.nxIn) : null
};
function translate(o, dx, dy) {
  const mv = q => ({
    x: q.x + dx,
    y: q.y + dy
  });
  const subs = o.subs,
    nSubs = new Array(subs.length);
  for (let si = 0; si < subs.length; si++) {
    const sp = subs[si],
      ns = sp.nodes,
      nNs = new Array(ns.length);
    for (let ni = 0; ni < ns.length; ni++) {
      const n = ns[ni];
      nNs[ni] = {
        id: n.id,
        x: n.x + dx,
        y: n.y + dy,
        type: n.type,
        handleIn: n.handleIn ? {
          x: n.handleIn.x + dx,
          y: n.handleIn.y + dy
        } : null,
        handleOut: n.handleOut ? {
          x: n.handleOut.x + dx,
          y: n.handleOut.y + dy
        } : null,
        fil: n.fil ? mapFil(n.fil, mv) : null
      };
    }
    nSubs[si] = {
      id: sp.id,
      closed: sp.closed,
      nodes: nNs
    };
  }
  let nextClipPathD = o.clipPathD;
  if (o.clipPathD) {
    try {
      const cSubs = parsePath(o.clipPathD);
      const tSubs = cSubs.map(sp => ({
        ...sp,
        nodes: sp.nodes.map(n => ({
          ...n,
          x: n.x + dx,
          y: n.y + dy,
          handleIn: n.handleIn ? {
            x: n.handleIn.x + dx,
            y: n.handleIn.y + dy
          } : null,
          handleOut: n.handleOut ? {
            x: n.handleOut.x + dx,
            y: n.handleOut.y + dy
          } : null
        }))
      }));
      nextClipPathD = serializePath({
        subs: tSubs
      });
    } catch (e) {}
  }
  const nextObj = {
    ...o,
    ...(nextClipPathD !== o.clipPathD ? {
      clipPathD: nextClipPathD
    } : {}),
    ...(o.text ? {
      text: {
        ...o.text,
        x: rd((o.text.x || 0) + dx),
        y: rd((o.text.y || 0) + dy)
      }
    } : {}),
    grad: o.grad ? mapGrad(o.grad, mv) : o.grad,
    ...(o.strokeGrad ? {
      strokeGrad: mapGrad(o.strokeGrad, mv)
    } : {}),
    subs: nSubs
  };
  const bb = TBB.get(o);
  if (bb) TBB.set(nextObj, [bb[0] + dx, bb[1] + dy, bb[2] + dx, bb[3] + dy]); /* warisi cache tightBBox (translasi murni) */
  if (typeof GEOMETRY_CACHE !== "undefined" && GEOMETRY_CACHE && GEOMETRY_CACHE.copySubsSignature) {
    GEOMETRY_CACHE.copySubsSignature(o.subs, nSubs);
  }
  return nextObj;
}
function moveNodes(o, ids, dx, dy) {
  let anyHit = false,
    allHit = true;
  for (let si = 0; si < o.subs.length; si++) {
    const ns = o.subs[si].nodes;
    for (let ni = 0; ni < ns.length; ni++) {
      if (ids.has(ns[ni].id)) anyHit = true;else allHit = false;
    }
  }
  if (!anyHit) return o;
  if (allHit) return translate(o, dx, dy);
  return {
    ...o,
    subs: o.subs.map(sp => sp.nodes.some(n => ids.has(n.id)) ? {
      ...sp,
      nodes: sp.nodes.map(n => ids.has(n.id) ? {
        ...n,
        fil: null,
        x: n.x + dx,
        y: n.y + dy,
        handleIn: n.handleIn && {
          x: n.handleIn.x + dx,
          y: n.handleIn.y + dy
        },
        handleOut: n.handleOut && {
          x: n.handleOut.x + dx,
          y: n.handleOut.y + dy
        }
      } : n)
    } : sp)
  };
}
const cloneObj = o => ({
  ...o,
  id: uid(),
  ...(o.text ? {
    text: {
      ...o.text
    }
  } : {}),
  subs: o.subs.map(sp => ({
    ...sp,
    id: uid(),
    nodes: sp.nodes.map(n => ({
      ...cl(n),
      id: uid()
    }))
  }))
});

/* =========================================================================
   ANALYTIC CUBIC EXTREMA BBOX (IM-007) & PRE-SAMPLED CHORD LUT + SPATIAL INDEX (GV-005, GV-006)
   ========================================================================= */

export { splitSeg, insertNode, insertMid, segPoint, mapFil, translate, moveNodes, cloneObj };
