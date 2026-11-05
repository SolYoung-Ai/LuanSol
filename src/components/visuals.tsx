import React, { useMemo, useRef } from 'react';
import type { DesignDoc, Dieline, Face, Layer, Palette, Sheet } from '../types';
import { faceMarkup } from '../engine/design';
import { escapeXml, round, svgToDataUrl } from '../engine/utils';

/* ---------- 单面设计稿渲染（可点选 / 拖拽） ---------- */
export function DesignView({
  face, selectedId, onSelect, onMove, interactive = false, roundClip = false, className = '', showSafe = false, safe = 5,
}: {
  face: Face; selectedId?: string | null; onSelect?: (id: string | null) => void;
  onMove?: (id: string, x: number, y: number) => void; interactive?: boolean; roundClip?: boolean;
  className?: string; showSafe?: boolean; safe?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number } | null>(null);
  const markup = useMemo(() => faceMarkup(face, roundClip), [face, roundClip]);
  const mmPerPx = () => face.w / (ref.current?.getBoundingClientRect().width || 1);
  return (
    <div ref={ref} className={`design-view ${className}`} style={{ aspectRatio: `${face.w} / ${face.h}` }}>
      <svg viewBox={`0 0 ${face.w} ${face.h}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet" dangerouslySetInnerHTML={{ __html: markup }} />
      {showSafe && <svg className="design-overlay" viewBox={`0 0 ${face.w} ${face.h}`} preserveAspectRatio="xMidYMid meet">
        <rect x={safe} y={safe} width={Math.max(0, face.w - safe * 2)} height={Math.max(0, face.h - safe * 2)} fill="none" stroke="#e05252" strokeWidth={0.4} strokeDasharray="2 1.5" opacity={0.5} />
      </svg>}
      {interactive && <svg className="design-overlay" viewBox={`0 0 ${face.w} ${face.h}`} preserveAspectRatio="xMidYMid meet"
        onClick={(e) => { if (e.target === e.currentTarget) onSelect?.(null); }}>
        {face.layers.filter((l) => !l.hidden).map((l: Layer) => (
          <rect key={l.id} x={l.x} y={l.y} width={l.w} height={l.h}
            fill="transparent" stroke={selectedId === l.id ? '#2b7fc3' : 'transparent'} strokeWidth={0.7}
            style={{ cursor: l.locked ? 'not-allowed' : 'move', pointerEvents: 'all' }}
            onClick={(e) => { e.stopPropagation(); onSelect?.(l.id); }}
            onPointerDown={(e) => {
              if (l.locked || !onMove) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              drag.current = { id: l.id, sx: e.clientX, sy: e.clientY, ox: l.x, oy: l.y };
            }}
            onPointerMove={(e) => {
              if (!drag.current || drag.current.id !== l.id || !onMove) return;
              const k = mmPerPx();
              onMove(l.id, round(drag.current.ox + (e.clientX - drag.current.sx) * k, 1), round(drag.current.oy + (e.clientY - drag.current.sy) * k, 1));
            }}
            onPointerUp={() => { drag.current = null; }}
          />
        ))}
      </svg>}
    </div>
  );
}

/* ---------- 刀模展开图 ---------- */
export function DielineView({ sheet, dieline, design, showArtwork = true, className = '' }:
{ sheet: Sheet; dieline: Dieline; design?: DesignDoc | null; showArtwork?: boolean; className?: string }) {
  const parts: string[] = [];
  if (showArtwork && design) {
    for (const p of sheet.rects.filter((r) => r.face && r.artwork)) {
      const f = design.faces[p.face!];
      if (!f) continue;
      parts.push(`<rect x="${round(p.x - dieline.bleed, 2)}" y="${round(p.y - dieline.bleed, 2)}" width="${round(p.w + dieline.bleed * 2, 2)}" height="${round(p.h + dieline.bleed * 2, 2)}" fill="${f.bg}"/>`);
      parts.push(`<svg x="${round(p.x, 2)}" y="${round(p.y, 2)}" width="${round(p.w, 2)}" height="${round(p.h, 2)}" viewBox="0 0 ${f.w} ${f.h}">${faceMarkup(f, dieline.structure === 'labelRound')}</svg>`);
    }
  }
  for (const s of sheet.segments) {
    const st = s.kind === 'cut' ? 'stroke="#151515" stroke-width="0.4"'
      : s.kind === 'crease' ? 'stroke="#d05555" stroke-width="0.28" stroke-dasharray="2.4 1.6"'
        : s.kind === 'bleed' ? 'stroke="#2b7fc3" stroke-width="0.22" stroke-dasharray="1.2 1.2"'
          : 'stroke="#a3a3a3" stroke-width="0.18" stroke-dasharray="0.8 1.4"';
    parts.push(`<line x1="${round(s.x1, 2)}" y1="${round(s.y1, 2)}" x2="${round(s.x2, 2)}" y2="${round(s.y2, 2)}" ${st}/>`);
  }
  for (const c of sheet.circles) parts.push(`<circle cx="${round(c.cx, 2)}" cy="${round(c.cy, 2)}" r="${round(c.r, 2)}" fill="none" stroke="${c.kind === 'cut' ? '#151515' : '#2b7fc3'}" stroke-width="0.4" stroke-dasharray="${c.kind === 'cut' ? '' : '1.2 1.2'}"/>`);
  return <div className={className} style={{ aspectRatio: `${sheet.width} / ${sheet.height}` }}>
    <svg viewBox={`0 0 ${sheet.width} ${sheet.height}`} width="100%" height="100%" dangerouslySetInnerHTML={{ __html: parts.join('') }} />
  </div>;
}

/* ---------- 原创程序化产品样机（首页 / 灵感库视觉，不复制任何第三方品牌） ---------- */
export type MockupKind = 'box' | 'pouch' | 'bottle' | 'label' | 'tube' | 'gift';
export function ProductMockup({ kind, palette, brand, sub, className = '' }:
{ kind: MockupKind; palette: Palette; brand: string; sub?: string; className?: string }) {
  const id = useMemo(() => `m${Math.random().toString(36).slice(2, 8)}`, []);
  const { bg, primary, accent, ink } = palette;
  const text = escapeXml(brand.slice(0, 12));
  const caption = escapeXml((sub || '').slice(0, 16));
  let body = '';
  if (kind === 'box' || kind === 'gift') {
    const x = 92, y = 158, w = 216, h = 212, d = 58;
    body = `
      <polygon points="${x},${y} ${x + d},${y - d * 0.58} ${x + w + d},${y - d * 0.58} ${x + w},${y}" fill="${accent}" opacity="0.82"/>
      <polygon points="${x + w},${y} ${x + w + d},${y - d * 0.58} ${x + w + d},${y + h - d * 0.58} ${x + w},${y + h}" fill="${primary}" opacity="0.72"/>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${bg}"/>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#gloss${id})" opacity="0.35"/>
      <rect x="${x + 22}" y="${y + 30}" width="${w - 44}" height="1" fill="${primary}" opacity="0.55"/>
      <text x="${x + w / 2}" y="${y + 96}" text-anchor="middle" font-family="'Songti SC',serif" font-size="30" letter-spacing="3" fill="${ink}">${text}</text>
      <text x="${x + w / 2}" y="${y + 126}" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="9" letter-spacing="4" fill="${ink}" opacity="0.65">${caption.toUpperCase()}</text>
      <circle cx="${x + w / 2}" cy="${y + 164}" r="14" fill="none" stroke="${primary}" stroke-width="1" opacity="0.7"/>
      <circle cx="${x + w / 2}" cy="${y + 164}" r="4" fill="${primary}" opacity="0.7"/>
      ${kind === 'gift' ? `<rect x="${x}" y="${y + 100}" width="${w}" height="16" fill="${primary}" opacity="0.85"/><rect x="${x + w / 2 - 8}" y="${y}" width="16" height="${h}" fill="${primary}" opacity="0.85"/>` : ''}
      <polygon points="${x},${y} ${x + d},${y - d * 0.58} ${x + w + d},${y - d * 0.58} ${x + w},${y}" fill="none" stroke="#00000012"/>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#00000012"/>`;
  } else if (kind === 'pouch') {
    body = `
      <path d="M112 132 L288 132 L296 400 Q200 424 104 400 Z" fill="${bg}" stroke="${primary}" stroke-opacity="0.18"/>
      <path d="M112 132 L288 132 L288 152 L112 152 Z" fill="${accent}" opacity="0.55"/>
      <path d="M104 400 Q200 424 296 400 L292 412 Q200 436 108 412 Z" fill="${primary}" opacity="0.5"/>
      <path d="M112 152 Q200 166 288 152" fill="none" stroke="${primary}" stroke-opacity="0.25"/>
      <text x="200" y="248" text-anchor="middle" font-family="'Songti SC',serif" font-size="28" letter-spacing="3" fill="${ink}">${text}</text>
      <text x="200" y="276" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="9" letter-spacing="3.5" fill="${ink}" opacity="0.65">${caption.toUpperCase()}</text>
      <circle cx="200" cy="322" r="24" fill="${accent}" opacity="0.55"/>
      <path d="M178 330 Q200 300 222 330" fill="none" stroke="${primary}" stroke-width="1.4" opacity="0.65"/>`;
  } else if (kind === 'bottle' || kind === 'tube') {
    const tall = kind === 'tube';
    body = `
      ${tall ? '' : `<rect x="182" y="96" width="36" height="46" rx="4" fill="${primary}"/><rect x="178" y="88" width="44" height="14" rx="3" fill="${ink}" opacity="0.85"/>`}
      <rect x="${tall ? 148 : 154}" y="${tall ? 126 : 140}" width="${tall ? 104 : 92}" height="${tall ? 262 : 250}" rx="${tall ? 10 : 16}" fill="${bg}" stroke="${primary}" stroke-opacity="0.2"/>
      <rect x="${tall ? 148 : 154}" y="${tall ? 126 : 140}" width="18" height="${tall ? 262 : 250}" fill="#ffffff" opacity="0.22"/>
      <rect x="${tall ? 160 : 166}" y="${tall ? 190 : 206}" width="${tall ? 80 : 68}" height="${tall ? 150 : 140}" fill="${accent}" opacity="0.35"/>
      <text x="200" y="${tall ? 262 : 268}" text-anchor="middle" font-family="'Songti SC',serif" font-size="20" letter-spacing="2" fill="${ink}">${text}</text>
      <text x="200" y="${tall ? 286 : 292}" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="7.5" letter-spacing="2" fill="${ink}" opacity="0.7">${caption.toUpperCase()}</text>
      <line x1="${tall ? 172 : 180}" y1="${tall ? 302 : 308}" x2="${tall ? 228 : 220}" y2="${tall ? 302 : 308}" stroke="${primary}" stroke-width="0.8" opacity="0.6"/>`;
  } else {
    body = `
      <g transform="rotate(-8 200 250)">
        <rect x="108" y="166" width="184" height="176" rx="8" fill="${bg}" stroke="${primary}" stroke-opacity="0.2"/>
        <rect x="108" y="166" width="184" height="26" fill="${primary}" opacity="0.85"/>
        <text x="200" y="258" text-anchor="middle" font-family="'Songti SC',serif" font-size="24" letter-spacing="2" fill="${ink}">${text}</text>
        <text x="200" y="284" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="8" letter-spacing="2.5" fill="${ink}" opacity="0.65">${caption.toUpperCase()}</text>
        <circle cx="200" cy="312" r="12" fill="none" stroke="${primary}" opacity="0.6"/>
      </g>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="480" viewBox="0 0 400 480">
  <defs>
    <radialGradient id="sh${id}" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#000" stop-opacity="0.22"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
    <linearGradient id="gloss${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.6"/><stop offset="0.5" stop-color="#ffffff" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity="0.06"/></linearGradient>
    <linearGradient id="wall${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#faf9f6"/><stop offset="1" stop-color="#ece9e2"/></linearGradient>
  </defs>
  <rect width="400" height="480" fill="url(#wall${id})"/>
  <ellipse cx="205" cy="410" rx="150" ry="30" fill="url(#sh${id})"/>
  ${body}
  </svg>`;
  return <div className={`mockup ${className}`}><img src={svgToDataUrl(svg)} alt={`${brand} 包装样机`} loading="lazy" /></div>;
}
