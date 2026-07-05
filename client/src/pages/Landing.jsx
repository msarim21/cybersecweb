import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion';

const HERO_IMG = '/cybersecpro_hero.jpeg';
const CONTACT = '+8615507967005';
const INSTAGRAM = 'https://www.instagram.com/cyber_sec_pro';

const MatrixRain = () => {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const chars = '01アイウエオカキクケコCSP<>{}[]|=+*/\\CYBERSEC';
    const fontSize = 13;
    const cols = Math.floor(canvas.width / fontSize);
    const drops = Array(cols).fill(1);
    const colors = ['rgba(99,102,241,0.08)', 'rgba(139,92,246,0.06)', 'rgba(16,185,129,0.06)'];
    const draw = () => {
      ctx.fillStyle = 'rgba(9,9,11,0.04)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      drops.forEach((y, i) => {
        ctx.fillStyle = colors[i % colors.length];
        ctx.font = `${fontSize}px JetBrains Mono`;
        const char = chars[Math.floor(Math.random() * chars.length)];
        ctx.fillText(char, i * fontSize, y * fontSize);
        if (y * fontSize > canvas.height && Math.random() > 0.975) drops[i] = 0;
        drops[i]++;
      });
    };
    const interval = setInterval(draw, 50);
    const onResize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    window.addEventListener('resize', onResize);
    return () => { clearInterval(interval); window.removeEventListener('resize', onResize); };
  }, []);
  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-0 opacity-25" />;
};

const GlitchText = ({ children, className, style }) => {
  const [glitch, setGlitch] = useState(false);
  useEffect(() => {
    const t = setInterval(() => {
      setGlitch(true);
      setTimeout(() => setGlitch(false), 150);
    }, 3000 + Math.random() * 2000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className={className} style={{ ...style, position: 'relative', display: 'inline-block' }}>
      {children}
      {glitch && (
        <>
          <span style={{ position: 'absolute', top: 0, left: 2, color: '#ff00ff', clipPath: 'inset(20% 0 60% 0)', opacity: 0.8 }}>{children}</span>
          <span style={{ position: 'absolute', top: 0, left: -2, color: '#00f5ff', clipPath: 'inset(60% 0 10% 0)', opacity: 0.8 }}>{children}</span>
        </>
      )}
    </span>
  );
};

const FloatingOrb = ({ size, x, y, color, delay }) => (
  <motion.div
    className="absolute rounded-full pointer-events-none"
    style={{ width: size, height: size, left: x, top: y, background: `radial-gradient(circle, ${color}40 0%, transparent 70%)`, filter: `blur(${size / 2.5}px)` }}
    animate={{ y: [0, -40, 0], opacity: [0.4, 1, 0.4], scale: [1, 1.1, 1] }}
    transition={{ duration: 7, repeat: Infinity, delay, ease: 'easeInOut' }}
  />
);

const HUDRing = ({ size, color, duration, reverse, dashed }) => (
  <motion.div
    className="absolute rounded-full"
    style={{
      width: size, height: size,
      left: '50%', top: '50%',
      marginLeft: -size / 2, marginTop: -size / 2,
      border: dashed ? `1px dashed ${color}50` : `1px solid ${color}70`,
      boxShadow: `0 0 30px ${color}35, inset 0 0 30px ${color}20`
    }}
    animate={{ rotate: reverse ? -360 : 360 }}
    transition={{ duration, repeat: Infinity, ease: 'linear' }}
  />
);

const ScanLine = () => (
  <motion.div
    className="fixed inset-x-0 pointer-events-none z-0"
    style={{ height: 2, background: 'linear-gradient(90deg, transparent, rgba(0,245,255,0.4), transparent)' }}
    animate={{ top: ['-2px', '100vh'] }}
    transition={{ duration: 6, repeat: Infinity, ease: 'linear', repeatDelay: 3 }}
  />
);

const CounterCard = ({ value, label, prefix = '', suffix = '', color = '#00f5ff' }) => {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const end = parseInt(value.replace(/\D/g, ''));
    let start = 0;
    const step = end / 60;
    const t = setInterval(() => {
      start += step;
      if (start >= end) { setCount(end); clearInterval(t); } else setCount(Math.floor(start));
    }, 25);
    return () => clearInterval(t);
  }, [value]);
  return (
    <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
      whileHover={{ scale: 1.05, y: -5 }}
      className="rounded-2xl text-center p-6 premium-card card-hover"
      style={{
        background: `linear-gradient(145deg, ${color}10, rgba(9,9,11,0.9))`,
        border: `1px solid ${color}25`,
      }}>
      <div className="font-display text-2xl sm:text-3xl font-bold mb-1" style={{ color }}>{prefix}{count.toLocaleString()}{suffix}</div>
      <div className="w-8 h-px mx-auto mb-2 opacity-50" style={{ background: color }} />
      <div className="text-xs text-slate-500 uppercase tracking-wide font-medium">{label}</div>
    </motion.div>
  );
};

