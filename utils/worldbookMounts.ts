import type { CharacterProfile, Worldbook } from '../types';

export type MountedWorldbook = NonNullable<CharacterProfile['mountedWorldbooks']>[number];

const sameMountedWorldbook = (mounted: MountedWorldbook, book: Worldbook) => (
    mounted.id === book.id &&
    mounted.title === book.title &&
    mounted.content === book.content &&
    mounted.category === book.category
);

/**
 * A mount is identified by worldbook ID.  The copied fields are only a
 * persisted cache for character-card portability; the library record is the
 * canonical source whenever it exists.
 */
export const synchronizeMountedWorldbooks = (
    mountedWorldbooks: CharacterProfile['mountedWorldbooks'],
    library: readonly Worldbook[],
): { mountedWorldbooks: MountedWorldbook[]; changed: boolean } => {
    if (!mountedWorldbooks?.length) {
        return { mountedWorldbooks: [], changed: false };
    }

    const libraryById = new Map(library.map(book => [book.id, book]));
    let changed = false;
    const synchronized = mountedWorldbooks.map(mounted => {
        const current = libraryById.get(mounted.id);
        if (!current || sameMountedWorldbook(mounted, current)) return mounted;

        changed = true;
        return {
            id: current.id,
            title: current.title,
            content: current.content,
            category: current.category,
        };
    });

    return { mountedWorldbooks: synchronized, changed };
};

export const currentMountedWorldbooks = (
    mountedWorldbooks: CharacterProfile['mountedWorldbooks'],
    library: readonly Worldbook[],
): MountedWorldbook[] => synchronizeMountedWorldbooks(mountedWorldbooks, library).mountedWorldbooks;
