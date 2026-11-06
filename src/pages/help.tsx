/* ============================================================
 * 帮助与反馈
 * ------------------------------------------------------------
 * 只回答用户在使用中最常问的 6 件事，再给反馈入口。
 * 不堆文档链接、不写客服电话（没有真人客服）。
 * ============================================================ */
import React from 'react';
import { Card, PageHead, SectionLabel } from '../ui';

const FAQS: { q: string; a: string }[] = [
  { q: '为什么必须登录才能开始设计？', a: '设计过程会保存项目、记录 AI 额度、同步云端，这些都需要账号归属。注册免费，新用户自动获得 2 次 AI 体验。' },
  { q: 'AI 额度用完了怎么办？', a: '免费体验 2 次用完后，可以订阅会员（¥399/月，600 次 AI 调用）。开通通道尚未上线，当前不扣费。' },
  { q: '我做的设计存在哪里？', a: '本机浏览器自动保存（IndexedDB）；登录后会同步到云端，换设备登录可取回。' },
  { q: '支持哪些导出格式？', a: '目前支持 PDF（含出血/CMYK）、PNG、SVG 矢量、以及 ZIP 打包。AI 生成的预览图为 PNG。' },
  { q: 'AI 用的是什么模型？', a: '统一接 DeepSeek（deepseek-chat 系列），密钥在服务端代理，浏览器看不到。后续会接入更多模型，在对话里可以切换。' },
  { q: '我能直接修改 AI 给的方案吗？', a: '可以。进入工作台后，尺寸、结构、配色、文字、Logo、3D 预览都可以手动调整，AI 只是起点不是终点。' },
];

export default function Help() {
  return <div className="page page-narrow">
    <PageHead kicker="HELP" title="帮助与反馈"
      desc="遇到问题先看这里；没解决就直接发邮件，工作日内回复。" />

    <Card className="pad-card">
      <SectionLabel en="FAQ">常见问题</SectionLabel>
      {FAQS.map((f) => <div key={f.q} style={{ marginBottom: 18 }}>
        <strong style={{ display: 'block', marginBottom: 6 }}>{f.q}</strong>
        <p style={{ color: 'var(--muted, #666)', fontSize: 14, lineHeight: 1.7 }}>{f.a}</p>
      </div>)}
    </Card>

    <Card className="pad-card">
      <SectionLabel en="CONTACT">反馈与建议</SectionLabel>
      <p style={{ color: 'var(--muted, #666)', lineHeight: 1.7 }}>
        发现 bug、想要新功能、或者对包装设计有想法，直接发邮件给我们：
      </p>
      <p style={{ marginTop: 10 }}>
        <a className="inline-link" href="mailto:hi@solyoung.top">hi@solyoung.top</a>
      </p>
      <p style={{ color: 'var(--muted, #888)', fontSize: 12, marginTop: 14 }}>
        邮件里附上：你用的设备（Mac/Windows/手机）、浏览器版本、以及你期望的效果，能帮我们更快定位问题。
      </p>
    </Card>
  </div>;
}
