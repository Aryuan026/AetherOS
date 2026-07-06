import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle, ImageSquare, Trash, UploadSimple, XCircle } from '@phosphor-icons/react';
import { useOS } from '../context/OSContext';
import AppHeader from '../components/shell/AppHeader';
import {
    CharacterWidgetConfig,
    CharacterWidgetImage,
    CustomCharacterWidgetStore,
    EMPTY_WIDGET_IMAGES,
    MAX_CUSTOM_WIDGET_IMAGES_PER_CHARACTER,
    buildCustomWidgetImage,
    getAllWidgetImagesForCharacter,
    getEnabledWidgetImagesForCharacter,
    isCharacterWidgetEnabled,
    loadCharacterWidgetConfig,
    loadCustomWidgetStore,
    saveCharacterWidgetConfig,
    saveCustomWidgetImages,
} from '../utils/characterWidgets';

const WidgetPreview: React.FC<{ image: CharacterWidgetImage; alt?: string }> = ({ image, alt = '' }) => {
    const foregroundClass = image.fit === 'contain'
        ? 'absolute inset-0 z-20 h-full w-full object-contain'
        : 'absolute inset-y-0 left-1/2 z-20 h-full w-auto max-w-none -translate-x-1/2';

    return (
        <div className="absolute inset-0 overflow-hidden bg-[#f5e9f8]">
            {image.fillLeftSrc && (
                <img src={image.fillLeftSrc} alt="" aria-hidden="true" className="absolute inset-y-0 left-0 z-0 h-full w-1/2 object-fill" />
            )}
            {image.fillRightSrc && (
                <img src={image.fillRightSrc} alt="" aria-hidden="true" className="absolute inset-y-0 right-0 z-0 h-full w-1/2 object-fill" />
            )}
            {image.backgroundSrc && (
                <img src={image.backgroundSrc} alt="" aria-hidden="true" className="absolute inset-y-0 left-1/2 z-10 h-full w-auto max-w-none -translate-x-1/2" />
            )}
            <img
                src={image.src}
                alt={alt}
                loading="lazy"
                className={foregroundClass}
                style={{
                    WebkitMaskImage: 'linear-gradient(to right, transparent 0, #000 3px, #000 calc(100% - 3px), transparent 100%)',
                    maskImage: 'linear-gradient(to right, transparent 0, #000 3px, #000 calc(100% - 3px), transparent 100%)',
                }}
            />
        </div>
    );
};

