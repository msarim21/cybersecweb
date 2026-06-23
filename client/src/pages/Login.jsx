import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';

const LOGO = 'https://media.mrfrankofc.gleeze.com/media/IMG-20260503-WA0094.jpg';

const AmbientBg = () => (
  <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] rounded-full opacity-30"
      style={{ background: 'radial-gradient(ellipse, rgba(99,102,241,0.15) 0%, transparent 70%)', filter: 'blur(60px)' }} />
    <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full opacity-20"
      style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%)', filter: 'blur(50px)' }} />
  </div>
);

export default function Login() {
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleChange = e => setFormData(p => ({ ...p, [e.target.name]: e.target.value }));

  const handleSubmit = async e => {
    e.preventDefault();
    if (!formData.email || !formData.password) return toast.error('All fields required');
    setLoading(true);
    try {
      const { data } = await axios.post('/api/auth/login', formData);
      login(data.token, data.user);
      toast.success('ACCESS GRANTED');
      navigate('/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen auth-bg flex items-center justify-center relative overflow-hidden">
      <AmbientBg />
      <div className="fixed inset-0 cyber-grid opacity-40 pointer-events-none z-0" />

      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: 'easeOut' }}
        className="relative z-10 w-full max-w-md mx-4">

        <div className="text-center mb-8">
          <img src={LOGO} alt="CYBERSECPRO"
            className="w-14 h-14 object-contain rounded-xl mx-auto mb-5 ring-1 ring-white/10 shadow-premium" />
          <h1 className="font-display font-bold text-2xl text-white tracking-tight">Welcome back</h1>
          <p className="text-sm text-slate-400 mt-2">Sign in to your CYBERSECPRO account</p>
        </div>

        <div className="glass rounded-2xl p-8">
          <div className="mb-6 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Secure sign in</span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="text-sm font-medium text-slate-300 block mb-2">Email address</label>
              <input name="email" type="email" value={formData.email} onChange={handleChange}
                className="input-neon" placeholder="operator@cybersec.pro" autoComplete="email" />
            </div>

            <div>
              <label className="text-sm font-medium text-slate-300 block mb-2">Password</label>
              <div className="relative">
                <input name="password" type={showPass ? 'text' : 'password'} value={formData.password} onChange={handleChange}
                  className="input-neon pr-16" placeholder="••••••••" autoComplete="current-password" />
                <button type="button" onClick={() => setShowPass(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-brand-400 transition-colors text-xs font-medium">
                  {showPass ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <motion.button type="submit" disabled={loading} whileHover={{ scale: loading ? 1 : 1.01 }} whileTap={{ scale: loading ? 1 : 0.99 }}
              className="w-full btn-neon-solid py-3.5 font-display text-sm font-semibold">
              {loading ? (
                <span className="flex items-center justify-center gap-3">
                  <div className="cyber-spinner w-5 h-5" />
                  Signing in...
                </span>
              ) : 'Sign in'}
            </motion.button>
          </form>

          <div className="mt-6 pt-5 border-t border-white/8 text-center">
            <p className="text-sm text-slate-500">
              Don't have an account?{' '}
              <Link to="/signup" className="text-cyan-400 hover:text-cyan-300 font-medium transition-colors">Create account</Link>
            </p>
          </div>
        </div>

        <div className="text-center mt-6">
          <Link to="/" className="text-sm text-slate-500 hover:text-cyan-400 transition-colors">← Back to home</Link>
        </div>
      </motion.div>
    </div>
  );
}
