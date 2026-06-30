import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';

const LOGO = 'https://media.mrfrankofc.gleeze.com/media/IMG-20260503-WA0094.jpg';

const AmbientBg = () => (
  <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] rounded-full opacity-30"
      style={{ background: 'radial-gradient(ellipse, rgba(139,92,246,0.12) 0%, transparent 70%)', filter: 'blur(60px)' }} />
    <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full opacity-20"
      style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.1) 0%, transparent 70%)', filter: 'blur(50px)' }} />
  </div>
);

const PasswordStrength = ({ password }) => {
  const getStrength = () => {
    let score = 0;
    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    return score;
  };
  const strength = getStrength();
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
  const colors = ['', '#ef4444', '#f59e0b', '#6366f1', '#10b981'];
  if (!password) return null;
  return (
    <div className="mt-2">
      <div className="flex gap-1">
        {[1,2,3,4].map(i => (
          <div key={i} className="h-1 flex-1 rounded-full" style={{ background: i <= strength ? colors[strength] : 'rgba(255,255,255,0.08)', transition: 'all 0.3s' }} />
        ))}
      </div>
      <span className="text-xs mt-1.5 block font-medium" style={{ color: colors[strength] }}>{labels[strength]}</span>
    </div>
  );
};

export default function Signup() {
  const [formData, setFormData] = useState({ username: '', email: '', password: '', confirmPassword: '' });
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleChange = e => setFormData(p => ({ ...p, [e.target.name]: e.target.value }));

  const handleSubmit = async e => {
    e.preventDefault();
    if (!formData.username || !formData.email || !formData.password || !formData.confirmPassword) {
      return toast.error('All fields required');
    }
    if (formData.password !== formData.confirmPassword) {
      return toast.error('Passwords do not match');
    }
    if (formData.password.length < 8) {
      return toast.error('Password must be at least 8 characters');
    }
    setLoading(true);
    try {
      const { data } = await axios.post('/api/auth/signup', {
        username: formData.username,
        email: formData.email,
        password: formData.password
      });
      login(data.token, data.user);
      toast.success('SIGNUP SUCCESSFUL');
      navigate('/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen auth-bg flex items-center justify-center relative overflow-hidden py-8">
      <AmbientBg />
      <div className="fixed inset-0 cyber-grid opacity-40 pointer-events-none z-0" />

      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: 'easeOut' }}
        className="relative z-10 w-full max-w-md mx-4">

        <div className="text-center mb-8">
          <img src={LOGO} alt="CYBERSECPRO"
            className="w-14 h-14 object-contain rounded-xl mx-auto mb-5 ring-1 ring-white/10 shadow-premium" />
          <h1 className="font-display font-bold text-2xl text-white tracking-tight">Create your account</h1>
          <p className="text-sm text-slate-400 mt-2">Get started with CYBERSECPRO for free</p>
        </div>

        <div className="glass-purple rounded-2xl p-8">
          <div className="mb-6 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-violet-500" />
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">New operator registration</span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-300 block mb-2">Username</label>
              <input name="username" type="text" value={formData.username} onChange={handleChange}
                className="input-neon" placeholder="operator_name" />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-300 block mb-2">Email address</label>
              <input name="email" type="email" value={formData.email} onChange={handleChange}
                className="input-neon" placeholder="operator@cybersec.pro" />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-300 block mb-2">Password</label>
              <div className="relative">
                <input name="password" type={showPass ? 'text' : 'password'} value={formData.password} onChange={handleChange}
                  className="input-neon pr-16" placeholder="••••••••" />
                <button type="button" onClick={() => setShowPass(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-violet-400 transition-colors text-xs font-medium">
                  {showPass ? 'Hide' : 'Show'}
                </button>
              </div>
              <PasswordStrength password={formData.password} />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-300 block mb-2">Confirm password</label>
              <input name="confirmPassword" type="password" value={formData.confirmPassword} onChange={handleChange}
                className="input-neon" placeholder="••••••••"
                style={{ borderColor: formData.confirmPassword && formData.password !== formData.confirmPassword ? 'rgba(239,68,68,0.5)' : undefined }} />
              {formData.confirmPassword && formData.password !== formData.confirmPassword && (
                <span className="text-xs text-red-400 mt-1.5 block font-medium">Passwords do not match</span>
              )}
            </div>

            <motion.button type="submit" disabled={loading} whileHover={{ scale: loading ? 1 : 1.01 }} whileTap={{ scale: loading ? 1 : 0.99 }}
              className="w-full py-3.5 rounded-xl font-display text-sm font-semibold text-white mt-2 transition-all"
              style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)', boxShadow: '0 4px 16px rgba(139,92,246,0.35)' }}>
              {loading ? (
                <span className="flex items-center justify-center gap-3">
                  <div className="cyber-spinner w-5 h-5" style={{ borderTopColor: '#fff' }} />
                  Creating account...
                </span>
              ) : 'Create account'}
            </motion.button>
          </form>

          <div className="mt-6 pt-5 border-t border-white/8 text-center">
            <p className="text-sm text-slate-500">
              Already registered?{' '}
              <Link to="/login" className="text-violet-400 hover:text-violet-300 font-medium transition-colors">Sign in</Link>
            </p>
          </div>
        </div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
          className="mt-5 glass-purple rounded-2xl overflow-hidden">

          <div className="px-6 py-4 border-b border-white/8">
            <div className="text-xs font-medium text-slate-500 mb-1 uppercase tracking-wide">Want more power?</div>
            <h2 className="font-display font-semibold text-sm text-violet-300">Upgrade to Pro or Enterprise</h2>
          </div>

          <div className="grid grid-cols-2 gap-0">
            <div className="p-4 border-r border-white/8">
              <div className="text-2xl mb-2">⚡</div>
              <div className="font-display text-xs font-bold text-violet-400 mb-2">PRO</div>
              <ul className="space-y-1.5 mb-3">
                {['5 WhatsApp Numbers', 'All bot features', 'Priority support', 'No trial limit'].map(f => (
                  <li key={f} className="text-[11px] text-slate-400 flex items-center gap-1.5">
                    <span className="text-violet-400">›</span> {f}
                  </li>
                ))}
              </ul>
            </div>
            <div className="p-4">
              <div className="text-2xl mb-2">🚀</div>
              <div className="font-display text-xs font-bold text-purple-400 mb-2">ENTERPRISE</div>
              <ul className="space-y-1.5 mb-3">
                {['Unlimited Numbers', 'All Pro features', 'Custom config', 'VIP support'].map(f => (
                  <li key={f} className="text-[11px] text-slate-400 flex items-center gap-1.5">
                    <span className="text-purple-400">›</span> {f}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="px-4 pb-4">
            <a
              href="https://wa.me/923350340732?text=I%20want%20to%20buy%20access%20of%20website%20plz%20share%20details"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-3 w-full py-3.5 rounded-xl font-display text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99]"
              style={{
                background: 'linear-gradient(135deg, #25D366, #128C7E)',
                boxShadow: '0 4px 16px rgba(37,211,102,0.25)'
              }}>
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white flex-shrink-0">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                <path d="M12 0C5.373 0 0 5.373 0 12c0 2.124.554 4.122 1.524 5.857L.057 23.882a.5.5 0 0 0 .611.611l6.025-1.467A11.945 11.945 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.812 9.812 0 0 1-5.003-1.372l-.359-.214-3.717.904.921-3.625-.235-.373A9.818 9.818 0 0 1 2.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z"/>
              </svg>
              Contact admin on WhatsApp
            </a>
            <p className="text-[10px] text-slate-600 text-center mt-2">Message automatically ready: "I want to buy access of website plz share details"</p>
          </div>
        </motion.div>

        <div className="text-center mt-5">
          <Link to="/" className="text-sm text-slate-500 hover:text-violet-400 transition-colors">← Back to home</Link>
        </div>
      </motion.div>
    </div>
  );
}
