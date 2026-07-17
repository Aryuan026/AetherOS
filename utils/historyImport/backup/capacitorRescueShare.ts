import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import type {
    HistoryRescueNativeShareAdapter,
} from './rescueDelivery.ts';

const utf8ToBase64 = (value: string): string => {
    const bytes = new TextEncoder().encode(value);
    let binary = '';
    const windowSize = 0x8000;
    for (let start = 0; start < bytes.length; start += windowSize) {
        binary += String.fromCharCode(...bytes.subarray(start, start + windowSize));
    }
    return btoa(binary);
};

export const createCapacitorHistoryRescueShareAdapter = (): HistoryRescueNativeShareAdapter => ({
    writeTemporaryCacheFile: async ({ path, serializedArchive }) => {
        await Filesystem.writeFile({
            path,
            data: utf8ToBase64(serializedArchive),
            directory: Directory.Cache,
        });
        const uri = await Filesystem.getUri({
            path,
            directory: Directory.Cache,
        });
        return { uri: uri.uri };
    },
    shareTemporaryFile: async ({ title, uri }) => Share.share({
        title,
        dialogTitle: title,
        files: [uri],
    }),
    deleteTemporaryCacheFile: async path => {
        await Filesystem.deleteFile({
            path,
            directory: Directory.Cache,
        });
    },
});
