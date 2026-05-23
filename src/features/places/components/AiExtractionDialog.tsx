import { useState } from 'react';
import { Button, Input } from '@/ui/components';
import { useAppServices } from '@/app/use-app-services';

const AI_PROMPT = `Extract the place details from the provided link or image (like a Google Maps screenshot or URL).
Return a JSON object matching this TypeScript interface exactly:
{
  "place_alias": "string (the name of the place, e.g. 'Eiffel Tower')",
  "category": "string (e.g. 'landmark', 'restaurant', 'museum', 'park', otherwise empty)",
  "notes": "string (any interesting description or opening hours, otherwise empty)"
}
Only output the JSON string, no markdown code block formatting.`;

export interface AiExtractedPlaceData {
  place_alias?: string;
  category?: string;
  notes?: string;
}

export interface AiExtractionDialogProps {
  onExtracted: (data: AiExtractedPlaceData) => void;
  onManualEntry: () => void;
}

export function AiExtractionDialog({ onExtracted, onManualEntry }: AiExtractionDialogProps): React.JSX.Element {
  const { ai } = useAppServices();
  const [aiUrl, setAiUrl] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAiExtractUrl() {
    if (!aiUrl || !ai) return;
    setIsAiLoading(true);
    setError(null);
    try {
      const data = await ai.extractData<AiExtractedPlaceData>({ url: aiUrl, prompt: AI_PROMPT });
      onExtracted(data);
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
      const data = await ai.extractData<AiExtractedPlaceData>({ imageBase64: base64, imageMimeType: file.type, prompt: AI_PROMPT });
      onExtracted(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsAiLoading(false);
      ev.target.value = '';
    }
  }

  return (
    <div className="flex flex-col gap-6 py-4 px-2">
      <div className="flex flex-col gap-2">
        <p className="text-sm text-on-surface-variant">Paste a Google Maps link or upload a screenshot and let AI autofill the details.</p>
      </div>

      {ai ? (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <Input 
              placeholder="Paste Google Maps URL..." 
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
