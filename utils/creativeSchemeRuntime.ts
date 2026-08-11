import {
  createDefaultCreativeSchemeSettings,
  prepareCreativeScheme,
  type CreativeScheme,
  type CreativeSchemeSettings,
  type PreparedCreativeScheme,
} from '../domain/creativeScheme';
import { DB } from './db';

export const loadCreativeSchemeLibrary = async (): Promise<{
  schemes: CreativeScheme[];
  settings: CreativeSchemeSettings;
}> => {
  const records = await DB.getAllCreativeSchemeRecords();
  return {
    schemes: records.filter((record): record is CreativeScheme => record.kind === 'scheme'),
    settings: records.find((record): record is CreativeSchemeSettings => record.kind === 'settings')
      || createDefaultCreativeSchemeSettings(),
  };
};

export const preparePlainNovelCreativeScheme = async (
  characterId?: string,
): Promise<PreparedCreativeScheme> => {
  const library = await loadCreativeSchemeLibrary();
  return prepareCreativeScheme({
    ...library,
    characterId,
    surface: 'plain_novel',
  });
};
