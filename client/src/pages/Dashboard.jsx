import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';

const LOGO = 'https://media.mrfrankofc.gleeze.com/media/IMG-20260503-WA0094.jpg';

const GCard = ({ children, className = '', style = {} }) => (
  <div className={`rounded-2xl ${className}`}
    style={{
      background: 'rgba(10,20,60,0.55)',
      backdropFilter: 'blur(24px)',
      WebkitBackdropFilter: 'blur(24px)',
      border: '1px solid rgba(0,245,255,0.18)',
      ...style
    }}>
    {children}
  </div>
);

const StatCard = ({ label, value, icon, color, sub }) => (
  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} whileHover={{ y: -3 }}
    className="rounded-2xl p-4 relative overflow-hidden"
    style={{
      background: `linear-gradient(135deg, ${color}18, rgba(10,20,60,0.7))`,
      backdropFilter: 'blur(24px)',
      border: `1px solid ${color}35`,
      boxShadow: `0 0 24px ${color}15`
    }}>
    <div className="absolute -top-2 -right-2 text-5xl opacity-10">{icon}</div>
    <div className="font-mono text-[10px] tracking-widest mb-1" style={{ color: `${color}cc` }}>{label}</div>
    <div className="font-display font-bold text-2xl sm:text-3xl" style={{ color, textShadow: `0 0 12px ${color}60` }}>{value}</div>
    {sub && <div className="font-mono text-[10px] text-gray-500 mt-1">{sub}</div>}
  </motion.div>
);

/* ─── Trial Expired Banner ─── */
const TrialExpiredBanner = ({ onRequestUpgrade }) => (
  <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
    className="rounded-2xl p-5 mb-4"
    style={{ background: 'linear-gradient(135deg,rgba(255,68,68,0.15),rgba(139,92,246,0.1))', border: '1px solid rgba(255,68,68,0.4)' }}>
    <div className="flex items-start gap-3">
      <div className="text-3xl">⏰</div>
      <div className="flex-1">
        <div className="font-display text-sm text-red-400 tracking-widest mb-1">FREE TRIAL EXPIRED</div>
        <div className="font-mono text-[11px] text-gray-400 mb-3">Your 24-hour free trial has ended. Upgrade to continue using your bot.</div>
        <div className="flex flex-wrap gap-2">
          <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
            onClick={() => onRequestUpgrade('pro')}
            className="px-4 py-2 rounded-xl font-display text-xs tracking-widest text-white"
            style={{ background: 'linear-gradient(135deg,rgba(139,92,246,0.4),rgba(255,0,255,0.2))', border: '1px solid rgba(139,92,246,0.5)' }}>
            ⚡ REQUEST PRO (5 numbers)
          </motion.button>
          <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
            onClick={() => onRequestUpgrade('enterprise')}
            className="px-4 py-2 rounded-xl font-display text-xs tracking-widest text-white"
            style={{ background: 'linear-gradient(135deg,rgba(255,0,255,0.3),rgba(139,92,246,0.2))', border: '1px solid rgba(255,0,255,0.4)' }}>
            🚀 REQUEST ENTERPRISE (Unlimited)
          </motion.button>
        </div>
      </div>
    </div>
  </motion.div>
);

/* ─── Trial Countdown Banner ─── */
const TrialCountdown = ({ expiresAt }) => {
  const [remaining, setRemaining] = useState('');
  useEffect(() => {
    const update = () => {
      const diff = new Date(expiresAt) - new Date();
      if (diff <= 0) { setRemaining('EXPIRED'); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const isLow = new Date(expiresAt) - new Date() < 3 * 3600000;
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="rounded-2xl p-4 mb-4 flex items-center gap-3"
      style={{ background: isLow ? 'rgba(255,68,68,0.1)' : 'rgba(0,245,255,0.06)', border: `1px solid ${isLow ? 'rgba(255,68,68,0.35)' : 'rgba(0,245,255,0.25)'}` }}>
      <div className="text-2xl">🔥</div>
      <div>
        <div className="font-mono text-[10px] tracking-widest" style={{ color: isLow ? '#ff4444' : '#00f5ff' }}>FREE TRIAL ACTIVE — 1 WhatsApp Number</div>
        <div className="font-display text-lg font-bold" style={{ color: isLow ? '#ff4444' : '#00f5ff', textShadow: `0 0 12px ${isLow ? '#ff444460' : '#00f5ff60'}` }}>
          {remaining} remaining
        </div>
      </div>
    </motion.div>
  );
};

/* ─── Upgrade Request Sent Banner ─── */
const UpgradeRequestBanner = ({ plan }) => (
  <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
    className="rounded-2xl p-4 mb-4 flex items-center gap-3"
    style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.35)' }}>
    <div className="text-2xl">⏳</div>
    <div>
      <div className="font-mono text-[10px] tracking-widest text-[#8b5cf6]">UPGRADE REQUEST PENDING</div>
      <div className="font-mono text-xs text-gray-400">Your {plan?.toUpperCase()} request is pending admin approval. You'll be notified soon.</div>
    </div>
  </motion.div>
);

/* ─── Site Audio Player ─── */
const SiteAudioPlayer = ({ audioUrl }) => {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!audioRef.current || !audioUrl) return;
    audioRef.current.loop = true;
    audioRef.current.volume = 0.4;

    const tryPlay = () => {
      if (startedRef.current) return;
      startedRef.current = true;
      if (!audioRef.current) return;
      audioRef.current.play()
        .then(() => setPlaying(true))
        .catch(() => { startedRef.current = false; });
      document.removeEventListener('click', tryPlay);
      document.removeEventListener('touchstart', tryPlay);
      document.removeEventListener('keydown', tryPlay);
    };

    // Try autoplay first — if blocked, wait for first user interaction
    audioRef.current.play()
      .then(() => { startedRef.current = true; setPlaying(true); })
      .catch(() => {
        document.addEventListener('click', tryPlay);
        document.addEventListener('touchstart', tryPlay);
        document.addEventListener('keydown', tryPlay);
      });

    return () => {
      document.removeEventListener('click', tryPlay);
      document.removeEventListener('touchstart', tryPlay);
      document.removeEventListener('keydown', tryPlay);
    };
  }, [audioUrl]);

  const toggle = () => {
    if (!audioRef.current) return;
    if (!playing) {
      audioRef.current.play().then(() => setPlaying(true)).catch(() => {});
    } else {
      audioRef.current.muted = !muted;
      setMuted(m => !m);
    }
  };

  if (!audioUrl) return null;
  const btnColor = !playing ? '#8b5cf6' : muted ? '#ff4444' : '#00f5ff';
  const btnLabel = !playing ? 'PLAY' : muted ? 'UNMUTE' : 'MUTE';
  const btnIcon  = !playing ? '▶' : muted ? '🔇' : '🔊';
  return (
    <div className="fixed bottom-20 lg:bottom-6 right-4 z-30 flex flex-col items-center gap-1">
      <audio ref={audioRef} src={audioUrl} />
      <motion.button
        whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.94 }}
        onClick={toggle}
        className="flex items-center gap-2 px-4 py-2 rounded-2xl shadow-xl font-mono text-xs tracking-widest"
        style={{
          background: `${btnColor}22`,
          border: `1.5px solid ${btnColor}`,
          color: btnColor,
          boxShadow: `0 0 18px ${btnColor}55`,
          minWidth: '90px',
          justifyContent: 'center',
        }}
        title={btnLabel}>
        <span className="text-base">{btnIcon}</span>
        <span>{btnLabel}</span>
      </motion.button>
    </div>
  );
};

