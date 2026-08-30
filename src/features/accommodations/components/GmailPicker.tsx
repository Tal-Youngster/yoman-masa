import { useEffect, useState } from 'react';
import { Button, Input } from '@/ui/components';
import { useAppServices } from '@/app/use-app-services';
import { GmailAuthError, type GmailMessageMeta } from '@/lib/gmail';
import { AI_PROMPT, sanitizeExtracted, type AiExtractedData } from '../ai-extraction';

export interface GmailPickerProps {
  onExtracted: (data: AiExtractedData) => void;
  onBack: () => void;
}

/** Strip the angle-bracket address off a `From` header for display. */
function senderName(from: string): string {
  const match = /^\s*"?([^"<]*?)"?\s*</.exec(from);
  return (match?.[1] || from).trim();
}

function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString();
}

export function GmailPicker({ onExtracted, onBack }: GmailPickerProps): React.JSX.Element {
  const { gmail, ai } = useAppServices();
  const [messages, setMessages] = useState<readonly GmailMessageMeta[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [extractingId, setExtractingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [draftQuery, setDraftQuery] = useState('');
  // Submitted query — searching costs a round trip, so it runs on submit
  // rather than on every keystroke.
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!gmail) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const list = query ? await gmail.searchMessages(query) : await gmail.listRecentInbox();
        if (!cancelled) setMessages(list);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof GmailAuthError) setNeedsReconnect(true);
        else setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gmail, query]);

  function handleSearch(ev: React.FormEvent) {
    ev.preventDefault();
    setQuery(draftQuery.trim());
  }

  function handleClearSearch() {
    setDraftQuery('');
    setQuery('');
  }

  async function handlePick(id: string) {
    if (!gmail || !ai) return;
    setExtractingId(id);
    setError(null);
    try {
      const body = await gmail.getMessageText(id);
      if (!body.trim()) throw new Error('That email has no readable text body.');
      const data = await ai.extractData<AiExtractedData>({ text: body, prompt: AI_PROMPT });
      onExtracted(sanitizeExtracted(data));
    } catch (err) {
      if (err instanceof GmailAuthError) setNeedsReconnect(true);
      else setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExtractingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4 py-4 px-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-on-surface">Pick a confirmation email</p>
        <Button variant="ghost" type="button" onClick={onBack} disabled={extractingId !== null}>
          Back
        </Button>
      </div>

      {gmail && !needsReconnect && (
        <form className="flex items-end gap-2" onSubmit={handleSearch}>
          <div className="flex-1">
            <Input
              type="search"
              enterKeyHint="search"
              placeholder="Search mail (e.g. from:booking.com)"
              aria-label="Search mailbox"
              value={draftQuery}
              onChange={(e) => setDraftQuery(e.target.value)}
              disabled={extractingId !== null}
              className="bg-surface-container-lowest"
            />
          </div>
          <Button type="submit" variant="secondary" disabled={extractingId !== null || loading}>
            Search
          </Button>
          {query && (
            <Button
              type="button"
              variant="ghost"
              onClick={handleClearSearch}
              disabled={extractingId !== null}
            >
              Clear
            </Button>
          )}
        </form>
      )}

      {!gmail ? (
        <p className="text-xs text-on-surface-variant border border-outline-variant p-3 rounded-lg">
          Gmail isn’t connected. Sign in with Google (with the vault) to import from your inbox.
        </p>
      ) : needsReconnect ? (
        <p className="text-xs text-orange-600 dark:text-orange-400 border border-outline-variant p-3 rounded-lg">
          Gmail access needs reconnecting. Reconnect your Google account, then try again.
        </p>
      ) : loading ? (
        <p className="text-sm text-on-surface-variant text-center py-6">
          {query ? 'Searching…' : 'Loading inbox…'}
        </p>
      ) : messages && messages.length > 0 ? (
        <ul className="flex flex-col gap-1 max-h-80 overflow-y-auto">
          {messages.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                disabled={extractingId !== null}
                onClick={() => void handlePick(m.id)}
                className="w-full text-left rounded-lg border border-outline-variant bg-surface-container-lowest p-3 transition-colors hover:bg-surface-container disabled:opacity-50"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-on-surface truncate">{senderName(m.from)}</span>
                  <span className="flex-none text-[11px] text-on-surface-variant">{formatDate(m.date)}</span>
                </div>
                <div className="text-sm text-on-surface truncate">{m.subject || '(no subject)'}</div>
                <div className="text-xs text-on-surface-variant truncate">
                  {extractingId === m.id ? 'Extracting…' : m.snippet}
                </div>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-on-surface-variant text-center py-6">
          {query ? `No mail matches “${query}”.` : 'No recent inbox messages.'}
        </p>
      )}

      {error && <p className="text-xs text-red-400 text-center">{error}</p>}
    </div>
  );
}
