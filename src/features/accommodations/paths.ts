import { deriveSlug } from '@/features/trips/slug';
import { tripFolderPath } from '@/features/trips/paths';

export function accommodationFilePath(travelFolderPath: string, tripSlug: string, checkin: string, name: string): string {
  const folder = tripFolderPath(travelFolderPath, tripSlug);
  const accSlug = deriveSlug(name) || 'acc';
  return `${folder}/Accommodations/${checkin}-${accSlug}.md`;
}
