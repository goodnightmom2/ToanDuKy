/**
 * Google Drive Picker + OAuth (drive.readonly) client-side service.
 * - Reads Client ID & API Key strictly from Admin Settings (NEVER hard-coded).
 * - Stores OAuth access token strictly in memory (NEVER in localStorage/sessionStorage).
 * - Supports selecting either individual files OR an entire Google Drive folder.
 */

export const DRIVE_READONLY_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';

export interface DrivePickedItem {
  id: string;
  name: string;
  mimeType: string;
  isFolder: boolean;
  sizeBytes?: number;
}

// Strictly in-memory token store (cleared on sign-out or page reload)
let memoryAccessToken: string | null = null;
let memoryTokenExpiresAt = 0;

export function clearDriveToken(): void {
  memoryAccessToken = null;
  memoryTokenExpiresAt = 0;
}

export function hasActiveDriveToken(): boolean {
  return Boolean(memoryAccessToken && Date.now() < memoryTokenExpiresAt - 15_000);
}

export function getActiveDriveToken(): string | null {
  return hasActiveDriveToken() ? memoryAccessToken : null;
}

function loadScriptOnce(src: string, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(id) as HTMLScriptElement | null;
    if (existing) {
      if (existing.dataset.loaded === '1') {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), {once: true});
      existing.addEventListener('error', () => reject(new Error(`Không tải được ${src}`)), {once: true});
      return;
    }
    const script = document.createElement('script');
    script.id = id;
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      script.dataset.loaded = '1';
      resolve();
    };
    script.onerror = () => reject(new Error(`Không tải được thư viện Google (${src}).`));
    document.head.appendChild(script);
  });
}

interface GoogleGlobals {
  google?: {
    accounts?: {
      oauth2?: {
        initTokenClient: (cfg: {
          client_id: string;
          scope: string;
          callback: (resp: {access_token?: string; expires_in?: number; error?: string; error_description?: string}) => void;
          error_callback?: (err: {type?: string; message?: string}) => void;
        }) => {requestAccessToken: (opts?: {prompt?: string}) => void};
      };
    };
    picker?: {
      ViewId: {DOCS: unknown; FOLDERS: unknown};
      Action: {PICKED: string; CANCEL: string};
      Feature: {SUPPORT_DRIVES: unknown};
      DocsView: new (viewId?: unknown) => {
        setIncludeFolders: (v: boolean) => unknown;
        setSelectFolderEnabled: (v: boolean) => unknown;
        setMimeTypes: (m: string) => unknown;
      };
      PickerBuilder: new () => {
        addView: (v: unknown) => unknown;
        setOAuthToken: (t: string) => unknown;
        setDeveloperKey: (k: string) => unknown;
        setOrigin: (o: string) => unknown;
        setTitle: (t: string) => unknown;
        setCallback: (cb: (data: {action: string; docs?: Array<{id: string; name: string; mimeType: string; sizeBytes?: number}>}) => void) => unknown;
        build: () => {setVisible: (v: boolean) => void};
      };
    };
  };
  gapi?: {
    load: (name: string, opts: {callback: () => void; onerror?: () => void}) => void;
  };
}

/**
 * Requests a short-lived Google OAuth access token with `drive.readonly` scope.
 */
export async function requestDriveAccessToken(clientId: string): Promise<string> {
  if (hasActiveDriveToken() && memoryAccessToken) {
    return memoryAccessToken;
  }
  const cleanClientId = clientId.trim();
  if (!cleanClientId) {
    throw new Error('Chưa cấu hình Google OAuth Client ID trong Cài đặt Quản trị.');
  }

  await loadScriptOnce('https://accounts.google.com/gsi/client', 'google-gsi-client');
  const win = window as unknown as GoogleGlobals;
  if (!win.google?.accounts?.oauth2?.initTokenClient) {
    throw new Error('Google Identity Services chưa sẵn sàng trên trình duyệt này.');
  }

  return new Promise<string>((resolve, reject) => {
    const tokenClient = win.google!.accounts!.oauth2!.initTokenClient({
      client_id: cleanClientId,
      scope: DRIVE_READONLY_SCOPE,
      callback: (resp) => {
        if (resp.error || !resp.access_token) {
          reject(new Error(resp.error_description || resp.error || 'Chưa được cấp quyền đọc Google Drive.'));
          return;
        }
        memoryAccessToken = resp.access_token;
        memoryTokenExpiresAt = Date.now() + (resp.expires_in ?? 3500) * 1000;
        resolve(resp.access_token);
      },
      error_callback: (err) => {
        reject(new Error(err.message || 'Cửa sổ đăng nhập Google đã bị đóng hoặc bị chặn popup.'));
      },
    });
    tokenClient.requestAccessToken({prompt: ''});
  });
}

