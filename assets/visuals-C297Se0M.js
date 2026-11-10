import{r as w,j as n}from"./vendor-react-EfbF1ROp.js";import{r as m,t as s,v as u,p as k}from"./index-Cm3j3kKH.js";function R({face:t,selectedId:$,onSelect:x,onMove:f,interactive:p=!1,roundClip:l=!1,className:e="",showSafe:o=!1,safe:y=5}){const a=w.useRef(null),c=w.useRef(null),d=w.useMemo(()=>m(t,l),[t,l]),h=()=>t.w/(a.current?.getBoundingClientRect().width||1);return n.jsxs("div",{ref:a,className:`design-view ${e}`,style:{aspectRatio:`${t.w} / ${t.h}`},children:[n.jsx("svg",{viewBox:`0 0 ${t.w} ${t.h}`,width:"100%",height:"100%",preserveAspectRatio:"xMidYMid meet",dangerouslySetInnerHTML:{__html:d}}),o&&n.jsx("svg",{className:"design-overlay",viewBox:`0 0 ${t.w} ${t.h}`,preserveAspectRatio:"xMidYMid meet",children:n.jsx("rect",{x:y,y,width:Math.max(0,t.w-y*2),height:Math.max(0,t.h-y*2),fill:"none",stroke:"#e05252",strokeWidth:.4,strokeDasharray:"2 1.5",opacity:.5})}),p&&n.jsx("svg",{className:"design-overlay",viewBox:`0 0 ${t.w} ${t.h}`,preserveAspectRatio:"xMidYMid meet",onClick:r=>{r.target===r.currentTarget&&x?.(null)},children:t.layers.filter(r=>!r.hidden).map(r=>n.jsx("rect",{x:r.x,y:r.y,width:r.w,height:r.h,fill:"transparent",stroke:$===r.id?"#2b7fc3":"transparent",strokeWidth:.7,style:{cursor:r.locked?"not-allowed":"move",pointerEvents:"all"},onClick:i=>{i.stopPropagation(),x?.(r.id)},onPointerDown:i=>{r.locked||!f||(i.currentTarget.setPointerCapture(i.pointerId),c.current={id:r.id,sx:i.clientX,sy:i.clientY,ox:r.x,oy:r.y})},onPointerMove:i=>{if(!c.current||c.current.id!==r.id||!f)return;const g=h();f(r.id,s(c.current.ox+(i.clientX-c.current.sx)*g,1),s(c.current.oy+(i.clientY-c.current.sy)*g,1))},onPointerUp:()=>{c.current=null}},r.id))})]})}function S({sheet:t,dieline:$,design:x,showArtwork:f=!0,className:p=""}){const l=[];if(f&&x)for(const e of t.rects.filter(o=>o.face&&o.artwork)){const o=x.faces[e.face];o&&(l.push(`<rect x="${s(e.x-$.bleed,2)}" y="${s(e.y-$.bleed,2)}" width="${s(e.w+$.bleed*2,2)}" height="${s(e.h+$.bleed*2,2)}" fill="${o.bg}"/>`),l.push(`<svg x="${s(e.x,2)}" y="${s(e.y,2)}" width="${s(e.w,2)}" height="${s(e.h,2)}" viewBox="0 0 ${o.w} ${o.h}">${m(o,$.structure==="labelRound")}</svg>`))}for(const e of t.segments){const o=e.kind==="cut"?'stroke="#151515" stroke-width="0.4"':e.kind==="crease"?'stroke="#d05555" stroke-width="0.28" stroke-dasharray="2.4 1.6"':e.kind==="bleed"?'stroke="#2b7fc3" stroke-width="0.22" stroke-dasharray="1.2 1.2"':'stroke="#a3a3a3" stroke-width="0.18" stroke-dasharray="0.8 1.4"';l.push(`<line x1="${s(e.x1,2)}" y1="${s(e.y1,2)}" x2="${s(e.x2,2)}" y2="${s(e.y2,2)}" ${o}/>`)}for(const e of t.circles)l.push(`<circle cx="${s(e.cx,2)}" cy="${s(e.cy,2)}" r="${s(e.r,2)}" fill="none" stroke="${e.kind==="cut"?"#151515":"#2b7fc3"}" stroke-width="0.4" stroke-dasharray="${e.kind==="cut"?"":"1.2 1.2"}"/>`);return n.jsx("div",{className:p,style:{aspectRatio:`${t.width} / ${t.height}`},children:n.jsx("svg",{viewBox:`0 0 ${t.width} ${t.height}`,width:"100%",height:"100%",dangerouslySetInnerHTML:{__html:l.join("")}})})}function z({kind:t,palette:$,brand:x,sub:f,className:p=""}){const l=w.useMemo(()=>`m${Math.random().toString(36).slice(2,8)}`,[]),{bg:e,primary:o,accent:y,ink:a}=$,c=u(x.slice(0,12)),d=u((f||"").slice(0,16));let h="";if(t==="box"||t==="gift")h=`
      <polygon points="92,158 150,${158-58*.58} 366,${158-58*.58} 308,158" fill="${y}" opacity="0.82"/>
      <polygon points="308,158 366,${158-58*.58} 366,${370-58*.58} 308,370" fill="${o}" opacity="0.72"/>
      <rect x="92" y="158" width="216" height="212" fill="${e}"/>
      <rect x="92" y="158" width="216" height="212" fill="url(#gloss${l})" opacity="0.35"/>
      <rect x="114" y="188" width="172" height="1" fill="${o}" opacity="0.55"/>
      <text x="${92+216/2}" y="254" text-anchor="middle" font-family="'Songti SC',serif" font-size="30" letter-spacing="3" fill="${a}">${c}</text>
      <text x="${92+216/2}" y="284" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="9" letter-spacing="4" fill="${a}" opacity="0.65">${d.toUpperCase()}</text>
      <circle cx="${92+216/2}" cy="322" r="14" fill="none" stroke="${o}" stroke-width="1" opacity="0.7"/>
      <circle cx="${92+216/2}" cy="322" r="4" fill="${o}" opacity="0.7"/>
      ${t==="gift"?`<rect x="92" y="258" width="216" height="16" fill="${o}" opacity="0.85"/><rect x="${92+216/2-8}" y="158" width="16" height="212" fill="${o}" opacity="0.85"/>`:""}
      <polygon points="92,158 150,${158-58*.58} 366,${158-58*.58} 308,158" fill="none" stroke="#00000012"/>
      <rect x="92" y="158" width="216" height="212" fill="none" stroke="#00000012"/>`;else if(t==="pouch")h=`
      <path d="M112 132 L288 132 L296 400 Q200 424 104 400 Z" fill="${e}" stroke="${o}" stroke-opacity="0.18"/>
      <path d="M112 132 L288 132 L288 152 L112 152 Z" fill="${y}" opacity="0.55"/>
      <path d="M104 400 Q200 424 296 400 L292 412 Q200 436 108 412 Z" fill="${o}" opacity="0.5"/>
      <path d="M112 152 Q200 166 288 152" fill="none" stroke="${o}" stroke-opacity="0.25"/>
      <text x="200" y="248" text-anchor="middle" font-family="'Songti SC',serif" font-size="28" letter-spacing="3" fill="${a}">${c}</text>
      <text x="200" y="276" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="9" letter-spacing="3.5" fill="${a}" opacity="0.65">${d.toUpperCase()}</text>
      <circle cx="200" cy="322" r="24" fill="${y}" opacity="0.55"/>
      <path d="M178 330 Q200 300 222 330" fill="none" stroke="${o}" stroke-width="1.4" opacity="0.65"/>`;else if(t==="bottle"||t==="tube"){const i=t==="tube";h=`
      ${i?"":`<rect x="182" y="96" width="36" height="46" rx="4" fill="${o}"/><rect x="178" y="88" width="44" height="14" rx="3" fill="${a}" opacity="0.85"/>`}
      <rect x="${i?148:154}" y="${i?126:140}" width="${i?104:92}" height="${i?262:250}" rx="${i?10:16}" fill="${e}" stroke="${o}" stroke-opacity="0.2"/>
      <rect x="${i?148:154}" y="${i?126:140}" width="18" height="${i?262:250}" fill="#ffffff" opacity="0.22"/>
      <rect x="${i?160:166}" y="${i?190:206}" width="${i?80:68}" height="${i?150:140}" fill="${y}" opacity="0.35"/>
      <text x="200" y="${i?262:268}" text-anchor="middle" font-family="'Songti SC',serif" font-size="20" letter-spacing="2" fill="${a}">${c}</text>
      <text x="200" y="${i?286:292}" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="7.5" letter-spacing="2" fill="${a}" opacity="0.7">${d.toUpperCase()}</text>
      <line x1="${i?172:180}" y1="${i?302:308}" x2="${i?228:220}" y2="${i?302:308}" stroke="${o}" stroke-width="0.8" opacity="0.6"/>`}else h=`
      <g transform="rotate(-8 200 250)">
        <rect x="108" y="166" width="184" height="176" rx="8" fill="${e}" stroke="${o}" stroke-opacity="0.2"/>
        <rect x="108" y="166" width="184" height="26" fill="${o}" opacity="0.85"/>
        <text x="200" y="258" text-anchor="middle" font-family="'Songti SC',serif" font-size="24" letter-spacing="2" fill="${a}">${c}</text>
        <text x="200" y="284" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="8" letter-spacing="2.5" fill="${a}" opacity="0.65">${d.toUpperCase()}</text>
        <circle cx="200" cy="312" r="12" fill="none" stroke="${o}" opacity="0.6"/>
      </g>`;const r=`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="480" viewBox="0 0 400 480">
  <defs>
    <radialGradient id="sh${l}" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#000" stop-opacity="0.22"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
    <linearGradient id="gloss${l}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.6"/><stop offset="0.5" stop-color="#ffffff" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity="0.06"/></linearGradient>
    <linearGradient id="wall${l}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#faf9f6"/><stop offset="1" stop-color="#ece9e2"/></linearGradient>
  </defs>
  <rect width="400" height="480" fill="url(#wall${l})"/>
  <ellipse cx="205" cy="410" rx="150" ry="30" fill="url(#sh${l})"/>
  ${h}
  </svg>`;return n.jsx("div",{className:`mockup ${p}`,children:n.jsx("img",{src:k(r),alt:`${x} 包装样机`,loading:"lazy"})})}export{R as D,z as P,S as a};