const WidgetApp: React.FC = () => {
    const { closeApp, characters, activeCharacterId, addToast } = useOS();
    const inputRef = useRef<HTMLInputElement>(null);
    const [selectedCharId, setSelectedCharId] = useState(activeCharacterId || characters[0]?.id || '');
    const [customStore, setCustomStore] = useState<CustomCharacterWidgetStore>({});
    const [config, setConfig] = useState<CharacterWidgetConfig>({ characters: {} });
    const [isLoading, setIsLoading] = useState(true);
    const [isUploading, setIsUploading] = useState(false);

    const selectedChar = useMemo(
        () => characters.find(char => char.id === selectedCharId) || characters[0] || null,
        [characters, selectedCharId],
    );

    const allImages = useMemo(
        () => getAllWidgetImagesForCharacter(selectedChar, customStore),
        [selectedChar, customStore],
    );
    const enabledImages = useMemo(
        () => getEnabledWidgetImagesForCharacter(selectedChar, customStore, config),
        [selectedChar, customStore, config],
    );
    const disabledImageIds = useMemo(
        () => new Set(selectedChar ? (config.characters[selectedChar.id]?.disabledImageIds || []) : []),
        [config, selectedChar?.id],
    );
    const isEnabled = useMemo(
        () => isCharacterWidgetEnabled(selectedChar, config),
        [selectedChar, config],
    );

    useEffect(() => {
        let cancelled = false;
        Promise.all([loadCustomWidgetStore(), loadCharacterWidgetConfig()]).then(([store, nextConfig]) => {
            if (cancelled) return;
            setCustomStore(store);
            setConfig(nextConfig);
            setIsLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!selectedCharId && characters[0]?.id) setSelectedCharId(characters[0].id);
    }, [characters, selectedCharId]);

    const saveConfigForCharacter = async (
        charId: string,
        updater: (current: CharacterWidgetConfig['characters'][string]) => CharacterWidgetConfig['characters'][string],
    ) => {
        const current = config.characters[charId] || {};
        const nextConfig = {
            characters: {
                ...config.characters,
                [charId]: {
                    ...updater(current),
                    updatedAt: Date.now(),
                },
            },
        };
        setConfig(nextConfig);
        await saveCharacterWidgetConfig(nextConfig);
    };

    const handleToggleCharacter = async () => {
        if (!selectedChar) return;
        const nextEnabled = !isEnabled;
        await saveConfigForCharacter(selectedChar.id, current => ({
            ...current,
            enabled: nextEnabled,
        }));
        addToast(nextEnabled ? '首屏小组件已启用' : '首屏小组件已停用', 'success');
    };

    const handleToggleImage = async (image: CharacterWidgetImage) => {
        if (!selectedChar) return;
        const nextDisabled = new Set(disabledImageIds);
        if (nextDisabled.has(image.id)) nextDisabled.delete(image.id);
        else nextDisabled.add(image.id);

        await saveConfigForCharacter(selectedChar.id, current => ({
            ...current,
            disabledImageIds: Array.from(nextDisabled),
        }));
    };

    const handleDeleteImage = async (image: CharacterWidgetImage) => {
        if (!selectedChar || image.source !== 'user') return;
        const currentImages = customStore[selectedChar.id] || EMPTY_WIDGET_IMAGES;
        const nextImages = currentImages.filter(item => item.id !== image.id);
        const nextStore = await saveCustomWidgetImages(selectedChar.id, nextImages);
        setCustomStore(nextStore);

        const nextDisabled = (config.characters[selectedChar.id]?.disabledImageIds || []).filter(id => id !== image.id);
        await saveConfigForCharacter(selectedChar.id, current => ({
            ...current,
            enabled: getAllWidgetImagesForCharacter(selectedChar, nextStore).length > 0 ? current.enabled : false,
            disabledImageIds: nextDisabled,
        }));
        addToast('小组件图片已删除', 'success');
    };

    const handleUpload = async (fileList: FileList | null) => {
        if (!selectedChar || !fileList?.length) return;
        const files = Array.from(fileList).filter(file => file.type.startsWith('image/'));
        if (files.length === 0) {
            addToast('请选择图片文件', 'error');
            return;
        }

        setIsUploading(true);
        try {
            const filesToProcess = files.slice(0, MAX_CUSTOM_WIDGET_IMAGES_PER_CHARACTER);
            const nextImages: CharacterWidgetImage[] = [];

            for (const file of filesToProcess) {
                nextImages.push(await buildCustomWidgetImage(file));
            }

            const currentImages = customStore[selectedChar.id] || EMPTY_WIDGET_IMAGES;
            const merged = [...currentImages, ...nextImages].slice(-MAX_CUSTOM_WIDGET_IMAGES_PER_CHARACTER);
            const nextStore = await saveCustomWidgetImages(selectedChar.id, merged);
            setCustomStore(nextStore);
            await saveConfigForCharacter(selectedChar.id, current => ({
                ...current,
                enabled: true,
            }));

            const clipped = files.length > filesToProcess.length;
            addToast(
                clipped
                    ? `已添加 ${nextImages.length} 张，当前角色最多保留 ${MAX_CUSTOM_WIDGET_IMAGES_PER_CHARACTER} 张`
                    : (nextImages.length > 1 ? `已添加 ${nextImages.length} 张小组件图` : '小组件图已添加'),
                'success',
            );
        } catch (e: any) {
            addToast(e?.message || '小组件图上传失败', 'error');
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="h-full w-full bg-[#f7f8fb] flex flex-col font-sans text-slate-800">
            <input
                ref={inputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={async (event) => {
                    await handleUpload(event.currentTarget.files);
                    if (inputRef.current) inputRef.current.value = '';
                }}
            />
            <AppHeader
                title="小组件"
                subtitle="首屏横向轮播"
                onBack={closeApp}
                right={(
                    <button
                        type="button"
                        disabled={isUploading || !selectedChar}
                        onClick={() => inputRef.current?.click()}
                        className="h-10 px-4 rounded-full bg-slate-900 text-white text-xs font-bold shadow-sm flex items-center gap-1.5 active:scale-95 transition-transform disabled:opacity-60"
                    >
                        {isUploading ? (
                            <span className="h-3.5 w-3.5 rounded-full border-2 border-white/35 border-t-white animate-spin" />
                        ) : (
                            <UploadSimple size={15} weight="bold" />
                        )}
                        上传
                    </button>
                )}
            />

            <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-4 pb-20">
                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-3 -mx-4 px-4">
                    {characters.map(char => {
                        const charImages = getAllWidgetImagesForCharacter(char, customStore);
                        const charEnabled = isCharacterWidgetEnabled(char, config);
                        const selected = char.id === selectedChar?.id;
                        return (
                            <button
                                key={char.id}
                                type="button"
                                onClick={() => setSelectedCharId(char.id)}
                                className={`min-w-[5.25rem] rounded-2xl border px-2.5 py-2 shadow-sm active:scale-95 transition-all ${
                                    selected ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-100'
                                }`}
                            >
                                <div className="mx-auto h-9 w-9 rounded-full overflow-hidden bg-slate-100 border border-white/80">
                                    <img src={char.avatar} alt="" className="h-full w-full object-cover" />
                                </div>
                                <div className="mt-1 text-[11px] font-bold truncate">{char.name}</div>
                                <div className={`mt-0.5 text-[9px] font-medium ${selected ? 'text-white/62' : 'text-slate-300'}`}>
                                    {charEnabled && charImages.length > 0 ? `${charImages.length} 张` : '默认'}
                                </div>
                            </button>
                        );
                    })}
                </div>

                <section className="rounded-3xl bg-white border border-slate-100 shadow-sm p-4 mb-4">
                    <div className="flex items-center gap-3">
                        <div className="h-12 w-12 rounded-2xl overflow-hidden bg-slate-100 border border-white shadow-sm shrink-0">
                            {selectedChar && <img src={selectedChar.avatar} alt="" className="h-full w-full object-cover" />}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-bold text-slate-800 truncate">{selectedChar?.name || '未选择角色'}</div>
                            <div className="mt-0.5 text-[10px] font-medium text-slate-400 truncate">
                                {isEnabled ? `首屏显示 ${enabledImages.length} 张` : '首屏使用默认角色卡'}
                            </div>
                        </div>
                        <button
                            type="button"
                            disabled={!selectedChar}
                            onClick={handleToggleCharacter}
                            className={`h-9 px-3 rounded-full text-[11px] font-bold border active:scale-95 transition-transform ${
                                isEnabled
                                    ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                                    : 'bg-slate-50 text-slate-400 border-slate-100'
                            }`}
                        >
                            {isEnabled ? '已启用' : '未启用'}
                        </button>
                    </div>
                </section>

                {isLoading ? (
                    <div className="rounded-3xl bg-white border border-slate-100 shadow-sm p-8 text-center text-xs font-bold text-slate-300">
                        读取中...
                    </div>
                ) : allImages.length > 0 ? (
                    <div className="space-y-3">
                        {allImages.map((image, index) => {
                            const imageEnabled = !disabledImageIds.has(image.id);
                            return (
                                <div key={image.id} className="rounded-3xl bg-white border border-slate-100 shadow-sm overflow-hidden">
                                    <div className="relative aspect-[2.85/1] bg-slate-100 overflow-hidden">
                                        <WidgetPreview image={image} alt={`${selectedChar?.name || ''} 小组件 ${index + 1}`} />
                                        <div className="absolute left-3 top-3 rounded-full bg-white/82 backdrop-blur-sm border border-white/80 px-2.5 py-1 text-[10px] font-bold text-slate-600 shadow-sm">
                                            {image.source === 'user' ? '我的' : '内置'}
                                        </div>
                                        <div className={`absolute right-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-bold border shadow-sm ${
                                            imageEnabled ? 'bg-emerald-50/90 text-emerald-600 border-emerald-100' : 'bg-slate-50/90 text-slate-400 border-slate-100'
                                        }`}>
                                            {imageEnabled ? '启用' : '停用'}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 px-3 py-3">
                                        <button
                                            type="button"
                                            onClick={() => handleToggleImage(image)}
                                            className={`flex-1 h-10 rounded-2xl text-xs font-bold flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform ${
                                                imageEnabled
                                                    ? 'bg-slate-900 text-white'
                                                    : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                                            }`}
                                        >
                                            {imageEnabled ? <XCircle size={16} weight="bold" /> : <CheckCircle size={16} weight="bold" />}
                                            {imageEnabled ? '停用这张' : '启用这张'}
                                        </button>
                                        {image.source === 'user' && (
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteImage(image)}
                                                className="h-10 w-11 rounded-2xl bg-rose-50 text-rose-500 border border-rose-100 flex items-center justify-center active:scale-95 transition-transform"
                                                aria-label="删除小组件图片"
                                            >
                                                <Trash size={17} weight="bold" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={() => inputRef.current?.click()}
                        className="w-full min-h-[12rem] rounded-3xl bg-white border border-dashed border-slate-200 shadow-sm flex flex-col items-center justify-center text-slate-300 active:scale-[0.99] transition-transform"
                    >
                        <ImageSquare size={36} weight="bold" />
                        <div className="mt-2 text-xs font-bold">暂无小组件图片</div>
                    </button>
                )}
            </div>
        </div>
    );
};

export default WidgetApp;
