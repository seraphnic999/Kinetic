import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, FlatList } from 'react-native';
import { Colors, Typography, Spacing, Radius, IconSize } from '../theme';
import { Icon } from './Icon';

/**
 * Bottom-sheet "combo box" — tap a field elsewhere to open this, pick one
 * option from the list. Options may be plain strings, or { key, label }
 * objects when the display text should differ from the selected value.
 */
export function PickerModal({ visible, title, options, selected, onSelect, onClose }) {
  const normalized = options.map(o => (typeof o === 'string' ? { key: o, label: o } : o));
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={onClose}>
              <Icon name="close" size={IconSize.row} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={normalized}
            keyExtractor={item => item.key}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.option}
                onPress={() => { onSelect(item.key); onClose(); }}
                activeOpacity={0.7}
              >
                <Text style={[styles.optionText, item.key === selected && styles.optionTextActive]}>
                  {item.label}
                </Text>
                {item.key === selected && (
                  <Icon name="check" size={IconSize.meta} color={Colors.ember} />
                )}
              </TouchableOpacity>
            )}
          />
        </View>
      </View>
    </Modal>
  );
}

/** Tappable field that opens a PickerModal — the visual "combo box" itself. */
export function PickerField({ label, value, placeholder, onPress }) {
  return (
    <TouchableOpacity style={styles.field} onPress={onPress} activeOpacity={0.7}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <Text style={value ? styles.fieldValue : styles.fieldPlaceholder}>
        {value || placeholder}
      </Text>
      <Icon name="chevronDown" size={IconSize.meta} color={Colors.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: '#000000AA', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.surface, borderTopLeftRadius: Radius.lg, borderTopRightRadius: Radius.lg,
    maxHeight: '70%', paddingBottom: Spacing.xxl,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.line,
  },
  title: { ...Typography.h3, color: Colors.text },
  option: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.lg,
    borderBottomWidth: 1, borderBottomColor: Colors.line,
  },
  optionText: { ...Typography.bodyLarge, color: Colors.text },
  optionTextActive: { color: Colors.ember },

  field: {
    height: 48, borderRadius: Radius.md, backgroundColor: Colors.raised,
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  fieldLabel:       { ...Typography.body, color: Colors.text },
  fieldValue:       { ...Typography.body, color: Colors.text, flex: 1 },
  fieldPlaceholder: { ...Typography.body, color: Colors.textMuted, flex: 1 },
});
