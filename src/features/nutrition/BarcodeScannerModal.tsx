/* Hallmark · genre: modern-minimal · design-system: docs/DESIGN.md */
import { useRef, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';

import { AppSymbol } from '@/src/components/AppSymbol';
import { Button } from '@/src/components/Button';
import { Spinner } from '@/src/components/Spinner';
import { lookupFoodBarcode, type FoodItemResult } from './api';
import { hapticError, hapticLight, hapticSuccess } from '@/src/lib/haptics';
import { useThemeColors } from '@/src/theme/useThemeColors';

// Safe native module access — avoids Metro runtime crashes when running an un-linked dev client binary
let ExpoCameraModule: typeof import('expo-camera') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ExpoCameraModule = require('expo-camera');
} catch {
  ExpoCameraModule = null;
}

const useCameraPermissionsHook =
  ExpoCameraModule?.useCameraPermissions ??
  function useFallbackPermissions(): [any, () => Promise<any>] {
    return [null, async () => ({ granted: false, status: 'denied' })];
  };

export interface BarcodeScannerModalProps {
  visible: boolean;
  onClose: () => void;
  /**
   * Reports a scanned item. The scanner does not close itself — the parent decides when,
   * so it can wait for `onDismissed` before presenting another modal.
   */
  onSelectFoodItem: (item: FoodItemResult) => void;
  /** Fires once the modal has finished dismissing. iOS only (RN Modal.onDismiss). */
  onDismissed?: () => void;
}

function NativeScannerContent({
  onClose,
  onSelectFoodItem,
}: {
  onClose: () => void;
  onSelectFoodItem: (item: FoodItemResult) => void;
}) {
  const theme = useThemeColors();

  const [permission, requestPermission] = useCameraPermissionsHook();

  const [isSearching, setIsSearching] = useState(false);
  const [notFoundBarcode, setNotFoundBarcode] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const isHandlingRef = useRef(false);

  const CameraView = ExpoCameraModule?.CameraView;

  const handleBarcodeScanned = async (event: { data: string; type: string }) => {
    const rawBarcode = event.data?.trim();
    if (!rawBarcode || isHandlingRef.current || isSearching) return;

    isHandlingRef.current = true;
    setIsSearching(true);
    setNotFoundBarcode(null);
    setErrorMsg(null);

    try {
      const item = await lookupFoodBarcode(rawBarcode);
      if (item) {
        hapticSuccess();
        // The parent closes the scanner and sequences the next modal — closing here would
        // present the portion calculator while this one is still dismissing.
        onSelectFoodItem(item);
      } else {
        hapticError();
        setNotFoundBarcode(rawBarcode);
      }
    } catch (err) {
      hapticError();
      setErrorMsg(err instanceof Error ? err.message : 'Failed to lookup barcode');
    } finally {
      setIsSearching(false);
      setTimeout(() => {
        isHandlingRef.current = false;
      }, 1500);
    }
  };

  const handleRescan = () => {
    hapticLight();
    setNotFoundBarcode(null);
    setErrorMsg(null);
    isHandlingRef.current = false;
  };

  if (!CameraView) return null;

  return (
    <View testID="barcode-scanner-modal" className="flex-1 bg-black">
      {!permission?.granted ? (
        <View className="flex-1 items-center justify-center bg-surface px-6">
          <View className="mb-4 h-16 w-16 items-center justify-center rounded-full border border-border bg-card">
            <AppSymbol sf="camera.fill" size={28} tintColor={theme.brandOnSurface} fallback="📷" />
          </View>
          <Text className="text-center text-xl font-bold text-text-primary">
            Camera Access Required
          </Text>
          <Text className="mt-2 max-w-xs text-center text-sm leading-5 text-text-muted">
            Coach Watts uses your camera to scan food package barcodes for instant nutrition
            logging.
          </Text>

          <View className="mt-8 w-full max-w-xs gap-3">
            <Button label="Grant Camera Permission" onPress={() => void requestPermission()} />
            <Button
              label="Cancel"
              variant="secondary"
              testID="barcode-scanner-close"
              onPress={onClose}
            />
          </View>
        </View>
      ) : (
        <CameraView
          style={{ flex: 1 }}
          facing="back"
          barcodeScannerSettings={{
            barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'qr'],
          }}
          onBarcodeScanned={
            isSearching || notFoundBarcode || errorMsg ? undefined : handleBarcodeScanned
          }
        >
          {/* Header overlay */}
          <View className="flex-row items-center justify-between bg-black/50 px-6 pb-4 pt-14">
            <View className="flex-1 pr-3">
              <Text className="text-lg font-bold" style={{ color: '#ffffff' }}>
                Scan Barcode
              </Text>
              <Text className="text-xs" style={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                Align the food barcode inside the frame
              </Text>
            </View>
            <Pressable
              testID="barcode-scanner-close"
              accessibilityRole="button"
              accessibilityLabel="Close scanner"
              onPress={onClose}
              className="h-9 w-9 items-center justify-center rounded-full bg-white/20 active:opacity-70"
            >
              <AppSymbol sf="xmark" size={18} tintColor="#FFFFFF" fallback="✕" />
            </Pressable>
          </View>

          {/* Viewfinder Target Frame */}
          <View className="flex-1 items-center justify-center px-8">
            <View className="relative h-56 w-full max-w-xs overflow-hidden rounded-2xl border-2 border-brand/80 bg-transparent">
              {/* Corner markers */}
              <View className="absolute left-0 top-0 h-6 w-6 border-l-4 border-t-4 border-brand" />
              <View className="absolute right-0 top-0 h-6 w-6 border-r-4 border-t-4 border-brand" />
              <View className="absolute bottom-0 left-0 h-6 w-6 border-b-4 border-l-4 border-brand" />
              <View className="absolute bottom-0 right-0 h-6 w-6 border-b-4 border-r-4 border-brand" />

              {/* Laser scan line indicator */}
              <View className="absolute left-4 right-4 top-1/2 h-0.5 bg-brand opacity-80" />
            </View>

            {/* Status Banner */}
            {isSearching ? (
              <View className="mt-6 flex-row items-center gap-2 rounded-xl bg-black/80 px-4 py-2.5">
                <Spinner size="small" />
                <Text className="text-sm font-medium" style={{ color: '#ffffff' }}>
                  Looking up barcode...
                </Text>
              </View>
            ) : notFoundBarcode ? (
              <View className="mt-6 w-full max-w-xs items-center rounded-xl border border-danger/40 bg-card p-4">
                <Text className="text-sm font-bold text-danger">Barcode Not Found</Text>
                <Text className="mt-1 text-center text-xs text-text-muted">
                  Barcode {notFoundBarcode} is not in our global database yet.
                </Text>
                <View className="mt-3 flex-row gap-2">
                  <Button label="Try Scanning Again" onPress={handleRescan} />
                </View>
              </View>
            ) : errorMsg ? (
              <View className="mt-6 w-full max-w-xs items-center rounded-xl border border-danger/40 bg-card p-4">
                <Text className="text-sm font-bold text-danger">Scanner Error</Text>
                <Text className="mt-1 text-center text-xs text-text-muted">{errorMsg}</Text>
                <Button label="Retry" className="mt-3" onPress={handleRescan} />
              </View>
            ) : (
              <Text
                className="mt-6 rounded-full bg-black/60 px-4 py-2 text-center text-xs font-medium"
                style={{ color: 'rgba(255, 255, 255, 0.8)' }}
              >
                Position camera over product barcode
              </Text>
            )}
          </View>

          {/* Bottom Actions */}
          <View className="items-center bg-black/50 px-6 pb-12 pt-4">
            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              className="rounded-full bg-white/20 px-4 py-2 active:opacity-70"
            >
              <Text className="text-sm font-semibold" style={{ color: '#ffffff' }}>
                Cancel & Search Manually
              </Text>
            </Pressable>
          </View>
        </CameraView>
      )}
    </View>
  );
}