/* ─── Plan Limit / Trial Expired Modal ─── */
const PlanLimitModal = ({ onClose, trialExpired, onRequestUpgrade }) => (
  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
    <motion.div initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }}
      className="w-full max-w-sm rounded-2xl p-6 text-center relative overflow-hidden"
      style={{ background: 'linear-gradient(145deg, rgba(255,0,0,0.12), rgba(6,9,26,0.98))', border: '1px solid rgba(255,68,68,0.4)' }}>
      <div className="text-5xl mb-3">{trialExpired ? '⏰' : '🚫'}</div>
      <h2 className="font-display font-bold text-lg text-red-400 tracking-widest mb-2">
        {trialExpired ? 'TRIAL EXPIRED' : 'PLAN LIMIT REACHED'}
      </h2>
      <p className="font-mono text-xs text-gray-400 mb-5 leading-relaxed">
        {trialExpired
          ? 'Your 24-hour free trial has expired. Upgrade to continue.'
          : 'You have reached your plan limit. Upgrade for more numbers.'}
      </p>
      {trialExpired ? (
        <div className="space-y-2 mb-4">
          <button onClick={() => { onRequestUpgrade('pro'); onClose(); }}
            className="w-full py-3 rounded-xl font-display text-xs tracking-widest text-white"
            style={{ background: 'linear-gradient(135deg,rgba(139,92,246,0.5),rgba(255,0,255,0.3))', border: '1px solid rgba(139,92,246,0.5)' }}>
            ⚡ REQUEST PRO — 5 Numbers
          </button>
          <button onClick={() => { onRequestUpgrade('enterprise'); onClose(); }}
            className="w-full py-3 rounded-xl font-display text-xs tracking-widest text-white"
            style={{ background: 'linear-gradient(135deg,rgba(255,0,255,0.3),rgba(139,92,246,0.2))', border: '1px solid rgba(255,0,255,0.4)' }}>
            🚀 REQUEST ENTERPRISE — Unlimited
          </button>
        </div>
      ) : (
        <div className="rounded-xl px-4 py-3 mb-5" style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.35)' }}>
          <div className="font-mono text-[10px] text-gray-400 mb-1 tracking-widest">CONTACT FOR UPGRADE</div>
          <a href="https://wa.me/923417022212" target="_blank" rel="noreferrer"
            className="font-display font-bold text-base" style={{ color: '#8b5cf6' }}>+923417022212</a>
        </div>
      )}
      <button onClick={onClose} className="w-full py-3 rounded-xl font-mono text-xs text-gray-400"
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>DISMISS</button>
    </motion.div>
  </motion.div>
);

