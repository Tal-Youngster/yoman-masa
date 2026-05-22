/**
 * Google Picker SDK wrapper (ADR-0003 — first-run folder picker).
 *
 * The Picker SDK is browser-only and loaded lazily. This module exposes a thin
 * `openFolderPicker` that resolves to a {@link FolderPick}. Path resolution
 * walks the parent chain via the Drive REST API — the caller passes in a
 * resolver because we don't want a circular import with the client.
 */

import type { FileId, FolderPick } from './types.js';
import { asFileId } from './types.js';
import type {} from './google-globals.js';

export interface PickerOptions {
  /** OAuth access token (from {@link DriveAuth.getAccessToken}). */
  accessToken: string;
  /** Picker developer key (Google Cloud → APIs & Services → Credentials). */
  developerKey: string;
  /**
   * Resolves the path of a folder id (root → folder), returning a slash-joined string.
   * Provided by the caller — typically composed of `files.get(id, fields=name,parents)` calls.
   */
  resolvePath: (id: FileId) => Promise<string>;
}

const PICKER_SCRIPT = 'https://apis.google.com/js/api.js';

async function ensurePickerLoaded(): Promise<void> {
  if (typeof window === 'undefined') {
    throw new Error('Picker SDK unavailable outside browser context');
  }
  if (window.google?.picker) return;
  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${PICKER_SCRIPT}"]`);
    const onLoad = (): void => {
      window.gapi?.load('picker', () => resolve());
    };
    if (existing) {
      existing.addEventListener('load', onLoad, { once: true });
      existing.addEventListener('error', () => reject(new Error('gapi load failed')), {
        once: true,
      });
      return;
    }
    const script = document.createElement('script');
    script.src = PICKER_SCRIPT;
    script.async = true;
    script.defer = true;
    script.addEventListener('load', onLoad, { once: true });
    script.addEventListener('error', () => reject(new Error('gapi load failed')), {
      once: true,
    });
    document.head.appendChild(script);
  });
}

/** Open the Picker and resolve with the selected folder. */
export async function openFolderPicker(opts: PickerOptions): Promise<FolderPick> {
  await ensurePickerLoaded();
  const ns = window.google?.picker;
  if (!ns) throw new Error('Google Picker namespace not present');
  const view = new ns.DocsView(ns.ViewId.FOLDERS)
    .setIncludeFolders(true)
    .setSelectFolderEnabled(true)
    .setMimeTypes('application/vnd.google-apps.folder');

  return new Promise<FolderPick>((resolve, reject) => {
    const picker = new ns.PickerBuilder()
      .addView(view)
      .setOAuthToken(opts.accessToken)
      .setDeveloperKey(opts.developerKey)
      .setCallback((data) => {
        if (data.action === ns.Action.CANCEL) {
          reject(new Error('Folder picker cancelled'));
          return;
        }
        if (data.action !== ns.Action.PICKED) return;
        const picked = data.docs?.[0];
        if (!picked) {
          reject(new Error('Picker returned no document'));
          return;
        }
        const id = asFileId(picked.id);
        opts
          .resolvePath(id)
          .then((path) => resolve({ id, name: picked.name, path }))
          .catch(reject);
      })
      .build();
    picker.setVisible(true);
  });
}
