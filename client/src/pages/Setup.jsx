import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import axios from 'axios';
import toast from 'react-hot-toast';

const LOGO = 'https://media.mrfrankofc.gleeze.com/media/IMG-20260503-WA0094.jpg';

const AmbientBg = () => (
  <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] rounded-full opacity-30"
      style={{ background: 'radial-gradient(ellipse, rgba(99,102,241,0.12) 0%, transparent 70%)', filter: 'blur(60px)' }} />
  </div>
);

export default function Setup() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [form, setForm] = useState({ username: '', email: '', password: '', confirm: '' });
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    axios.get('/api/setup/status')
      .then(res => {
        if (!res.data.needsSetup) {
          navigate('/login', { replace: true });
        } else {
          setChecking(false);
        }
      })
      .catch(() => {
        toast.error('Could not connect to server');
        setChecking(false);
      });
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirm) return toast.error('Passwords do not match');
    if (form.password.length < 6) return toast.error('Password must be at least 6 characters');
    setLoading(true);
    try {
      await axios.post('/api/setup', {
        username: form.username,
        email: form.email,
        password: form.password,
      });
      setDone(true);
      toast.success('Admin account created successfully!');
      setTimeout(() => navigate('/login', { replace: true }), 2000);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Setup failed');
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#09090b]">
        <div className="flex flex-col items-center gap-4">
          <div className="cyber-spinner" />
          <p className="text-sm text-slate-400 font-medium">Checking system...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen auth-bg flex items-center justify-center relative overflow-hidden px-4">
      <AmbientBg />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-md"
      >
        <div className="text-center mb-8">
          <img src={LOGO} alt="CYBERSECPRO"
            className="w-14 h-14 rounded-xl object-cover mx-auto mb-5 ring-1 ring-white/10 shadow-premium" />
          <h1 className="text-2xl font-display font-bold text-white tracking-tight mb-1">
            First-run setup
          </h1>
          <p className="text-sm text-slate-400">
            Create your admin account
          </p>
          <div className="mt-4 text-xs px-4 py-2.5 rounded-xl border border-amber-500/20 bg-amber-500/8 text-amber-300 font-medium">
            This page is only available once — no admin exists yet
          </div>
        </div>

        <div className="glass rounded-2xl p-8">
          {done ? (
            <div className="text-center py-8">
              <div className="text-4xl mb-4">✅</div>
              <p className="text-emerald-400 font-display font-semibold text-sm">Admin created successfully</p>
              <p className="text-slate-500 text-sm mt-2">Redirecting to login...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {[
                { label: 'Username', key: 'username', type: 'text', placeholder: 'admin_username' },
                { label: 'Email', key: 'email', type: 'email', placeholder: 'admin@yourdomain.com' },
                { label: 'Password', key: 'password', type: 'password', placeholder: '••••••••' },
                { label: 'Confirm password', key: 'confirm', type: 'password', placeholder: '••••••••' },
              ].map(({ label, key, type, placeholder }) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    {label}
                  </label>
                  <input
                    type={type}
                    value={form[key]}
                    onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                    placeholder={placeholder}
                    required
                    className="input-neon"
                  />
                </div>
              ))}

              <button
                type="submit"
                disabled={loading}
                className="w-full btn-neon-solid py-3.5 font-display text-sm font-semibold disabled:opacity-50"
              >
                {loading ? 'Creating admin...' : 'Create admin account'}
              </button>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
}
