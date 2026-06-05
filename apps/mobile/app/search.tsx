import { Stack } from 'expo-router';
import { StyleSheet, Text, TextInput, View } from 'react-native';

export default function Search() {
  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Search' }} />
      <TextInput
        style={styles.input}
        placeholder="Search crags…"
        editable={false}
      />
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>Search coming in Phase 10</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#d4d4d8',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    backgroundColor: '#f4f4f5',
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    opacity: 0.5,
  },
});
