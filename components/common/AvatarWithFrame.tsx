import React from 'react';
import { AvatarFramePreset } from '../../types';
import { DEFAULT_AVATAR_FRAME_CALIBRATION, normalizeAvatarFrameCalibration } from '../../utils/avatarFrames';

interface AvatarWithFrameProps {
    src: string;
    framePreset?: AvatarFramePreset;
    alt?: string;
    className?: string;
    imageClassName?: string;
    frameClassName?: string;
    roundedClassName?: string;
    loading?: 'eager' | 'lazy';
    decoding?: 'sync' | 'async' | 'auto';
}

const AvatarWithFrame: React.FC<AvatarWithFrameProps> = ({
    src,
    framePreset,
    alt = '',
    className = '',
    imageClassName = '',
    frameClassName = '',
    roundedClassName = 'rounded-full',
    loading = 'lazy',
    decoding = 'async',
}) => {
    if (framePreset?.src) {
        const calibration = normalizeAvatarFrameCalibration(framePreset.calibration || DEFAULT_AVATAR_FRAME_CALIBRATION);
        return (
            <span className={`relative inline-block shrink-0 overflow-visible ${className}`}>
                <img
                    src={src}
                    className={`absolute left-1/2 top-1/2 h-full w-full ${roundedClassName} object-cover ${imageClassName}`}
                    style={{
                        transform: `translate(-50%, -50%) translate(${calibration.avatarX}%, ${calibration.avatarY}%) scale(${calibration.avatarScale})`,
                    }}
                    alt={alt}
                    loading={loading}
                    decoding={decoding}
                />
                <img
                    src={framePreset.src}
                    className={`absolute left-1/2 top-1/2 z-10 h-full w-full pointer-events-none select-none object-contain ${frameClassName}`}
                    style={{
                        transform: `translate(-50%, -50%) translate(${calibration.frameX}%, ${calibration.frameY}%) scale(${calibration.frameScale})`,
                    }}
                    alt=""
                    aria-hidden="true"
                    loading={loading}
                    decoding={decoding}
                />
            </span>
        );
    }

    return (
        <span className={`relative inline-block shrink-0 overflow-hidden ${roundedClassName} ${className}`}>
            <img
                src={src}
                className={`h-full w-full ${roundedClassName} object-cover ${imageClassName}`}
                alt={alt}
                loading={loading}
                decoding={decoding}
            />
        </span>
    );
};

export default AvatarWithFrame;
