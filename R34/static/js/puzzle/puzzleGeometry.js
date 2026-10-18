// ============================================================
// Jigsaw Geometry & Tab/Blank Edge Generators
// ============================================================

export function getJigsawPt(x1, y1, x2, y2, t, n_val, W, H) {
    const vx = x2 - x1;
    const vy = y2 - y1;
    if (!W || !H) {
        const L = Math.hypot(vx, vy);
        if (L < 0.0001) return { x: x1, y: y1 };
        const ux = vx / L;
        const uy = vy / L;
        const nx = -uy;
        const ny = ux;
        return {
            x: x1 + t * vx + n_val * nx * L,
            y: y1 + t * vy + n_val * ny * L
        };
    }
    const nx = -vy * (H / W);
    const ny = vx * (W / H);
    return {
        x: x1 + t * vx + n_val * nx,
        y: y1 + t * vy + n_val * ny
    };
}

export function getSeamBaselineN(t, seam) {
    if (!seam) return 0;
    const baseCurve = seam.baseCurve || 0;
    return baseCurve * Math.sin(t * Math.PI);
}

export function getCanonicalJigsawSegments(x1, y1, x2, y2, seam, W, H) {
    const pos = seam.tabPos || 0.5;
    const size = seam.tabSize || 0.18;
    const rawWidth = seam.tabWidth || 0.18;
    const rawNeck = seam.neckWidth || 0.085;
    const width = Math.max(0.14, Math.min(0.28, rawWidth));
    const neck = Math.max(0.06, Math.min(width * 0.45, rawNeck));
    const h = size * (seam.dir || 1);
    const nBase = (t) => getSeamBaselineN(t, seam);
    const pt = (t, nTab) => getJigsawPt(x1, y1, x2, y2, t, nBase(t) + nTab, W, H);
    const startPt = pt(0, 0);
    const endPt = pt(1, 0);
    const segs = [];

    const curve = (pStart, pEnd, cp1YFunct, cp2YFunct) => {
        const cp1x = pStart.t + (pEnd.t - pStart.t) * 0.3;
        const cp2x = pStart.t + (pEnd.t - pStart.t) * 0.7;
        return {
            isLine: false,
            start: pt(pStart.t, pStart.nTab),
            cp1: pt(cp1x, cp1YFunct(pStart.nTab, pEnd.nTab)),
            cp2: pt(cp2x, cp2YFunct(pStart.nTab, pEnd.nTab)),
            end: pt(pEnd.t, pEnd.nTab)
        };
    };

    if (seam.shape === 'wavy') {
        const wBase = width * 0.8;
        const wNeck = neck * 0.45;
        const wBulb = width * 0.5;
        const pts = {
            p1: { t: pos - wBase, nTab: 0 },
            pDip1: { t: pos - (wBase + wNeck) * 0.5, nTab: -h * 0.15 },
            p2: { t: pos - wNeck, nTab: h * 0.35 },
            p3: { t: pos - wBulb, nTab: h * 0.95 },
            p4: { t: pos + wBulb, nTab: h * 0.95 },
            p5: { t: pos + wNeck, nTab: h * 0.35 },
            pDip2: { t: pos + (wBase + wNeck) * 0.5, nTab: -h * 0.15 },
            p6: { t: pos + wBase, nTab: 0 }
        };
        const t1 = pts.p1.t;
        segs.push({ isLine: false, start: startPt, cp1: pt(t1 * 0.33, 0), cp2: pt(t1 * 0.66, 0), end: pt(t1, 0) });
        segs.push(curve(pts.p1, pts.pDip1, (sn) => sn, (sn, en) => en));
        segs.push(curve(pts.pDip1, pts.p2, (sn) => sn, (sn, en) => en - h * 0.1));
        segs.push(curve(pts.p2, pts.p3, (sn, en) => sn + h * 0.3, (sn, en) => en - h * 0.1));
        segs.push({ isLine: false, start: pt(pts.p3.t, pts.p3.nTab), cp1: pt(pts.p3.t + (pts.p4.t - pts.p3.t) * 0.1, pts.p3.nTab + h * 0.25), cp2: pt(pts.p4.t - (pts.p4.t - pts.p3.t) * 0.1, pts.p4.nTab + h * 0.25), end: pt(pts.p4.t, pts.p4.nTab) });
        segs.push(curve(pts.p4, pts.p5, (sn) => sn - h * 0.1, (sn, en) => en + h * 0.3));
        segs.push(curve(pts.p5, pts.pDip2, (sn) => sn - h * 0.1, (sn, en) => en));
        segs.push(curve(pts.pDip2, pts.p6, (sn) => sn, (sn, en) => en));
        const t6 = pts.p6.t;
        const tSpan = 1 - t6;
        segs.push({ isLine: false, start: pt(t6, 0), cp1: pt(t6 + tSpan * 0.33, 0), cp2: pt(t6 + tSpan * 0.66, 0), end: endPt });
    } else {
        const wBase = width * 0.5;
        const wNeck = neck * 0.5;
        const wBulb = width * 0.4;
        const pts = {
            p1: { t: pos - wBase, nTab: 0 },
            p2: { t: pos - wNeck, nTab: h * 0.3 },
            p3: { t: pos - wBulb, nTab: h * 0.9 },
            p4: { t: pos + wBulb, nTab: h * 0.9 },
            p5: { t: pos + wNeck, nTab: h * 0.3 },
            p6: { t: pos + wBase, nTab: 0 }
        };
        const t1 = pts.p1.t;
        segs.push({ isLine: false, start: startPt, cp1: pt(t1 * 0.33, 0), cp2: pt(t1 * 0.66, 0), end: pt(t1, 0) });
        segs.push(curve(pts.p1, pts.p2, (sn) => sn, (sn, en) => en - h * 0.1));
        segs.push(curve(pts.p2, pts.p3, (sn, en) => sn + h * 0.3, (sn, en) => en - h * 0.1));
        segs.push({ isLine: false, start: pt(pts.p3.t, pts.p3.nTab), cp1: pt(pts.p3.t + (pts.p4.t - pts.p3.t) * 0.1, pts.p3.nTab + h * 0.25), cp2: pt(pts.p4.t - (pts.p4.t - pts.p3.t) * 0.1, pts.p4.nTab + h * 0.25), end: pt(pts.p4.t, pts.p4.nTab) });
        segs.push(curve(pts.p4, pts.p5, (sn) => sn - h * 0.1, (sn, en) => en + h * 0.3));
        segs.push(curve(pts.p5, pts.p6, (sn) => sn - h * 0.1, (sn, en) => en));
        const t6 = pts.p6.t;
        const tSpan = 1 - t6;
        segs.push({ isLine: false, start: pt(t6, 0), cp1: pt(t6 + tSpan * 0.33, 0), cp2: pt(t6 + tSpan * 0.66, 0), end: endPt });
    }
    return segs;
}