const HIGHLIGHT_FEATURES = [
  { icon: '📱', title: 'Bot Management', desc: 'Link and control WhatsApp numbers from one dashboard' },
  { icon: '🔒', title: 'Secure Pairing', desc: 'Encrypted pairing codes with session protection' },
  { icon: '📊', title: 'Real-time Stats', desc: 'Monitor active numbers and usage at a glance' },
];

const HeroLogo3D = () => (
  <motion.div
    className="hero-logo-3d-wrap"
    initial={{ opacity: 0, scale: 0.85, y: 30 }}
    animate={{ opacity: 1, scale: 1, y: 0 }}
    transition={{ duration: 0.7, ease: 'easeOut' }}>
    <div className="hero-logo-3d-glow" />
    <div className="hero-logo-3d-ring" />
    <div className="hero-logo-3d">
      <div className="hero-logo-3d-face">
        <img src={HERO_IMG} alt="CYBERSECPRO" />
      </div>
    </div>
  </motion.div>
);

const FEATURES = [
  { icon: '📱', title: 'Bot Management', desc: 'Link and control WhatsApp numbers from one dashboard with real-time status updates.', color: '#22d3ee' },
  { icon: '🔒', title: 'Secure Pairing', desc: 'Encrypted pairing codes with session protection and JWT authentication.', color: '#06b6d4' },
  { icon: '📊', title: 'Real-time Stats', desc: 'Monitor active numbers, usage graphs, and performance insights live.', color: '#34d399' },
  { icon: '🤖', title: 'AI-Powered Bots', desc: 'Intelligent bot management with automated responses and smart routing.', color: '#8b5cf6' },
  { icon: '🌐', title: 'Global Network', desc: 'Distributed infrastructure for ultra-low latency worldwide.', color: '#a78bfa' },
  { icon: '⚡', title: 'Lightning Fast', desc: 'Instant number linking and management across your entire network.', color: '#f59e0b' },
];

const PRICING = [
  {
    plan: 'FREE', color: '#22d3ee',
    price: 'FREE',
    period: '24 hours',
    users: '1 User',
    features: ['1 User Account', 'Basic Dashboard', 'Standard Security', 'Community Support', 'Basic Analytics'],
    cta: 'Start Free', ctaLink: '/signup', isFree: true
  },
  {
    plan: 'PRO', color: '#8b5cf6', popular: true,
    price: 'Contact',
    period: 'for pricing',
    users: '5 Users',
    features: ['5 User Accounts', 'Advanced Dashboard', 'Enhanced Security', 'Priority Support', 'Full Analytics', 'API Access', 'Custom Bot Names'],
    cta: 'Contact for PRO', isFree: false
  },
  {
    plan: 'ENTERPRISE', color: '#a78bfa',
    price: 'Contact',
    period: 'for pricing',
    users: 'Unlimited',
    features: ['Unlimited Users', 'Control Center', 'Military Security', 'Dedicated Support', 'AI Analytics', 'Full API Access', 'White Label', 'SLA Guarantee'],
    cta: 'Contact for Enterprise', isFree: false
  }
];

