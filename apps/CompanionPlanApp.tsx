import React, { useEffect, useMemo, useState } from 'react';
import { useOS } from '../context/OSContext';
import Modal from '../components/os/Modal';
import { Task, CompanionPlanCheckIn } from '../types';
import { DB } from '../utils/db';
import { ContextBuilder } from '../utils/context';
import { safeResponseJson } from '../utils/safeApi';
import AppHeader, { AppHeaderAddButton } from '../components/shell/AppHeader';

const cadenceLabel: Record<NonNullable<Task['cadence']>, string> = {
    daily: '每日陪跑',
    weekly: '每周回看',
    flex: '弹性推进',
};

const statusLabel: Record<CompanionPlanCheckIn['status'], string> = {
    done: '已推进',
    stalled: '卡住了',
    adjusted: '调整过',
};

const formatDate = (value?: string | number) => {
    if (!value) return '未设日期';
    const date = typeof value === 'number' ? new Date(value) : new Date(value);
    if (Number.isNaN(date.getTime())) return '未设日期';
    return date.toLocaleDateString();
};

const getDaysLeft = (deadline?: string) => {
    if (!deadline) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(deadline);
    target.setHours(0, 0, 0, 0);
    return Math.ceil((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
};

const isSameLocalDay = (a: number, b: number) => {
    const da = new Date(a);
    const db = new Date(b);
    return da.getFullYear() === db.getFullYear()
        && da.getMonth() === db.getMonth()
        && da.getDate() === db.getDate();
};

const sortPlans = (plans: Task[]) => [...plans].sort((a, b) => {
    if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
    if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
    if (a.deadline) return -1;
    if (b.deadline) return 1;
    return b.createdAt - a.createdAt;
});

const CompanionPlanApp: React.FC = () => {
    const { closeApp, characters, activeCharacterId, apiConfig, addToast, userProfile } = useOS();
    const [plans, setPlans] = useState<Task[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [newTarget, setNewTarget] = useState('');
    const [newDescription, setNewDescription] = useState('');
    const [newDeadline, setNewDeadline] = useState('');
    const [newCadence, setNewCadence] = useState<NonNullable<Task['cadence']>>('daily');
    const [newSupervisorId, setNewSupervisorId] = useState(activeCharacterId || '');
    const [processingId, setProcessingId] = useState<string | null>(null);

    useEffect(() => {
        loadPlans();
    }, []);

    const loadPlans = async () => {
        const stored = await DB.getAllTasks();
        setPlans(sortPlans(stored));
    };

    const activePlans = useMemo(() => plans.filter(plan => !plan.isCompleted), [plans]);
    const completedPlans = useMemo(() => plans.filter(plan => plan.isCompleted), [plans]);

    const savePlan = async (plan: Task) => {
        await DB.saveTask(plan);
        setPlans(prev => sortPlans(prev.some(item => item.id === plan.id)
            ? prev.map(item => item.id === plan.id ? plan : item)
            : [...prev, plan]));
    };

    const handleAddPlan = async () => {
        if (!newTitle.trim()) return;
        const fallbackSupervisor = newSupervisorId || activeCharacterId || characters[0]?.id || '';
        const plan: Task = {
            id: `plan-${Date.now()}`,
            title: newTitle.trim(),
            target: newTarget.trim() || undefined,
            description: newDescription.trim() || undefined,
            deadline: newDeadline || undefined,
            cadence: newCadence,
            supervisorId: fallbackSupervisor,
            tone: 'gentle',
            isCompleted: false,
            createdAt: Date.now(),
            kind: 'companion_plan',
            checkIns: [],
        };
        await savePlan(plan);
        setIsModalOpen(false);
        setNewTitle('');
        setNewTarget('');
        setNewDescription('');
        setNewDeadline('');
        setNewCadence('daily');
        addToast('同行计划已写下', 'success');
    };

    const addCheckIn = async (plan: Task, status: CompanionPlanCheckIn['status']) => {
        const checkIn: CompanionPlanCheckIn = {
            id: `checkin-${Date.now()}`,
            at: Date.now(),
            status,
        };
        const updated: Task = {
            ...plan,
            kind: plan.kind || 'companion_plan',
            checkIns: [...(plan.checkIns || []), checkIn],
            lastCheckInAt: checkIn.at,
        };
        await savePlan(updated);
        addToast(status === 'done' ? '今天的推进记下了' : '卡住也记下了', status === 'done' ? 'success' : 'info');
    };

    const generateMilestoneNote = async (plan: Task): Promise<string | undefined> => {
        const supervisor = characters.find(c => c.id === plan.supervisorId);
        if (!supervisor || !apiConfig.apiKey) return undefined;

        const checkInSummary = (plan.checkIns || [])
            .slice(-8)
            .map(item => `- ${formatDate(item.at)}: ${statusLabel[item.status]}`)
            .join('\n') || '暂无打卡记录';

        const prompt = `
### 场景：同行计划阶段完成
用户 (${userProfile.name}) 完成了一个阶段目标。

目标: ${plan.title}
成果/期待: ${plan.target || '未填写'}
周期: ${plan.deadline ? `截止到 ${plan.deadline}` : '未设置截止日期'}
最近推进记录:
${checkInSummary}

### 任务
请以你的人设，为这次阶段完成留一句简短小结。它会先保存在同行计划里，未来可选择写入时光簿。

输出要求:
- 只输出一句话。
- 不要列清单。
- 使用用户常用语言。`;

        const response = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
            body: JSON.stringify({
                model: apiConfig.model,
                messages: [
                    { role: 'system', content: ContextBuilder.buildCoreContext(supervisor, userProfile) },
                    { role: 'user', content: prompt },
                ],
                temperature: 0.8,
                max_tokens: 300,
            }),
        });

        if (!response.ok) return undefined;
        const data = await safeResponseJson(response);
        return data.choices?.[0]?.message?.content?.trim().replace(/^["']|["']$/g, '');
    };

    const completePlan = async (plan: Task) => {
        setProcessingId(plan.id);
        try {
            let milestoneNote = plan.milestoneNote;
            if (!milestoneNote) {
                try {
                    milestoneNote = await generateMilestoneNote(plan);
                } catch (error) {
                    console.warn('Companion plan milestone note failed:', error);
                }
            }
            await savePlan({
                ...plan,
                kind: plan.kind || 'companion_plan',
                isCompleted: true,
                completedAt: Date.now(),
                milestoneNote: milestoneNote || plan.milestoneNote,
                milestoneGeneratedAt: milestoneNote ? Date.now() : plan.milestoneGeneratedAt,
            });
            addToast('阶段完成，先收在同行计划里', 'success');
        } finally {
            setProcessingId(null);
        }
    };

    const deletePlan = async (id: string) => {
        await DB.deleteTask(id);
        setPlans(prev => prev.filter(plan => plan.id !== id));
    };

    const renderPlan = (plan: Task) => {
        const supervisor = characters.find(c => c.id === plan.supervisorId);
        const daysLeft = getDaysLeft(plan.deadline);
        const latestCheckIn = (plan.checkIns || []).slice(-1)[0];
        const checkedToday = latestCheckIn ? isSameLocalDay(latestCheckIn.at, Date.now()) : false;

        return (
            <div key={plan.id} className="rounded-2xl bg-white border border-slate-100 shadow-sm p-4">
                <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-2xl overflow-hidden bg-slate-100 shrink-0">
                        {supervisor?.avatar ? (
                            <img src={supervisor.avatar} alt="" className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">AI</div>
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                            <div>
                                <h3 className="text-base font-bold text-slate-800 leading-snug">{plan.title}</h3>
                                <p className="text-[11px] text-slate-400 mt-1">
                                    {supervisor?.name || '未指定'} · {cadenceLabel[plan.cadence || 'daily']}
                                </p>
                            </div>
                            <button onClick={() => deletePlan(plan.id)} className="text-slate-300 hover:text-rose-400 px-1">×</button>
                        </div>

                        {(plan.target || plan.description) && (
                            <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
                                {plan.target && <div className="font-semibold text-slate-700">{plan.target}</div>}
                                {plan.description && <div className={plan.target ? 'mt-1' : ''}>{plan.description}</div>}
                            </div>
                        )}

                        <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-500">
                                {plan.deadline ? `截止 ${formatDate(plan.deadline)}` : '没有截止日'}
                            </span>
                            {daysLeft !== null && (
                                <span className={`rounded-full px-2.5 py-1 ${daysLeft < 0 ? 'bg-rose-50 text-rose-500' : 'bg-emerald-50 text-emerald-600'}`}>
                                    {daysLeft < 0 ? `已超 ${Math.abs(daysLeft)} 天` : daysLeft === 0 ? '今天到期' : `还剩 ${daysLeft} 天`}
                                </span>
                            )}
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-500">
                                推进 {(plan.checkIns || []).length} 次
                            </span>
                        </div>

                        {latestCheckIn && (
                            <div className="mt-3 text-[11px] text-slate-400">
                                最近一次：{formatDate(latestCheckIn.at)} · {statusLabel[latestCheckIn.status]}
                            </div>
                        )}

                        {plan.milestoneNote && (
                            <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-700">
                                {plan.milestoneNote}
                            </div>
                        )}
                    </div>
                </div>

                {!plan.isCompleted && (
                    <div className="mt-4 grid grid-cols-3 gap-2">
                        <button
                            onClick={() => addCheckIn(plan, 'done')}
                            disabled={checkedToday}
                            className="h-10 rounded-xl bg-slate-900 text-white text-xs font-bold disabled:bg-slate-200 disabled:text-slate-400"
                        >
                            {checkedToday ? '今日已记' : '今天推进'}
                        </button>
                        <button onClick={() => addCheckIn(plan, 'stalled')} className="h-10 rounded-xl bg-slate-100 text-slate-600 text-xs font-bold">
                            卡住了
                        </button>
                        <button
                            onClick={() => completePlan(plan)}
                            disabled={processingId === plan.id}
                            className="h-10 rounded-xl bg-emerald-500 text-white text-xs font-bold disabled:opacity-60"
                        >
                            {processingId === plan.id ? '收尾中' : '完成阶段'}
                        </button>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="h-full w-full bg-[#f8faf8] flex flex-col font-sans text-slate-800">
            <AppHeader
                title="同行计划"
                subtitle="阶段目标"
                onBack={closeApp}
                center
                className="bg-[#f8faf8]/90 border-slate-200/70"
                titleClassName="truncate text-lg font-bold tracking-wide text-slate-800"
                subtitleClassName="mt-0.5 truncate text-[10px] font-semibold tracking-[0.12em] text-slate-400"
                right={(
                    <AppHeaderAddButton onClick={() => setIsModalOpen(true)} title="新建同行计划" />
                )}
            />

            <div className="flex-1 overflow-y-auto no-scrollbar p-5 pb-24 space-y-4">
                <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-2xl bg-white border border-slate-100 p-3 text-center">
                        <div className="text-lg font-bold">{activePlans.length}</div>
                        <div className="text-[10px] text-slate-400 mt-1">同行中</div>
                    </div>
                    <div className="rounded-2xl bg-white border border-slate-100 p-3 text-center">
                        <div className="text-lg font-bold">{completedPlans.length}</div>
                        <div className="text-[10px] text-slate-400 mt-1">已完成</div>
                    </div>
                    <div className="rounded-2xl bg-white border border-slate-100 p-3 text-center">
                        <div className="text-lg font-bold">{plans.reduce((sum, plan) => sum + (plan.checkIns?.length || 0), 0)}</div>
                        <div className="text-[10px] text-slate-400 mt-1">推进记录</div>
                    </div>
                </div>

                <section className="space-y-3">
                    <div className="flex items-center justify-between px-1">
                        <h2 className="text-xs font-bold text-slate-400 tracking-[0.18em]">正在同行</h2>
                    </div>
                    {activePlans.length === 0 ? (
                        <button onClick={() => setIsModalOpen(true)} className="w-full rounded-2xl border border-dashed border-slate-300 bg-white/70 py-10 text-center">
                            <div className="text-sm font-bold text-slate-600">还没有阶段目标</div>
                            <div className="text-xs text-slate-400 mt-2">先写一个可以被陪着推进的小目标。</div>
                        </button>
                    ) : activePlans.map(renderPlan)}
                </section>

                {completedPlans.length > 0 && (
                    <section className="space-y-3 pt-2">
                        <h2 className="px-1 text-xs font-bold text-slate-400 tracking-[0.18em]">完成过的阶段</h2>
                        {completedPlans.map(renderPlan)}
                    </section>
                )}
            </div>

            <Modal isOpen={isModalOpen} title="新建同行计划" onClose={() => setIsModalOpen(false)} footer={<button onClick={handleAddPlan} className="w-full py-3 rounded-2xl bg-slate-900 text-white font-bold">保存计划</button>}>
                <div className="space-y-4">
                    <input
                        value={newTitle}
                        onChange={e => setNewTitle(e.target.value)}
                        placeholder="阶段目标，比如：三个月内减重 5kg"
                        className="w-full rounded-xl bg-slate-100 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                    />
                    <input
                        value={newTarget}
                        onChange={e => setNewTarget(e.target.value)}
                        placeholder="想达到什么状态"
                        className="w-full rounded-xl bg-slate-100 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                    />
                    <textarea
                        value={newDescription}
                        onChange={e => setNewDescription(e.target.value)}
                        placeholder="补充一点背景，比如为什么想做、哪里容易拖延"
                        className="w-full h-24 rounded-xl bg-slate-100 px-4 py-3 text-sm outline-none resize-none focus:ring-2 focus:ring-slate-300"
                    />
                    <div className="grid grid-cols-2 gap-3">
                        <input
                            type="date"
                            value={newDeadline}
                            onChange={e => setNewDeadline(e.target.value)}
                            className="w-full rounded-xl bg-slate-100 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                        />
                        <select
                            value={newCadence}
                            onChange={e => setNewCadence(e.target.value as NonNullable<Task['cadence']>)}
                            className="w-full rounded-xl bg-slate-100 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                        >
                            <option value="daily">每日陪跑</option>
                            <option value="weekly">每周回看</option>
                            <option value="flex">弹性推进</option>
                        </select>
                    </div>
                    <div>
                        <div className="text-[10px] font-bold text-slate-400 tracking-[0.18em] mb-2">陪你的人</div>
                        <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
                            {characters.map(char => (
                                <button
                                    key={char.id}
                                    onClick={() => setNewSupervisorId(char.id)}
                                    className={`min-w-[64px] flex flex-col items-center gap-2 rounded-2xl p-2 border ${newSupervisorId === char.id ? 'border-slate-900 bg-white' : 'border-transparent opacity-55'}`}
                                >
                                    <img src={char.avatar} alt="" className="w-10 h-10 rounded-full object-cover" />
                                    <span className="text-[10px] font-bold text-slate-600 whitespace-nowrap">{char.name}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default CompanionPlanApp;
