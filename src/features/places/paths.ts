import { deriveSlug } from '@/features/trips/slug';
import { tripFolderPath } from '@/features/trips/paths';

export function placeFilePath(travelFolderPath: string, tripSlug: string, name: string): string {
  const folder = tripFolderPath(travelFolderPath, tripSlug);
  const placeSlug = deriveSlug(name) || 'place';
  return `${folder}/Places/${placeSlug}.md`;
}
