import { ExternalLink, MapPin } from 'lucide-react';
import type { Article } from '@/domain/article';
import type { Place } from '@/domain/place';
import { urlHost } from '../filter';

export interface ArticleDetailProps {
  article: Article;
  /**
   * The linked place, or `undefined` when `place_id` is set but no longer
   * resolves — deleted in the app, or removed from the vault in Obsidian.
   */
  place: Place | undefined;
  onOpenPlace: (place: Place) => void;
}

export function ArticleDetail({
  article,
  place,
  onOpenPlace,
}: ArticleDetailProps): React.JSX.Element {
  const host = urlHost(article.url);

  return (
    <div className="flex flex-col gap-4 py-2">
      <div>
        <h3 className="text-base font-semibold text-on-surface">{article.title}</h3>
        {host && <p className="text-xs text-on-surface-variant">{host}</p>}
      </div>

      <a
        href={article.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex w-fit items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-on-primary shadow-soft transition-opacity hover:opacity-90"
      >
        <ExternalLink className="h-4 w-4" />
        Open article
      </a>

      {article.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {article.tags.map((t) => (
            <span
              key={t}
              className="rounded-full bg-surface-container px-2 py-0.5 text-xs text-on-surface-variant"
            >
              #{t}
            </span>
          ))}
        </div>
      )}

      {article.place_id !== null &&
        (place ? (
          <button
            type="button"
            onClick={() => onOpenPlace(place)}
            className="inline-flex w-fit items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-sm text-primary transition-colors hover:bg-primary/20"
          >
            <MapPin className="h-4 w-4" />
            {place.place_alias || place.place_id}
          </button>
        ) : (
          <p className="inline-flex w-fit items-center gap-1 rounded-full bg-surface-container px-3 py-1 text-sm text-on-surface-variant">
            <MapPin className="h-4 w-4" />
            Linked place no longer exists
          </p>
        ))}

      {article.notes.trim() !== '' && (
        <div>
          <p className="mb-1 text-xs font-medium text-on-surface">Notes</p>
          <p className="whitespace-pre-wrap text-sm text-on-surface-variant">{article.notes}</p>
        </div>
      )}
    </div>
  );
}
