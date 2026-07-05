import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';

const LOGO = 'https://media.mrfrankofc.gleeze.com/media/IMG-20260503-WA0094.jpg';

const GCard = ({ children, className = '', style = {} }) => (
  <div className={`rounded-2xl premium-card ${className}`}
    style={{
      background: 'rgba(255,255,255,0.03)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      border: '1px solid rgba(255,255,255,0.08)',
      boxShadow: '0 4px 24px rgba(0,0,0,0.35)',
      ...style
    }}>
    {children}
  </div>
);

const StatCard = ({ label, value, icon, color, sub }) => (
  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} whileHover={{ y: -2 }}
    className="rounded-2xl p-5 relative overflow-hidden premium-card"
    style={{
      background: `linear-gradient(135deg, ${color}10, rgba(255,255,255,0.02))`,
      border: `1px solid ${color}20`,
    }}>
    <div className="absolute -top-2 -right-2 text-5xl opacity-5">{icon}</div>
    <div className="text-[11px] font-medium text-slate-500 mb-1 uppercase tracking-wide">{label}</div>
    <div className="font-display font-bold text-2xl sm:text-3xl text-white" style={{ color }}>{value}</div>
    {sub && <div className="text-[11px] text-slate-500 mt-1">{sub}</div>}
  </motion.div>
);

const getBotPresence = (n) => {
  if (n?.connectionStatus === 'ERROR') {
    return {
      label: 'ERROR',
      dot: '✕',
      textClass: 'text-[#ff4444]',
      bg: 'rgba(255,68,68,0.1)',
      border: 'rgba(255,68,68,0.35)',
    };
  }
  if (n?.connectionStatus === 'LOGGED_OUT') {
    return {
      label: 'LOGGED OUT',
      dot: '⊘',
      textClass: 'text-[#ff8844]',
      bg: 'rgba(255,136,68,0.1)',
      border: 'rgba(255,136,68,0.35)',
    };
  }
  if (n?.status !== 'active') {
    return {
      label: 'OFFLINE',
      dot: '○',
      textClass: 'text-[#ffaa00]',
      bg: 'rgba(255,170,0,0.08)',
      border: 'rgba(255,170,0,0.3)',
    };
  }

  if (n?.botOnline) {
    return {
      label: 'ONLINE',
      dot: '●',
      textClass: 'text-[#00ff88]',
      bg: 'rgba(0,255,136,0.08)',
      border: 'rgba(0,255,136,0.3)',
    };
  }

  if (n?.botPhase === 'starting') {
    return {
      label: 'STARTING',
      dot: '◔',
      textClass: 'text-[#ffe066]',
      bg: 'rgba(255,224,102,0.08)',
      border: 'rgba(255,224,102,0.28)',
    };
  }

  if (n?.botPhase === 'syncing') {
    return {
      label: 'SYNCING',
      dot: '↻',
      textClass: 'text-[#00f5ff]',
      bg: 'rgba(0,245,255,0.08)',
      border: 'rgba(0,245,255,0.28)',
    };
  }

  if (n?.connectionStatus === 'DISCONNECTED' || n?.connectionStatus === 'CONNECTING') {
    return {
      label: n?.connectionStatus === 'CONNECTING' ? 'CONNECTING' : 'RECONNECTING',
      dot: '↻',
      textClass: 'text-[#ffe066]',
      bg: 'rgba(255,224,102,0.08)',
      border: 'rgba(255,224,102,0.28)',
    };
  }

  return {
    label: 'OFFLINE',
    dot: '○',
    textClass: 'text-[#ffaa00]',
    bg: 'rgba(255,170,0,0.08)',
    border: 'rgba(255,170,0,0.3)',
  };
};

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