const TESTIMONIALS = [
  { name: 'Alex_X', role: 'Bot Developer', text: 'CYBERSECPRO transformed how I manage my bot infrastructure. Clean and easy to use.', rating: 5, color: '#22d3ee' },
  { name: 'CyberNinja', role: 'Tech Lead', text: 'Best SaaS platform I\'ve ever used. The security features are unmatched in every way.', rating: 5, color: '#8b5cf6' },
  { name: 'NexusOp', role: 'System Admin', text: 'Migrated 50+ numbers seamlessly. The admin panel is a complete game changer for teams.', rating: 5, color: '#a78bfa' },
];

const ParticleField = () => {
  const particles = Array.from({ length: 30 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 3 + 1,
    color: ['#6366f1', '#8b5cf6', '#a855f7', '#10b981'][Math.floor(Math.random() * 4)],
    duration: Math.random() * 8 + 4,
    delay: Math.random() * 4
  }));
  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      {particles.map(p => (
        <motion.div key={p.id}
          className="absolute rounded-full"
          style={{ left: `${p.x}%`, top: `${p.y}%`, width: p.size, height: p.size, background: p.color, boxShadow: `0 0 6px ${p.color}` }}
          animate={{ y: [0, -60, 0], opacity: [0, 1, 0], x: [0, Math.random() * 20 - 10, 0] }}
          transition={{ duration: p.duration, repeat: Infinity, delay: p.delay, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
};

export default function Landing() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeFeature, setActiveFeature] = useState(null);
  const { scrollYProgress } = useScroll();
  const headerOpacity = useTransform(scrollYProgress, [0, 0.1], [1, 0.95]);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#0f1629]">
      <div className="hidden md:block"><MatrixRain /></div>
      <div className="hidden md:block"><ParticleField /></div>

      <div className="hidden md:block">
        <FloatingOrb size={600} x="0%" y="-5%" color="#22d3ee" delay={0} />
        <FloatingOrb size={500} x="60%" y="0%" color="#8b5cf6" delay={2} />
        <FloatingOrb size={400} x="75%" y="50%" color="#a78bfa" delay={4} />
      </div>

      <div className="fixed inset-0 pointer-events-none z-0 cyber-grid opacity-30" />

      <motion.div className="fixed top-0 left-0 h-0.5 z-50 origin-left bg-gradient-to-r from-cyan-400 to-violet-400"
        style={{ scaleX: scrollYProgress }} />

      {/* Navbar — mobile-friendly like reference */}
      <motion.nav
        className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-3.5 bg-[#0f1629]/92 backdrop-blur-xl border-b border-white/8"
        style={{ opacity: headerOpacity, paddingTop: 'max(0.875rem, env(safe-area-inset-top))' }}>
        <div className="flex flex-col gap-0.5">
          <div className="font-display font-bold text-[15px] text-white tracking-tight leading-none">CYBERSECPRO</div>
          <div className="flex items-center gap-1.5 md:hidden">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
            <span className="text-[9px] font-semibold text-emerald-400 uppercase tracking-wider">Online</span>
          </div>
          <div className="hidden md:flex items-center gap-3">
            <img src={HERO_IMG} alt="" className="w-8 h-8 object-cover rounded-lg ring-1 ring-white/10" />
            <span className="text-xs text-slate-500">v4.0 Online</span>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-8">
          {['Features', 'Pricing', 'Testimonials'].map(item => (
            <a key={item} href={`#${item.toLowerCase()}`}
              className="text-sm font-medium text-slate-400 hover:text-white transition-colors">
              {item}
            </a>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <Link to="/login" className="md:hidden">
            <span className="text-sm font-semibold text-cyan-400 hover:text-cyan-300 transition-colors">Login</span>
          </Link>
          <Link to="/login" className="hidden md:block">
            <button className="btn-outline-cyan text-sm py-2 px-4">Login</button>
          </Link>
          <Link to="/signup" className="hidden md:block">
            <button className="btn-neon-solid text-sm py-2 px-4">Sign up</button>
          </Link>
          <button onClick={() => setMenuOpen(p => !p)} className="md:hidden text-xl text-slate-400 hover:text-white ml-1">
            {menuOpen ? '✕' : '☰'}
          </button>
        </div>
      </motion.nav>

      {/* Mobile Menu */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="fixed top-[65px] left-0 right-0 z-40 md:hidden px-4 py-4 flex flex-col gap-3 bg-[#0f1629]/95 backdrop-blur-xl border-b border-white/8">
            {['Features', 'Pricing', 'Testimonials'].map(item => (
              <a key={item} href={`#${item.toLowerCase()}`} onClick={() => setMenuOpen(false)}
                className="text-sm font-medium text-slate-300 hover:text-white transition-colors py-2 border-b border-white/5">{item}</a>
            ))}
            <Link to="/login" onClick={() => setMenuOpen(false)}>
              <button className="w-full py-3 rounded-xl text-sm font-medium border border-white/10 text-slate-300">Login</button>
            </Link>
            <Link to="/signup" onClick={() => setMenuOpen(false)}>
              <button className="w-full py-3 rounded-xl text-sm font-semibold btn-neon-solid">Sign up</button>
            </Link>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── HERO — mobile-first 3D professional ── */}
      <section className="relative z-10 mobile-hero-section px-4 overflow-hidden">

        {/* Mobile ambient glow */}
        <div className="md:hidden absolute top-16 left-1/2 -translate-x-1/2 w-[90vw] h-[45vw] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(ellipse, rgba(34,211,238,0.12) 0%, transparent 70%)', filter: 'blur(30px)' }} />

        {/* Desktop-only background logo */}
        <div className="hidden md:block absolute inset-0 pointer-events-none z-0">
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <div className="absolute opacity-15 relative" style={{ width: 500, height: 500, marginLeft: -250, marginTop: -250 }}>
              <HUDRing size={500} color="#22d3ee" duration={25} dashed />
            </div>
            <div className="w-[420px] h-[420px] rounded-full overflow-hidden opacity-50"
              style={{ border: '2px solid rgba(34,211,238,0.3)', boxShadow: '0 0 80px rgba(34,211,238,0.15)' }}>
              <img src={HERO_IMG} alt="" className="w-full h-full object-cover" aria-hidden="true" />
            </div>
          </div>
          <div className="absolute inset-0"
            style={{ background: 'radial-gradient(ellipse 55% 50% at 50% 50%, rgba(15,22,41,0.3) 0%, rgba(15,22,41,0.85) 100%)' }} />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative z-10 max-w-lg md:max-w-5xl mx-auto w-full flex flex-col">

          {/* Mobile: prominent 3D logo on top */}
          <div className="md:hidden mb-7">
            <HeroLogo3D />
          </div>

          {/* Status pill */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
            className="mobile-status-pill mb-5 self-start md:mx-auto md:self-center">
            <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse" />
            <span className="text-[11px] font-semibold text-cyan-300 tracking-wide">System Online</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="font-display font-extrabold mb-3 leading-[1.1] tracking-tight text-white md:text-center"
            style={{ fontSize: 'clamp(2rem, 8.5vw, 4rem)' }}>
            <span className="block md:hidden">NEXT-GEN</span>
            <span className="block md:hidden text-cyan-400">BOT PLATFORM</span>
            <span className="hidden md:inline">
              <GlitchText className="text-cyan-400">CYBER</GlitchText>
              <span className="text-white">SEC</span>
              <GlitchText className="text-violet-400">PRO</GlitchText>
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.25 }}
            className="text-[15px] text-slate-300 mb-7 leading-relaxed md:text-center md:max-w-2xl md:mx-auto">
            The ultimate control center for WhatsApp bot number management. Secure, scalable, and built for operators.
          </motion.p>

          {/* 3D touch-friendly CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="flex flex-col gap-3 mb-8 md:flex-row md:justify-center md:mb-14">
            <Link to="/signup" className="w-full md:w-auto">
              <button className="btn-3d-primary font-display text-sm flex items-center justify-center gap-2 md:px-10 md:w-auto">
                <span>⚡</span> Initialize Free
              </button>
            </Link>
            <a href="#features" className="w-full md:w-auto">
              <button className="btn-3d-secondary font-display text-sm md:px-10 md:w-auto">
                Explore System
              </button>
            </a>
          </motion.div>

          {/* Mobile 3D feature cards */}
          <div className="md:hidden">
            <p className="text-[11px] font-bold text-cyan-400 uppercase tracking-[0.15em] mb-4">System Features</p>
            <div className="space-y-3">
              {HIGHLIGHT_FEATURES.map((f, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.45 + i * 0.08 }}
                  className="card-3d-mobile flex items-center gap-4">
                  <div className="flex-shrink-0 w-12 h-12 flex items-center justify-center rounded-2xl text-xl"
                    style={{
                      background: 'linear-gradient(145deg, rgba(34,211,238,0.15), rgba(34,211,238,0.05))',
                      boxShadow: '0 4px 12px rgba(34,211,238,0.1), inset 0 1px 0 rgba(255,255,255,0.1)',
                      border: '1px solid rgba(34,211,238,0.2)',
                    }}>
                    {f.icon}
                  </div>
                  <div className="min-w-0">
                    <div className="font-display font-bold text-[15px] text-white mb-0.5">{f.title}</div>
                    <div className="text-[13px] text-slate-400 leading-snug">{f.desc}</div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Desktop stats */}
          <div className="hidden md:grid grid-cols-3 gap-4 max-w-lg mx-auto mt-4">
            <CounterCard value="1000+" label="Active Users" suffix="+" color="#22d3ee" />
            <CounterCard value="50000+" label="Bot Sessions" suffix="+" color="#8b5cf6" />
            <CounterCard value="99%" label="Uptime" suffix="%" color="#34d399" />
          </div>
        </motion.div>
      </section>

      {/* Features */}
      <section id="features" className="relative z-10 py-12 sm:py-24 px-4">
        <div className="max-w-6xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-14">
            <p className="text-xs font-semibold text-cyan-400 mb-3 uppercase tracking-wider">Core modules</p>
            <h2 className="font-display font-bold text-2xl sm:text-4xl mb-4 gradient-text">
              System Features
            </h2>
            <div className="mt-3 h-px max-w-xs mx-auto bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent" />
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5">
            {FEATURES.map((f, i) => (
              <motion.div key={i}
                initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                whileHover={{ y: -4 }}
                onHoverStart={() => setActiveFeature(i)} onHoverEnd={() => setActiveFeature(null)}
                className="card-3d-mobile sm:premium-card sm:card-hover cursor-default relative overflow-hidden sm:rounded-2xl sm:p-6"
                style={{
                  borderColor: activeFeature === i ? `${f.color}40` : undefined,
                }}>
                <div className="text-2xl sm:text-3xl mb-3 sm:mb-4">{f.icon}</div>
                <div className="font-display text-[15px] sm:text-sm font-bold mb-1.5 sm:mb-2" style={{ color: f.color }}>{f.title}</div>
                <div className="text-[13px] sm:text-xs text-slate-400 leading-relaxed">{f.desc}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Bot Capabilities */}
      <section id="capabilities" className="relative z-10 py-16 sm:py-24 px-4">
        <div className="max-w-6xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-14">
            <p className="text-xs font-semibold text-emerald-400 mb-3 uppercase tracking-wider">Bot capabilities</p>
            <h2 className="font-display font-bold text-3xl sm:text-4xl mb-4"
              style={{ background: 'linear-gradient(135deg, #10b981, #6366f1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              What CYBERSECPRO Can Do
            </h2>
            <div className="mt-3 h-px max-w-xs mx-auto bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent" />
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              {
                icon: '🤖',
                color: '#6366f1',
                title: 'AI Chat',
                desc: 'Talk directly to GPT & Gemini inside WhatsApp. Get answers, generate content, solve problems — all without leaving the app.',
                tag: 'GPT · GEMINI · AI IMAGE',
              },
              {
                icon: '🎵',
                color: '#8b5cf6',
                title: 'Media Downloader',
                desc: 'Download MP3 & MP4 from YouTube, TikTok, Spotify and more — instantly, with no third-party apps needed.',
                tag: 'YOUTUBE · TIKTOK · SPOTIFY',
              },
              {
                icon: '👁️',
                color: '#10b981',
                title: 'Deleted Message Viewer',
                desc: 'Never miss a deleted message again. The bot automatically captures and shows you messages before they disappear.',
                tag: 'AUTO CAPTURE · INSTANT NOTIFY',
              },
              {
                icon: '📸',
                color: '#a855f7',
                title: 'View Once Saver',
                desc: "WhatsApp's one-time view photos and videos are automatically saved — so you never lose them after a single view.",
                tag: 'PHOTOS · VIDEOS · AUTO SAVE',
              },
              {
                icon: '📥',
                color: '#f59e0b',
                title: 'Status Downloader',
                desc: "Reply to anyone's WhatsApp status and the bot instantly downloads the photo or video for you — no extra steps.",
                tag: 'PHOTO · VIDEO · ONE TAP',
              },
              {
                icon: '⚡',
                color: '#eab308',
                title: '700+ Features',
                desc: 'Group management, sticker maker, bug tools, utility commands, auto-replies, anti-spam and hundreds more built-in tools.',
                tag: 'GROUP · TOOLS · STICKERS · MORE',
                highlight: true,
              },
            ].map((f, i) => (
              <motion.div key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                whileHover={{ y: -8, scale: 1.02 }}
                className="rounded-xl p-6 relative overflow-hidden cursor-default"
                style={{
                  background: `linear-gradient(145deg, ${f.color}12, rgba(4,6,26,0.95))`,
                  border: `1px solid ${f.color}30`,
                  boxShadow: f.highlight ? `0 0 40px ${f.color}20` : 'none',
                  transition: 'all 0.3s ease',
                }}>
                {f.highlight && (
                  <motion.div className="absolute top-0 left-0 right-0 h-px"
                    style={{ background: `linear-gradient(90deg, transparent, ${f.color}, transparent)` }}
                    animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 2, repeat: Infinity }} />
                )}
                <div className="text-4xl mb-4">{f.icon}</div>
                {f.highlight && (
                  <motion.div
                    className="font-display font-black text-5xl mb-2"
                    style={{ color: f.color, textShadow: `0 0 30px ${f.color}80` }}
                    animate={{ textShadow: [`0 0 20px ${f.color}60`, `0 0 50px ${f.color}`, `0 0 20px ${f.color}60`] }}
                    transition={{ duration: 2.5, repeat: Infinity }}>
                    700+
                  </motion.div>
                )}
                <div className="font-display text-sm font-bold tracking-wider mb-2" style={{ color: f.color }}>{f.title}</div>
                <div className="font-mono text-xs text-gray-400 leading-relaxed mb-4">{f.desc}</div>
                <div className="font-mono text-[9px] tracking-widest px-2 py-1 rounded inline-block"
                  style={{ background: `${f.color}15`, color: `${f.color}aa`, border: `1px solid ${f.color}20` }}>
                  {f.tag}
                </div>
                <motion.div className="mt-4 h-px" style={{ background: `linear-gradient(90deg, ${f.color}80, transparent)` }}
                  initial={{ scaleX: 0, originX: 0 }}
                  whileInView={{ scaleX: 1 }}
                  transition={{ duration: 0.8, delay: i * 0.1 }} />
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="relative z-10 py-16 sm:py-24 px-4">
        <div className="max-w-5xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-14">
            <p className="text-xs font-semibold text-violet-400 mb-3 uppercase tracking-wider">Access tiers</p>
            <h2 className="font-display font-bold text-3xl sm:text-4xl mb-4"
              style={{ background: 'linear-gradient(135deg, #8b5cf6, #a855f7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Pricing
            </h2>
            <div className="mt-3 h-px max-w-xs mx-auto bg-gradient-to-r from-transparent via-violet-500/50 to-transparent" />
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {PRICING.map((tier, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.15 }}
                whileHover={{ y: -12, scale: 1.02 }}
                className="relative rounded-xl p-7 flex flex-col overflow-hidden"
                style={{
                  background: `linear-gradient(145deg, ${tier.color}15, rgba(4,6,26,0.97))`,
                  border: `1px solid ${tier.color}${tier.popular ? '70' : '35'}`,
                  boxShadow: tier.popular ? `0 0 60px ${tier.color}30, 0 0 120px ${tier.color}10` : `0 0 20px ${tier.color}10`
                }}>
                {tier.popular && (
                  <>
                    <div className="absolute top-0 left-0 right-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${tier.color}, transparent)` }} />
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-5 py-1.5 text-[9px] font-display tracking-widest rounded-full font-bold"
                      style={{ background: `linear-gradient(135deg, ${tier.color}, ${tier.color}aa)`, color: '#04061a' }}>
                      ★ MOST POPULAR
                    </div>
                  </>
                )}
                <div className="font-display text-xs tracking-widest mb-2" style={{ color: tier.color + 'aa' }}>// TIER</div>
                <div className="font-display text-2xl font-bold tracking-widest mb-2" style={{ color: tier.color, textShadow: `0 0 20px ${tier.color}60` }}>
                  {tier.plan}
                </div>
                <div className="mb-5 rounded-lg px-4 py-3 text-center" style={{ background: `${tier.color}10`, border: `1px solid ${tier.color}25` }}>
                  <div className="font-mono text-xs text-gray-500 mb-1 tracking-widest uppercase">Users</div>
                  <div className="font-display font-black text-2xl" style={{ color: tier.color }}>{tier.users}</div>
                </div>
                {tier.isFree ? (
                  <div className="mb-6 text-center">
                    <span className="font-display font-black text-3xl text-white">FREE</span>
                    <span className="font-mono text-gray-500 text-xs ml-2">/ 24 hours</span>
                  </div>
                ) : (
                  <div className="mb-6 text-center">
                    <div className="font-mono text-xs text-gray-400 mb-1 tracking-widest">FOR PRICING CONTACT</div>
                    <a href={`https://wa.me/${CONTACT.replace(/\+/g, '')}`} target="_blank" rel="noreferrer"
                      className="font-display font-bold text-lg transition-colors" style={{ color: tier.color }}>
                      {CONTACT}
                    </a>
                  </div>
                )}
                <div className="space-y-3 mb-8 flex-1">
                  {tier.features.map((f, j) => (
                    <motion.div key={j} className="flex items-center gap-3"
                      initial={{ opacity: 0, x: -10 }} whileInView={{ opacity: 1, x: 0 }} transition={{ delay: j * 0.05 }}>
                      <span style={{ color: tier.color }} className="text-sm">◆</span>
                      <span className="font-mono text-xs text-gray-300">{f}</span>
                    </motion.div>
                  ))}
                </div>
                {tier.isFree ? (
                  <Link to="/signup">
                    <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                      className="w-full py-3 rounded font-display text-xs tracking-widest transition-all"
                      style={{ background: `linear-gradient(135deg, ${tier.color}40, ${tier.color}20)`, border: `1px solid ${tier.color}70`, color: tier.color, boxShadow: `0 0 20px ${tier.color}20` }}>
                      {tier.cta}
                    </motion.button>
                  </Link>
                ) : (
                  <a href={`https://wa.me/${CONTACT.replace(/\+/g, '')}`} target="_blank" rel="noreferrer">
                    <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                      className="w-full py-3 rounded font-display text-xs tracking-widest transition-all"
                      style={{ background: `linear-gradient(135deg, ${tier.color}40, ${tier.color}20)`, border: `1px solid ${tier.color}70`, color: tier.color, boxShadow: `0 0 20px ${tier.color}20` }}>
                      📱 {tier.cta}
                    </motion.button>
                  </a>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="relative z-10 py-16 sm:py-24 px-4">
        <div className="max-w-5xl mx-auto">
          <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} className="text-center mb-14">
            <p className="text-xs font-semibold text-brand-400 mb-3 uppercase tracking-wider">User reviews</p>
            <h2 className="font-display font-bold text-3xl sm:text-4xl gradient-text">
              Testimonials
            </h2>
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.15 }}
                whileHover={{ y: -8, scale: 1.02 }}
                className="rounded-xl p-7 relative overflow-hidden"
                style={{ background: `linear-gradient(145deg, ${t.color}10, rgba(4,6,26,0.95))`, border: `1px solid ${t.color}30` }}>
                <div className="absolute top-0 right-0 w-24 h-24 rounded-full opacity-10"
                  style={{ background: `radial-gradient(circle, ${t.color}, transparent)`, filter: 'blur(20px)', transform: 'translate(30%, -30%)' }} />
                <div className="flex mb-4" style={{ color: t.color }}>{Array(t.rating).fill('★').join('')}</div>
                <p className="font-mono text-xs text-gray-300 leading-relaxed mb-6">"{t.text}"</p>
                <div className="border-t pt-4" style={{ borderColor: t.color + '25' }}>
                  <div className="font-display text-sm font-bold" style={{ color: t.color }}>{t.name}</div>
                  <div className="font-mono text-xs text-gray-500 mt-0.5">{t.role}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 py-16 sm:py-24 px-4">
        <motion.div initial={{ opacity: 0, scale: 0.98 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }}
          className="max-w-4xl mx-auto text-center rounded-3xl p-10 sm:p-16 relative overflow-hidden premium-card"
          style={{ background: 'linear-gradient(145deg, rgba(34,211,238,0.08), rgba(139,92,246,0.06))', border: '1px solid rgba(34,211,238,0.2)' }}>
          <div className="absolute inset-0 opacity-30" style={{ background: 'radial-gradient(circle at 30% 50%, rgba(99,102,241,0.15) 0%, transparent 50%), radial-gradient(circle at 70% 50%, rgba(139,92,246,0.1) 0%, transparent 50%)' }} />
          <h2 className="font-display font-bold text-3xl sm:text-4xl mb-6 relative z-10 gradient-text">
            Ready to get started?
          </h2>
          <p className="text-slate-400 text-base mb-10 relative z-10 max-w-lg mx-auto">
            Join thousands of operators using CYBERSECPRO to manage their bot infrastructure
          </p>
          <Link to="/signup">
            <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
              className="px-10 py-3.5 rounded-xl font-display text-sm font-bold btn-neon-solid relative z-10">
              Get started free
            </motion.button>
          </Link>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 py-12 px-4 sm:px-8 bg-[#0f1629]/90 border-t border-white/8">
        <div className="max-w-6xl mx-auto flex flex-col items-center gap-6">
          <div className="flex items-center gap-3">
            <img src={HERO_IMG} alt="CYBERSECPRO" className="w-9 h-9 object-cover rounded-xl ring-1 ring-white/10" />
            <span className="font-display text-base font-semibold text-white">CYBERSECPRO</span>
          </div>
          <div className="h-px w-40 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          <div className="text-center">
            <div className="text-sm text-slate-400 mb-1">
              Created by <span className="font-semibold text-white">CYBERSECPRO</span>
            </div>
            <div className="text-xs text-slate-500">
              For Premium Plans:{' '}
              <a href={`https://wa.me/${CONTACT.replace(/\+/g, '')}`} target="_blank" rel="noreferrer"
                className="text-cyan-400 hover:text-cyan-300 transition-colors">{CONTACT}</a>
            </div>
          </div>
          <div className="flex gap-6">
            <Link to="/login" className="text-sm text-slate-500 hover:text-white transition-colors">Login</Link>
            <span className="text-slate-700">|</span>
            <Link to="/signup" className="text-sm text-slate-500 hover:text-white transition-colors">Sign up</Link>
          </div>
          <div className="text-xs text-slate-600 text-center">
            © 2026 CYBERSECPRO — Professional Bot Management Platform
          </div>
          <div className="text-xs text-center text-slate-500">
            Web by{' '}
            <a href={INSTAGRAM} target="_blank" rel="noreferrer"
              className="text-brand-400 hover:text-brand-300 transition-colors">
              cyber_sec_pro
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
