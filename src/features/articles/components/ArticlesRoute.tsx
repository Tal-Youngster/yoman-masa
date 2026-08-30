import { useCallback, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus } from 'lucide-react';
import { Button, Card, Input, Sheet } from '@/ui/components';
import { useAppServices } from '@/app/use-app-services';
import { useActiveTrip } from '@/ui/layout/useActiveTrip';
import type { Article } from '@/domain/article';
import type { Place } from '@/domain/place';
import { placesByTrip } from '@/features/places/queries';
import { PlaceDetail } from '@/features/places/components/Detail';

import type { ArticleScope } from '../articles-admin';
import { collectTags, filterArticles, sortArticles } from '../filter';
import { ArticleDetail } from './ArticleDetail';
import { ArticleForm } from './ArticleForm';
import { ArticlesList } from './ArticlesList';

type DialogMode = 'none' | 'create' | 'edit' | 'view';
type ScopeKind = 'trip' | 'general';

const GENERAL_SCOPE: ArticleScope = { tripId: null, slug: null };

// Stable identities so the `?? []` fallback doesn't invalidate the memos below
// on every render while a live query is still resolving.
const NO_ARTICLES: Article[] = [];
const NO_PLACES: Place[] = [];

export function ArticlesRoute(): React.JSX.Element {
  const { articlesAdmin } = useAppServices();
  const { activeTrip, loading } = useActiveTrip();

  const [scopeKind, setScopeKind] = useState<ScopeKind>('trip');
  const [dialog, setDialog] = useState<DialogMode>('none');
  const [selected, setSelected] = useState<Article | null>(null);
  const [viewingPlace, setViewingPlace] = useState<Place | null>(null);
  const [query, setQuery] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);

  // No active trip → there's nothing but the General collection to show.
  const effectiveKind: ScopeKind = activeTrip ? scopeKind : 'general';
  const scope: ArticleScope = useMemo(
    () =>
      effectiveKind === 'trip' && activeTrip
        ? { tripId: activeTrip.id, slug: activeTrip.slug }
        : GENERAL_SCOPE,
    [effectiveKind, activeTrip],
  );

  // Subscribes to the `articles` table — covers local mutations and inbound
  // pulls without manual refresh-key bookkeeping.
  const articles =
    useLiveQuery<Article[]>(
      () => (articlesAdmin ? articlesAdmin.listByScope(scope) : Promise.resolve([])),
      [articlesAdmin, scope.tripId],
    ) ?? NO_ARTICLES;

  // Linked places come from the active trip regardless of scope: a General
  // article can point at a place the user saved on the trip they're viewing.
  const places =
    useLiveQuery<Place[]>(
      () => (activeTrip ? placesByTrip(activeTrip.id) : Promise.resolve([])),
      [activeTrip?.id],
    ) ?? NO_PLACES;

  const placesById = useMemo(() => new Map(places.map((p) => [p.id as string, p])), [places]);

  const tags = useMemo(() => collectTags(articles), [articles]);
  const visible = useMemo(
    () =>
      sortArticles(
        filterArticles(articles, {
          query,
          ...(activeTag ? { tags: [activeTag] } : {}),
        }),
      ),
    [articles, query, activeTag],
  );

  const openCreate = useCallback(() => {
    setSelected(null);
    setDialog('create');
  }, []);

  const openEdit = useCallback((a: Article) => {
    setSelected(a);
    setDialog('edit');
  }, []);

  const openView = useCallback((a: Article) => {
    setSelected(a);
    setDialog('view');
  }, []);

  const closeDialog = useCallback(() => {
    setDialog('none');
    setSelected(null);
  }, []);

  const handleDelete = useCallback(
    async (a: Article) => {
      if (!articlesAdmin) return;
      const confirmed = confirm(
        `Remove "${a.title}" from the app?\n\nThe note stays in your vault — delete it in Obsidian to remove it for good.`,
      );
      if (!confirmed) return;
      await articlesAdmin.removeArticle(a);
      closeDialog();
    },
    [articlesAdmin, closeDialog],
  );

  if (loading) {
    return <p className="text-sm text-on-surface-variant">Loading…</p>;
  }

  if (!articlesAdmin) {
    return (
      <Card title="Articles" description="Saved articles and notes.">
        <p className="text-sm text-on-surface-variant">Articles service is not configured.</p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-on-surface">Articles</h2>
          <p className="text-xs text-on-surface-variant">
            {effectiveKind === 'trip' && activeTrip
              ? `Links and notes saved for ${activeTrip.name}.`
              : 'Cross-trip General reading list.'}
          </p>
        </div>
        <Button onClick={openCreate} aria-label="New article">
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </div>

      {activeTrip && (
        <div className="mb-2 flex gap-6 border-b border-outline-variant text-sm">
          <button
            type="button"
            onClick={() => setScopeKind('trip')}
            className={`border-b-2 px-1 pb-2 transition-colors ${
              effectiveKind === 'trip'
                ? 'border-primary font-medium text-primary'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {activeTrip.name}
          </button>
          <button
            type="button"
            onClick={() => setScopeKind('general')}
            className={`border-b-2 px-1 pb-2 transition-colors ${
              effectiveKind === 'general'
                ? 'border-primary font-medium text-primary'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            General
          </button>
        </div>
      )}

      <Input
        aria-label="Search articles"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by title, tag or site"
        type="search"
      />

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.map((t) => {
            const on = activeTag === t;
            return (
              <button
                key={t}
                type="button"
                aria-pressed={on}
                onClick={() => setActiveTag(on ? null : t)}
                className={`rounded-full px-2 py-0.5 text-xs transition-colors ${
                  on
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
                }`}
              >
                #{t}
              </button>
            );
          })}
        </div>
      )}

      <ArticlesList
        articles={visible}
        placesById={placesById}
        filtered={articles.length > 0 && visible.length === 0}
        onOpen={openView}
        onEdit={openEdit}
        onDelete={(a) => void handleDelete(a)}
      />

      <Sheet
        open={dialog !== 'none'}
        onClose={closeDialog}
        side="bottom"
        title={
          dialog === 'view'
            ? (selected?.title ?? 'Article')
            : dialog === 'edit'
              ? 'Edit article'
              : 'New article'
        }
      >
        {(dialog === 'create' || dialog === 'edit') && (
          <ArticleForm
            scope={scope}
            admin={articlesAdmin}
            places={places}
            {...(dialog === 'edit' && selected ? { article: selected } : {})}
            onSuccess={closeDialog}
            onCancel={closeDialog}
          />
        )}
        {dialog === 'view' && selected && (
          <ArticleDetail
            article={selected}
            place={selected.place_id ? placesById.get(selected.place_id) : undefined}
            onOpenPlace={setViewingPlace}
          />
        )}
      </Sheet>

      <Sheet
        open={viewingPlace !== null}
        onClose={() => setViewingPlace(null)}
        side="bottom"
        title={viewingPlace?.place_alias || 'Place'}
      >
        {viewingPlace && <PlaceDetail place={viewingPlace} />}
      </Sheet>
    </div>
  );
}
