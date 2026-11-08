/* AI 原生新建设计流程页面（任务书 P0）。
 * 本文件只负责挂载 CreationFlow，阶段逻辑与数据都在 workflow 模块。 */
import React from 'react';
import CreationFlow from '../workflow/CreationFlow';

export default function NewDesign() {
  return <CreationFlow />;
}
