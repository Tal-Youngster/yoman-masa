/**
 * Shared global typings for the GIS + Picker browser SDKs.
 *
 * Kept in a single module so that `Window.google` is declared once. Both
 * `auth.ts` and `picker.ts` import from here.
 */

export interface GisTokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

export interface GisTokenClient {
  requestAccessToken(opts?: { prompt?: string; hint?: string }): void;
  callback: (resp: GisTokenResponse) => void;
}

export interface GisOauth2Namespace {
  initTokenClient(opts: {
    client_id: string;
    scope: string;
    callback: (resp: GisTokenResponse) => void;
    prompt?: string;
  }): GisTokenClient;
}

export interface GoogleDocsView {
  setIncludeFolders(b: boolean): GoogleDocsView;
  setSelectFolderEnabled(b: boolean): GoogleDocsView;
  setMimeTypes(types: string): GoogleDocsView;
}

export interface GooglePickerCallbackData {
  action: string;
  docs?: { id: string; name: string }[];
}

export interface GooglePickerBuilder {
  addView(view: GoogleDocsView): GooglePickerBuilder;
  setOAuthToken(token: string): GooglePickerBuilder;
  setDeveloperKey(key: string): GooglePickerBuilder;
  setCallback(cb: (data: GooglePickerCallbackData) => void): GooglePickerBuilder;
  build(): { setVisible(b: boolean): void };
}

export interface GooglePickerNamespace {
  PickerBuilder: new () => GooglePickerBuilder;
  ViewId: { FOLDERS: unknown };
  DocsView: new (viewId: unknown) => GoogleDocsView;
  Action: { PICKED: string; CANCEL: string };
  Response: { ACTION: string; DOCUMENTS: string };
}

declare global {
  interface Window {
    gapi?: {
      load(name: string, cb: () => void): void;
    };
    google?: {
      accounts?: {
        oauth2?: GisOauth2Namespace;
      };
      picker?: GooglePickerNamespace;
    };
  }
}
