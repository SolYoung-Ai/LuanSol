/* ============================================================
 * 复刻设计 · 模版库（/replicate/templates）
 * ------------------------------------------------------------
 * 这一页解决的问题：用户手里通常只有自己的产品图，
 * 没有一张「照着做」的参考版式，于是「新建复刻」第一屏就卡住。
 *
 * 一屏之内给出全部可选版式：按复刻类型分类，卡片就是某一个模版的
 * 参考图 + 名称 + 一句话说明 + 价格。点任意一张，
 * 直接进工作区，**参考图已经上传好**，用户只需要传自己的素材图。
 *
 * 为什么分类用复刻的六个类型而不是「电商 / 社媒 / 印刷」这类用途：
 * 类型决定生图规则与比例，用途只是一句描述，前者才是真正要传给模型的参数。
 *
 * 2026-11-14：正式素材还没到，TEMPLATES 已清空。
 * 空的时候不摆空分类、不摆空卡片，直接给一个说得清的空状态 +
 * 「从零开始」的出口，别让人对着一片空白猜。
 * ============================================================ */
import React, { useMemo, useEffect, useState } from 'react';
import { go, useHash } from '../ui';
import { useLang } from '../i18n';
import { Icon } from '../components/icons';
import { KINDS, kindName } from '../replicate/kinds';
import { TEMPLATES, type ReplicateTemplate } from '../replicate/templates';
import { imageCost } from '../cloud/models';
import '../templates.css';

export default function ReplicateTemplates() {
  const { t, lang } = useLang();
  const hash = useHash();
  const [kind, setKind] = useState<string>(() => {
    const q = new URLSearchParams(hash.split('?')[1] || '').get('kind');
    return q && KINDS.some((k) => k.id === q) ? q : 'all';
  });

  /* 这一页唯一的去处是复刻工作区：空闲就把那块 chunk 取回来，
     点模版时不会再闪一整屏加载字标。 */
  useEffect(() => { void import('./replicate'); }, []);

  const list = useMemo(
    () => (kind === 'all' ? TEMPLATES : TEMPLATES.filter((m) => m.kind === kind)),
    [kind],
  );

  const use = (m: ReplicateTemplate) => go(`/replicate/new?tpl=${m.id}`);
  const price = imageCost('flash');
  const empty = TEMPLATES.length === 0;

  const tabs: { id: string; label: string; n: number }[] = [
    { id: 'all', label: t('全部', 'All'), n: TEMPLATES.length },
    ...KINDS.map((k) => ({
      id: k.id,
      label: kindName(k, lang),
      n: TEMPLATES.filter((m) => m.kind === k.id).length,
    })),
  ];

  return <div className="v4-page mdl-page">
    <div className="v4-page-head">
      <div>
        <div className="v4-kicker">RECREATE TEMPLATES</div>
        <h1 className="v4-h1">{t('模版库', 'Template library')}</h1>
        <p className="v4-sub">{t(
          '挑一个模版，参考图已经帮你放好，上传自己的素材图就能出三张。',
          'Pick a template — the reference image is already in place, you just add your own product shots.',
        )}</p>
      </div>
      <div className="v4-tools">
        <button className="v4-btn-line" onClick={() => go('/replicate/new')}>{t('从零开始复刻', 'Start from scratch')}</button>
      </div>
    </div>

    {!empty && <>
      <div className="mdl-note">
        <Icon name="spark" size={14} />
        <span>{t(
          `每个模版 = 一张参考版式 + 类型 + 尺寸 + 复刻度。一组 3 张按一次计费，${price} 积分起。`,
          `Each template bundles a reference layout, format, size and fidelity. Three images count as one run, from ${price} credits.`,
        )}</span>
      </div>

      <div className="mdl-tabs" role="tablist" aria-label={t('按类型筛选', 'Filter by format')}>
        {tabs.map((x) => <button
          key={x.id}
          role="tab"
          aria-selected={kind === x.id}
          className={`mdl-tab ${kind === x.id ? 'on' : ''}`}
          onClick={() => setKind(x.id)}
        >
          {x.label}
          <em>{x.n}</em>
        </button>)}
      </div>

      <div className="mdl-grid">
        {list.map((m) => {
          const k = KINDS.find((x) => x.id === m.kind);
          return <button className="mdl-card" key={m.id} onClick={() => use(m)}
            title={t(`用「${m.name.zh}」开始`, `Start with ${m.name.en}`)}>
            <span className="mdl-shot" style={{ background: m.tone }}>
              <img src={m.img} alt={lang === 'en' ? m.name.en : m.name.zh} loading="lazy" decoding="async" />
              <span className="mdl-ratio">{m.ratio}</span>
              <span className="mdl-use">
                <Icon name="chevronRight" size={14} />{t('用它开始', 'Use this')}
              </span>
            </span>
            <span className="mdl-body">
              <b>{lang === 'en' ? m.name.en : m.name.zh}</b>
              <em>{lang === 'en' ? m.desc.en : m.desc.zh}</em>
              <span className="mdl-foot">
                <span className="mdl-pill">{k ? kindName(k, lang) : ''}</span>
                <span className="mdl-price">{price} {t('积分', 'credits')}</span>
              </span>
            </span>
          </button>;
        })}
      </div>

      {list.length === 0 && <div className="v4-empty">
        <h3>{t('这个分类下还没有模版', 'No templates in this format yet')}</h3>
        <p>{t('换一个分类，或从零开始复刻。', 'Try another format, or start from scratch.')}</p>
        <button className="v4-btn-dark" onClick={() => go('/replicate/new')}>{t('从零开始', 'Start from scratch')}</button>
      </div>}
    </>}

    {empty && <div className="mdl-empty">
      <div className="mdl-empty-mark" aria-hidden>
        <svg viewBox="0 0 32 32" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.2">
          <rect x="5" y="6" width="22" height="20" rx="3" />
          <path d="M5 12h22M11 6v6" />
        </svg>
      </div>
      <h3>{t('模版还在整理中', 'Templates are being prepared')}</h3>
      <p>{t(
        '精选模版会按主图 / 详情页 / 海报 / 视频封面 / 包装 / 周边分类上架，每个都带好参考图，点一下就能用。',
        'Curated templates will go live by format — main image, detail page, poster, video cover, packaging, merch — each with its reference image ready to go.',
      )}</p>
      <p className="mdl-empty-sub">{t(
        '现在可以先从零开始：上传一张参考图 + 你自己的素材图，同样是一次出三张。',
        'For now, start from scratch: add one reference and your own assets, and you still get three takes.',
      )}</p>
      <div className="mdl-empty-actions">
        <button className="v4-btn-dark" onClick={() => go('/replicate/new')}>{t('从零开始复刻', 'Start from scratch')}</button>
        <button className="v4-btn-line" onClick={() => go('/replicate')}>{t('看我的记录', 'Go to Records')}</button>
      </div>
    </div>}
  </div>;
}
