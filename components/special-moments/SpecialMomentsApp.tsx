import React, { useEffect, useMemo, useState } from 'react';
import { useOS } from '../../context/OSContext';
import { DB } from '../../utils/db';
import { filterCharactersForPersonaSurface, resolvePersonaRouteScope } from '../../utils/personaRouteScope';
import { ValentineSession, VALENTINE_RECORD_KEY } from '../ValentineEvent';
import { WhiteDaySession, WHITEDAY_RECORD_KEY } from '../WhiteDayEvent';
import AppHeader from '../shell/AppHeader';
import { DeleteSpecialMomentDialog } from './DeleteSpecialMomentDialog';
import { SpecialMomentsIntro } from './SpecialMomentsIntro';
import { SpecialMomentsPlayDeck } from './SpecialMomentsPlayDeck';
import { SPECIAL_GAME_DOORS, SpecialGameId } from './specialMomentGames';

const CLEAR_ALL_KEEPSAKES_TARGET = '__all_special_moment_keepsakes__';

export const SpecialMomentsApp: React.FC = () => {
    const { closeApp, characters, addToast, updateCharacter, userProfile, activeCharacterId } = useOS();
    const [showValentineArchive, setShowValentineArchive] = useState(false);
    const [valentineCharacterId, setValentineCharacterId] = useState('');
    const [valentineDeleteTargetId, setValentineDeleteTargetId] = useState<string | null>(null);
    const [selectedGame, setSelectedGame] = useState<SpecialGameId>('heart');
    const [showHeartSession, setShowHeartSession] = useState(false);
    const [heartCharacterId, setHeartCharacterId] = useState(activeCharacterId || '');
    const [heartDeleteTargetId, setHeartDeleteTargetId] = useState<string | null>(null);
    const [clearKeepsakesTarget, setClearKeepsakesTarget] = useState<string | null>(null);

    const personaScope = useMemo(() => (
        resolvePersonaRouteScope(userProfile, characters, activeCharacterId)
    ), [userProfile, characters, activeCharacterId]);
    const visibleCharacters = useMemo(() => (
        filterCharactersForPersonaSurface(characters, personaScope, {
            surface: 'special_moments',
            fallbackToAllWhenEmpty: false,
        })
    ), [characters, personaScope]);

    useEffect(() => {
        if (visibleCharacters.length === 0) {
            if (heartCharacterId) setHeartCharacterId('');
            return;
        }
        if (visibleCharacters.some(character => character.id === heartCharacterId)) return;
        const nextCharacter = visibleCharacters.find(character => character.id === activeCharacterId)
            || visibleCharacters[0];
        setHeartCharacterId(nextCharacter.id);
    }, [activeCharacterId, heartCharacterId, visibleCharacters]);

    useEffect(() => {
        const testWindow = window as typeof window & {
            render_game_to_text?: () => string;
            advanceTime?: (ms: number) => Promise<void> | void;
        };
        const previousRenderer = testWindow.render_game_to_text;
        const previousAdvanceTime = testWindow.advanceTime;
        const fallbackAdvanceTime = async (_ms: number) => undefined;

        testWindow.render_game_to_text = () => JSON.stringify({
            surface: 'special_moments_play_deck',
            mode: showHeartSession ? 'heart_session' : showValentineArchive ? 'valentine_archive' : 'lobby',
            selectedGame,
            gameDoors: SPECIAL_GAME_DOORS.map(({ id, label, state }) => ({ id, label, state })),
            selectedCharacterId: heartCharacterId || null,
            scopeMode: 'linked_only',
            activeMaskId: personaScope.activeMaskId,
            linkedCharacterIds: personaScope.linkedCharacterIds,
            visibleCharacterIds: visibleCharacters.map(character => character.id),
            visibleCharacterCount: visibleCharacters.length,
            heartRecordAvailable: Boolean(
                heartCharacterId
                && characters.find(character => character.id === heartCharacterId)?.specialMomentRecords?.[WHITEDAY_RECORD_KEY]
            ),
            heartArchiveCount: visibleCharacters.filter(character => Boolean(character.specialMomentRecords?.[WHITEDAY_RECORD_KEY])).length,
            valentineArchiveCount: visibleCharacters.filter(character => Boolean(character.specialMomentRecords?.[VALENTINE_RECORD_KEY])).length,
            keepsakeCount: visibleCharacters.reduce((count, character) => (
                count
                + (character.specialMomentRecords?.[WHITEDAY_RECORD_KEY] ? 1 : 0)
                + (character.specialMomentRecords?.[VALENTINE_RECORD_KEY] ? 1 : 0)
            ), 0),
        });
        if (!testWindow.advanceTime) testWindow.advanceTime = fallbackAdvanceTime;

        return () => {
            if (previousRenderer) testWindow.render_game_to_text = previousRenderer;
            else delete testWindow.render_game_to_text;
            if (testWindow.advanceTime === fallbackAdvanceTime) {
                if (previousAdvanceTime) testWindow.advanceTime = previousAdvanceTime;
                else delete testWindow.advanceTime;
            }
        };
    }, [characters, heartCharacterId, personaScope.activeMaskId, personaScope.linkedCharacterIds, selectedGame, showHeartSession, showValentineArchive, visibleCharacters]);

    const deleteValentineMessages = async (characterId: string) => {
        const messages = await DB.getMessagesByCharId(characterId);
        const messageIds = messages
            .filter(message => message.metadata?.valentineEvent)
            .map(message => message.id)
            .filter((id): id is number => id !== undefined);
        if (messageIds.length > 0) await DB.deleteMessages(messageIds);
    };

    const handleDeleteHeartRecord = async (characterId: string) => {
        try {
            const targetCharacter = characters.find(character => character.id === characterId);
            if (targetCharacter) {
                const nextRecords = { ...(targetCharacter.specialMomentRecords || {}) };
                delete nextRecords[WHITEDAY_RECORD_KEY];
                updateCharacter(characterId, { specialMomentRecords: nextRecords });
            }
            await DB.deleteScheduledMessage(`heart-letter-${characterId}-${WHITEDAY_RECORD_KEY}`);
            addToast(`已删除 ${targetCharacter?.name || ''} 的心契记录`, 'success');
        } catch (error) {
            console.warn('Delete Heart record failed:', error);
            addToast('删除失败', 'error');
        } finally {
            setHeartDeleteTargetId(null);
        }
    };

    const handleDeleteValentineRecord = async (characterId: string) => {
        try {
            const targetCharacter = characters.find(character => character.id === characterId);
            if (targetCharacter) {
                const nextRecords = { ...(targetCharacter.specialMomentRecords || {}) };
                delete nextRecords[VALENTINE_RECORD_KEY];
                updateCharacter(characterId, { specialMomentRecords: nextRecords });
            }
            await deleteValentineMessages(characterId);
            addToast(`已删除 ${targetCharacter?.name || ''} 的情人节记录`, 'success');
        } catch (error) {
            console.warn('Delete Valentine record failed:', error);
            addToast('删除失败', 'error');
        } finally {
            setValentineDeleteTargetId(null);
        }
    };

    const handleClearKeepsakes = async () => {
        const targets = visibleCharacters
            .map(character => ({
                character,
                hasHeart: Boolean(character.specialMomentRecords?.[WHITEDAY_RECORD_KEY]),
                hasValentine: Boolean(character.specialMomentRecords?.[VALENTINE_RECORD_KEY]),
            }))
            .filter(target => target.hasHeart || target.hasValentine);
        const recordCount = targets.reduce(
            (count, target) => count + Number(target.hasHeart) + Number(target.hasValentine),
            0,
        );

        try {
            await Promise.all(targets.map(async ({ character, hasHeart, hasValentine }) => {
                const nextRecords = { ...(character.specialMomentRecords || {}) };
                if (hasHeart) delete nextRecords[WHITEDAY_RECORD_KEY];
                if (hasValentine) delete nextRecords[VALENTINE_RECORD_KEY];
                updateCharacter(character.id, { specialMomentRecords: nextRecords });

                if (hasHeart) {
                    await DB.deleteScheduledMessage(`heart-letter-${character.id}-${WHITEDAY_RECORD_KEY}`);
                }
                if (hasValentine) await deleteValentineMessages(character.id);
            }));
            addToast(recordCount > 0 ? `已清空 ${recordCount} 份往日留声` : '没有需要清空的留声', 'success');
        } catch (error) {
            console.warn('Clear Special Moments keepsakes failed:', error);
            addToast('清空失败', 'error');
        } finally {
            setClearKeepsakesTarget(null);
        }
    };

    if (showValentineArchive && valentineCharacterId) {
        return (
            <ValentineSession
                charId={valentineCharacterId}
                onClose={() => {
                    setShowValentineArchive(false);
                    setValentineCharacterId('');
                }}
            />
        );
    }

    if (showHeartSession && heartCharacterId) {
        return (
            <WhiteDaySession
                charId={heartCharacterId}
                onClose={() => setShowHeartSession(false)}
            />
        );
    }

    return (
        <div className="relative flex h-full w-full flex-col overflow-hidden bg-gradient-to-b from-[#fff7f8] via-[#fffaf7] to-[#f8f4ff] font-light">
            <div className="pointer-events-none absolute -right-16 top-20 h-52 w-52 rounded-full bg-rose-200/25 blur-3xl" />
            <div className="pointer-events-none absolute -left-20 bottom-16 h-56 w-56 rounded-full bg-violet-200/20 blur-3xl" />
            <AppHeader
                title="特别时光"
                subtitle="双人小游戏 · 随时可停"
                onBack={closeApp}
                center
                className="relative z-10 border-rose-100/70 bg-white/70 backdrop-blur-xl"
                titleClassName="truncate text-lg font-semibold tracking-tight text-slate-700"
            />

            <div className="relative z-[1] flex-1 overflow-y-auto px-4 pb-8 pt-4">
                <SpecialMomentsIntro />
                <SpecialMomentsPlayDeck
                    selectedGame={selectedGame}
                    onSelectGame={setSelectedGame}
                    characters={visibleCharacters}
                    selectedCharacterId={heartCharacterId}
                    onSelectCharacter={setHeartCharacterId}
                    heartRecordKey={WHITEDAY_RECORD_KEY}
                    onOpenHeart={(characterId) => {
                        setHeartCharacterId(characterId);
                        setShowHeartSession(true);
                    }}
                    onDeleteHeartRecord={setHeartDeleteTargetId}
                    valentineRecordKey={VALENTINE_RECORD_KEY}
                    onOpenValentine={(characterId) => {
                        setValentineCharacterId(characterId);
                        setShowValentineArchive(true);
                    }}
                    onDeleteValentineRecord={setValentineDeleteTargetId}
                    onClearKeepsakes={() => setClearKeepsakesTarget(CLEAR_ALL_KEEPSAKES_TARGET)}
                />
            </div>

            <DeleteSpecialMomentDialog
                targetId={heartDeleteTargetId}
                characters={characters}
                title="删除心契记录"
                description={(name) => (
                    <>
                        将删除 <span className="font-bold text-slate-600">{name}</span> 的心契记录和尚未送出的留信。此操作不可撤销。
                    </>
                )}
                onCancel={() => setHeartDeleteTargetId(null)}
                onConfirm={handleDeleteHeartRecord}
            />

            <DeleteSpecialMomentDialog
                targetId={valentineDeleteTargetId}
                characters={characters}
                title="删除情人节记录"
                description={(name) => (
                    <>
                        将删除 <span className="font-bold text-slate-600">{name}</span> 的情人节记录，包括存储的回忆和对应的聊天消息。此操作不可撤销。
                    </>
                )}
                onCancel={() => setValentineDeleteTargetId(null)}
                onConfirm={handleDeleteValentineRecord}
            />

            <DeleteSpecialMomentDialog
                targetId={clearKeepsakesTarget}
                targetName="全部留声"
                characters={characters}
                title="清空往日留声"
                confirmLabel="确认清空"
                description={() => (
                    <>
                        将清空当前面具下的心契和情人节留声。尚未送出的心契信会一并取消，已经进入聊天的心契信仍会保留。此操作不可撤销。
                    </>
                )}
                onCancel={() => setClearKeepsakesTarget(null)}
                onConfirm={handleClearKeepsakes}
            />
        </div>
    );
};