/* ─── Subscription Status Badge (header) ─── */
const SubscriptionBadge = ({ user, stats }) => {
  const subStatus = user?.subscriptionStatus || stats?.subscriptionStatus || 'trial';
  const trialExpiresAt = user?.trialExpiresAt || stats?.trialExpiresAt || null;
  const [countdown, setCountdown] = React.useState('');

  React.useEffect(() => {
    if (subStatus !== 'trial' || !trialExpiresAt) return;
    const update = () => {
      const diff = new Date(trialExpiresAt) - new Date();
      if (diff <= 0) { setCountdown('EXPIRED'); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setCountdown(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [trialExpiresAt, subStatus]);

  if (subStatus === 'active_pro') {
    return (
      <div className="flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-display tracking-widest"
        style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.4)', color: '#a78bfa' }}>
        <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse inline-block" />
        PRO ACTIVE
      </div>
    );
  }
  if (subStatus === 'active_enterprise') {
    return (
      <div className="flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-display tracking-widest"
        style={{ background: 'rgba(255,0,255,0.1)', border: '1px solid rgba(255,0,255,0.4)', color: '#f0abfc' }}>
        <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-400 animate-pulse inline-block" />
        ENTERPRISE
      </div>
    );
  }
  if (subStatus === 'expired' || countdown === 'EXPIRED') {
    return (
      <div className="flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-display tracking-widest"
        style={{ background: 'rgba(255,68,68,0.12)', border: '1px solid rgba(255,68,68,0.4)', color: '#f87171' }}>
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
        EXPIRED
      </div>
    );
  }
  if (subStatus === 'trial' && trialExpiresAt && countdown) {
    const isLow = new Date(trialExpiresAt) - new Date() < 3 * 3600000;
    return (
      <div className="flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-mono"
        style={{
          background: isLow ? 'rgba(255,68,68,0.1)' : 'rgba(0,245,255,0.08)',
          border: `1px solid ${isLow ? 'rgba(255,68,68,0.4)' : 'rgba(0,245,255,0.3)'}`,
          color: isLow ? '#f87171' : '#22d3ee'
        }}>
        <span className={`w-1.5 h-1.5 rounded-full inline-block ${isLow ? 'bg-red-500 animate-ping' : 'bg-cyan-400 animate-pulse'}`} />
        TRIAL {countdown}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-display tracking-widest"
      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8' }}>
      FREE
    </div>
  );
};

/* ─── Site Audio Player ─── */
const SiteAudioPlayer = ({ audioUrl }) => {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    setLoadError(false);
    if (!audioRef.current || !audioUrl) return;
    const el = audioRef.current;
    el.loop = true;
    el.volume = 0.4;
    el.crossOrigin = 'anonymous';
    el.preload = 'auto';

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
    el.play()
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
  const btnColor = !playing ? '#8b5cf6' : muted ? '#ef4444' : '#22d3ee';
  const btnLabel = !playing ? 'PLAY' : muted ? 'UNMUTE' : 'MUTE';
  const btnIcon  = !playing ? '▶' : muted ? '🔇' : '🔊';
  return (
    <div className="fixed bottom-20 lg:bottom-6 right-4 z-30 flex flex-col items-center gap-1">
      <audio
        key={audioUrl}
        ref={audioRef}
        src={audioUrl}
        crossOrigin="anonymous"
        preload="auto"
        onError={() => {
          setLoadError(true);
          console.error('[Audio] failed to load:', audioUrl);
        }}
      />
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
          <a href="https://wa.me/8615507967005" target="_blank" rel="noreferrer"
            className="font-display font-bold text-base" style={{ color: '#8b5cf6' }}>+8615507967005</a>
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
  const [pairStatus, setPairStatus] = useState('');
  const [copied, setCopied] = useState(false);
  const [timer, setTimer] = useState(300);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const timerRef   = useRef(null);
  const pollRef    = useRef(null);
  const codePollRef = useRef(null);
  const requestStartedAtRef = useRef(0);
  const autoSaved  = useRef(false);
  const linkingRef = useRef(false);

  useEffect(() => {
    if (step === 3) {
      timerRef.current = setInterval(() => setTimer(t => {
        if (t <= 1) { clearInterval(timerRef.current); return 0; }
        return t - 1;
      }), 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [step]);

  const finishLinking = async () => {
    if (autoSaved.current || linkingRef.current) return;
    linkingRef.current = true;
    autoSaved.current = true;
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setSaving(true);
    try {
      const listRes = await axios.get('/api/numbers');
      const cleanNum = form.number.replace(/\D/g, '');
      const existing = (listRes.data || []).find(
        (n) => String(n.number).replace(/\D/g, '') === cleanNum
      );
      if (existing) {
        onAdd(existing);
      } else {
        const res = await axios.post('/api/numbers', { number: form.number, botName: form.botName });
        onAdd(res.data);
      }
      toast.success('✅ Number linked successfully');
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save number');
      autoSaved.current = false;
      linkingRef.current = false;
    } finally {
      setSaving(false);
    }
  };

  // Auto-detect WhatsApp pairing — polls DB (works web+worker split on Heroku)
  useEffect(() => {
    if (step !== 3) {
      autoSaved.current = false;
      linkingRef.current = false;
      return;
    }
    const cleanNum = form.number.replace(/\D/g, '');
    if (!cleanNum) return;

    const poll = async () => {
      if (autoSaved.current || linkingRef.current) return;
      try {
        const { data } = await axios.get(`/api/pairing/status/${cleanNum}`);
        setSyncing(Boolean(data.pairing || data.syncing));
        if (data.connected) {
          await finishLinking();
        }
      } catch (err) {
        if (err.response?.status === 403) {
          toast.error('Session expired — login again.');
        }
      }
    };

    poll();
    pollRef.current = setInterval(poll, 2000);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [step, form.number, form.botName]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll worker for pairing code (async flow — web enqueues, worker generates)
  useEffect(() => {
    if (step !== 2) {
      if (codePollRef.current) {
        clearInterval(codePollRef.current);
        codePollRef.current = null;
      }
      return;
    }
    const cleanNum = form.number.replace(/\D/g, '');
    if (!cleanNum) return;

    let cancelled = false;
    const pollCode = async () => {
      if (cancelled) return;
      try {
        const { data } = await axios.get(`/api/pairing/code/${cleanNum}`);
        setPairStatus(data.status || 'in_progress');
        if (data.status === 'expired') {
          setCode('');
          toast.error(data.error || 'Code expired — tap NEW CODE');
          return;
        }
        if (data.code) {
          const codeTime = data.updatedAt ? new Date(data.updatedAt).getTime() : Date.now();
          if (requestStartedAtRef.current && codeTime < requestStartedAtRef.current - 2000) {
            return;
          }
          setCode(data.code);
          setTimer(data.expiresInSec != null ? data.expiresInSec : 120);
          setStep(3);
          if (codePollRef.current) clearInterval(codePollRef.current);
        }
      } catch (err) {
        if (err.response?.data?.status === 'failed') {
          setStep(1);
          toast.error(err.response?.data?.error || 'Pairing failed on worker');
          if (codePollRef.current) clearInterval(codePollRef.current);
        }
      }
    };

    pollCode();
    codePollRef.current = setInterval(pollCode, 1000);
    const timeout = setTimeout(() => {
      if (!cancelled) {
        setStep(1);
        toast.error('Timed out waiting for pairing code. Try again.');
        if (codePollRef.current) clearInterval(codePollRef.current);
      }
    }, 90000);

    return () => {
      cancelled = true;
      if (codePollRef.current) clearInterval(codePollRef.current);
      clearTimeout(timeout);
    };
  }, [step, form.number]);

  const fmt = s => `${Math.floor(s / 60).toString().padStart(2,'0')}:${(s % 60).toString().padStart(2,'0')}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      toast.success('Code copied!');
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const handleRequest = async e => {
    e?.preventDefault();
    if (!form.number || !form.botName) return toast.error('All fields required');
    setCode('');
    setPairStatus('requested');
    requestStartedAtRef.current = Date.now();
    try {
      const { data } = await axios.post('/api/pairing/request', { phoneNumber: form.number, botName: form.botName });
      if (data.code) {
        setCode(data.code);
        setTimer(120);
        setStep(3);
        return;
      }
      if (data.async) {
        setPairStatus(data.status || 'requested');
        setStep(2);
        return;
      }
      throw new Error('No pairing code received from server.');
    } catch (err) {
      setStep(1);
      setPairStatus('');
      const errCode = err.response?.data?.error;
      if (errCode === 'PLAN_LIMIT_REACHED' || errCode === 'TRIAL_EXPIRED') {
        toast.error(err.response?.data?.message || 'Limit reached'); onClose();
      } else {
        toast.error(err.response?.data?.error || err.message || 'Failed to get pairing code. Try again.', { id: 'pair-req-err' });
      }
    }
  };

  const handleNewCode = async () => {
    autoSaved.current = false;
    linkingRef.current = false;
    if (pollRef.current) clearInterval(pollRef.current);
    await handleRequest();
  };

  const handleConfirm = async () => {
    if (autoSaved.current || linkingRef.current) return;
    const cleanNum = form.number.replace(/\D/g, '');
    setSaving(true);
    try {
      const { data } = await axios.get(`/api/pairing/status/${cleanNum}`);
      if (!data.connected) {
        if (data.syncing || data.status === 'code_ready') {
          toast.error('WhatsApp abhi sync ho raha hai — phone par "Keep app open" rakhein, 10–30 sec wait karein.');
        } else if (data.pairing) {
          toast.error('Pehle phone par WhatsApp → Linked Devices → code enter karein.');
        } else {
          toast.error('Abhi connect nahi hua — code dubara check karein ya NEW CODE try karein.');
        }
        return;
      }
      await finishLinking();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not verify WhatsApp connection');
    } finally {
      setSaving(false);
    }
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
                    className="input-neon rounded-xl w-full" placeholder="8615507967005" inputMode="tel" />
                  <p className="font-mono text-[10px] text-gray-600 mt-1">No + or spaces — e.g. 8615507967005</p>
                </div>
                <div>
                  <label className="font-mono text-[10px] text-[#00f5ff] tracking-widest block mb-2">BOT NAME</label>
                  <input value={form.botName} onChange={e => setForm(p => ({ ...p, botName: e.target.value }))}
                    className="input-neon rounded-xl w-full" placeholder="MY_BOT_ALPHA" />
                </div>
                <button type="submit"
                  disabled={pairStatus === 'requested'}
                  className="w-full py-3 rounded-xl font-display text-sm tracking-widest text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: 'linear-gradient(135deg,rgba(0,245,255,0.3),rgba(139,92,246,0.3))', border: '1px solid rgba(0,245,255,0.5)', boxShadow: '0 0 20px rgba(0,245,255,0.2)' }}>
                  {pairStatus === 'requested' ? '⏳ CONNECTING...' : '⚡ GET PAIRING CODE'}
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
                  <div className="font-mono text-[10px] text-gray-600 mt-1">
                    {pairStatus === 'code_ready' ? 'Code ready…' :
                     pairStatus === 'in_progress' ? 'Worker generating code…' :
                     pairStatus === 'requested' ? 'Queued on worker dyno…' :
                     'Usually 5–10 seconds — please wait'}
                  </div>
                </div>
              </motion.div>
            )}
            {step === 3 && (
              <motion.div key="code" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                <div className="rounded-2xl p-5 text-center"
                  style={{ background: 'rgba(0,245,255,0.06)', border: '1px solid rgba(0,245,255,0.3)', boxShadow: '0 0 30px rgba(0,245,255,0.08)' }}>
                  <div className="font-mono text-[10px] text-gray-400 tracking-widest mb-1">YOUR PAIRING CODE</div>
                  <div className="font-mono text-[10px] text-[#00f5ff] mb-3">
                    For WhatsApp number: <span className="font-bold">{form.number.replace(/\D/g, '')}</span>
                  </div>
                  <div className="font-mono text-[9px] text-gray-600 mb-3">
                    Phone par wahi number hona chahiye — code 2 min mein expire hota hai
                  </div>
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
                  {syncing && (
                    <div className="mt-3 font-mono text-[10px] text-[#00ff88] animate-pulse">
                      ⟳ WhatsApp sync ho raha hai — phone par app open rakhein, auto-connect ho jayega…
                    </div>
                  )}
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
                <div className="rounded-xl p-3 flex gap-2.5 items-start"
                  style={{ background: 'rgba(255,180,0,0.07)', border: '1px solid rgba(255,180,0,0.35)' }}>
                  <span className="text-base flex-shrink-0 mt-0.5">⚠️</span>
                  <p className="font-mono text-[10px] leading-relaxed" style={{ color: '#ffd966' }}>
                    SOMETIMES WHATSAPP SHOWS <strong>"THIS MAY BE A SCAM"</strong> WARNING BECAUSE OUR SERVERS RUN IN USA AND YOU ARE LINKING FROM PAKISTAN. THIS IS NORMAL — JUST TAP <strong>"LINK DEVICE"</strong> TO CONTINUE.
                  </p>
                </div>
                <div className="flex gap-3">
                  <button onClick={handleNewCode} className="py-3 px-4 rounded-xl font-mono text-xs text-gray-400"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>← NEW CODE</button>
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    onClick={handleConfirm} disabled={saving || timer === 0}
                    className="flex-1 py-3 rounded-xl font-display text-xs tracking-widest text-white"
                    style={{ background: 'linear-gradient(135deg,rgba(0,255,136,0.3),rgba(0,245,255,0.2))', border: '1px solid rgba(0,255,136,0.4)' }}>
                    {saving ? '⟳ CHECKING...' : '✓ I ENTERED THE CODE — VERIFY'}
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
  { id: 'support', label: 'SUPPORT', icon: '💬' },
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
  const [audioVersion, setAudioVersion] = useState(Date.now()); // cache-busting timestamp
  const [broadcast, setBroadcast] = useState(null);
  const [licenseKey, setLicenseKey] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [chatUnread, setChatUnread] = useState(0);
  const chatPollRef = useRef(null);

  useEffect(() => {
    fetchData();
    fetchAudio();
    fetchBroadcast();
    startChatPolling();
    // Auto-refresh license key + numbers every 30s (admin may have set a key)
    const refreshInterval = setInterval(() => {
      fetchData(true); // silent refresh, no loading spinner
    }, 30000);
    // Auto-refresh audio info every 30s — admin new audio upload karta hai to user panel pe bhi update ho
    const audioRefreshInterval = setInterval(() => {
      fetchAudio(true);
    }, 30000);
    return () => {
      if (chatPollRef.current) clearInterval(chatPollRef.current);
      clearInterval(refreshInterval);
      clearInterval(audioRefreshInterval);
    };
  }, []);

  const fetchData = async (silent = false, attempt = 0) => {
    if (!silent) setLoading(true);
    try {
      const [nRes, sRes, pRes] = await Promise.all([
        axios.get('/api/numbers'),
        axios.get('/api/user/stats'),
        axios.get('/api/user/profile'),
      ]);
      setNumbers(Array.isArray(nRes.data) ? nRes.data : []);
      setStats(sRes.data || null);
      setLicenseKey(pRes.data?.licenseKey || null);
    } catch (err) {
      const status = err?.response?.status;
      const msg = err?.response?.data?.error;
      const shouldRetry = attempt < 3 && (status === 503 || status === 502 || !err?.response);
      if (shouldRetry) {
        await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
        return fetchData(silent, attempt + 1);
      }
      if (!silent) {
        toast.error(
          status === 403 ? (msg || 'Access denied — plan may have expired.')
            : status === 401 ? 'Session expired — please login again.'
            : (msg || 'Failed to load data')
        );
      }
      // Hard-logout on auth failure so the user isn't stuck on a dashboard
      // whose token is dead. Without this every action keeps failing silently.
      if (status === 401) {
        try { logout(); } catch { }
        try { navigate('/login'); } catch { }
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const fetchAudio = async (silent = false) => {
    try {
      const res = await axios.get('/api/site/audio');
      const next = res.data?.original || '';
      // Use functional setter so the comparison uses the latest state, not
      // the value captured when fetchAudio was created. Otherwise the 30s
      // polling interval (mount-only useEffect) keeps seeing prev='' and
      // bumps audioVersion every tick, restarting the background music.
      setSiteAudio(prev => {
        if (next && next !== (prev?.original || '')) {
          setAudioVersion(Date.now());
        }
        return res.data || prev;
      });
    } catch { }
  };

  const fetchBroadcast = async () => {
    try {
      const res = await axios.get('/api/site/broadcast');
      setBroadcast(res.data.active ? res.data : null);
    } catch { }
  };

  // License key now fetched via fetchData() from /api/user/profile

  const fetchChatMessages = async () => {
    try {
      const res = await axios.get('/api/user/chat/messages');
      const msgs = res.data.messages || [];
      setChatMessages(msgs);
      const unread = msgs.filter(m => m.sender === 'admin' && !m.read).length;
      setChatUnread(unread);
    } catch { }
  };

  const startChatPolling = () => {
    fetchChatMessages();
    chatPollRef.current = setInterval(fetchChatMessages, 3000);
  };

  const sendChatMessage = async (e) => {
    e?.preventDefault();
    if (!chatInput.trim()) return;
    setChatSending(true);
    try {
      await axios.post('/api/user/chat/send', { message: chatInput.trim() });
      setChatInput('');
      await fetchChatMessages();
      toast.success('Message sent!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to send');
    } finally { setChatSending(false); }
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

  const handleDisconnect = async id => {
    if (!confirm('Disconnect this number?\n\nThe WhatsApp session will be terminated and all session files will be deleted. To reconnect, a fresh pairing code must be generated.')) return;
    try {
      await axios.post(`/api/numbers/${id}/disconnect`);
      setNumbers(p => p.filter(n => n._id !== id));
      setStats(p => ({ ...p, total: Math.max(0, (p?.total || 1) - 1), active: Math.max(0, (p?.active || 1) - 1) }));
      toast.success('Number disconnected. Slot is now free.');
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to disconnect'); }
  };

  const handleForceDisconnect = async (id, number) => {
    if (!confirm(`Force disconnect ${number}?\n\nThis will kill the bot process AND wipe all saved session data (filesystem + database). Use when the number is stuck or not responding.\n\nYou will need to re-pair to reconnect.`)) return;
    try {
      await axios.post(`/api/numbers/${id}/force-disconnect`);
      setNumbers(p => p.map(n => n._id === id ? { ...n, status: 'inactive' } : n));
      toast.success('Force disconnected! Session fully cleared.');
    } catch (err) { toast.error(err.response?.data?.error || 'Force disconnect failed'); }
  };

  const [reconnecting, setReconnecting] = useState({});
  const handleReconnect = async (id, number) => {
    setReconnecting(p => ({ ...p, [id]: true }));
    try {
      const res = await axios.post(`/api/numbers/${id}/reconnect`);
      toast.success(res.data?.message || `Reconnecting ${number}...`);
      // Optimistically show CONNECTING state then refresh after 4s
      setNumbers(p => p.map(n => n._id === id
        ? { ...n, connectionStatus: 'CONNECTING', botOnline: false, botPhase: 'starting' }
        : n));
      setTimeout(() => fetchData(true), 4000);
    } catch (err) {
      const d = err.response?.data;
      if (d?.needsRepair) {
        toast.error('No session in DB — please use DISCONNECT then re-pair this number.');
      } else {
        toast.error(d?.error || 'Reconnect failed. Try again.');
      }
    } finally {
      setReconnecting(p => ({ ...p, [id]: false }));
    }
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

  const handleRequestUpgrade = async (plan = 'pro') => {
    const wantedPlan = plan === 'enterprise' ? 'enterprise' : 'pro';
    setUpgradeLoading('upgrade');
    try {
      await axios.post('/api/user/upgrade-request', { plan: wantedPlan });
      toast.success(`Upgrade request sent (${wantedPlan.toUpperCase()})! Admin will review shortly.`);
      const waMsg = encodeURIComponent(`I want to upgrade my CYBERSECPRO account to ${wantedPlan.toUpperCase()}. Please review my upgrade request sent via dashboard.`);
      window.open('https://wa.me/8615507967005?text=' + waMsg, '_blank');
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

  const planColor = user?.subscriptionPlan === 'enterprise' ? '#a78bfa' : user?.subscriptionPlan === 'pro' ? '#8b5cf6' : '#22d3ee';

  const trialExpired = stats?.trialExpired;
  const trialExpiresAt = stats?.trialExpiresAt;
  const upgradeRequest = stats?.upgradeRequest;
  const audioUrl = siteAudio.filename ? `/api/site/audio/file?v=${audioVersion}` : '';

  const canAddNumber = !trialExpired && (stats?.total ?? 0) < (stats?.limit ?? 1);

  return (
    <div className="min-h-screen flex app-shell">
      <div className="fixed inset-0 cyber-grid pointer-events-none z-0 opacity-30" />

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
        className="fixed top-0 left-0 h-full w-64 z-40 flex flex-col bg-[#0f1629]/95 backdrop-blur-xl border-r border-white/8">
        <div className="p-5 border-b border-white/8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src={LOGO} className="w-9 h-9 rounded-xl object-cover ring-1 ring-white/10" alt="CSP" />
              <div>
                <div className="font-display text-xs font-bold text-white">CYBERSEC</div>
                <div className="font-display text-xs font-semibold text-slate-400">PRO</div>
              </div>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-slate-500 hover:text-white text-lg">×</button>
          </div>
        </div>
        <div className="mx-3 mt-3 mb-2 rounded-xl p-3 bg-white/3 border border-white/8">
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
          <div className="mt-2 flex justify-center">
            <SubscriptionBadge user={user} stats={stats} />
          </div>
        </div>
        <nav className="flex-1 px-2 py-2 space-y-1 overflow-y-auto">
          {NAV.map(item => (
            <button key={item.id} onClick={() => { setTab(item.id); setSidebarOpen(false); }}
              className="w-full text-left px-4 py-2.5 rounded-xl flex items-center gap-3 transition-all text-sm font-medium"
              style={{
                background: tab === item.id ? 'rgba(34,211,238,0.1)' : 'transparent',
                color: tab === item.id ? '#22d3ee' : '#94a3b8'
              }}>
              <span className="text-base">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
          {user?.role === 'admin' && (
            <Link to="/admin" onClick={() => setSidebarOpen(false)}>
              <div className="w-full text-left px-4 py-2.5 rounded-xl flex items-center gap-3 text-violet-400 hover:bg-violet-500/10 transition-all text-sm font-medium">
                <span>⚙️</span><span>Admin Panel</span>
              </div>
            </Link>
          )}
        </nav>
        <div className="p-2 border-t border-white/8">
          <button onClick={handleLogout}
            className="w-full px-4 py-2.5 rounded-xl text-sm font-medium text-red-400 flex items-center gap-3 hover:bg-red-500/10 transition-all">
            <span>⏻</span> Logout
          </button>
        </div>
      </motion.aside>

      {/* ════ MAIN AREA ════ */}
      <div className="flex-1 flex flex-col min-w-0 lg:ml-64 relative z-10">
        <header className="sticky top-0 z-20 flex items-center justify-between px-4 py-3 bg-[#0f1629]/80 backdrop-blur-xl border-b border-white/8">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(p => !p)}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-300 lg:hidden bg-white/5 border border-white/8 hover:bg-white/10 transition-all">☰</button>
            <div>
              <div className="font-display text-sm font-semibold text-white">{NAV.find(n => n.id === tab)?.label || 'Dashboard'}</div>
              <div className="text-[11px] text-slate-500">CYBERSECPRO Control Center</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <SubscriptionBadge user={user} stats={stats} />
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <div className="flex items-center gap-2 rounded-xl px-3 py-1.5 bg-white/5 border border-white/8">
              <span className="text-[11px] font-medium truncate max-w-[80px]" style={{ color: planColor }}>{user?.username}</span>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 pb-24 lg:pb-6 overflow-y-auto">
          {broadcast && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
              className="mb-4 rounded-2xl p-4 flex items-start gap-3"
              style={{ background: 'linear-gradient(135deg,rgba(255,170,0,0.12),rgba(255,68,0,0.08))', border: '1px solid rgba(255,170,0,0.4)', boxShadow: '0 0 20px rgba(255,170,0,0.1)' }}>
              <span className="text-2xl flex-shrink-0">📢</span>
              <div className="flex-1 min-w-0">
                <div className="font-display text-xs tracking-widest mb-1" style={{ color: '#ffaa00' }}>ADMIN ANNOUNCEMENT</div>
                <div className="font-mono text-sm text-white leading-relaxed">{broadcast.text}</div>
                <div className="font-mono text-[10px] text-gray-500 mt-1">
                  {broadcast.sentAt ? new Date(broadcast.sentAt).toLocaleString() : ''}
                </div>
              </div>
            </motion.div>
          )}
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
                        {/* ─── Single Upgrade Now Button ─── */}
                        <div className="px-4 pt-3 pb-1">
                          {upgradeRequest === 'none' ? (
                            <motion.button
                              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                              disabled={upgradeLoading === 'upgrade'}
                              onClick={handleRequestUpgrade}
                              className="w-full py-3 rounded-xl font-display text-xs tracking-widest transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                              style={{ background: 'linear-gradient(135deg,rgba(139,92,246,0.45),rgba(255,0,255,0.3))', border: '1.5px solid rgba(139,92,246,0.7)', color: '#fff', boxShadow: '0 0 22px rgba(139,92,246,0.35)' }}>
                              {upgradeLoading === 'upgrade' ? '⏳ Sending request...' : '⚡ UPGRADE NOW'}
                            </motion.button>
                          ) : (
                            <div className="font-mono text-[10px] text-center py-2.5 rounded-xl"
                              style={{ background: 'rgba(139,92,246,0.1)', color: '#8b5cf6', border: '1px solid rgba(139,92,246,0.25)' }}>
                              ⏳ UPGRADE REQUEST PENDING — Admin will review shortly
                            </div>
                          )}
                        </div>
                        <div className="px-4 pb-1 mt-0.5">
                          <div className="font-mono text-[9px] text-center text-gray-500">Sends request to admin panel + opens WhatsApp</div>
                        </div>
                        <div className="px-4 py-3">
                          <a href="https://wa.me/8615507967005?text=I%20want%20to%20buy%20access%20of%20website%20plz%20share%20details"
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
                        sub={`${Math.max(0, (stats?.limit ?? 1) - (stats?.total ?? 0))} slots left`} />
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

                    {/* ─── License Key Card ─── */}
                    {licenseKey !== undefined && (
                      <GCard className="p-4" style={{ border: licenseKey ? '1px solid rgba(0,255,136,0.25)' : '1px solid rgba(255,68,68,0.25)' }}>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                            style={{ background: licenseKey ? 'rgba(0,255,136,0.1)' : 'rgba(255,68,68,0.1)', border: licenseKey ? '1px solid rgba(0,255,136,0.3)' : '1px solid rgba(255,68,68,0.3)' }}>
                            {licenseKey ? '🔑' : '🔒'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-mono text-[9px] tracking-widest text-gray-500 mb-0.5">YOUR LICENSE KEY</div>
                            {licenseKey ? (
                              <div className="font-mono text-sm text-[#00ff88] font-bold tracking-wider truncate">{licenseKey}</div>
                            ) : (
                              <div className="font-mono text-sm text-red-400 font-bold">NOT SET — Contact admin</div>
                            )}
                          </div>
                          {licenseKey && (
                            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                              onClick={() => { navigator.clipboard.writeText(licenseKey); toast.success('License key copied!'); }}
                              className="px-3 py-1.5 rounded-lg font-mono text-[10px] text-[#00ff88] flex-shrink-0"
                              style={{ background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.25)' }}>
                              COPY
                            </motion.button>
                          )}
                        </div>
                      </GCard>
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
                            <div className="flex flex-col items-end gap-1">
                              <span className={n.status === 'active' ? 'status-active' : 'status-inactive'}>{n.status.toUpperCase()}</span>
                              {n.status === 'active' && (() => {
                                const presence = getBotPresence(n);
                                return (
                                  <span className={`font-mono text-[9px] ${presence.textClass}`}>
                                    {presence.dot} BOT {presence.label}
                                  </span>
                                );
                              })()}
                            </div>
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
                    {filtered.map((n, i) => {
                      const presence = getBotPresence(n);
                      return (
                        <motion.div key={n._id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                          className="rounded-2xl p-4"
                          style={{ background: 'rgba(10,20,60,0.55)', backdropFilter: 'blur(20px)', border: '1px solid rgba(0,245,255,0.14)' }}>

                          {/* ── Top row: info + status badge ── */}
                          <div className="flex items-start justify-between gap-2 mb-3">
                            <div className="flex-1 min-w-0">
                              <div className="font-mono text-sm text-white truncate">{n.number}</div>
                              <div className="font-mono text-[10px] text-[#00f5ff] mt-0.5 truncate">{n.botName}</div>
                              <div className="font-mono text-[10px] text-gray-600 mt-0.5">
                                Added {new Date(n.createdAt).toLocaleDateString()}
                              </div>
                              {n.status === 'active' && (
                                <div className="mt-1.5 space-y-0.5">
                                  {n.connectionStatus && (
                                    <div className="font-mono text-[9px] text-gray-500">
                                      WA: <span className="text-[#00f5ff]">{n.connectionStatus}</span>
                                      {n.sessionHealth && n.sessionHealth !== 'unknown' && (
                                        <span className="ml-2 text-gray-600">· {n.sessionHealth}</span>
                                      )}
                                    </div>
                                  )}
                                  {n.lastConnectedAt && (
                                    <div className="font-mono text-[9px] text-gray-600">
                                      Last: {new Date(n.lastConnectedAt).toLocaleString()}
                                    </div>
                                  )}
                                  {n.lastError && (
                                    <div className="font-mono text-[9px] text-red-400 truncate" title={n.lastError}>
                                      ⚠ {n.lastError}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                            {/* Bot presence badge — top right */}
                            <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                              {n.status === 'active' && (
                                <span className={`font-mono text-[9px] px-2 py-1 rounded-lg whitespace-nowrap ${presence.textClass}`}
                                  style={{ background: presence.bg, border: `1px solid ${presence.border}` }}>
                                  {presence.dot} {presence.label}
                                </span>
                              )}
                              {/* Toggle active/inactive */}
                              <button onClick={() => handleToggle(n._id)}
                                className={n.status === 'active' ? 'status-active' : 'status-inactive'}>
                                {n.status.toUpperCase()}
                              </button>
                            </div>
                          </div>

                          {/* ── Bottom row: action buttons (wrap on mobile) ── */}
                          <div className="flex flex-wrap gap-1.5 pt-2.5 border-t border-[rgba(0,245,255,0.08)]">
                            <button
                              onClick={() => handleDisconnect(n._id)}
                              title="Disconnect — session wipe, slot freed, fresh pairing needed"
                              className="flex-1 min-w-[90px] py-2 px-3 rounded-xl font-mono text-[10px] tracking-widest transition-all text-center"
                              style={{ background: 'rgba(255,68,68,0.08)', border: '1px solid rgba(255,68,68,0.35)', color: '#f87171' }}
                              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,68,68,0.18)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,68,68,0.08)'}
                            >
                              🔌 DISCONNECT
                            </button>

                            {n.status === 'active' && !n.botOnline && n.connectionStatus !== 'LOGGED_OUT' && (
                              <motion.button
                                whileTap={{ scale: 0.94 }}
                                onClick={() => handleReconnect(n._id, n.number)}
                                disabled={reconnecting[n._id]}
                                title="Force Reconnect — restore session from DB and reconnect bot without re-pairing"
                                className="flex-1 min-w-[90px] py-2 px-3 rounded-xl font-mono text-[10px] tracking-widest transition-all disabled:opacity-50 text-center"
                                style={{ background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.4)', color: '#00ff88' }}
                                onMouseEnter={e => { if (!reconnecting[n._id]) e.currentTarget.style.background = 'rgba(0,255,136,0.2)'; }}
                                onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,255,136,0.08)'}
                              >
                                {reconnecting[n._id] ? '↻ CONNECTING' : '⚡ RECONNECT'}
                              </motion.button>
                            )}

                            <button
                              onClick={() => handleForceDisconnect(n._id, n.number)}
                              title="Force Disconnect — kills bot + wipes ALL session data. Use when stuck."
                              className="flex-1 min-w-[90px] py-2 px-3 rounded-xl font-mono text-[10px] tracking-widest transition-all text-center"
                              style={{ background: 'rgba(255,140,0,0.08)', border: '1px solid rgba(255,140,0,0.4)', color: '#fb923c' }}
                              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,140,0,0.2)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,140,0,0.08)'}
                            >
                              🔥 FORCE
                            </button>
                          </div>
                        </motion.div>
                      );
                    })}
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
            {/* ══ SUPPORT CHAT ══ */}
            {tab === 'support' && (
              <motion.div key="support" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <div className="mb-5">
                  <h2 className="font-display text-xl font-bold gradient-text tracking-widest">SUPPORT CHAT</h2>
                  <p className="font-mono text-[10px] text-gray-500 mt-0.5">Message admin team directly</p>
                </div>
                <div className="max-w-lg mx-auto">
                  <GCard className="flex flex-col" style={{ height: 'calc(100vh - 240px)', minHeight: '400px' }}>
                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ maxHeight: '100%' }}>
                      {chatMessages.length === 0 ? (
                        <div className="text-center py-10">
                          <div className="text-4xl mb-3">💬</div>
                          <div className="font-mono text-xs text-gray-500">No messages yet</div>
                          <div className="font-mono text-[10px] text-gray-600 mt-1">Start a conversation with admin</div>
                        </div>
                      ) : (
                        chatMessages.map((m) => (
                          <div key={m._id || m.id} className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${m.sender === 'user' ? 'rounded-br-md' : 'rounded-bl-md'}`}
                              style={{
                                background: m.sender === 'user' ? 'rgba(0,245,255,0.12)' : 'rgba(139,92,246,0.15)',
                                border: m.sender === 'user' ? '1px solid rgba(0,245,255,0.25)' : '1px solid rgba(139,92,246,0.3)',
                              }}>
                              <div className="font-mono text-xs text-white leading-relaxed">{m.message}</div>
                              <div className="font-mono text-[9px] text-gray-500 mt-1 flex items-center gap-1">
                                {new Date(m.createdAt || m.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                                {m.sender === 'user' && <span style={{ color: '#00f5ff' }}>✓</span>}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                    {/* Input */}
                    <div className="p-3 border-t border-[rgba(0,245,255,0.1)]">
                      <form onSubmit={sendChatMessage} className="flex gap-2">
                        <input
                          value={chatInput}
                          onChange={e => setChatInput(e.target.value)}
                          placeholder="Type message to admin..."
                          className="flex-1 px-4 py-2.5 rounded-xl font-mono text-xs outline-none"
                          style={{ background: 'rgba(0,245,255,0.06)', border: '1px solid rgba(0,245,255,0.2)', color: '#fff' }}
                        />
                        <motion.button
                          whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                          disabled={chatSending || !chatInput.trim()}
                          className="px-4 py-2.5 rounded-xl font-display text-xs tracking-widest text-white transition-all disabled:opacity-40"
                          style={{ background: 'linear-gradient(135deg,rgba(0,245,255,0.3),rgba(139,92,246,0.3))', border: '1px solid rgba(0,245,255,0.4)' }}>
                          {chatSending ? '...' : '→'}
                        </motion.button>
                      </form>
                    </div>
                  </GCard>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      {/* ════ MOBILE BOTTOM NAV ════ */}
      <nav className="fixed bottom-0 left-0 right-0 z-20 lg:hidden flex bg-[#0f1629]/95 backdrop-blur-xl border-t border-white/8">
        {NAV.map(item => (
          <button key={item.id} onClick={() => setTab(item.id)}
            className="flex-1 flex flex-col items-center justify-center py-3 gap-1 transition-all relative"
            style={{ color: tab === item.id ? '#22d3ee' : '#64748b' }}>
            <span className="text-xl leading-none">{item.icon}</span>
            <span className="text-[10px] font-medium">{item.label}</span>
            {item.id === 'support' && chatUnread > 0 && (
              <span className="absolute top-1 right-2 w-4 h-4 rounded-full text-[8px] font-bold flex items-center justify-center bg-red-500 text-white">{chatUnread}</span>
            )}
            {tab === item.id && (
              <motion.div layoutId="tab-indicator" className="absolute top-0 h-0.5 w-10 rounded-full bg-cyan-400" />
            )}
          </button>
        ))}
        {user?.role === 'admin' && (
          <Link to="/admin" className="flex-1 flex flex-col items-center justify-center py-3 gap-1 text-violet-400">
            <span className="text-xl leading-none">⚙️</span>
            <span className="text-[10px] font-medium">Admin</span>
          </Link>
        )}
      </nav>
    </div>
  );
}
