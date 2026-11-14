/* ============================================================
 * 复刻设计 · 模型库（/replicate/models）
 * ------------------------------------------------------------
 * 这一页解决的问题：用户手里通常只有自己的产品图，
 * 没有一张「照着做」的参考版式，于是「新建复刻」第一屏就卡住。
 *
 * 一屏之内给出全部可选版式：按复刻类型分类，卡片就是某一个模型的
 * 参考图 + 名称 + 一句话说明 + 价格。点任意一张，
 * 直接进工作区，**参考图已经上传好**，用户只需要传自己的素材图。
 *
 * 为什么分类用复刻的六个类型而不是「电商 / 社媒 / 印刷」这类用途：
 * 类型决定生图规则与比例，用途只是一句描述，前者才是真正要传给模型的参数。
 * ============================================================ */
import React, { useMemo, useEffect, useState } from 'react';
import { go, useHash } from '../ui';
import { useLang } from '../i18n';
import { Icon } from '../components/icons';
import { KINDS, kindName, type KindDef } from '../replicate/kinds';
import { MODELS, type ReplicateModel } from '../replicate/models';
import { imageCost } from '../cloud/models';
import '../models.css';

export default function ReplicateModels() {
  const { t, lang } = useLang();
  const hash = useHash();
  const [kind, setKind] = useState<string>(() => {
    const q = new URLSearchParams(hash.split('?')[1] || '').get('kind');
    return q && KINDS.some((k) => k.id === q) ? q : 'all';
  });

  /* 这一页唯一的去处是复刻工作区：空闲就把那块 chunk 取回来，
     点模型时不会再闪一整屏加载字标。 */
  useEffect(() => { void import('./replicate'); }, []);

  const list = useMemo(
    () => (kind === 'all' ? MODELS : MODELS.filter((m) => m.kind === kind)),
    [kind],
  );

  const use = (m: ReplicateModel) => go(`/replicate/new?model=${m.id}`);
  const price = imageCost('flash');

  const tabs: { id: string; label: string; n: number }[] = [
    { id: 'all', label: t('全部', 'All'), n: MODELS.length },
    ...KINDS.map((k: KindDef) => ({
      id: k.id,
      label: kindName(k, lang),
      n: MODELS.filter((m) => m.kind === k.id).length,
    })),
  ];

  return <div className="v4-page mdl-page">
    <div className="v4-page-head">
      <div>
        <div className="v4-kicker">RECREATE MODELS</div>
        <h1 className="v4-h1">{t('模型库', 'Model library')}</h1>
        <p className="v4-sub">{t(
          '挑一个模型，参考图已经帮你放好，上传自己的素材图就能出三张。',
          'Pick a model — the reference image is already in place, you just add your own product shots.',
        )}</p>
      </div>
      <div className="v4-tools">
        <button className="v4-btn-line" onClick={() => go('/replicate/new')}>{t('从零开始复刻', 'Start from scratch')}</button>
      </div>
    </div>

    <div className="mdl-note">
      <Icon name="spark" size={14} />
      <span>{t(
        `每个模型 = 一张参考版式 + 类型 + 尺寸 + 复刻度。一组 3 张按一次计费，${price} 积分起。`,
        `Each model bundles a reference layout, format, size and fidelity. Three images count as one run, from ${price} credits.`,
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
      <h3>{t('这个分类下还没有模型', 'No models in this format yet')}</h3>
      <p>{t('先换一个分类，或从零开始复刻。', 'Try another format, or start from scratch.')}</p>
      <button className="v4-btn-dark" onClick={() => go('/replicate/new')}>{t('从零开始', 'Start from scratch')}</button>
    </div>}

    <p className="mdl-credit">{t(
      '模板参考图来自 Pexels，遵循 Pexels 许可可免费商用；画面中不含任何第三方品牌标识。',
      'Reference images come from Pexels and are free for commercial use under the Pexels license. No third-party brand marks appear in them.',
    )}</p>
  </div>;
}