/* ─── Link Number Modal ─── */
const LinkModal = ({ onClose, onAdd }) => {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ number: '', botName: '' });
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [timer, setTimer] = useState(300);
  const [saving, setSaving] = useState(false);
  const timerRef   = useRef(null);
  const pollRef    = useRef(null);
  const autoSaved  = useRef(false);

  useEffect(() => {
    if (step === 3) {
      timerRef.current = setInterval(() => setTimer(t => {
        if (t <= 1) { clearInterval(timerRef.current); return 0; }
        return t - 1;
      }), 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [step]);

  // Auto-detect WhatsApp pairing — poll /api/pairing/status every 3 s
  useEffect(() => {
    if (step !== 3) { autoSaved.current = false; return; }
    const cleanNum = form.number.replace(/\D/g, '');
    if (!cleanNum) return;
    pollRef.current = setInterval(async () => {
      if (autoSaved.current) return;
      try {
        const { data } = await axios.get(`/api/pairing/status/${cleanNum}`);
        if (data.connected) {
          autoSaved.current = true;
          clearInterval(pollRef.current);
          toast.success('📱 WhatsApp connected! Auto-saving…');
          setSaving(true);
          try {
            const res = await axios.post('/api/numbers', { number: form.number, botName: form.botName });
            onAdd(res.data);
            toast.success('✅ NUMBER LINKED SUCCESSFULLY');
            onClose();
          } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to save number');
            autoSaved.current = false;
          } finally { setSaving(false); }
        }
      } catch (_) {}
    }, 3000);
    return () => clearInterval(pollRef.current);
  }, [step, form.number, form.botName]); // eslint-disable-line react-hooks/exhaustive-deps

  const fmt = s => `${Math.floor(s / 60).toString().padStart(2,'0')}:${(s % 60).toString().padStart(2,'0')}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      toast.success('Code copied!');
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const handleRequest = async e => {
    e.preventDefault();
    if (!form.number || !form.botName) return toast.error('All fields required');
    setStep(2);
    try {
      const { data } = await axios.post('/api/pairing/request', { phoneNumber: form.number });
      setCode(data.code);
      setTimer(300);
      setStep(3);
    } catch (err) {
      setStep(1);
      const errCode = err.response?.data?.error;
      if (errCode === 'PLAN_LIMIT_REACHED' || errCode === 'TRIAL_EXPIRED') {
        toast.error(err.response?.data?.message || 'Limit reached'); onClose();
      } else {
        toast.error(err.response?.data?.error || 'Failed to get pairing code. Try again.');
      }
    }
  };

  const handleConfirm = async () => {
    setSaving(true);
    try {
      const res = await axios.post('/api/numbers', { number: form.number, botName: form.botName });
      onAdd(res.data);
      toast.success('NUMBER LINKED SUCCESSFULLY');
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save number');
    } finally { setSaving(false); }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
        className="w-full max-w-md rounded-2xl overflow-hidden"
        style={{ background: 'rgba(10,20,60,0.97)', backdropFilter: 'blur(30px)', border: '1px solid rgba(0,245,255,0.25)' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(0,245,255,0.1)]">
          <div className="font-display text-sm text-[#00f5ff] tracking-widest">
            {step === 1 ? 'LINK WhatsApp NUMBER' : step === 2 ? 'CONNECTING TO WHATSAPP' : 'YOUR PAIRING CODE'}
          </div>
          {step !== 2 && <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">×</button>}
        </div>
        <div className="p-5">
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.form key="form" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
                onSubmit={handleRequest} className="space-y-4">
                <div>
                  <label className="font-mono text-[10px] text-[#00f5ff] tracking-widest block mb-2">PHONE NUMBER (with country code)</label>
                  <input value={form.number} onChange={e => setForm(p => ({ ...p, number: e.target.value }))}
                    className="input-neon rounded-xl w-full" placeholder="923417022212" inputMode="tel" />
                  <p className="font-mono text-[10px] text-gray-600 mt-1">No + or spaces — e.g. 923417022212</p>
                </div>
                <div>
                  <label className="font-mono text-[10px] text-[#00f5ff] tracking-widest block mb-2">BOT NAME</label>
                  <input value={form.botName} onChange={e => setForm(p => ({ ...p, botName: e.target.value }))}
                    className="input-neon rounded-xl w-full" placeholder="MY_BOT_ALPHA" />
                </div>
                <button type="submit"
                  className="w-full py-3 rounded-xl font-display text-sm tracking-widest text-white"
                  style={{ background: 'linear-gradient(135deg,rgba(0,245,255,0.3),rgba(139,92,246,0.3))', border: '1px solid rgba(0,245,255,0.5)', boxShadow: '0 0 20px rgba(0,245,255,0.2)' }}>
                  ⚡ GET PAIRING CODE
                </button>
              </motion.form>
            )}
            {step === 2 && (
              <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="py-8 flex flex-col items-center gap-5">
                <div className="relative w-16 h-16">
                  <div className="absolute inset-0 rounded-full border-2 border-[rgba(0,245,255,0.15)]" />
                  <div className="absolute inset-0 rounded-full border-t-2 border-[#00f5ff] animate-spin" style={{ boxShadow: '0 0 12px rgba(0,245,255,0.5)' }} />
                  <div className="absolute inset-3 rounded-full border-t-2 border-[#8b5cf6] animate-spin" style={{ animationDirection: 'reverse', animationDuration: '0.7s' }} />
                  <div className="absolute inset-0 flex items-center justify-center text-xl">📱</div>
                </div>
                <div className="text-center">
                  <div className="font-display text-sm text-[#00f5ff] tracking-widest mb-1">CONNECTING TO WHATSAPP</div>
                  <div className="font-mono text-[10px] text-gray-500">Requesting pairing code for {form.number}…</div>
                  <div className="font-mono text-[10px] text-gray-600 mt-1">This takes ~5 seconds</div>
                </div>
              </motion.div>
            )}
            {step === 3 && (
              <motion.div key="code" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                <div className="rounded-2xl p-5 text-center"
                  style={{ background: 'rgba(0,245,255,0.06)', border: '1px solid rgba(0,245,255,0.3)', boxShadow: '0 0 30px rgba(0,245,255,0.08)' }}>
                  <div className="font-mono text-[10px] text-gray-400 tracking-widest mb-3">YOUR PAIRING CODE</div>
                  <div className="font-display font-black text-4xl sm:text-5xl tracking-[10px] mb-4"
                    style={{ color: '#00f5ff', textShadow: '0 0 30px rgba(0,245,255,0.9)', letterSpacing: '0.2em' }}>{code}</div>
                  <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} onClick={handleCopy}
                    className="w-full py-3 rounded-xl font-display text-sm tracking-widest transition-all"
                    style={{ background: copied ? 'rgba(0,255,136,0.2)' : 'rgba(0,245,255,0.12)', border: copied ? '1px solid rgba(0,255,136,0.5)' : '1px solid rgba(0,245,255,0.4)', color: copied ? '#00ff88' : '#00f5ff' }}>
                    {copied ? '✓ COPIED!' : '⧉ TAP TO COPY CODE'}
                  </motion.button>
                  <div className="mt-3 font-mono text-xs" style={{ color: timer < 60 ? '#ff4444' : '#00ff88' }}>
                    ⏱ expires in {fmt(timer)}
                  </div>
                </div>
                <div className="rounded-xl p-4 space-y-2.5" style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)' }}>
                  <div className="font-mono text-[10px] text-[#8b5cf6] tracking-widest mb-2">HOW TO ENTER THE CODE</div>
                  {['Open WhatsApp on your phone','Tap ⋮ Menu → Linked Devices','Tap "Link a Device"','Tap "Link with phone number instead"','Type the code shown above'].map((s, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <span className="font-display text-[10px] w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.3)', color: '#8b5cf6' }}>{i + 1}</span>
                      <span className="font-mono text-xs text-gray-300 leading-relaxed">{s}</span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-3">
                  <button onClick={() => { setStep(1); setTimer(300); }} className="py-3 px-4 rounded-xl font-mono text-xs text-gray-400"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>← NEW CODE</button>
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    onClick={handleConfirm} disabled={saving || timer === 0}
                    className="flex-1 py-3 rounded-xl font-display text-xs tracking-widest text-white"
                    style={{ background: 'linear-gradient(135deg,rgba(0,255,136,0.3),rgba(0,245,255,0.2))', border: '1px solid rgba(0,255,136,0.4)' }}>
                    {saving ? '⟳ AUTO-SAVING...' : '✓ I ENTERED THE CODE — SAVE'}
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
};

const NAV = [
  { id: 'overview', label: 'HOME', icon: '◈' },
  { id: 'numbers', label: 'NUMBERS', icon: '📱' },
  { id: 'profile', label: 'PROFILE', icon: '👤' },
];

export default function Dashboard() {
  const { user, logout, updateUser } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState('overview');
  const [numbers, setNumbers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showLimit, setShowLimit] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(typeof window !== 'undefined' && window.innerWidth >= 1024);
  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const [profileEdit, setProfileEdit] = useState({ username: user?.username || '' });
  const [profileLoading, setProfileLoading] = useState(false);
  const [upgradeLoading, setUpgradeLoading] = useState('');
  const [siteAudio, setSiteAudio] = useState({ filename: '', original: '' });

  useEffect(() => { fetchData(); fetchAudio(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [nRes, sRes] = await Promise.all([axios.get('/api/numbers'), axios.get('/api/user/stats')]);
      setNumbers(nRes.data);
      setStats(sRes.data);
    } catch { toast.error('Failed to load data'); }
    finally { setLoading(false); }
  };

  const fetchAudio = async () => {
    try {
      const res = await axios.get('/api/site/audio');
      setSiteAudio(res.data);
    } catch { }
  };

  const handleAdd = n => {
    setNumbers(p => [n, ...p]);
    setStats(p => ({ ...p, total: (p?.total || 0) + 1, active: (p?.active || 0) + 1 }));
  };

  const handleDelete = async id => {
    if (!confirm('Delete this number?')) return;
    try {
      await axios.delete(`/api/numbers/${id}`);
      setNumbers(p => p.filter(n => n._id !== id));
      setStats(p => ({ ...p, total: p.total - 1 }));
      toast.success('Deleted');
    } catch { toast.error('Failed to delete'); }
  };

  const handleToggle = async id => {
    try {
      const res = await axios.put(`/api/numbers/${id}/toggle`);
      setNumbers(p => p.map(n => n._id === id ? res.data : n));
    } catch { toast.error('Failed to toggle'); }
  };

  const handleProfileSave = async () => {
    setProfileLoading(true);
    try {
      await axios.put('/api/user/profile', { username: profileEdit.username });
      updateUser({ username: profileEdit.username });
      toast.success('Profile updated');
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to update'); }
    finally { setProfileLoading(false); }
  };

  const handleRequestUpgrade = async (plan) => {
    setUpgradeLoading(plan);
    try {
      await axios.post('/api/user/upgrade-request', { plan });
      toast.success(`Upgrade request to ${plan.toUpperCase()} sent! Admin will review shortly.`);
      await fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to send request');
    } finally { setUpgradeLoading(''); }
  };

  const handleLogout = () => { logout(); navigate('/'); toast.success('Logged out'); };

  const filtered = numbers.filter(n =>
    n.number?.toLowerCase().includes(search.toLowerCase()) ||
    n.botName?.toLowerCase().includes(search.toLowerCase())
  );

  const planColor = user?.subscriptionPlan === 'enterprise' ? '#ff00ff' : user?.subscriptionPlan === 'pro' ? '#8b5cf6' : '#00f5ff';

  const trialExpired = stats?.trialExpired;
  const trialExpiresAt = stats?.trialExpiresAt;
  const upgradeRequest = stats?.upgradeRequest;
  const audioUrl = siteAudio.filename ? '/api/site/audio/file' : '';

  const canAddNumber = !trialExpired && (stats?.total ?? 0) < (stats?.limit ?? 1);

  return (
    <div className="min-h-screen flex" style={{ background: 'linear-gradient(135deg,#06091a 0%,#0d0820 50%,#060d1e 100%)' }}>
      <div className="fixed inset-0 cyber-grid pointer-events-none z-0 opacity-40" />

      {audioUrl && <SiteAudioPlayer audioUrl={audioUrl} audioName={siteAudio.original} />}

      <AnimatePresence>
        {showAdd && <LinkModal onClose={() => setShowAdd(false)} onAdd={handleAdd} />}
        {showLimit && <PlanLimitModal onClose={() => setShowLimit(false)} trialExpired={trialExpired} onRequestUpgrade={handleRequestUpgrade} />}
      </AnimatePresence>

      <AnimatePresence>
        {sidebarOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-30 lg:hidden"
            onClick={() => setSidebarOpen(false)} />
        )}
      </AnimatePresence>

      {/* ════ SIDEBAR ════ */}
      <motion.aside
        initial={false}
        animate={{ x: isDesktop || sidebarOpen ? 0 : -280 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="fixed top-0 left-0 h-full w-64 z-40 flex flex-col"
        style={{ background: 'rgba(6,9,26,0.92)', backdropFilter: 'blur(30px)', borderRight: '1px solid rgba(0,245,255,0.15)' }}>
        <div className="p-5 border-b border-[rgba(0,245,255,0.12)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src={LOGO} className="w-9 h-9 rounded-lg object-cover" style={{ filter: 'drop-shadow(0 0 8px #00f5ff)' }} alt="CSP" />
              <div>
                <div className="font-display text-xs font-bold tracking-widest" style={{ color: '#00f5ff' }}>CYBERSEC</div>
                <div className="font-display text-xs font-bold text-white tracking-widest">PRO</div>
              </div>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-gray-500 hover:text-white text-lg">×</button>
          </div>
        </div>
        <div className="mx-3 mt-3 mb-2 rounded-xl p-3"
          style={{ background: `linear-gradient(135deg,${planColor}12,rgba(10,20,60,0.6))`, border: `1px solid ${planColor}25` }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg"
              style={{ background: `${planColor}20`, border: `1.5px solid ${planColor}40` }}>👤</div>
            <div className="flex-1 min-w-0">
              <div className="font-display text-sm text-white truncate">{user?.username}</div>
              <div className="font-mono text-[10px] truncate" style={{ color: planColor }}>
                {(user?.subscriptionPlan || 'FREE').toUpperCase()} PLAN
              </div>
            </div>
          </div>
        </div>
        <nav className="flex-1 px-2 py-2 space-y-1 overflow-y-auto">
          {NAV.map(item => (
            <button key={item.id} onClick={() => { setTab(item.id); setSidebarOpen(false); }}
              className="w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 transition-all"
              style={{
                background: tab === item.id ? 'rgba(0,245,255,0.1)' : 'transparent',
                borderLeft: tab === item.id ? '2px solid #00f5ff' : '2px solid transparent',
                color: tab === item.id ? '#00f5ff' : '#9ca3af'
              }}>
              <span className="text-base">{item.icon}</span>
              <span className="font-mono text-xs tracking-widest">{item.label}</span>
            </button>
          ))}
          {user?.role === 'admin' && (
            <Link to="/admin" onClick={() => setSidebarOpen(false)}>
              <div className="w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 text-[#ff00ff] hover:bg-[rgba(255,0,255,0.07)] transition-all">
                <span>⚙️</span><span className="font-mono text-xs tracking-widest">ADMIN PANEL</span>
              </div>
            </Link>
          )}
        </nav>
        <div className="p-2 border-t border-[rgba(0,245,255,0.08)]">
          <button onClick={handleLogout}
            className="w-full px-4 py-3 rounded-xl font-mono text-xs tracking-widest text-red-400 flex items-center gap-3 hover:bg-red-500/10 transition-all">
            <span>⏻</span> LOGOUT
          </button>
        </div>
      </motion.aside>

      {/* ════ MAIN AREA ════ */}
      <div className="flex-1 flex flex-col min-w-0 lg:ml-64 relative z-10">
        <header className="sticky top-0 z-20 flex items-center justify-between px-4 py-3"
          style={{ background: 'rgba(6,9,26,0.88)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(0,245,255,0.1)' }}>
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(p => !p)}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-[#00f5ff] lg:hidden"
              style={{ background: 'rgba(0,245,255,0.08)', border: '1px solid rgba(0,245,255,0.2)' }}>☰</button>
            <div>
              <div className="font-display text-sm tracking-widest text-[#00f5ff]">{NAV.find(n => n.id === tab)?.label || 'DASHBOARD'}</div>
              <div className="font-mono text-[10px] text-gray-600 hidden sm:block">CYBERSECPRO CONTROL CENTER</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-[#00ff88] animate-pulse" style={{ boxShadow: '0 0 6px #00ff88' }} />
            <div className="hidden sm:flex items-center gap-2 rounded-xl px-3 py-1.5"
              style={{ background: `${planColor}12`, border: `1px solid ${planColor}25` }}>
              <span className="font-mono text-[10px] truncate max-w-[80px]" style={{ color: planColor }}>{user?.username}</span>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 pb-24 lg:pb-6 overflow-y-auto">
          <AnimatePresence mode="wait">

            {/* ══ OVERVIEW ══ */}
            {tab === 'overview' && (
              <motion.div key="overview" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <div className="mb-4">
                  <h2 className="font-display text-xl font-bold gradient-text tracking-widest">SYSTEM OVERVIEW</h2>
                  <p className="font-mono text-[10px] text-gray-500 mt-0.5">Real-time monitoring</p>
                </div>

                {loading ? (
                  <div className="flex justify-center py-20"><div className="cyber-spinner" /></div>
                ) : (
                  <div className="space-y-4">
                    {trialExpired && upgradeRequest === 'none' && (
                      <TrialExpiredBanner onRequestUpgrade={handleRequestUpgrade} />
                    )}
                    {trialExpired && upgradeRequest !== 'none' && (
                      <UpgradeRequestBanner plan={upgradeRequest} />
                    )}
                    {!trialExpired && trialExpiresAt && user?.subscriptionPlan === 'free' && (
                      <TrialCountdown expiresAt={trialExpiresAt} />
                    )}

                    {/* ─── WhatsApp Upgrade Card (Free users only) ─── */}
                    {(user?.subscriptionPlan === 'free' || !user?.subscriptionPlan) && (
                      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                        className="rounded-2xl overflow-hidden"
                        style={{ background: 'rgba(10,20,60,0.55)', border: '1px solid rgba(139,92,246,0.35)' }}>
                        <div className="px-5 pt-4 pb-2">
                          <div className="font-mono text-[9px] tracking-widest text-gray-500 mb-1">UPGRADE YOUR ACCOUNT</div>
                          <div className="font-display font-bold text-sm tracking-widest" style={{ color: '#8b5cf6' }}>⚡ GO PRO OR ENTERPRISE</div>
                          <p className="font-mono text-[10px] text-gray-400 mt-1">Get more numbers, all features, and no limits.</p>
                        </div>
                        <div className="grid grid-cols-2 border-t border-b" style={{ borderColor: 'rgba(139,92,246,0.12)' }}>
                          <div className="px-4 py-3 border-r" style={{ borderColor: 'rgba(139,92,246,0.12)' }}>
                            <div className="font-display text-xs font-bold mb-1" style={{ color: '#8b5cf6' }}>⚡ PRO</div>
                            <ul className="space-y-0.5">
                              {['5 Numbers', 'All features', 'Priority support'].map(f => (
                                <li key={f} className="font-mono text-[9px] text-gray-400"><span style={{ color: '#8b5cf6' }}>›</span> {f}</li>
                              ))}
                            </ul>
                          </div>
                          <div className="px-4 py-3">
                            <div className="font-display text-xs font-bold mb-1" style={{ color: '#ff00ff' }}>🚀 ENTERPRISE</div>
                            <ul className="space-y-0.5">
                              {['Unlimited Numbers', 'VIP support', 'Custom config'].map(f => (
                                <li key={f} className="font-mono text-[9px] text-gray-400"><span style={{ color: '#ff00ff' }}>›</span> {f}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                        {/* ─── Upgrade Request Buttons (free/active users) ─── */}
                        {upgradeRequest === 'none' ? (
                          <div className="px-4 pt-3 pb-1 grid grid-cols-2 gap-2">
                            <motion.button
                              whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                              disabled={!!upgradeLoading}
                              onClick={() => handleRequestUpgrade('pro')}
                              className="py-2.5 rounded-xl font-display text-[10px] tracking-widest transition-all disabled:opacity-50"
                              style={{ background: 'linear-gradient(135deg,rgba(139,92,246,0.3),rgba(139,92,246,0.1))', border: '1.5px solid rgba(139,92,246,0.6)', color: '#8b5cf6', boxShadow: '0 0 14px rgba(139,92,246,0.2)' }}>
                              {upgradeLoading === 'pro' ? '⏳ ...' : '⚡ REQUEST PRO'}
                            </motion.button>
                            <motion.button
                              whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                              disabled={!!upgradeLoading}
                              onClick={() => handleRequestUpgrade('enterprise')}
                              className="py-2.5 rounded-xl font-display text-[10px] tracking-widest transition-all disabled:opacity-50"
                              style={{ background: 'linear-gradient(135deg,rgba(255,0,255,0.3),rgba(255,0,255,0.1))', border: '1.5px solid rgba(255,0,255,0.6)', color: '#ff00ff', boxShadow: '0 0 14px rgba(255,0,255,0.2)' }}>
                              {upgradeLoading === 'enterprise' ? '⏳ ...' : '🚀 REQUEST ENTERPRISE'}
                            </motion.button>
                          </div>
                        ) : (
                          <div className="px-4 pt-3 pb-1">
                            <div className="font-mono text-[10px] text-center py-2.5 rounded-xl"
                              style={{ background: 'rgba(139,92,246,0.1)', color: '#8b5cf6', border: '1px solid rgba(139,92,246,0.25)' }}>
                              ⏳ {(upgradeRequest || '').toUpperCase()} REQUEST PENDING — Admin will review
                            </div>
                          </div>
                        )}
                        <div className="px-4 pb-1 mt-1">
                          <div className="font-mono text-[9px] text-center text-gray-600">— or contact directly —</div>
                        </div>
                        <div className="px-4 py-3">
                          <a href="https://wa.me/923417022212?text=I%20want%20to%20buy%20access%20of%20website%20plz%20share%20details"
                            target="_blank" rel="noopener noreferrer"
                            className="flex items-center justify-center gap-2.5 w-full py-3 rounded-xl font-display text-xs tracking-widest text-white transition-all hover:scale-[1.02] active:scale-[0.98]"
                            style={{ background: 'linear-gradient(135deg,#25D366,#128C7E)', boxShadow: '0 0 18px rgba(37,211,102,0.3)' }}>
                            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white flex-shrink-0">
                              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                              <path d="M12 0C5.373 0 0 5.373 0 12c0 2.124.554 4.122 1.524 5.857L.057 23.882a.5.5 0 0 0 .611.611l6.025-1.467A11.945 11.945 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.812 9.812 0 0 1-5.003-1.372l-.359-.214-3.717.904.921-3.625-.235-.373A9.818 9.818 0 0 1 2.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z"/>
                            </svg>
                            CONTACT ADMIN ON WHATSAPP
                          </a>
                          <p className="font-mono text-[9px] text-gray-600 text-center mt-1.5">Auto message: "I want to buy access of website plz share details"</p>
                        </div>
                      </motion.div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                      <StatCard label="TOTAL NUMBERS" value={stats?.total ?? 0} icon="📱" color="#00f5ff"
                        sub={`${(stats?.limit ?? 1) - (stats?.total ?? 0)} slots left`} />
                      <StatCard label="ACTIVE BOTS" value={stats?.active ?? 0} icon="⚡" color="#00ff88" />
                      <StatCard label="INACTIVE" value={stats?.inactive ?? 0} icon="💤" color="#ffaa00" />
                      <StatCard label="PLAN LIMIT" value={stats?.limit === 999 ? '∞' : stats?.limit ?? 1} icon="🛡️" color="#8b5cf6"
                        sub={(stats?.plan || 'FREE').toUpperCase()} />
                    </div>

                    <GCard className="p-4">
                      <div className="flex justify-between items-center mb-3">
                        <span className="font-mono text-[10px] text-[#00f5ff] tracking-widest">PLAN USAGE</span>
                        <span className="font-mono text-xs text-gray-400">{stats?.total}/{stats?.limit === 999 ? '∞' : stats?.limit}</span>
                      </div>
                      <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'rgba(0,245,255,0.08)' }}>
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(((stats?.total || 0) / (stats?.limit === 999 ? 1 : stats?.limit || 1)) * 100, 100)}%` }}
                          transition={{ duration: 1.2, ease: 'easeOut' }}
                          className="h-full rounded-full"
                          style={{
                            background: (stats?.total / (stats?.limit || 1)) > 0.8 ? 'linear-gradient(90deg,#ffaa00,#ff4444)' : 'linear-gradient(90deg,#00f5ff,#8b5cf6)',
                            boxShadow: '0 0 10px rgba(0,245,255,0.5)'
                          }} />
                      </div>
                    </GCard>

                    {!trialExpired && (
                      <motion.button
                        whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                        onClick={() => !canAddNumber ? setShowLimit(true) : setShowAdd(true)}
                        className="w-full py-4 rounded-2xl font-display text-sm tracking-widest text-white"
                        style={{ background: 'linear-gradient(135deg,rgba(0,245,255,0.25),rgba(139,92,246,0.25))', border: '1px solid rgba(0,245,255,0.35)', boxShadow: '0 0 25px rgba(0,245,255,0.15)' }}>
                        ⚡ LINK NEW WHATSAPP NUMBER
                      </motion.button>
                    )}

                    <GCard>
                      <div className="flex justify-between items-center px-4 py-3 border-b border-[rgba(0,245,255,0.1)]">
                        <span className="font-mono text-[10px] text-[#00f5ff] tracking-widest">RECENT NUMBERS</span>
                        <button onClick={() => setTab('numbers')} className="font-mono text-[10px] text-gray-500 hover:text-[#00f5ff]">VIEW ALL →</button>
                      </div>
                      {numbers.length === 0 ? (
                        <div className="text-center py-8 font-mono text-xs text-gray-600">NO NUMBERS LINKED YET</div>
                      ) : (
                        numbers.slice(0, 5).map(n => (
                          <div key={n._id} className="flex justify-between items-center px-4 py-3 border-b border-[rgba(0,245,255,0.05)] last:border-0">
                            <div>
                              <div className="font-mono text-sm text-white">{n.number}</div>
                              <div className="font-mono text-[10px] text-gray-500">{n.botName}</div>
                            </div>
                            <span className={n.status === 'active' ? 'status-active' : 'status-inactive'}>{n.status.toUpperCase()}</span>
                          </div>
                        ))
                      )}
                    </GCard>
                  </div>
                )}
              </motion.div>
            )}

            {/* ══ NUMBERS ══ */}
            {tab === 'numbers' && (
              <motion.div key="numbers" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="font-display text-xl font-bold gradient-text tracking-widest">LINKED NUMBERS</h2>
                    <p className="font-mono text-[10px] text-gray-500 mt-0.5">{numbers.length} registered</p>
                  </div>
                  {!trialExpired && (
                    <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                      onClick={() => !canAddNumber ? setShowLimit(true) : setShowAdd(true)}
                      className="px-4 py-2.5 rounded-xl font-display text-xs tracking-widest text-white"
                      style={{ background: 'linear-gradient(135deg,rgba(0,245,255,0.25),rgba(139,92,246,0.25))', border: '1px solid rgba(0,245,255,0.35)' }}>
                      + LINK
                    </motion.button>
                  )}
                </div>

                {trialExpired && upgradeRequest === 'none' && (
                  <TrialExpiredBanner onRequestUpgrade={handleRequestUpgrade} />
                )}
                {trialExpired && upgradeRequest !== 'none' && (
                  <UpgradeRequestBanner plan={upgradeRequest} />
                )}

                <input value={search} onChange={e => setSearch(e.target.value)}
                  className="input-neon rounded-xl w-full mb-4" placeholder="🔍  SEARCH NUMBERS..." />

                {loading ? (
                  <div className="flex justify-center py-20"><div className="cyber-spinner" /></div>
                ) : filtered.length === 0 ? (
                  <GCard className="p-10 text-center">
                    <div className="text-4xl mb-3">📱</div>
                    <div className="font-mono text-xs text-gray-500">{search ? 'NO RESULTS' : 'NO NUMBERS LINKED YET'}</div>
                  </GCard>
                ) : (
                  <div className="space-y-3">
                    {filtered.map((n, i) => (
                      <motion.div key={n._id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                        className="rounded-2xl p-4"
                        style={{ background: 'rgba(10,20,60,0.55)', backdropFilter: 'blur(20px)', border: '1px solid rgba(0,245,255,0.14)' }}>
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="font-mono text-sm text-white truncate">{n.number}</div>
                            <div className="font-mono text-[10px] text-[#00f5ff] mt-0.5">{n.botName}</div>
                            <div className="font-mono text-[10px] text-gray-600 mt-0.5">Added {new Date(n.createdAt).toLocaleDateString()}</div>
                          </div>
                          <div className="flex items-center gap-3 ml-3 flex-shrink-0">
                            <button onClick={() => handleToggle(n._id)} className={n.status === 'active' ? 'status-active' : 'status-inactive'}>
                              {n.status.toUpperCase()}
                            </button>
                            <button onClick={() => handleDelete(n._id)}
                              className="w-8 h-8 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-500/15 transition-all"
                              style={{ border: '1px solid rgba(255,68,68,0.25)' }}>✕</button>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* ══ PROFILE ══ */}
            {tab === 'profile' && (
              <motion.div key="profile" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <div className="mb-5">
                  <h2 className="font-display text-xl font-bold gradient-text tracking-widest">OPERATOR PROFILE</h2>
                  <p className="font-mono text-[10px] text-gray-500 mt-0.5">Manage your account</p>
                </div>

                <div className="space-y-4 max-w-md">
                  <GCard className="p-5">
                    <div className="flex items-center gap-4 mb-5">
                      <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0"
                        style={{ background: `${planColor}15`, border: `2px solid ${planColor}35` }}>👤</div>
                      <div>
                        <div className="font-display text-lg text-white">{user?.username}</div>
                        <div className="font-mono text-xs text-gray-400">{user?.email}</div>
                        <span className="inline-block mt-1 font-mono text-[10px] px-2 py-0.5 rounded-lg"
                          style={{ background: `${planColor}18`, border: `1px solid ${planColor}35`, color: planColor }}>
                          {(user?.subscriptionPlan || 'FREE').toUpperCase()} PLAN
                        </span>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <label className="font-mono text-[10px] text-[#00f5ff] tracking-widest block mb-2">USERNAME</label>
                        <input value={profileEdit.username} onChange={e => setProfileEdit(p => ({ ...p, username: e.target.value }))}
                          className="input-neon rounded-xl w-full" />
                      </div>
                      <div>
                        <label className="font-mono text-[10px] text-[#00f5ff] tracking-widest block mb-2">EMAIL</label>
                        <input value={user?.email} disabled className="input-neon rounded-xl w-full opacity-50 cursor-not-allowed" />
                      </div>
                      <div>
                        <label className="font-mono text-[10px] text-[#00f5ff] tracking-widest block mb-2">MEMBER SINCE</label>
                        <div className="font-mono text-sm text-gray-400 px-4 py-3 rounded-xl"
                          style={{ background: 'rgba(0,245,255,0.04)', border: '1px solid rgba(0,245,255,0.1)' }}>
                          {user?.createdAt ? new Date(user.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A'}
                        </div>
                      </div>
                      <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                        onClick={handleProfileSave} disabled={profileLoading}
                        className="w-full py-3 rounded-xl font-display text-sm tracking-widest text-white"
                        style={{ background: 'linear-gradient(135deg,rgba(0,245,255,0.25),rgba(139,92,246,0.25))', border: '1px solid rgba(0,245,255,0.4)' }}>
                        {profileLoading ? 'SAVING...' : '💾 SAVE CHANGES'}
                      </motion.button>
                    </div>
                  </GCard>

                  {user?.role === 'admin' && (
                    <Link to="/admin">
                      <GCard className="p-4 flex items-center justify-between hover:border-[rgba(255,0,255,0.4)] transition-all cursor-pointer"
                        style={{ borderColor: 'rgba(255,0,255,0.25)' }}>
                        <div className="flex items-center gap-3">
                          <span className="text-xl">⚙️</span>
                          <div>
                            <div className="font-display text-sm text-[#ff00ff]">ADMIN PANEL</div>
                            <div className="font-mono text-[10px] text-gray-500">Manage all users</div>
                          </div>
                        </div>
                        <span className="text-gray-500">→</span>
                      </GCard>
                    </Link>
                  )}

                  <GCard className="p-4" style={{ borderColor: 'rgba(255,68,68,0.2)' }}>
                    <div className="font-display text-xs text-red-400 tracking-widest mb-3">DANGER ZONE</div>
                    <button onClick={handleLogout}
                      className="w-full py-3 rounded-xl font-mono text-sm text-red-400 hover:bg-red-500/10 transition-all"
                      style={{ border: '1px solid rgba(255,68,68,0.25)' }}>
                      ⏻ LOGOUT
                    </button>
                  </GCard>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      {/* ════ MOBILE BOTTOM NAV ════ */}
      <nav className="fixed bottom-0 left-0 right-0 z-20 lg:hidden flex"
        style={{ background: 'rgba(6,9,26,0.95)', backdropFilter: 'blur(24px)', borderTop: '1px solid rgba(0,245,255,0.15)' }}>
        {NAV.map(item => (
          <button key={item.id} onClick={() => setTab(item.id)}
            className="flex-1 flex flex-col items-center justify-center py-3 gap-1 transition-all"
            style={{ color: tab === item.id ? '#00f5ff' : '#6b7280' }}>
            <span className="text-xl leading-none">{item.icon}</span>
            <span className="font-mono text-[9px] tracking-widest">{item.label}</span>
            {tab === item.id && (
              <motion.div layoutId="tab-indicator" className="absolute top-0 h-0.5 w-10 rounded-full"
                style={{ background: '#00f5ff', boxShadow: '0 0 8px #00f5ff' }} />
            )}
          </button>
        ))}
        {user?.role === 'admin' && (
          <Link to="/admin" className="flex-1 flex flex-col items-center justify-center py-3 gap-1" style={{ color: '#ff00ff' }}>
            <span className="text-xl leading-none">⚙️</span>
            <span className="font-mono text-[9px] tracking-widest">ADMIN</span>
          </Link>
        )}
      </nav>
    </div>
  );
}
