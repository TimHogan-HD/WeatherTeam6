import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, spacing, type as t } from '@weatherteam6/design/tokens'

type Props = {
  title: string
  subtitle?: string
  showBack?: boolean
  onBack?: () => void
  rightElement?: React.ReactNode
}

export function TopBar({ title, subtitle, showBack, onBack, rightElement }: Props) {
  return (
    <View style={styles.bar}>
      <View style={styles.left}>
        {showBack ? (
          <Pressable onPress={onBack} hitSlop={12} style={styles.backBtn}>
            <Text style={styles.backChevron}>‹</Text>
            <Text style={styles.backLabel}>Locations</Text>
          </Pressable>
        ) : (
          <View style={styles.titleRow}>
            <View style={styles.dot} />
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
          </View>
        )}
        {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {rightElement ? <View style={styles.right}>{rightElement}</View> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.screenH,
    paddingVertical: 12,
  },
  left: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.inlineGap,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.good,
  },
  title: {
    ...t.navTitle,
  },
  subtitle: {
    ...t.screenSub,
    marginTop: 2,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  backChevron: {
    fontSize: 22,
    color: colors.txt1,
    lineHeight: 24,
  },
  backLabel: {
    ...t.navLabel,
  },
  right: {
    marginLeft: 12,
  },
})
