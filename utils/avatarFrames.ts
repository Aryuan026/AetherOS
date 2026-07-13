import { AvatarFrameCalibration, AvatarFramePreset, OSTheme } from '../types';
import { normalizePublicAssetUrl, publicAsset } from './publicAssets';

export const DEFAULT_AVATAR_FRAME_CALIBRATION: AvatarFrameCalibration = {
  avatarScale: 1,
  avatarX: 0,
  avatarY: 0,
  frameScale: 1,
  frameX: 0,
  frameY: 0,
};

export const BUILT_IN_AVATAR_FRAME_PRESETS: AvatarFramePreset[] = [
  {
    id: 'builtin-frame-xavier',
    name: '沈星回默认框',
    src: publicAsset('assets/aetheros/avatar-frames/xavier-frame.png'),
    calibration: { ...DEFAULT_AVATAR_FRAME_CALIBRATION },
    ownerType: 'character',
    ownerId: 'builtin-xavier',
    isBuiltIn: true,
  },
  {
    id: 'builtin-frame-zayne',
    name: '黎深默认框',
    src: publicAsset('assets/aetheros/avatar-frames/zayne-frame.png'),
    calibration: { ...DEFAULT_AVATAR_FRAME_CALIBRATION },
    ownerType: 'character',
    ownerId: 'builtin-zayne',
    isBuiltIn: true,
  },
  {
    id: 'builtin-frame-qiyu',
    name: '祁煜默认框',
    src: publicAsset('assets/aetheros/avatar-frames/qiyu-frame.png'),
    calibration: { ...DEFAULT_AVATAR_FRAME_CALIBRATION, frameScale: 1.02 },
    ownerType: 'character',
    ownerId: 'builtin-daily-companion',
    isBuiltIn: true,
  },
  {
    id: 'builtin-frame-sylus',
    name: '秦彻默认框',
    src: publicAsset('assets/aetheros/avatar-frames/sylus-frame.png'),
    calibration: { ...DEFAULT_AVATAR_FRAME_CALIBRATION },
    ownerType: 'character',
    ownerId: 'builtin-sylus',
    isBuiltIn: true,
  },
  {
    id: 'builtin-frame-caleb',
    name: '夏以昼默认框',
    src: publicAsset('assets/aetheros/avatar-frames/caleb-frame.png'),
    calibration: { ...DEFAULT_AVATAR_FRAME_CALIBRATION },
    ownerType: 'character',
    ownerId: 'builtin-caleb',
    isBuiltIn: true,
  },
];

export const normalizeAvatarFrameCalibration = (
  calibration?: Partial<AvatarFrameCalibration>
): AvatarFrameCalibration => ({
  ...DEFAULT_AVATAR_FRAME_CALIBRATION,
  ...(calibration || {}),
  avatarScale: 1,
  avatarX: 0,
  avatarY: 0,
});

export const normalizeAvatarFramePreset = (preset: AvatarFramePreset): AvatarFramePreset => ({
  ...preset,
  src: normalizePublicAssetUrl(preset.src),
  calibration: normalizeAvatarFrameCalibration(preset.calibration),
});

export const mergeAvatarFramePresets = (presets?: AvatarFramePreset[]): AvatarFramePreset[] => {
  const byId = new Map<string, AvatarFramePreset>();
  for (const preset of BUILT_IN_AVATAR_FRAME_PRESETS) {
    byId.set(preset.id, normalizeAvatarFramePreset(preset));
  }
  for (const preset of presets || []) {
    if (!preset?.id) continue;
    const base = byId.get(preset.id);
    byId.set(preset.id, normalizeAvatarFramePreset({
      ...base,
      ...preset,
      calibration: {
        ...(base?.calibration || DEFAULT_AVATAR_FRAME_CALIBRATION),
        ...(preset.calibration || {}),
      },
    } as AvatarFramePreset));
  }
  return Array.from(byId.values());
};

export const resolveAvatarFramePreset = (
  theme: Pick<OSTheme, 'avatarFramePresets'>,
  presetId?: string
): AvatarFramePreset | undefined => {
  if (!presetId) return undefined;
  return mergeAvatarFramePresets(theme.avatarFramePresets).find(preset => preset.id === presetId);
};
