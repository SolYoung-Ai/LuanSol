/* ============================================================
 * 草稿卡右下角的「⋯」菜单
 * ------------------------------------------------------------
 * 为什么把动作收起来：包装设计的卡片上原本平铺 6 条文字按钮
 * （继续编辑 / 查看方案 / 3D 预览 / 导出 / 复制 / 重命名 / 删除），
 * 一行读下来像文档目录，卡片本身反而看不见。
 * 现在卡片只用图片 + 三行信息说话，次要动作放进这里。
 *
 * 交互细节：
 *   · 点按钮开/关，点空白处或 Esc 关；
 *   · 菜单向上弹出（卡片通常在视口下半部分，向下会被页脚挡住）；
 *   · 每个菜单项点完立即关闭，不做二次确认——删除的确认在页面层做。
 * ============================================================ */
import React, { useEffect, useRef, useState } from 'react';

export interface WorkMenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
}

export default function WorkMenu({ items, label }: { items: WorkMenuItem[]; label: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  if (!items.length) return null;

  return <div className="v4-work-more-wrap" ref={box}>
    <button
      className={`v4-work-more ${open ? 'on' : ''}`}
      onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
      aria-haspopup="menu" aria-expanded={open} aria-label={label} title={label}
    >
      {/* 三点用 SVG 画，不用「…」字符：字符在 12px 下会掉到基线以下 */}
      <svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor" aria-hidden>
        <circle cx="3.2" cy="8" r="1.35" /><circle cx="8" cy="8" r="1.35" /><circle cx="12.8" cy="8" r="1.35" />
      </svg>
    </button>
    {open && <div className="v4-work-menu" role="menu">
      {items.map((it) => <button
        key={it.label}
        role="menuitem"
        className={it.danger ? 'danger' : undefined}
        onClick={(e) => { e.stopPropagation(); setOpen(false); it.onClick(); }}
      >{it.label}</button>)}
    </div>}
  </div>;
}
