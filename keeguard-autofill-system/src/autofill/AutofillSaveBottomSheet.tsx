// src/autofill/AutofillSaveBottomSheet.tsx
// The in-app bottom sheet shown when autofill detects a new or changed credential

import React, { useEffect, useRef, useState } from 'react';
import {
  Animated, Image, StyleSheet, Text, TouchableOpacity,
  View, useColorScheme, SafeAreaView
} from 'react-native';
import { AutofillSaveEvent, confirmAutofillSave, dismissAutofillPrompt, recordCategoryOverride } from './autofillService';
import { useCategories } from '../hooks/useCategories';

interface Props {
  event: AutofillSaveEvent | null;
  onDismiss: () => void;
}

export const AutofillSaveBottomSheet: React.FC<Props> = ({ event, onDismiss }) => {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const slideAnim = useRef(new Animated.Value(300)).current;
  const { categories, getCategoryById } = useCategories();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (event) {
      setSelectedCategoryId(event.suggestedCategoryId ?? null);
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 10 }).start();
    } else {
      Animated.timing(slideAnim, { toValue: 300, useNativeDriver: true, duration: 200 }).start();
    }
  }, [event]);

  if (!event) return null;

  const isUpdate = event.action === 'update';
  const faviconUrl = `https://www.google.com/s2/favicons?domain=\${event.domain}&sz=32`;
  const selectedCategory = selectedCategoryId ? getCategoryById(selectedCategoryId) : null;

  const handleSave = async () => {
    if (!selectedCategoryId) return;
    setSaving(true);
    try {
      if (selectedCategoryId !== event.suggestedCategoryId && event.domain) {
        recordCategoryOverride(event.domain, selectedCategoryId);
      }
      await confirmAutofillSave({
        action: event.action,
        domain: event.domain,
        username: event.username,
        password: event.password,
        categoryId: selectedCategoryId,
        credentialId: event.credentialId
      });
      onDismiss();
    } finally {
      setSaving(false);
    }
  };

  const handleDismiss = async () => {
    await dismissAutofillPrompt();
    onDismiss();
  };

  const bg = isDark ? '#1c1b19' : '#f9f8f5';
  const text = isDark ? '#cdccca' : '#28251d';
  const muted = isDark ? '#797876' : '#7a7974';
  const border = isDark ? '#393836' : '#d4d1ca';
  const primary = isDark ? '#4f98a3' : '#01696f';

  return (
    <View style={styles.overlay}>
      <TouchableOpacity style={styles.backdrop} onPress={handleDismiss} />
      <Animated.View style={[styles.sheet, { backgroundColor: bg, transform: [{ translateY: slideAnim }] }]}>
        <SafeAreaView>
          {/* Handle */}
          <View style={[styles.handle, { backgroundColor: border }]} />

          {/* Header */}
          <View style={styles.header}>
            <Image source={{ uri: faviconUrl }} style={styles.favicon} />
            <View style={styles.headerText}>
              <Text style={[styles.title, { color: text }]}>
                {isUpdate ? 'Update password?' : 'Save login?'}
              </Text>
              <Text style={[styles.domain, { color: muted }]}>{event.domain}</Text>
            </View>
          </View>

          {/* Credential preview */}
          <View style={[styles.credRow, { borderColor: border }]}>
            <Text style={[styles.credLabel, { color: muted }]}>Username</Text>
            <Text style={[styles.credValue, { color: text }]} numberOfLines={1}>{event.username}</Text>
          </View>
          <View style={[styles.credRow, { borderColor: border }]}>
            <Text style={[styles.credLabel, { color: muted }]}>Password</Text>
            <Text style={[styles.credValue, { color: text }]}>{'•'.repeat(12)}</Text>
          </View>

          {/* Category selector */}
          {!isUpdate && (
            <View style={[styles.credRow, { borderColor: border }]}>
              <Text style={[styles.credLabel, { color: muted }]}>Category</Text>
              <Text style={[styles.credValue, { color: primary }]}>
                {selectedCategory?.name ?? 'Passwords'}
              </Text>
            </View>
          )}

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity style={[styles.btnSecondary, { borderColor: border }]} onPress={handleDismiss}>
              <Text style={[styles.btnSecondaryText, { color: text }]}>Dismiss</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btnPrimary, { backgroundColor: primary }]}
              onPress={handleSave}
              disabled={saving}>
              <Text style={styles.btnPrimaryText}>{saving ? 'Saving...' : isUpdate ? 'Update' : 'Save'}</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end', zIndex: 9999 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingTop: 8 },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  favicon: { width: 32, height: 32, borderRadius: 8, marginRight: 12 },
  headerText: { flex: 1 },
  title: { fontSize: 16, fontWeight: '600' },
  domain: { fontSize: 13, marginTop: 2 },
  credRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1 },
  credLabel: { fontSize: 14 },
  credValue: { fontSize: 14, fontWeight: '500', maxWidth: '60%' },
  actions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  btnSecondary: { flex: 1, paddingVertical: 14, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  btnSecondaryText: { fontSize: 15, fontWeight: '500' },
  btnPrimary: { flex: 2, paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  btnPrimaryText: { color: '#fff', fontSize: 15, fontWeight: '600' }
});
