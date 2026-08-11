import { useEffect, useSyncExternalStore } from 'react';

import {
  getSyncDiagnosticSync,
  loadSyncDiagnostic,
  subscribeSyncDiagnostic,
} from './syncDiagnostics';

export function useSyncDiagnostic() {
  const diagnostic = useSyncExternalStore(
    subscribeSyncDiagnostic,
    getSyncDiagnosticSync,
    getSyncDiagnosticSync,
  );

  useEffect(() => {
    void loadSyncDiagnostic();
  }, []);

  return diagnostic;
}
