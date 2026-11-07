/* LunaSol 统一创作工作台入口。
 * 所有编辑器状态在 EditorProvider（单一数据源），界面在 EditorShell，
 * 本文件只负责挂载，不再包含业务逻辑。 */
import React from 'react';
import { EditorProvider } from '../editor/EditorContext';
import EditorShell from '../editor/EditorShell';

export default function Studio() {
  return (
    <EditorProvider>
      <EditorShell />
    </EditorProvider>
  );
}
