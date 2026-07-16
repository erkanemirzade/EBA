import React from 'react';
import { View, Text, TextInput, Pressable, ScrollView } from 'react-native';
import { useTheme } from '@/src/ctx/theme';
import { spacing, radius } from '@/src/theme';

type Props = {
  label: string;
  value: string;
  onChangeText?: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric' | 'email-address' | 'decimal-pad';
  multiline?: boolean;
  testID?: string;
};

export function LabeledInput({ label, value, onChangeText, placeholder, keyboardType, multiline, testID }: Props) {
  const { c } = useTheme();
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={{ fontSize: 12, fontWeight: '500', color: c.onSurfaceSecondary, marginBottom: 6 }}>{label}</Text>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={c.muted}
        keyboardType={keyboardType || 'default'}
        multiline={multiline}
        style={{
          borderWidth: 1,
          borderColor: c.border,
          backgroundColor: c.surfaceSecondary,
          color: c.onSurface,
          borderRadius: radius.md,
          paddingHorizontal: spacing.md,
          paddingVertical: 12,
          fontSize: 15,
          minHeight: multiline ? 80 : undefined,
          textAlignVertical: multiline ? 'top' : 'center',
        }}
      />
    </View>
  );
}

type ChipsProps = {
  label?: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
  testIDPrefix?: string;
};

export function Chips({ label, options, value, onChange, testIDPrefix }: ChipsProps) {
  const { c } = useTheme();
  return (
    <View style={{ marginBottom: spacing.md }}>
      {label && <Text style={{ fontSize: 12, fontWeight: '500', color: c.onSurfaceSecondary, marginBottom: 6 }}>{label}</Text>}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.md }}
      >
        {options.map((opt) => {
          const selected = value === opt;
          return (
            <Pressable
              key={opt}
              testID={testIDPrefix ? `${testIDPrefix}-${opt.toLowerCase().replace(/\s+/g, '-')}` : undefined}
              onPress={() => onChange(opt)}
              style={{
                flexShrink: 0,
                height: 36,
                paddingHorizontal: spacing.md,
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: selected ? c.brand : c.border,
                backgroundColor: selected ? c.brand : c.surface,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: selected ? c.onBrand : c.onSurfaceSecondary, fontSize: 13, fontWeight: '600' }}>{opt}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
