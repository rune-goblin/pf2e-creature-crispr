export type FilePickerType = 'image' | 'audio' | 'video' | 'imagevideo' | 'text' | 'any';

export interface PickFileOptions {
  type?: FilePickerType;
  current?: string;
  activeSource?: string;
  displayMode?: string;
  redirectToRoot?: string[];
}

// The promise only settles on selection — cancelling leaves it unresolved, matching
// the underlying FilePicker callback API (which has no cancel signal).
export function pickFile(options: PickFileOptions = {}): Promise<string> {
  const FilePickerCls = foundry.applications.apps.FilePicker?.implementation;
  if (!FilePickerCls) return Promise.reject(new Error('FilePicker is not available'));
  return new Promise<string>((resolve) => {
    const config: Record<string, unknown> = {
      type: options.type ?? 'image',
      current: options.current ?? '',
      callback: (path: string) => resolve(path)
    };
    if (options.activeSource !== undefined) config.activeSource = options.activeSource;
    if (options.displayMode !== undefined) config.displayMode = options.displayMode;
    if (options.redirectToRoot !== undefined) config.redirectToRoot = options.redirectToRoot;
    new FilePickerCls(config).browse();
  });
}
