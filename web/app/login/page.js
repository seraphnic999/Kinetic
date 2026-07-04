'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode]         = useState('login');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [info, setInfo]         = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace('/dashboard');
    });
  }, [router]);

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setInfo('');
    if (!email || !password) { setError('Email and password required.'); return; }
    setLoading(true);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) setError(error.message);
        else router.replace('/dashboard');
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) setError(error.message);
        else setInfo('Account created! Check your email to confirm, then sign in.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="flex items-center justify-center gap-2 mb-1">
            <span className="text-primary text-4xl">⚡</span>
            <span className="text-4xl font-bold tracking-widest text-primary">KINETIC</span>
          </div>
          <p className="text-secondary text-sm">Your training companion</p>
        </div>

        {/* Card */}
        <div className="bg-surface rounded-2xl p-8">
          <h2 className="text-xl font-semibold mb-6">{mode === 'login' ? 'Sign in' : 'Create account'}</h2>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-xs text-secondary mb-1 uppercase tracking-wider">Email</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                className="w-full bg-raised rounded-lg px-4 h-12 text-white placeholder-muted outline-none focus:ring-2 focus:ring-primary"
                placeholder="you@example.com" autoComplete="email"
              />
            </div>
            <div>
              <label className="block text-xs text-secondary mb-1 uppercase tracking-wider">Password</label>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                className="w-full bg-raised rounded-lg px-4 h-12 text-white placeholder-muted outline-none focus:ring-2 focus:ring-primary"
                placeholder="••••••••" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              />
            </div>

            {error && <p className="text-danger text-sm">{error}</p>}
            {info  && <p className="text-primary text-sm">{info}</p>}

            <button
              type="submit" disabled={loading}
              className="w-full h-12 bg-primary text-bg font-bold rounded-full mt-2 hover:opacity-90 transition disabled:opacity-50"
            >
              {loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Sign up'}
            </button>
          </form>

          <button
            onClick={() => { setMode(m => m === 'login' ? 'signup' : 'login'); setError(''); setInfo(''); }}
            className="w-full text-center text-secondary text-sm mt-4 hover:text-white transition"
          >
            {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <span className="text-primary">{mode === 'login' ? 'Sign up' : 'Sign in'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
