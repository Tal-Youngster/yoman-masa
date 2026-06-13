import { useState } from 'react';
import { Button, Input } from '@/ui/components';
import { useAppServices } from '@/app/use-app-services';
import { AI_PROMPT, sanitizeExtracted, type AiExtractedData } from '../ai-extraction';
import { GmailPicker } from './GmailPicker';

// Re-exported so existing importers (form, route) keep their import path.
export type { AiExtractedData } from '../ai-extraction';

export interface AiExtractionDialogProps {
  onExtracted: (data: AiExtractedData, source?: { url?: string; file?: File }) => void;
  onManualEntry: () => void;
}

export function AiExtractionDialog({ onExtracted, onManualEntry }: AiExtractionDialogProps): React.JSX.Element {
  const { ai, gmail } = useAppServices();
  const [aiUrl, setAiUrl] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'home' | 'gmail'>('home');

  async function handleAiExtractUrl() {
    if (!aiUrl || !ai) return;
    setIsAiLoading(true);
    setError(null);
    try {
      const data = await ai.extractData<AiExtractedData>({ url: aiUrl, prompt: AI_PROMPT });
      onExtracted(sanitizeExtracted(data), { url: aiUrl });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsAiLoading(false);
    }
  }

  async function handleAiExtractImage(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    if (!file || !ai) return;
    setIsAiLoading(true);
    setError(null);
    try {
      const buffer = await file.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
      const data = await ai.extractData<AiExtractedData>({ imageBase64: base64, imageMimeType: file.type, prompt: AI_PROMPT });
      onExtracted(sanitizeExtracted(data), { file });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsAiLoading(false);
      ev.target.value = '';
    }
  }

  if (mode === 'gmail') {
    return <GmailPicker onExtracted={(data) => onExtracted(data)} onBack={() => setMode('home')} />;
  }

  return (
    <div className="flex flex-col gap-6 py-4 px-2">
      <div className="flex flex-col gap-2">
        <p className="text-sm text-on-surface-variant">Paste a link, upload a screenshot, or pick a confirmation email and let AI autofill the details.</p>
      </div>

      {ai ? (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <Input
              placeholder="Paste Booking or Airbnb URL..."
              value={aiUrl}
              onChange={e => setAiUrl(e.target.value)}
              className="bg-surface-container-lowest"
            />
            <Button type="button" onClick={() => void handleAiExtractUrl()} disabled={isAiLoading || !aiUrl}>
              {isAiLoading ? 'Extracting...' : 'Extract from Link'}
            </Button>
          </div>

          <div className="flex flex-col items-center gap-3 border-t border-outline-variant pt-6">
            <label className="cursor-pointer">
              <span className="inline-flex cursor-pointer items-center justify-center rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-on-secondary shadow transition-colors hover:bg-secondary/90">
                {isAiLoading ? 'Extracting...' : 'Upload screenshot'}
              </span>
              <input type="file" accept="image/*" className="hidden" disabled={isAiLoading} onChange={(e) => void handleAiExtractImage(e)} />
            </label>
          </div>

          {gmail && (
            <div className="flex flex-col items-center gap-3 border-t border-outline-variant pt-6">
              <Button type="button" variant="secondary" onClick={() => setMode('gmail')} disabled={isAiLoading}>
                Import from Gmail
              </Button>
            </div>
          )}

          {error && <p className="text-xs text-red-400 text-center">{error}</p>}
        </div>
      ) : (
        <p className="text-xs text-on-surface-variant border border-outline-variant p-3 rounded-lg">AI integration is not configured. Please add a Gemini API key.</p>
      )}

      <div className="flex justify-center mt-2">
        <Button variant="ghost" type="button" onClick={onManualEntry} disabled={isAiLoading}>
          Enter manually
        </Button>
      </div>
    </div>
  );
}
