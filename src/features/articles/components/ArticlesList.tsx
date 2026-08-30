import { BookOpen, MapPin, Pencil, Trash2 } from 'lucide-react';
import { EmptyState } from '@/ui/components';
import type { Article } from '@/domain/article';
import type { Place } from '@/domain/place';
import { urlHost } from '../filter';

export interface ArticlesListProps {
  articles: readonly Article[];
  /** Places of the active trip, keyed by id, for the "linked place" chip. */
  placesById: ReadonlyMap<string, Place>;
  /** True when the list is empty only because of an active search / tag filter. */
  filtered: boolean;
  onOpen: (a: Article) => void;
  onEdit: (a: Article) => void;
  onDelete: (a: Article) => void;
}

export function ArticlesList({
  articles,
  placesById,
  filtered,
  onOpen,
  onEdit,
  onDelete,
}: ArticlesListProps): React.JSX.Element {
  if (articles.length === 0) {
    return (
      <EmptyState
        icon={<BookOpen className="h-7 w-7" />}
        title={filtered ? 'Nothing matches' : 'No saved articles'}
        description={
          filtered
            ? 'Try a different search, or clear the tag filter.'
            : 'Save a link with your notes and it becomes a note in your vault.'
        }
      />
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {articles.map((a) => {
        const place = a.place_id ? placesById.get(a.place_id) : undefined;
        const host = urlHost(a.url);
        return (
          <li
            key={a.id}
            className="rounded-xl border border-outline-variant bg-surface-container-low p-3"
          >
            <div className="flex items-start justify-between gap-2">
              <button
                type="button"
                onClick={() => onOpen(a)}
                className="min-w-0 flex-1 text-left"
              >
                <p className="truncate text-sm font-medium text-on-surface">{a.title}</p>
                {host && <p className="truncate text-xs text-on-surface-variant">{host}</p>}
              </button>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  onClick={() => onEdit(a)}
                  aria-label={`Edit ${a.title}`}
                  className="rounded-md p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(a)}
                  aria-label={`Delete ${a.title}`}
                  className="rounded-md p-1.5 text-error transition-colors hover:bg-error/10"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            {(a.tags.length > 0 || place) && (
              <div className="mt-2 flex flex-wrap items-center gap-1">
                {place && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                    <MapPin className="h-3 w-3" />
                    {place.place_alias || place.place_id}
                  </span>
                )}
                {a.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-full bg-surface-container px-2 py-0.5 text-xs text-on-surface-variant"
                  >
                    #{t}
                  </span>
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
