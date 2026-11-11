/* 印前检查弹窗：报告总结、检查项列表、自动修复、关闭。 */
import React from 'react';
import { useEditor } from '../EditorContext';
import { Icon } from '../../components/icons';
import { useLang } from '../../i18n';

export default function PrepressModal() {
  const ed = useEditor();
  const { t } = useLang();
  const report = ed.prepressReport;
  if (!ed.prepressOpen || !report) return null;

  const statusColor = report.status === 'pass'
    ? { bg: '#dcfce7', fg: '#166534' }
    : report.status === 'warning'
      ? { bg: '#fef3c7', fg: '#92400e' }
      : { bg: '#fee2e2', fg: '#991b1b' };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 800,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
      onClick={ed.closePrepress}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 12, maxWidth: 640, width: '100%',
          maxHeight: '85vh', overflow: 'auto', padding: 24,
        }}
      >
        {/* 标题 */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18 }}>{t('印前检查报告', 'Prepress report')}</h3>
          <div style={{ flex: 1 }} />
          <button
            onClick={ed.closePrepress}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#999', padding: 4 }}
            title={t('关闭', 'Close')}
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        {/* 总结 */}
        <div style={{
          padding: 12, borderRadius: 8, marginBottom: 16,
          background: statusColor.bg, color: statusColor.fg,
          fontSize: 14, fontWeight: 500,
        }}>
          {report.summary}
        </div>

        {/* 检查项 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {report.items.map((item) => {
            const borderColor = item.level === 'pass' ? '#22c55e' : item.level === 'warning' ? '#f59e0b' : '#ef4444';
            const iconName = item.level === 'pass' ? 'check' : item.level === 'warning' ? 'alert' : 'close';
            return (
              <div key={item.id} style={{
                padding: 12, borderRadius: 8, border: '1px solid #eee',
                borderLeft: '4px solid ' + borderColor,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <Icon name={iconName} size={16} style={{ color: borderColor }} />
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{item.title}</span>
                  <span style={{ fontSize: 11, color: '#999', marginLeft: 'auto' }}>{item.group}</span>
                </div>
                <div style={{ fontSize: 13, color: '#555', lineHeight: 1.6, marginLeft: 24 }}>
                  {item.detail}
                </div>
                {item.fix && (
                  <div style={{ fontSize: 12, color: '#0369a1', marginTop: 4, marginLeft: 24 }}>
                    {t('建议：', 'Suggested fix: ')}{item.fix}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* 底部操作 */}
        <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
          <button
            onClick={ed.doAutoFix}
            style={{
              padding: '8px 16px', background: '#f5c451', color: '#333',
              border: 'none', borderRadius: 8, cursor: 'pointer',
              fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <Icon name="spark" size={15} />
            {t('自动修复可处理问题', 'Auto-fix what can be fixed')}
          </button>
          <button
            onClick={ed.closePrepress}
            style={{
              padding: '8px 16px', background: '#fff', color: '#333',
              border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer',
            }}
          >
            {t('关闭', 'Close')}
          </button>
        </div>
      </div>
    </div>
  );
}
