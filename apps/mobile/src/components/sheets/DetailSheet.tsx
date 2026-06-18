import { useEffect, useState } from 'react'
import { Animated, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { colors, radius, spacing, type as t } from '@weatherteam6/design/tokens'

type Props = {
  visible: boolean
  title: string
  onDismiss: () => void
  children: React.ReactNode
}

export function DetailSheet({ visible, title, onDismiss, children }: Props) {
  const [slideAnim] = useState(() => new Animated.Value(visible ? 0 : 500))
  // Keep modal mounted during close animation; starts open when visible=true
  const [keepMounted, setKeepMounted] = useState(visible)
  // Combined: open immediately when visible becomes true; close after animation
  const modalVisible = visible || keepMounted

  useEffect(() => {
    const anim = Animated.timing(slideAnim, {
      toValue: visible ? 0 : 500,
      duration: visible ? 280 : 240,
      useNativeDriver: true,
    })
    anim.start(({ finished }) => {
      if (finished) {
        setKeepMounted(visible)
      }
    })
    return () => anim.stop()
  }, [visible, slideAnim])

  return (
    <Modal visible={modalVisible} transparent animationType="none" onRequestClose={onDismiss}>
      <Pressable style={styles.overlay} onPress={onDismiss} />
      <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{title}</Text>
          <Pressable onPress={onDismiss} hitSlop={10}>
            <Text style={styles.done}>Done</Text>
          </Pressable>
        </View>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {children}
        </ScrollView>
      </Animated.View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: '88%',
    backgroundColor: colors.bgGradientMid,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    padding: spacing.screenH,
    paddingBottom: 0,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: radius.stepBar,
    backgroundColor: colors.line2,
    alignSelf: 'center',
    marginBottom: spacing.sectionGap,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.listGap,
  },
  headerTitle: {
    ...t.navTitle,
    color: colors.txt1,
  },
  done: {
    ...t.bodyMd,
    color: colors.good,
    fontWeight: '600',
  },
  scrollContent: {
    paddingBottom: spacing.bottomInset,
  },
})