export function BarcodeScannerModal({
  visible,
  onClose,
  onSelectFoodItem,
  onDismissed,
}: BarcodeScannerModalProps) {
  const theme = useThemeColors();

  const hasNativeModule = Boolean(ExpoCameraModule?.CameraView);

  // Deliberately not `if (!visible) return null`: RN keeps the Modal mounted through its
  // dismissal animation so onDismiss can fire, and unmounting here would cut that short.
  // The camera itself is gated on `visible` below so it still tears down on close.
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      onDismiss={onDismissed}
    >
      {!hasNativeModule ? (
        <View
          testID="barcode-scanner-modal"
          className="flex-1 items-center justify-center bg-surface px-6"
        >
          <View className="mb-4 h-16 w-16 items-center justify-center rounded-full border border-border bg-card">
            <AppSymbol sf="camera.fill" size={28} tintColor={theme.brandOnSurface} fallback="📷" />
          </View>
          <Text className="text-center text-xl font-bold text-text-primary">
            Rebuild Dev Client Required
          </Text>
          <Text className="mt-2 max-w-xs text-center text-sm leading-5 text-text-muted">
            The native module &apos;ExpoCamera&apos; is not linked in your running dev client
            binary. Run <Text className="font-mono text-brand">pnpm ios</Text> or{' '}
            <Text className="font-mono text-brand">pnpm android</Text> to compile camera support
            into the app.
          </Text>

          <View className="mt-8 w-full max-w-xs">
            <Button
              label="Dismiss & Search Manually"
              testID="barcode-scanner-close"
              onPress={onClose}
            />
          </View>
        </View>
      ) : visible ? (
        <NativeScannerContent onClose={onClose} onSelectFoodItem={onSelectFoodItem} />
      ) : null}
    </Modal>
  );
}
