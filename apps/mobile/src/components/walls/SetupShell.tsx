import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, type as t, spacing, components } from '@weatherteam6/design/tokens'
import type { ReactNode } from 'react'

type Props = {
  step: number
  total: number
  question: string
  hint?: string
  onCancel: () => void
  onContinue: () => void
  continueLabel?: string
  continueDisabled?: boolean
  footerOverride?: ReactNode
  children: ReactNode
}

export function SetupShell({
  step,
  total,
  question,
  hint,
  onCancel,
  onContinue,
  continueLabel = 'Continue',
  continueDisabled = false,
  footerOverride,
  children,
}: Props) {
  const insets = useSafeAreaInsets()

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.head, { paddingTop: insets.top + 14 }]}>
        <Pressable style={styles.cancelBtn} onPress={onCancel} hitSlop={12}>
          <Text style={styles.cancelText}>✕  Cancel</Text>
        </Pressable>
        <Text style={styles.stepLabel}>
          Step <Text style={styles.stepNum}>{step}</Text> / {total}
        </Text>
      </View>

      {/* Step bar */}
      <View style={styles.stepbar}>
        {Array.from({ length: total }, (_, i) => (
          <View
            key={i}
            style={[
              components.stepBarInactive,
              i + 1 < step && components.stepBarDone,
              i + 1 === step && components.stepBarCurrent,
            ]}
          />
        ))}
      </View>

      {/* Scrollable body */}
      <ScrollView
        style={styles.bodyScroll}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.question}>{question}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
        {children}
        <View style={{ height: 16 }} />
      </ScrollView>

      {/* Sticky footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        {footerOverride ?? (
          <Pressable
            style={[components.btnPrimary, styles.footerBtn, continueDisabled && styles.footerBtnDisabled]}
            onPress={onContinue}
            disabled={continueDisabled}
          >
            <Text style={[components.btnPrimaryText, continueDisabled && styles.footerBtnTextDisabled]}>
              {continueLabel}  ›
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgGradientBottom,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.screenH,
    flexShrink: 0,
  },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  cancelText: {
    fontFamily: 'BarlowCondensed',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.txt3,
  },
  stepLabel: {
    fontFamily: 'BarlowCondensed',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: colors.txt4,
  },
  stepNum: {
    color: colors.good,
  },
  stepbar: {
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: spacing.screenH,
    paddingTop: 14,
    flexShrink: 0,
  },
  bodyScroll: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: spacing.screenH,
    paddingTop: spacing.setupBodyTop,
    paddingBottom: 8,
  },
  question: {
    ...t.setupQuestion,
  },
  hint: {
    ...t.bodyMd,
    marginTop: 7,
  },
  footer: {
    flexShrink: 0,
    paddingHorizontal: spacing.screenH,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: 'rgba(10,12,16,0.5)',
  },
  footerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  footerBtnDisabled: {
    opacity: 0.4,
  },
  footerBtnTextDisabled: {
    color: colors.onGood,
  },
})
