import React from 'react';
import { Info } from '@phosphor-icons/react';

const HistoryContextNotice: React.FC = () => (
  <details
    aria-label="导入后的记忆范围和用量说明"
    className="group mt-3 rounded-2xl border border-indigo-100 bg-indigo-50/65 p-3"
  >
    <summary className="flex cursor-pointer list-none items-center gap-2 text-[10px] font-black text-slate-700">
      <Info size={17} weight="fill" className="mt-0.5 shrink-0 text-indigo-500" />
      AI 第一次会怎么接上？
    </summary>
    <div className="ml-6 mt-2">
        <h4 className="text-[10px] font-black text-slate-700">旧记录会保存，但不会每次整本发给 AI</h4>
        <p className="mt-1 text-[9px] leading-relaxed text-slate-600">
          导入后，完整记录仍在本机，也能在「对话日历」里按天翻看。第一次继续聊天时，
          只会把最近最多 24 条你和角色的旧消息带给 AI 衔接；更早记录暂不会自动进入回复。
        </p>
        <p className="mt-1.5 text-[9px] leading-relaxed text-slate-500">
          这些旧消息、当前消息、角色卡等都会计入 API 输入 token。最近内容越长，首次续聊通常用量越高；
          具体费用按你的 API 服务商规则计算。之后也只会按角色的上下文设置滚动读取最近聊天。
        </p>
    </div>
  </details>
);

export default HistoryContextNotice;