/**
 * Opens Google Picker allowing selection of either a supported file (.docx, .json, .txt)
 * OR a Google Drive folder.
 */
export async function openGoogleDrivePicker(params: {
  clientId: string;
  apiKey: string;
}): Promise<{items: DrivePickedItem[]; accessToken: string}> {
  const accessToken = await requestDriveAccessToken(params.clientId);

  await loadScriptOnce('https://apis.google.com/js/api.js', 'google-gapi-client');
  const win = window as unknown as GoogleGlobals;
  if (!win.gapi?.load) {
    throw new Error('Không tải được Google Picker API (gapi).');
  }

  await new Promise<void>((resolve, reject) => {
    win.gapi!.load('picker', {
      callback: () => resolve(),
      onerror: () => reject(new Error('Không khởi tạo được Google Picker.')),
    });
  });

  if (!win.google?.picker) {
    throw new Error('Thư viện google.picker chưa sẵn sàng.');
  }

  const pickerOrigin =
    window.location.ancestorOrigins && window.location.ancestorOrigins.length > 0
      ? window.location.ancestorOrigins[window.location.ancestorOrigins.length - 1]
      : window.location.origin;

  return new Promise((resolve, reject) => {
    const pickerApi = win.google!.picker!;
    const docsView = new pickerApi.DocsView(pickerApi.ViewId.DOCS);
    docsView.setIncludeFolders(true);
    docsView.setSelectFolderEnabled(true);
    docsView.setMimeTypes(
      [
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/json',
        'text/plain',
        'application/vnd.google-apps.folder',
      ].join(','),
    );

    const builder = new pickerApi.PickerBuilder();
    builder.addView(docsView);
    builder.setOAuthToken(accessToken);
    if (params.apiKey.trim()) {
      builder.setDeveloperKey(params.apiKey.trim());
    }
    builder.setOrigin(pickerOrigin);
    builder.setTitle('Chọn tệp học liệu (.docx, .json, .txt — tối đa 5 câu/tệp) hoặc thư mục trên Google Drive');
    builder.setCallback((data) => {
      if (data.action === pickerApi.Action.PICKED) {
        const docs = (data.docs ?? []).map((d) => ({
          id: d.id,
          name: d.name,
          mimeType: d.mimeType,
          isFolder: d.mimeType === 'application/vnd.google-apps.folder',
          sizeBytes: d.sizeBytes,
        }));
        resolve({items: docs, accessToken});
      } else if (data.action === pickerApi.Action.CANCEL) {
        resolve({items: [], accessToken});
      }
    });

    try {
      const picker = builder.build();
      picker.setVisible(true);
    } catch (err) {
      reject(err instanceof Error ? err : new Error('Không mở được cửa sổ Google Picker.'));
    }
  });
}

/**
 * Lists supported material files (.docx, .json, .txt) inside a selected Google Drive folder.
 */
export async function listSupportedFilesInFolder(
  folderId: string,
  accessToken: string,
): Promise<DrivePickedItem[]> {
  const safeId = folderId.replace(/'/g, '');
  const q = `'${safeId}' in parents and trashed = false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent('files(id,name,mimeType,size)')}&pageSize=50`;
  const resp = await fetch(url, {
    headers: {Authorization: `Bearer ${accessToken}`},
  });
  if (!resp.ok) {
    throw new Error(`Không đọc được danh sách tệp trong thư mục Drive (HTTP ${resp.status}).`);
  }
  const data = (await resp.json()) as {
    files?: Array<{id: string; name: string; mimeType: string; size?: string}>;
  };
  const supportedExts = ['.docx', '.json', '.txt'];
  return (data.files ?? [])
    .filter((f) => {
      const lower = f.name.toLowerCase();
      return supportedExts.some((ext) => lower.endsWith(ext));
    })
    .map((f) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      isFolder: false,
      sizeBytes: f.size ? Number(f.size) : undefined,
    }));
}

/**
 * Downloads file bytes directly from Google Drive using the in-memory OAuth token.
 */
export async function downloadDriveFileArrayBuffer(
  fileId: string,
  accessToken: string,
): Promise<ArrayBuffer> {
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`;
  const resp = await fetch(url, {
    headers: {Authorization: `Bearer ${accessToken}`},
  });
  if (!resp.ok) {
    throw new Error(`Không tải được nội dung tệp từ Google Drive (HTTP ${resp.status}).`);
  }
  return resp.arrayBuffer();
}