export function drawJigsawEdge(x1, y1, x2, y2, isReverse, seam, W, H) {
    if (!seam || !seam.shape) {
        return `L ${x2.toFixed(4)} ${y2.toFixed(4)}`;
    }
    const L = Math.hypot(x2 - x1, y2 - y1);
    if (L < 0.0001) return `L ${x2.toFixed(4)} ${y2.toFixed(4)}`;
    const f = n => n.toFixed(4);
    let segs;
    if (!isReverse) {
        segs = getCanonicalJigsawSegments(x1, y1, x2, y2, seam, W, H);
    } else {
        segs = getCanonicalJigsawSegments(x2, y2, x1, y1, seam, W, H);
    }
    let str = '';
    if (!isReverse) {
        for (let i = 0; i < segs.length; i++) {
            const seg = segs[i];
            if (seg.isLine) {
                str += ` L ${f(seg.end.x)} ${f(seg.end.y)}`;
            } else {
                str += ` C ${f(seg.cp1.x)} ${f(seg.cp1.y)}, ${f(seg.cp2.x)} ${f(seg.cp2.y)}, ${f(seg.end.x)} ${f(seg.end.y)}`;
            }
        }
    } else {
        for (let i = segs.length - 1; i >= 0; i--) {
            const seg = segs[i];
            if (seg.isLine) {
                str += ` L ${f(seg.start.x)} ${f(seg.start.y)}`;
            } else {
                str += ` C ${f(seg.cp2.x)} ${f(seg.cp2.y)}, ${f(seg.cp1.x)} ${f(seg.cp1.y)}, ${f(seg.start.x)} ${f(seg.start.y)}`;
            }
        }
    }
    return str;
}
