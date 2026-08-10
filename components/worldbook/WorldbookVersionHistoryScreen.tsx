import React, { useMemo, useState } from 'react';
import { ArrowCounterClockwise, CaretDown } from '@phosphor-icons/react';
import AppHeader from '../shell/AppHeader';
import Modal from '../os/Modal';
import type { Worldbook, WorldbookRevisionSnapshot } from '../../types';
import { getActiveWorldbookRevision } from '../../domain/worldbook';

interface Props {
  entry: Worldbook;
  reenabledCharacterCount: number;
  onClose: () => void;
  onRestore: (revisionId: string) => Promise<void>;
}

const sourceLabel = (revision: WorldbookRevisionSnapshot): string => {
  const kind = revision.sourceRefs[0]?.kind;
  if (kind === 'import') return '导入资料';
  if (kind === 'narrative_promotion') return '故事生长';
  if (kind === 'revision_restore') return '恢复旧版本';
  if (kind === 'legacy_normalization') return '原有资料';
  return '我的编辑';
};

const WorldbookVersionHistoryScreen: React.FC<Props> = ({
  entry,
  reenabledCharacterCount,
  onClose,
  onRestore,
}) => {
  const active = getActiveWorldbookRevision(entry);
  const revisions = useMemo(
    () => [...(entry.revisionSnapshots || [])]
      .filter(revision => revision.knowledgePolicy.kind !== 'director_only')
      .sort((left, right) => right.revision - left.revision),
    [entry.revisionSnapshots],
  );
  const [expandedId, setExpandedId] = useState(active.id);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmRevisionId, setConfirmRevisionId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const confirmRevision = revisions.find(revision => revision.id === confirmRevisionId);

  const restore = async (revisionId: string) => {
    setBusyId(revisionId);
    setError('');
    try {
      await onRestore(revisionId);
      setConfirmRevisionId(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '没有恢复成功，请再试一次。');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex h-full w-full flex-col bg-slate-50 font-sans" data-worldbook-version-history>
      <AppHeader
        title="版本记录"
        subtitle={entry.title}
        onBack={onClose}
        className="border-b border-slate-200 bg-white/90 backdrop-blur-xl"
      />
      <div className="flex-1 space-y-4 overflow-y-auto px-5 pb-[max(6rem,env(safe-area-inset-bottom))] pt-5 no-scrollbar">
        <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 px-4 py-3 text-xs leading-5 text-indigo-600">
          恢复会把选中的内容保存成一个新版本，并重新启用仍保留挂载的角色；旧记录不会被覆盖。
          <div className="mt-1 font-bold" data-worldbook-restore-mount-count>
            {reenabledCharacterCount > 0
              ? `当前有 ${reenabledCharacterCount} 位角色保留挂载，恢复后会重新使用这条世界书。`
              : '当前没有角色保留挂载，恢复只会让内容重新回到书架。'}
          </div>
        </div>
        {revisions.map(revision => {
          const isActive = revision.id === active.id;
          const canRestore = !isActive || active.publicationStatus === 'archived';
          const expanded = expandedId === revision.id;
          return (
            <section key={revision.id} className="overflow-hidden rounded-[24px] border border-white bg-white/85 shadow-sm">
              <button
                type="button"
                onClick={() => setExpandedId(previous => previous === revision.id ? '' : revision.id)}
                className="flex w-full items-center gap-3 p-4 text-left"
                aria-expanded={expanded}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-slate-700">版本 {revision.revision}</span>
                    {isActive && (
                      <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${active.publicationStatus === 'archived' ? 'bg-slate-100 text-slate-500' : 'bg-emerald-50 text-emerald-600'}`}>
                        {active.publicationStatus === 'archived' ? '已归档' : '当前'}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[10px] text-slate-400">
                    {sourceLabel(revision)} · {new Date(revision.createdAt).toLocaleString()}
                  </p>
                </div>
                <CaretDown size={16} className={`text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
              </button>
              {expanded && (
                <div className="space-y-3 border-t border-slate-100 px-4 pb-4 pt-3">
                  <div>
                    <div className="text-[10px] font-bold text-slate-400">{revision.category}</div>
                    <h3 className="mt-1 text-sm font-bold text-slate-700">{revision.title}</h3>
                  </div>
                  <p className="whitespace-pre-wrap text-xs leading-6 text-slate-600">{revision.content || '（空白正文）'}</p>
                  {canRestore && (
                    <button
                      type="button"
                      disabled={busyId === revision.id}
                      onClick={() => setConfirmRevisionId(revision.id)}
                      className="flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-50 py-3 text-xs font-bold text-indigo-600 disabled:opacity-50"
                    >
                      <ArrowCounterClockwise size={16} /> {busyId === revision.id ? '恢复中' : '恢复这个版本'}
                    </button>
                  )}
                </div>
              )}
            </section>
          );
        })}
        {error && <div role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-xs text-red-600">{error}</div>}
      </div>
      <Modal
        isOpen={Boolean(confirmRevision)}
        title="恢复并重新启用？"
        onClose={() => {
          if (!busyId) setConfirmRevisionId(null);
        }}
        footer={(
          <div className="flex w-full gap-3">
            <button
              type="button"
              disabled={Boolean(busyId)}
              onClick={() => setConfirmRevisionId(null)}
              className="flex-1 rounded-2xl bg-slate-100 py-3 text-sm font-bold text-slate-600 disabled:opacity-50"
            >
              先不恢复
            </button>
            <button
              type="button"
              disabled={!confirmRevisionId || Boolean(busyId)}
              onClick={() => confirmRevisionId && void restore(confirmRevisionId)}
              className="flex-1 rounded-2xl bg-indigo-500 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {busyId ? '恢复中' : '确认恢复'}
            </button>
          </div>
        )}
      >
        <div className="space-y-3 py-2 text-center text-sm leading-6 text-slate-600" data-worldbook-restore-confirm>
          <div>版本 {confirmRevision?.revision} 的内容会成为新的当前版本。</div>
          <div className="rounded-2xl bg-indigo-50 px-4 py-3 text-xs font-bold text-indigo-600">
            {reenabledCharacterCount > 0
              ? `${reenabledCharacterCount} 位角色保留的挂载会随之重新启用。`
              : '没有角色会被自动新增挂载。'}
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default WorldbookVersionHistoryScreen;
