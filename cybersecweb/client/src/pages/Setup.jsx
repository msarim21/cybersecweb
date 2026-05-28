import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import axios from 'axios';
import toast from 'react-hot-toast';

const LOGO = 'https://media.mrfrankofc.gleeze.com/media/IMG-20260503-WA0094.jpg';

const MatrixRain = () => {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const chars = '01アイウエオCYBERSECPRO<>{}[]/\\';
    const fontSize = 12;
    const cols = Math.floor(canvas.width / fontSize);
    const drops = Array(cols).fill(1);
    const draw = () => {
      ctx.fillStyle = 'rgba(2,4,8,0.06)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'rgba(0,245,255,0.12)';
      ctx.font = `${fontSize}px Share Tech Mono`;
      drops.forEach((y, i) => {
        const char = chars[Math.floor(Math.random() * chars.length)];
        ctx.fillText(char, i * fontSize, y * fontSize);
        if (y * fontSize > canvas.height && Math.random() > 0.975) drops[i] = 0;
        drops[i]++;
      });
    };
    const id = setInterval(draw, 50);
    return () => clearInterval(id);
  }, []);
  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none opacity-30" style={{ zIndex: 0 }} />;
};

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
      <div className="fixed inset-0 flex items-center justify-center bg-[#020408]">
        <div className="text-[#00f5ff] font-mono animate-pulse text-sm tracking-widest">CHECKING SYSTEM...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#020408] flex items-center justify-center relative overflow-hidden px-4">
      <MatrixRain />
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 1 }}>
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full opacity-5" style={{ background: 'radial-gradient(circle, #00f5ff, transparent)' }} />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full opacity-5" style={{ background: 'radial-gradient(circle, #8b5cf6, transparent)' }} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-10 w-full max-w-md"
      >
        <div className="text-center mb-8">
          <div className="relative inline-block mb-4">
            <div className="absolute inset-0 rounded-full animate-ping opacity-20" style={{ background: '#00f5ff' }} />
            <img src={LOGO} alt="CYBERSECPRO" className="relative w-16 h-16 rounded-full object-cover border-2 border-[#00f5ff] shadow-lg" style={{ boxShadow: '0 0 20px rgba(0,245,255,0.4)' }} />
          </div>
          <h1 className="text-2xl font-bold tracking-widest mb-1" style={{ fontFamily: 'Share Tech Mono, monospace', color: '#00f5ff' }}>
            FIRST-RUN SETUP
          </h1>
          <p className="text-xs tracking-widest" style={{ color: 'rgba(0,245,255,0.5)', fontFamily: 'Share Tech Mono, monospace' }}>
            CREATE YOUR ADMIN ACCOUNT
          </p>
          <div className="mt-3 text-xs px-4 py-2 rounded border" style={{ color: '#fbbf24', borderColor: 'rgba(251,191,36,0.3)', background: 'rgba(251,191,36,0.05)', fontFamily: 'Share Tech Mono, monospace' }}>
            ⚠ This page is only available once — no admin exists yet
          </div>
        </div>

        <div className="rounded-xl p-8 border" style={{ background: 'rgba(2,4,8,0.9)', borderColor: 'rgba(0,245,255,0.2)', boxShadow: '0 0 40px rgba(0,245,255,0.05)' }}>
          {done ? (
            <div className="text-center py-8">
              <div className="text-4xl mb-4">✅</div>
              <p className="text-[#00ff88] font-mono text-sm tracking-widest">ADMIN CREATED SUCCESSFULLY</p>
              <p className="text-[rgba(0,245,255,0.5)] text-xs mt-2 font-mono">Redirecting to login...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {[
                { label: 'USERNAME', key: 'username', type: 'text', placeholder: 'admin_username' },
                { label: 'EMAIL', key: 'email', type: 'email', placeholder: 'admin@yourdomain.com' },
                { label: 'PASSWORD', key: 'password', type: 'password', placeholder: '••••••••' },
                { label: 'CONFIRM PASSWORD', key: 'confirm', type: 'password', placeholder: '••••••••' },
              ].map(({ label, key, type, placeholder }) => (
                <div key={key}>
                  <label className="block text-xs mb-2 tracking-widest" style={{ color: 'rgba(0,245,255,0.6)', fontFamily: 'Share Tech Mono, monospace' }}>
                    {label}
                  </label>
                  <input
                    type={type}
                    value={form[key]}
                    onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                    placeholder={placeholder}
                    required
                    className="w-full px-4 py-3 rounded-lg text-sm outline-none transition-all"
                    style={{
                      background: 'rgba(0,245,255,0.03)',
                      border: '1px solid rgba(0,245,255,0.15)',
                      color: '#e0f7fa',
                      fontFamily: 'Share Tech Mono, monospace',
                    }}
                    onFocus={e => { e.target.style.borderColor = 'rgba(0,245,255,0.5)'; e.target.style.boxShadow = '0 0 12px rgba(0,245,255,0.1)'; }}
                    onBlur={e => { e.target.style.borderColor = 'rgba(0,245,255,0.15)'; e.target.style.boxShadow = 'none'; }}
                  />
                </div>
              ))}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-lg text-sm font-bold tracking-widest transition-all disabled:opacity-50"
                style={{
                  background: loading ? 'rgba(0,245,255,0.1)' : 'linear-gradient(135deg, rgba(0,245,255,0.15), rgba(139,92,246,0.15))',
                  border: '1px solid rgba(0,245,255,0.4)',
                  color: '#00f5ff',
                  fontFamily: 'Share Tech Mono, monospace',
                  boxShadow: loading ? 'none' : '0 0 20px rgba(0,245,255,0.1)',
                }}
              >
                {loading ? 'CREATING ADMIN...' : 'CREATE ADMIN ACCOUNT'}
              </button>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
}
