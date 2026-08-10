import React, { useMemo } from 'react';
import { Plus } from '@phosphor-icons/react';
import type { CharacterProfile, WorldbookGroupAssignment } from '../../types';
import {
  createWorldbookGroupAssignment,
  UNIVERSAL_WORLDBOOK_GROUP_NAME,
} from '../../utils/worldbookGroups';

interface Props {
  characters: readonly Pick<CharacterProfile, 'id' | 'name'>[];
  groups: readonly WorldbookGroupAssignment[];
  value: WorldbookGroupAssignment;
  onChange: (value: WorldbookGroupAssignment) => void;
}

const sameOwner = (
  left: WorldbookGroupAssignment['owner'],
  right: WorldbookGroupAssignment['owner'],
) => left.kind === right.kind && (
  left.kind === 'universal'
  || (right.kind === 'character' && left.charId === right.charId)
);

const WorldbookGroupPicker: React.FC<Props> = ({ characters, groups, value, onChange }) => {
  const ownerGroups = useMemo(
    () => groups.filter(group => sameOwner(group.owner, value.owner)),
    [groups, value.owner],
  );
  const isExisting = ownerGroups.some(group => group.id === value.id);

  const chooseOwner = (owner: WorldbookGroupAssignment['owner'], fallbackName: string) => {
    const existing = groups.find(group => sameOwner(group.owner, owner));
    onChange(existing || createWorldbookGroupAssignment({ name: fallbackName, owner }));
  };

  return (
    <div className="space-y-3" data-worldbook-group-picker>
      <div>
        <div className="mb-2 text-xs font-bold tracking-wider text-slate-400">归到谁的世界书</div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => chooseOwner({ kind: 'universal' }, UNIVERSAL_WORLDBOOK_GROUP_NAME)}
            className={`rounded-full border px-3 py-2 text-xs font-bold ${value.owner.kind === 'universal' ? 'border-violet-500 bg-violet-500 text-white' : 'border-slate-200 bg-white text-slate-500'}`}
          >
            通用区
          </button>
          {characters.map(character => (
            <button
              type="button"
              key={character.id}
              onClick={() => chooseOwner({ kind: 'character', charId: character.id }, character.name)}
              className={`rounded-full border px-3 py-2 text-xs font-bold ${value.owner.kind === 'character' && value.owner.charId === character.id ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-slate-200 bg-white text-slate-500'}`}
            >
              {character.name}
            </button>
          ))}
        </div>
      </div>

      {value.owner.kind === 'character' && (
        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-xs font-bold tracking-wider text-slate-400">分组</span>
            <span className="text-[10px] text-slate-400">整组启用，不跨角色借单条</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {ownerGroups.map(group => (
              <button
                type="button"
                key={group.id}
                onClick={() => onChange(group)}
                className={`rounded-full border px-3 py-2 text-xs font-bold ${group.id === value.id ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-slate-200 bg-white text-slate-500'}`}
              >
                {group.name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => onChange(createWorldbookGroupAssignment({
                name: characters.find(character => (
                  value.owner.kind === 'character' && character.id === value.owner.charId
                ))?.name || '新分组',
                owner: value.owner,
              }))}
              className={`flex items-center gap-1 rounded-full border border-dashed px-3 py-2 text-xs font-bold ${isExisting ? 'border-slate-300 bg-white text-slate-500' : 'border-violet-400 bg-violet-50 text-violet-600'}`}
            >
              <Plus size={13} weight="bold" /> 新建分组
            </button>
          </div>
          {!isExisting && (
            <input
              value={value.name === '新分组' ? '' : value.name}
              onChange={event => onChange({ ...value, name: event.target.value })}
              placeholder="给这组起个名字"
              className="mt-3 w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
            />
          )}
        </div>
      )}
      {value.owner.kind === 'universal' && (
        <div className="rounded-2xl border border-violet-100 bg-violet-50/70 px-4 py-3 text-xs leading-5 text-violet-600">
          通用区里的启用条目会供所有角色按需读取；它们仍会经过本轮话题和篇幅筛选。
        </div>
      )}
    </div>
  );
};

export default WorldbookGroupPicker;
