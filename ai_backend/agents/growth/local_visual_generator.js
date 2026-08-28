'use strict';

/**
 * local_visual_generator.js — Deterministic LOCAL fallback image generator.
 *
 * Produces a decorative 9:16 background image with ZERO network calls and
 * ZERO external services. This is the guaranteed "local_fallback" layer of
 * the AI visual chain: even when every AI provider is down, rate-limited,
 * timing out or returning corrupt data, every video still gets a usable
 * poster/background image.
 *
 * How it works:
 * - A stable seed is derived from the content fingerprint
 *   (type + documentId + slug + category + title + date).
 * - The seed drives a seeded PRNG (mulberry32). Math.random() is NEVER used.
 * - The PRNG picks a category-inspired palette, one of several geometric
 *   compositions (gradients, panels, bands, waves, arcs, circles, dot grids,
 *   chevrons) and every position/size/density of the shapes.
 * - The result is rendered as an SVG string and converted to PNG with
 *   `sharp`, which is ALREADY a project dependency (og_image.js uses it).
 *   No new dependency was added.
 *
 * Determinism guarantees:
 * - Same content => same seed => same SVG => same PNG bytes on retry.
 * - Different content => different seed => normally a different composition,
 *   palette and layout, so consecutive videos do not look like clones.
 *
 * Safety:
 * - The image is decorative only: NO text, NO logos, NO seals, NO dates,
 *   NO fake document numbers, NO watermarks.
 * - sharp is lazily required; if it is unavailable the generator returns
 *   { success: false } and the visual chain falls through to the category
 *   fallback instead of crashing the video pipeline.
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const WIDTH = 720;
const HEIGHT = 1280;

// ---------------------------------------------------------------------------
// Deterministic PRNG (mulberry32). No Math.random anywhere in this module.
// ---------------------------------------------------------------------------
function mulberry32(seed) {
    let a = seed >>> 0;
    return function next() {
        a |= 0;
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ---------------------------------------------------------------------------
// Category-inspired palettes (dark enough to sit under the white poster text)
// ---------------------------------------------------------------------------
const PALETTES = {
    RESULT: [
        { id: 'result_royal', bg: ['#1a1a2e', '#16213e', '#0f3460'], accent: '#00d4ff', soft: '#e94560' },
        { id: 'result_emerald', bg: ['#0b3d2e', '#14532d', '#166534'], accent: '#86efac', soft: '#f59e0b' }
    ],
    ADMIT_CARD: [
        { id: 'admit_plum', bg: ['#2d132c', '#3d1c4a', '#4a1f5c'], accent: '#ffd700', soft: '#ff6b6b' },
        { id: 'admit_wine', bg: ['#3b0764', '#6b21a8', '#4c1d95'], accent: '#fde68a', soft: '#db2777' }
    ],
    ANSWER_KEY: [
        { id: 'key_blue', bg: ['#1e3c72', '#2a5298', '#1e3c72'], accent: '#ffa500', soft: '#ff8c00' },
        { id: 'key_slate', bg: ['#0f172a', '#1e3a8a', '#1d4ed8'], accent: '#fb923c', soft: '#c2410c' }
    ],
    SYLLABUS: [
        { id: 'syllabus_teal', bg: ['#134e5e', '#2a6b7c', '#134e5e'], accent: '#00ff88', soft: '#00cc6a' },
        { id: 'syllabus_pine', bg: ['#064e3b', '#0f766e', '#115e59'], accent: '#6ee7b7', soft: '#047857' }
    ],
    POLICE: [
        { id: 'police_steel', bg: ['#101418', '#1f2937', '#374151'], accent: '#60a5fa', soft: '#dc2626' },
        { id: 'police_dusk', bg: ['#1e1b4b', '#312e81', '#4338ca'], accent: '#93c5fd', soft: '#f59e0b' }
    ],
    RAILWAY: [
        { id: 'rail_indigo', bg: ['#0a192f', '#1a3a5c', '#1d4ed8'], accent: '#38bdf8', soft: '#f97316' },
        { id: 'rail_night', bg: ['#111827', '#1f2937', '#2563eb'], accent: '#7dd3fc', soft: '#eab308' }
    ],
    BANKING: [
        { id: 'bank_midnight', bg: ['#0f0c29', '#302b63', '#24243e'], accent: '#38bdf8', soft: '#22c55e' },
        { id: 'bank_teal', bg: ['#042f2e', '#115e59', '#0f766e'], accent: '#5eead4', soft: '#facc15' }
    ],
    SSC: [
        { id: 'ssc_ocean', bg: ['#0f2027', '#203a43', '#2c5364'], accent: '#4ade80', soft: '#fbbf24' },
        { id: 'ssc_slate', bg: ['#0f172a', '#1e293b', '#334155'], accent: '#22d3ee', soft: '#fb7185' }
    ],
    DEFENCE: [
        { id: 'defence_olive', bg: ['#1a2e05', '#3f4a1c', '#4d7c0f'], accent: '#bef264', soft: '#f97316' },
        { id: 'defence_gunmetal', bg: ['#18181b', '#3f3f46', '#52525b'], accent: '#a1a1aa', soft: '#dc2626' }
    ],
    TEACHING: [
        { id: 'teach_indigo', bg: ['#1e1b4b', '#312e81', '#4338ca'], accent: '#fbbf24', soft: '#38bdf8' },
        { id: 'teach_violet', bg: ['#2e1065', '#4c1d95', '#6d28d9'], accent: '#fde68a', soft: '#f472b6' }
    ],
    ENGINEERING: [
        { id: 'eng_graphite', bg: ['#1c1917', '#292524', '#44403c'], accent: '#fbbf24', soft: '#38bdf8' },
        { id: 'eng_blueprint', bg: ['#0c4a6e', '#075985', '#0284c7'], accent: '#7dd3fc', soft: '#f97316' }
    ],
    UPSC: [
        { id: 'upsc_maroon', bg: ['#2b0a0a', '#4a1515', '#6d1a1a'], accent: '#fca5a5', soft: '#facc15' },
        { id: 'upsc_charcoal', bg: ['#111827', '#1f2937', '#374151'], accent: '#fcd34d', soft: '#4ade80' }
    ],
    JOB: [
        { id: 'job_midnight', bg: ['#0f0c29', '#302b63', '#24243e'], accent: '#00d4ff', soft: '#ff006e' },
        { id: 'job_indigo', bg: ['#1e1b4b', '#3730a3', '#312e81'], accent: '#38bdf8', soft: '#db2777' }
    ],
    FAST_TRACK: [
        { id: 'fast_crimson', bg: ['#2b0a0a', '#5f0f0f', '#7f1d1d'], accent: '#fca5a5', soft: '#facc15' },
        { id: 'fast_orange', bg: ['#1c0a00', '#7c2d12', '#9a3412'], accent: '#fdba74', soft: '#fde047' }
    ],
    Default: [
        { id: 'generic_dark', bg: ['#0f0c29', '#302b63', '#24243e'], accent: '#00d4ff', soft: '#ff006e' },
        { id: 'generic_slate', bg: ['#0f172a', '#1e293b', '#334155'], accent: '#38bdf8', soft: '#fb7185' }
    ]
};

// ---------------------------------------------------------------------------
// Seed derivation — mirrors the visual fingerprint
// (type + documentId + slug + category + title + date)
// ---------------------------------------------------------------------------
function deriveSeed(content = {}, seedOverride) {
    if (Number.isFinite(Number(seedOverride))) {
        return Number(seedOverride) >>> 0;
    }
    const type = String(content?.type || content?.contentType || 'content').toLowerCase().trim();
    const documentId = String(content?.documentId || content?.contentId || content?.id || content?.jobId || '').trim();
    const slug = String(content?.slug || content?.slugId || content?.titleSlug || '').trim();
    const category = String(content?.category || 'Default').toLowerCase().trim();
    const title = String(content?.title || content?.name || content?.topic || '').trim();
    const publishDate = String(
        content?.publishDate || content?.publishedAt || content?.createdAt || content?.date || ''
    ).trim();
    const canonical = [type, documentId, slug, category, title, publishDate].join('::');
    const hash = crypto.createHash('sha256').update(canonical).digest('hex');
    return parseInt(hash.substring(0, 8), 16) >>> 0;
}

function normalizeCategoryKey(category) {
    const c = String(category || 'Default').trim().toUpperCase().replace(/[\s-]+/g, '_');
    if (c === 'FAST_TRACK' || c === 'FASTTRACK') return 'FAST_TRACK';
    if (c === 'JOB' || c === 'JOB_UPDATE' || c === 'JOB_UPDATES') return 'JOB';
    if (PALETTES[c]) return c;
    return 'Default';
}

// ---------------------------------------------------------------------------
// Small SVG helpers
// ---------------------------------------------------------------------------
function num(n) {
    return Math.round(n * 100) / 100;
}

function rgba(hex, alpha) {
    const h = String(hex || '#000000').replace('#', '');
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    const r = parseInt(full.substring(0, 2), 16);
    const g = parseInt(full.substring(2, 4), 16);
    const b = parseInt(full.substring(4, 6), 16);
    return `rgba(${r},${g},${b},${num(alpha)})`;
}

function circle(cx, cy, r, fill, extra = '') {
    return `<circle cx="${num(cx)}" cy="${num(cy)}" r="${num(r)}" fill="${fill}" ${extra}/>`;
}

function rect(x, y, w, h, fill, rx = 0, extra = '') {
    return `<rect x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}" rx="${num(rx)}" fill="${fill}" ${extra}/>`;
}

function linearGradientDef(id, stops, angleDeg) {
    // Angle in degrees: 0 = left→right, 90 = top→bottom.
    const rad = (angleDeg * Math.PI) / 180;
    const cx = 50;
    const cy = 50;
    const dx = Math.cos(rad);
    const dy = Math.sin(rad);
    const x1 = cx - 60 * dx;
    const y1 = cy - 60 * dy;
    const x2 = cx + 60 * dx;
    const y2 = cy + 60 * dy;
    const stopsSvg = stops
        .map(([offset, color]) => `<stop offset="${num(offset)}" stop-color="${color}"/>`)
        .join('');
    return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${num(x1)}%" y1="${num(y1)}%" x2="${num(x2)}%" y2="${num(y2)}%">${stopsSvg}</linearGradient>`;
}

function radialGradientDef(id, stops, cxPct, cyPct, rPct) {
    const stopsSvg = stops
        .map(([offset, color]) => `<stop offset="${num(offset)}" stop-color="${color}"/>`)
        .join('');
    return `<radialGradient id="${id}" cx="${num(cxPct)}%" cy="${num(cyPct)}%" r="${num(rPct)}%">${stopsSvg}</radialGradient>`;
}

function polygon(points, fill, extra = '') {
    const pts = points.map(([x, y]) => `${num(x)},${num(y)}`).join(' ');
    return `<polygon points="${pts}" fill="${fill}" ${extra}/>`;
}

function polyline(points, stroke, strokeWidth, extra = '') {
    const pts = points.map(([x, y]) => `${num(x)},${num(y)}`).join(' ');
    return `<polyline points="${pts}" fill="none" stroke="${stroke}" stroke-width="${num(strokeWidth)}" stroke-linecap="round" ${extra}/>`;
}

function wavePath(width, startY, amplitude, wavelength, phase, segments) {
    const points = [];
    for (let i = 0; i <= segments; i++) {
        const x = (width / segments) * i;
        const y = startY + Math.sin((x / wavelength) * Math.PI * 2 + phase) * amplitude;
        points.push([x, y]);
    }
    let d = `M ${num(points[0][0])} ${num(points[0][1])}`;
    for (let i = 1; i < points.length; i++) {
        d += ` L ${num(points[i][0])} ${num(points[i][1])}`;
    }
    return d;
}

// ---------------------------------------------------------------------------
// Compositions. Each is a pure function of (ctx) -> array of SVG element
// strings. All values come from the seeded PRNG, never from Math.random.
// ---------------------------------------------------------------------------
const COMPOSITIONS = [
    {
        key: 'diagonal_panels',
        draw: (ctx) => {
            const { w, h, rng, pal } = ctx;
            const parts = [];
            const count = 3 + Math.floor(rng() * 3); // 3-5 panels
            for (let i = 0; i < count; i++) {
                const y = h * (0.15 + rng() * 0.7);
                const tilt = w * (0.25 + rng() * 0.5);
                const color = rgba(i % 2 === 0 ? pal.accent : pal.soft, 0.04 + rng() * 0.08);
                parts.push(polygon(
                    [[-tilt, y], [w + tilt, y - h * 0.18], [w + tilt, y - h * 0.18 + h * 0.22], [-tilt, y + h * 0.16]],
                    color
                ));
            }
            const circles = 3 + Math.floor(rng() * 3);
            for (let i = 0; i < circles; i++) {
                const r = 24 + rng() * 90;
                const cx = r + rng() * (w - 2 * r);
                const cy = r + rng() * (h - 2 * r);
                parts.push(circle(cx, cy, r, rgba(pal.accent, 0.05 + rng() * 0.1)));
            }
            return parts;
        }
    },
    {
        key: 'radial_arcs',
        draw: (ctx) => {
            const { w, h, rng, pal } = ctx;
            const parts = [];
            const cx = w * (0.25 + rng() * 0.5);
            const cy = h * (0.2 + rng() * 0.6);
            const arcs = 4 + Math.floor(rng() * 3);
            for (let i = 0; i < arcs; i++) {
                const r = 80 + i * (70 + rng() * 60);
                const alpha = 0.16 - i * 0.02;
                parts.push(circle(cx, cy, r, 'none', `stroke="${rgba(pal.accent, Math.max(alpha, 0.03))}" stroke-width="${num(2 + rng() * 6)}" stroke-dasharray="${num(10 + rng() * 60)} ${num(10 + rng() * 40)}"`));
            }
            const dots = 8 + Math.floor(rng() * 8);
            for (let i = 0; i < dots; i++) {
                parts.push(circle(rng() * w, rng() * h, 3 + rng() * 9, rgba(pal.soft, 0.1 + rng() * 0.2)));
            }
            return parts;
        }
    },
    {
        key: 'horizon_bands',
        draw: (ctx) => {
            const { w, h, rng, pal } = ctx;
            const parts = [];
            const bands = 4 + Math.floor(rng() * 4); // 4-7
            let y = 0;
            for (let i = 0; i < bands; i++) {
                const bandH = h * (0.06 + rng() * 0.12);
                const color = i % 2 === 0 ? rgba(pal.accent, 0.05 + rng() * 0.07) : rgba(pal.soft, 0.05 + rng() * 0.07);
                parts.push(rect(0, y, w, bandH, color));
                y += bandH + h * (0.02 + rng() * 0.08);
            }
            const bubbles = 5 + Math.floor(rng() * 5);
            for (let i = 0; i < bubbles; i++) {
                const r = 10 + rng() * 40;
                parts.push(circle(r + rng() * (w - 2 * r), r + rng() * (h - 2 * r), r, rgba(pal.accent, 0.06 + rng() * 0.1)));
            }
            return parts;
        }
    },
    {
        key: 'panel_grid',
        draw: (ctx) => {
            const { w, h, rng, pal } = ctx;
            const parts = [];
            const cols = 2 + Math.floor(rng() * 2); // 2-3
            const rows = 4 + Math.floor(rng() * 3); // 4-6
            const gap = 18 + rng() * 14;
            const cellW = (w - gap * (cols + 1)) / cols;
            const cellH = (h - gap * (rows + 1)) / rows;
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const alpha = 0.03 + rng() * 0.09;
                    const color = (r + c) % 2 === 0 ? rgba(pal.accent, alpha) : rgba(pal.soft, alpha);
                    parts.push(rect(gap + c * (cellW + gap), gap + r * (cellH + gap), cellW, cellH, color, 18 + rng() * 22));
                }
            }
            // One diagonal accent line across the grid
            parts.push(polyline([[0, h * (0.2 + rng() * 0.6)], [w, h * (0.2 + rng() * 0.6)]], rgba(pal.accent, 0.25), 3 + rng() * 5));
            return parts;
        }
    },
    {
        key: 'waves',
        draw: (ctx) => {
            const { w, h, rng, pal } = ctx;
            const parts = [];
            const layers = 3 + Math.floor(rng() * 2); // 3-4
            const baseY = h * (0.25 + rng() * 0.4);
            for (let i = 0; i < layers; i++) {
                const startY = baseY + i * (60 + rng() * 50);
                const amplitude = 24 + rng() * 70;
                const wavelength = 120 + rng() * 220;
                const phase = rng() * Math.PI * 2;
                const d = wavePath(w, startY, amplitude, wavelength, phase, 24);
                const alpha = 0.28 - i * 0.06;
                parts.push(`<path d="${d} ${num(w)} ${num(h)} 0 ${num(h)} Z" fill="${rgba(i % 2 === 0 ? pal.accent : pal.soft, Math.max(alpha, 0.05))}"/>`);
            }
            return parts;
        }
    },
    {
        key: 'corner_glow',
        draw: (ctx) => {
            const { w, h, rng, pal } = ctx;
            const parts = [];
            const corner = Math.floor(rng() * 4); // 0 TL, 1 TR, 2 BL, 3 BR
            const ox = corner % 2 === 0 ? 0 : w;
            const oy = corner < 2 ? 0 : h;
            const lines = 5 + Math.floor(rng() * 4);
            for (let i = 0; i < lines; i++) {
                const tx = rng() * w;
                const ty = rng() * h;
                parts.push(polyline([[ox, oy], [tx, ty]], rgba(pal.accent, 0.08 + rng() * 0.16), 2 + rng() * 5));
            }
            const dots = 4 + Math.floor(rng() * 4);
            for (let i = 0; i < dots; i++) {
                parts.push(circle(rng() * w, rng() * h, 6 + rng() * 26, rgba(pal.soft, 0.08 + rng() * 0.14)));
            }
            return parts;
        }
    },
    {
        key: 'halftone',
        draw: (ctx) => {
            const { w, h, rng, pal } = ctx;
            const parts = [];
            const spacing = 26 + Math.floor(rng() * 18);
            const vertical = rng() > 0.5;
            const maxR = 5 + rng() * 6;
            for (let y = spacing / 2; y < h; y += spacing) {
                for (let x = spacing / 2; x < w; x += spacing) {
                    const t = vertical ? y / h : x / w;
                    const r = 0.8 + maxR * (0.25 + 0.75 * t);
                    const alpha = 0.05 + 0.18 * t;
                    parts.push(circle(x + (rng() - 0.5) * 6, y + (rng() - 0.5) * 6, r, rgba(t > 0.5 ? pal.accent : pal.soft, alpha)));
                }
            }
            return parts;
        }
    },
    {
        key: 'chevrons',
        draw: (ctx) => {
            const { w, h, rng, pal } = ctx;
            const parts = [];
            const stripes = 4 + Math.floor(rng() * 4); // 4-7
            const step = h / stripes;
            for (let i = 0; i < stripes; i++) {
                const y0 = i * step + rng() * (step * 0.3);
                const depth = step * (0.5 + rng() * 0.5);
                const color = i % 2 === 0 ? rgba(pal.accent, 0.05 + rng() * 0.06) : rgba(pal.soft, 0.05 + rng() * 0.06);
                parts.push(polygon(
                    [[0, y0], [w * 0.5, y0 + depth], [w, y0], [w, y0 + step * 0.4], [w * 0.5, y0 + depth + step * 0.4], [0, y0 + step * 0.4]],
                    color
                ));
            }
            return parts;
        }
    }
];

// ---------------------------------------------------------------------------
// Main builders
// ---------------------------------------------------------------------------
function buildLocalVisualSvg(content = {}, options = {}) {
    const seed = deriveSeed(content, options.seed);
    const category = normalizeCategoryKey(options.category || content?.category);
    const palettes = PALETTES[category] || PALETTES.Default;
    const palette = palettes[(seed >>> 3) % palettes.length];
    const rng = mulberry32(seed);
    const width = options.width || WIDTH;
    const height = options.height || HEIGHT;

    const compIndex = seed % COMPOSITIONS.length;
    const composition = COMPOSITIONS[compIndex];

    // Gradient direction varies per seed: 0=top→bottom, 45, 90, 135, 180, 225, 270, 315 + radial
    const useRadial = rng() > 0.75;
    const angle = Math.floor(rng() * 8) * 45;
    const defs = useRadial
        ? radialGradientDef('bg', [[0, palette.bg[0]], [0.55, palette.bg[1]], [1, palette.bg[2]]], 20 + rng() * 60, 10 + rng() * 60, 60 + rng() * 60)
        : linearGradientDef('bg', [[0, palette.bg[0]], [0.55, palette.bg[1]], [1, palette.bg[2]]], angle);

    const shapes = composition.draw({ w: width, h: height, rng, pal: palette }).join('');

    const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
        `<defs>${defs}</defs>` +
        `<rect width="${width}" height="${height}" fill="url(#bg)"/>` +
        shapes +
        `</svg>`;

    return {
        svg,
        seed,
        variant: compIndex,
        composition: composition.key,
        paletteId: palette.id,
        category,
        width,
        height
    };
}

/**
 * Generate a deterministic local fallback image file (PNG).
 *
 * @returns {Promise<object>} { success, path, ... } on success;
 *                            { success: false, error } when rendering fails.
 */
