import type { CharacterProfile, Worldbook } from '../types';
import { getActiveWorldbookRevision } from '../domain/worldbook/contract';

export type MountedWorldbook = NonNullable<CharacterProfile['mountedWorldbooks']>[number];

const compatibilityFieldsFor = (book: Worldbook): Pick<
    MountedWorldbook,
    'publicationStatus' | 'legacyPromptEligibility' | 'knowledgePolicy'
> => {
    const revision = getActiveWorldbookRevision(book);
    const publicGlobal = revision.knowledgePolicy.kind === 'public'
        && revision.bindings.every(binding => binding.kind === 'global');
    return {
        publicationStatus: revision.publicationStatus,
        legacyPromptEligibility: publicGlobal ? 'public_global' : 'typed_only',
        knowledgePolicy: revision.knowledgePolicy,
    };
};

const sameMountedWorldbook = (mounted: MountedWorldbook, book: Worldbook) => (
    mounted.id === book.id &&
    mounted.title === book.title &&
    mounted.content === book.content &&
    mounted.category === book.category &&
    mounted.publicationStatus === compatibilityFieldsFor(book).publicationStatus &&
    mounted.legacyPromptEligibility === compatibilityFieldsFor(book).legacyPromptEligibility &&
    JSON.stringify(mounted.knowledgePolicy) === JSON.stringify(compatibilityFieldsFor(book).knowledgePolicy)
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
            ...compatibilityFieldsFor(current),
        };
    });

    return { mountedWorldbooks: synchronized, changed };
};

export const currentMountedWorldbooks = (
    mountedWorldbooks: CharacterProfile['mountedWorldbooks'],
    library: readonly Worldbook[],
): MountedWorldbook[] => synchronizeMountedWorldbooks(mountedWorldbooks, library).mountedWorldbooks;
