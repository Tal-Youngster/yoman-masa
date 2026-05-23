import { useState } from 'react';

import { Button, Card } from '@/ui/components';
import { useAppServices } from '@/app/use-app-services';

export interface FirstRunFolderPromptProps {
  /** Called once the Travel folder has been picked and persisted. */
  onPicked: (folder: { id: string; name: string; path: string }) => void;
}

/**
 * Renders when `kv.travel_folder_file_id` is null — prompts the user to pick
 * the Travel folder in their Drive. Wraps S3's `pickFolder()`.
 *
 * Pickup of the surrounding `vault_root_file_id` (the parent of the Travel
 * folder, used by the path resolver) is best-effort: we store the picked
 * folder's parent path as a hint, but the real walk happens in S6+ when the
 * read flow first lists folders.
 */
export function FirstRunFolderPrompt({ onPicked }: FirstRunFolderPromptProps): React.JSX.Element {
  const { drive, kv } = useAppServices();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePick(): Promise<void> {
    if (!drive) {
      setError('Drive client not configured — sync will not work in this build.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const picked = await drive.pickFolder();
      await kv.set('travel_folder_file_id', picked.id);
      // The vault root is the path's first segment; we persist the picker's
      // own folder id as a stand-in until S6's path resolver lands.
      await kv.set('vault_root_file_id', picked.id);
      onPicked({ id: picked.id, name: picked.name, path: picked.path });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title="Pick your Travel folder"
      description="Travel Journal stores your trip files in your Drive vault. Pick the folder you keep your travel notes in (typically <vault>/Travel)."
    >
      {error && (
        <p role="alert" className="text-xs text-red-400" data-testid="first-run-error">
          {error}
        </p>
      )}
      <div className="mt-2 flex justify-end">
        <Button
          onClick={() => void handlePick()}
          disabled={busy}
          data-testid="first-run-pick"
        >
          {busy ? 'Opening picker…' : 'Pick folder'}
        </Button>
      </div>
    </Card>
  );
}
