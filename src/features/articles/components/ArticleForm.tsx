import { useState, type FormEvent } from 'react';
import { Button, Input } from '@/ui/components';
import type { Article } from '@/domain/article';
import type { Place } from '@/domain/place';
import type { PlaceId } from '@/domain/ids';
import type { ArticleScope, ArticlesAdminService } from '../articles-admin';

export interface ArticleFormProps {
  scope: ArticleScope;
  admin: ArticlesAdminService;
  /** Wishlist places of the active trip, offered as the optional link target. */
  places: readonly Place[];
  /** Pass to edit an existing article; omit to create. */
  article?: Article;
  onSuccess: () => void;
  onCancel: () => void;
}

function placeLabel(p: Place): string {
  return p.place_alias || p.place_id;
}

export function ArticleForm({
  scope,
  admin,
  places,
  article,
  onSuccess,
  onCancel,
}: ArticleFormProps): React.JSX.Element {
  const editing = article !== undefined;
  const [url, setUrl] = useState(article?.url ?? '');
  const [title, setTitle] = useState(article?.title ?? '');
  const [tags, setTags] = useState((article?.tags ?? []).join(', '));
  const [placeId, setPlaceId] = useState<string>(article?.place_id ?? '');
  const [notes, setNotes] = useState(article?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (title.trim() === '') {
      setError('Title is required');
      return;
    }
    let normalizedUrl = url.trim();
    // A pasted link usually arrives without a scheme; add the common one rather
    // than rejecting it, since `Article.url` must be a valid URL.
    if (normalizedUrl !== '' && !/^https?:\/\//i.test(normalizedUrl)) {
      normalizedUrl = `https://${normalizedUrl}`;
    }
    try {
      new URL(normalizedUrl);
    } catch {
      setError('Enter a valid link, e.g. https://example.com/post');
      return;
    }

    const tagList = tags
      .split(',')
      .map((t) => t.trim().replace(/^#/, ''))
      .filter((t) => t.length > 0);

    setSubmitting(true);
    try {
      if (editing && article) {
        await admin.updateArticle(scope, {
          ...article,
          url: normalizedUrl,
          title: title.trim(),
          tags: tagList,
          place_id: placeId === '' ? null : (placeId as PlaceId),
          notes,
        });
      } else {
        await admin.addArticle(scope, {
          url: normalizedUrl,
          title: title.trim(),
          tags: tagList,
          place_id: placeId === '' ? null : placeId,
          notes,
        });
      }
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="flex flex-col gap-4 py-2" onSubmit={(e) => void handleSubmit(e)}>
      <Input
        label="Link"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://example.com/best-hanoi-food"
        inputMode="url"
        autoComplete="off"
      />
      <Input
        label="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Best Hanoi street food"
      />
      <Input
        label="Tags"
        value={tags}
        onChange={(e) => setTags(e.target.value)}
        placeholder="food, hanoi"
        hint="Comma separated."
      />

      <div className="flex flex-col gap-1">
        <label htmlFor="article-place" className="text-xs font-medium text-on-surface">
          Linked place
        </label>
        <select
          id="article-place"
          value={placeId}
          onChange={(e) => setPlaceId(e.target.value)}
          className="h-10 border-b border-outline-variant bg-transparent px-2 text-sm text-on-surface focus:border-b-2 focus:border-primary focus:outline-none"
        >
          <option value="">— none —</option>
          {places.map((p) => (
            <option key={p.id} value={p.id}>
              {placeLabel(p)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="article-notes" className="text-xs font-medium text-on-surface">
          Notes
        </label>
        <textarea
          id="article-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={6}
          placeholder="Why you saved it, what to try…"
          className="rounded-lg border border-outline-variant bg-transparent p-2 text-sm text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none"
        />
        <p className="text-xs text-on-surface-variant">
          Saved as the note body in your vault — Obsidian edits land here too.
        </p>
      </div>

      {error && <p className="text-sm text-error">{error}</p>}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {editing ? 'Save' : 'Add article'}
        </Button>
      </div>
    </form>
  );
}