async function generateLocalVisual(content = {}, options = {}) {
    let sharp;
    try {
        sharp = require('sharp');
    } catch (err) {
        return {
            success: false,
            error: `sharp unavailable: ${err?.message || err}`
        };
    }

    let built;
    try {
        built = buildLocalVisualSvg(content, options);
    } catch (err) {
        return { success: false, error: `svg build failed: ${err?.message || err}` };
    }

    const outputPath = options.outputPath
        || path.join(os.tmpdir(), `local-visual-${built.seed}-${built.variant}.png`);

    try {
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        const png = await sharp(Buffer.from(built.svg), { density: 72 }).png().toBuffer();
        fs.writeFileSync(outputPath, png);
        const stat = fs.statSync(outputPath);
        return {
            success: true,
            path: outputPath,
            format: 'png',
            width: built.width,
            height: built.height,
            size: stat.size,
            seed: built.seed,
            variant: built.variant,
            composition: built.composition,
            paletteId: built.paletteId,
            category: built.category
        };
    } catch (err) {
        if (fs.existsSync(outputPath)) {
            try { fs.unlinkSync(outputPath); } catch { /* ignore */ }
        }
        return {
            success: false,
            error: `png render failed: ${err?.message || err}`
        };
    }
}

module.exports = {
    WIDTH,
    HEIGHT,
    PALETTES,
    COMPOSITIONS,
    mulberry32,
    deriveSeed,
    normalizeCategoryKey,
    buildLocalVisualSvg,
    generateLocalVisual
};
