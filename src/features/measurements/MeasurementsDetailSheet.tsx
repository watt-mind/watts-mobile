/* Hallmark · genre: modern-minimal · design-system: docs/DESIGN.md · designed-as-app */
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';

import { MeasurementsSection } from '@/src/features/measurements/MeasurementsSection';

interface MeasurementsDetailSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function MeasurementsDetailSheet({ visible, onClose }: MeasurementsDetailSheetProps) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      {/* Backdrop is a sibling, not a parent: a Pressable ancestor of the ScrollView
          swallows drags that start on card content on Android (CW-620). */}
      <View className="flex-1 justify-end bg-black/60">
        <Pressable
          className="flex-1"
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        />
        <View className="rounded-t-3xl bg-surface px-6 pb-10 pt-4" style={{ maxHeight: '90%' }}>
          {/* Sheet Handle */}
          <View className="mb-4 h-1 w-10 self-center rounded-full bg-border-strong" />

          {/* Header */}
          <View className="mb-2 flex-row items-center justify-between">
            <View>
              <Text className="text-xl font-bold text-text-primary">Body Measurements</Text>
              <Text className="text-xs text-text-muted">Recorded metrics & history</Text>
            </View>
            <Pressable hitSlop={8} onPress={onClose} className="p-1 active:opacity-70">
              <Text className="text-base font-semibold text-text-muted">Close</Text>
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled">
            <MeasurementsSection />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
