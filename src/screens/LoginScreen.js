import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius, DIGITAL_FONT } from '../theme';
import { supabase } from '../config/supabase';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode]       = useState('login'); // 'login' | 'signup'
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [info, setInfo]       = useState('');

  const handleSubmit = async () => {
    setError(''); setInfo('');
    if (!email.trim() || !password) { setError('Email and password required.'); return; }
    setLoading(true);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) setError(error.message);
      } else {
        const { error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) setError(error.message);
        else setInfo('Account created! Check your email to confirm, then log in.');
      }
    } catch (e) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: Colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={[s.root, { paddingTop: insets.top + Spacing.xl }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Logo / wordmark */}
        <View style={s.logoRow}>
          <Ionicons name="flash" size={36} color={Colors.primary} />
          <Text style={s.logo}>KINETIC</Text>
        </View>
        <Text style={s.tagline}>Your training companion</Text>

        {/* Card */}
        <View style={s.card}>
          <Text style={s.cardTitle}>{mode === 'login' ? 'Sign in' : 'Create account'}</Text>

          <Text style={s.label}>Email</Text>
          <TextInput
            style={s.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            placeholder="you@example.com"
            placeholderTextColor={Colors.textMuted}
          />

          <Text style={s.label}>Password</Text>
          <TextInput
            style={s.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            placeholder="••••••••"
            placeholderTextColor={Colors.textMuted}
          />

          {!!error && <Text style={s.error}>{error}</Text>}
          {!!info  && <Text style={s.info}>{info}</Text>}

          <TouchableOpacity style={s.btn} onPress={handleSubmit} activeOpacity={0.8} disabled={loading}>
            {loading
              ? <ActivityIndicator color={Colors.background} />
              : <Text style={s.btnTxt}>{mode === 'login' ? 'Sign in' : 'Sign up'}</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity onPress={() => { setMode(m => m === 'login' ? 'signup' : 'login'); setError(''); setInfo(''); }} style={s.switchRow}>
            <Text style={s.switchTxt}>
              {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
              <Text style={{ color: Colors.primary }}>
                {mode === 'login' ? 'Sign up' : 'Sign in'}
              </Text>
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={s.hint}>Your workouts sync across devices and are only visible to you.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root:     { flexGrow: 1, alignItems: 'center', padding: Spacing.lg, paddingBottom: Spacing.xxl },
  logoRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.xs },
  logo:     { fontFamily: DIGITAL_FONT, fontSize: 32, color: Colors.primary, letterSpacing: 4 },
  tagline:  { ...Typography.body, color: Colors.textSecondary, marginBottom: Spacing.xxl },
  card:     { width: '100%', backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.xl, gap: Spacing.sm },
  cardTitle:{ ...Typography.h2, color: Colors.textPrimary, marginBottom: Spacing.sm },
  label:    { ...Typography.label, color: Colors.textSecondary },
  input:    {
    height: 48, backgroundColor: Colors.surfaceRaised, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, ...Typography.body, color: Colors.textPrimary,
  },
  error:    { ...Typography.bodySmall, color: Colors.danger },
  info:     { ...Typography.bodySmall, color: Colors.primary },
  btn:      {
    height: 52, backgroundColor: Colors.primary, borderRadius: Radius.full,
    alignItems: 'center', justifyContent: 'center', marginTop: Spacing.sm,
  },
  btnTxt:   { ...Typography.h3, color: Colors.background, fontWeight: '700' },
  switchRow:{ alignItems: 'center', paddingVertical: Spacing.sm },
  switchTxt:{ ...Typography.body, color: Colors.textSecondary },
  hint:     { ...Typography.bodySmall, color: Colors.textMuted, textAlign: 'center', marginTop: Spacing.xl, paddingHorizontal: Spacing.lg },
});
