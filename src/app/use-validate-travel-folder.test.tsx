// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

import { AppServicesProvider, type AppServices } from './context';
import { createMemoryKVStore } from './kv-store';
import { createMockTripsStore } from './trips-store';
import { useValidateTravelFolder } from './use-validate-travel-folder';
import { asFileId, DriveApiError, type DriveClient, type FileMetadata } from '@/sync/drive';

function stubDrive(getMetadata: DriveClient['getMetadata']): DriveClient {
  const reject = (): never => {
    throw new Error('not used');
  };
  return {
    getMetadata,
    getContent: reject,
    listFolder: reject,
    createFolder: reject,
    createFile: reject,
    updateFile: reject,
    pickFolder: reject,
    getChanges: reject,
    startChangeToken: reject,
  };
}

function renderValidate(opts: { travelFolderId?: string | null; drive?: DriveClient }) {
  const kv = createMemoryKVStore(
    opts.travelFolderId !== undefined ? { travel_folder_file_id: opts.travelFolderId } : {},
  );
  const services: AppServices = {
    kv,
    trips: createMockTripsStore(),
    ...(opts.drive ? { drive: opts.drive } : {}),
  };
  const view = renderHook(() => useValidateTravelFolder(), {
    wrapper: ({ children }) => (
      <AppServicesProvider services={services}>{children}</AppServicesProvider>
    ),
  });
  return { ...view, kv };
}

describe('useValidateTravelFolder', () => {
  it('drops a stale folder id and reports null when getMetadata 404s', async () => {
    const getMetadata = vi
      .fn<DriveClient['getMetadata']>()
      .mockRejectedValue(new DriveApiError('File not found: fld-000002', 404));
    const { result, kv } = renderValidate({
      travelFolderId: 'fld-000002',
      drive: stubDrive(getMetadata),
    });

    await waitFor(() => expect(result.current[0]).toBeNull());
    expect(getMetadata).toHaveBeenCalledWith(asFileId('fld-000002'));
    expect(await kv.get('travel_folder_file_id')).toBeNull();
  });

  it('keeps the folder id on a transient (non-404) error', async () => {
    const getMetadata = vi
      .fn<DriveClient['getMetadata']>()
      .mockRejectedValue(new DriveApiError('Service unavailable', 503));
    const { result, kv } = renderValidate({
      travelFolderId: 'fld_travel',
      drive: stubDrive(getMetadata),
    });

    await waitFor(() => expect(result.current[0]).toBe('fld_travel'));
    expect(await kv.get('travel_folder_file_id')).toBe('fld_travel');
  });

  it('keeps a folder id that validates successfully', async () => {
    const getMetadata = vi
      .fn<DriveClient['getMetadata']>()
      .mockResolvedValue({ id: asFileId('fld_travel') } as FileMetadata);
    const { result, kv } = renderValidate({
      travelFolderId: 'fld_travel',
      drive: stubDrive(getMetadata),
    });

    await waitFor(() => expect(result.current[0]).toBe('fld_travel'));
    expect(getMetadata).toHaveBeenCalledTimes(1);
    expect(await kv.get('travel_folder_file_id')).toBe('fld_travel');
  });

  it('skips validation when no Drive client is wired', async () => {
    const { result } = renderValidate({ travelFolderId: 'fld_travel' });
    await waitFor(() => expect(result.current[0]).toBe('fld_travel'));
  });

  it('reports null without calling Drive when no folder is stored', async () => {
    const getMetadata = vi.fn<DriveClient['getMetadata']>();
    const { result } = renderValidate({ travelFolderId: null, drive: stubDrive(getMetadata) });

    await waitFor(() => expect(result.current[0]).toBeNull());
    expect(getMetadata).not.toHaveBeenCalled();
  });
});
