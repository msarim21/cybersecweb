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
      background: 'rgba(15,5,30,0.65)',
      backdropFilter: 'blur(24px)',
      WebkitBackdropFilter: 'blur(24px)',
      border: '1px solid rgba(255,0,255,0.18)',
      ...style
    }}>
    {children}
  </div>
);

const StatPanel = ({ label, value, color, icon, sub }) => (
  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} whileHover={{ y: -3 }}
    className="rounded-2xl p-4 relative overflow-hidden"
    style={{
      background: `linear-gradient(135deg,${color}18,rgba(15,5,30,0.75))`,
      backdropFilter: 'blur(24px)',
      border: `1px solid ${color}35`,
      boxShadow: `0 0 24px ${color}12`
    }}>
    <div className="absolute -top-2 -right-2 text-5xl opacity-10">{icon}</div>
    <div className="font-mono text-[10px] tracking-widest mb-1" style={{ color: `${color}cc` }}>{label}</div>
    <div className="font-display font-black text-2xl sm:text-3xl" style={{ color, textShadow: `0 0 12px ${color}60` }}>{value}</div>
    {sub && <div className="font-mono text-[10px] text-gray-500 mt-1">{sub}</div>}
  </motion.div>
);

const NAV = [
  { id: 'overview', label: 'OVERVIEW', icon: '◈' },
  { id: 'users', label: 'USERS', icon: '👥' },
  { id: 'numbers', label: 'NUMBERS', icon: '📱' },
  { id: 'upgrades', label: 'UPGRADES', icon: '⚡' },
  { id: 'security', label: 'SECURITY', icon: '🛡️' },
  { id: 'audio', label: 'AUDIO', icon: '🎵' },
  { id: 'access', label: 'ACCESS', icon: '🔞' },
];

const SEV_COLOR = { CRITICAL: '#ff2244', HIGH: '#ff6600', MEDIUM: '#ffaa00', LOW: '#00f5ff' };
const SEV_BG    = { CRITICAL: 'rgba(255,34,68,0.15)', HIGH: 'rgba(255,102,0,0.12)', MEDIUM: 'rgba(255,170,0,0.1)', LOW: 'rgba(0,245,255,0.08)' };
const TYPE_ICON = { SQL_INJECTION: '💉', XSS_ATTEMPT: '⚡', BRUTE_FORCE: '🔨', CORS_VIOLATION: '🚫', RATE_LIMIT_EXCEEDED: '⏱️' };
function fmtTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' ' + d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

export default function Admin() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState('overview');
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [numbers, setNumbers] = useState([]);
  const [upgradeRequests, setUpgradeRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= 1024);
  useEffect(() => {
    const onResize = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const [threats, setThreats] = useState([]);
  const [threatSummary, setThreatSummary] = useState({ CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 });
  const [threatTotal, setThreatTotal] = useState(0);
  const [threatLoading, setThreatLoading] = useState(false);

  const [audioInfo, setAudioInfo] = useState({ filename: '', original: '' });
  const [audioUploading, setAudioUploading] = useState(false);
  const audioFileRef = useRef(null);
  const [adultCode, setAdultCode] = useState('');
  const [adultCodeInput, setAdultCodeInput] = useState('');
  const [adultUnlockedUsers, setAdultUnlockedUsers] = useState([]);
  const [adultBannedUsers, setAdultBannedUsers] = useState([]);
  const [adultLoading, setAdultLoading] = useState(false);
  const [botDisabledNumbers, setBotDisabledNumbers] = useState([]);
  const [botNumberInput, setBotNumberInput] = useState('');
  const [botControlLoading, setBotControlLoading] = useState(false);

  // ── Real-time new signup notifications ──
  const [newSignups, setNewSignups] = useState([]);
  const [newSignupBadge, setNewSignupBadge] = useState(0);
  const lastCheckedRef = useRef(Date.now());

  useEffect(() => { fetchData(); fetchAudio(); fetchThreats(); fetchAdult(); }, []);

  // Poll for new signups every 30 seconds
  useEffect(() => {
    const poll = async () => {
      try {
        const since = lastCheckedRef.current;
        lastCheckedRef.current = Date.now();
        const res = await axios.get(`/api/admin/new-signups?since=${since}`);
        const arrived = res.data.newUsers || [];
        if (arrived.length > 0) {
          setNewSignups(prev => [...arrived, ...prev].slice(0, 20));
          setNewSignupBadge(prev => prev + arrived.length);
          arrived.forEach(u => {
            toast.success(`🆕 New signup: ${u.username}`, {
              duration: 6000,
              style: {
                background: 'rgba(15,5,30,0.95)',
                border: '1px solid rgba(0,245,255,0.4)',
                color: '#00f5ff',
                fontFamily: 'monospace',
                fontSize: '12px'
              }
            });
          });
          // Refresh users list silently
          try {
            const uRes = await axios.get('/api/admin/users');
            setUsers(uRes.data.users || []);
          } catch {}
        }
      } catch {}
    };
    const id = setInterval(poll, 30000);
    return () => clearInterval(id);
  }, []);

  const fetchThreats = async () => {
    setThreatLoading(true);
    try {
      const res = await axios.get('/api/admin/security?limit=100');
      setThreats(res.data.threats || []);
      setThreatSummary(res.data.summary || { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 });
      setThreatTotal(res.data.total || 0);
    } catch { }
    finally { setThreatLoading(false); }
  };

  const clearThreats = async () => {
    if (!confirm('Clear all security threat logs?')) return;
    try { await axios.delete('/api/admin/security'); setThreats([]); setThreatSummary({ CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 }); setThreatTotal(0); toast.success('Threat log cleared'); }
    catch { toast.error('Failed to clear log'); }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [sR, uR, nR, upR] = await Promise.all([
        axios.get('/api/admin/stats'),
        axios.get('/api/admin/users'),
        axios.get('/api/admin/numbers'),
        axios.get('/api/admin/upgrade-requests'),
      ]);
      setStats(sR.data);
      setUsers(uR.data.users);
      setNumbers(nR.data);
      setUpgradeRequests(upR.data);
    } catch { toast.error('Failed to load admin data'); }
    finally { setLoading(false); }
  };

  const fetchAudio = async () => {
    try {
      const res = await axios.get('/api/admin/audio');
      setAudioInfo(res.data);
    } catch { }
  };

  const handleBan = async id => {
    try {
      const res = await axios.put(`/api/admin/users/${id}/ban`);
      setUsers(p => p.map(u => u.id === id || u._id === id ? { ...u, banned: res.data.banned } : u));
      toast.success(res.data.message);
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
  };

  const handleDelete = async id => {
    if (!confirm('Permanently delete this user and all their data?')) return;
    try {
      await axios.delete(`/api/admin/users/${id}`);
      setUsers(p => p.filter(u => u.id !== id && u._id !== id));
      toast.success('User deleted');
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
  };

  const handlePlanChange = async (id, plan) => {
    try {
      await axios.put(`/api/admin/users/${id}/plan`, { plan });
      setUsers(p => p.map(u => u.id === id || u._id === id ? { ...u, subscriptionPlan: plan } : u));
      toast.success(`Plan → ${plan.toUpperCase()}`);
    } catch { toast.error('Failed to update plan'); }
  };

  const handleApproveUpgrade = async (id, plan) => {
    try {
      await axios.put(`/api/admin/upgrade-requests/${id}/approve`, { plan });
      setUpgradeRequests(p => p.filter(r => r.id !== id));
      setUsers(p => p.map(u => u.id === id ? { ...u, subscriptionPlan: plan, upgradeRequest: 'none' } : u));
      toast.success(`Upgrade to ${plan.toUpperCase()} approved!`);
      fetchData();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to approve'); }
  };

  const handleRejectUpgrade = async (id) => {
    try {
      await axios.put(`/api/admin/upgrade-requests/${id}/reject`);
      setUpgradeRequests(p => p.filter(r => r.id !== id));
      toast.success('Upgrade request rejected.');
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to reject'); }
  };

  const handleAudioUpload = async () => {
    const file = audioFileRef.current?.files[0];
    if (!file) return toast.error('Please select an audio file.');
    setAudioUploading(true);
    try {
      const fd = new FormData();
      fd.append('audio', file);
      const res = await axios.post('/api/admin/audio', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Audio uploaded successfully!');
      setAudioInfo({ filename: res.data.filename, original: file.name });
      if (audioFileRef.current) audioFileRef.current.value = '';
    } catch (err) { toast.error(err.response?.data?.error || 'Upload failed'); }
    finally { setAudioUploading(false); }
  };

  const handleAudioRemove = async () => {
    if (!confirm('Remove the site audio?')) return;
    try {
      await axios.delete('/api/admin/audio');
      setAudioInfo({ filename: '', original: '' });
      toast.success('Audio removed.');
    } catch { toast.error('Failed to remove audio'); }
  };

  const fetchAdult = async () => {
    try {
      const [adultRes, botRes] = await Promise.all([
        axios.get('/api/admin/adult'),
        axios.get('/api/admin/bot-disabled'),
      ]);
      setAdultCode(adultRes.data.code || '');
      setAdultCodeInput(adultRes.data.code || '');
      setAdultUnlockedUsers(adultRes.data.unlockedUsers || []);
      setAdultBannedUsers(adultRes.data.bannedUsers || []);
      setBotDisabledNumbers(botRes.data.disabledNumbers || []);
    } catch {}
  };

  const handleUpdateAdultCode = async () => {
    if (!adultCodeInput.trim() || adultCodeInput.trim().length < 4)
      return toast.error('Code must be at least 4 characters.');
    setAdultLoading(true);
    try {
      const res = await axios.put('/api/admin/adult/code', { code: adultCodeInput.trim() });
      setAdultCode(res.data.code);
      toast.success('Secret code updated!');
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
    finally { setAdultLoading(false); }
  };

  const handleRemoveAdultUser = async (phone) => {
    try {
      const res = await axios.delete(`/api/admin/adult/user/${phone}`);
      setAdultUnlockedUsers(res.data.unlockedUsers || []);
      toast.success('User access removed.');
    } catch { toast.error('Failed to remove user.'); }
  };

  const handleClearAllAdult = async () => {
    if (!confirm('Remove 18+ access from ALL users?')) return;
    try {
      const res = await axios.delete('/api/admin/adult/all');
      setAdultUnlockedUsers(res.data.unlockedUsers || []);
      toast.success('All adult access cleared.');
    } catch { toast.error('Failed.'); }
  };

  const handleBanAdultUser = async (phone) => {
    const cleanPhone = phone.includes('@') ? phone.split('@')[0] : phone;
    if (!confirm(`Permanently ban ${cleanPhone} from 18+ content? They cannot re-unlock even with the code.`)) return;
    try {
      const res = await axios.post(`/api/admin/adult/ban/${cleanPhone}`);
      setAdultBannedUsers(res.data.bannedUsers || []);
      setAdultUnlockedUsers(res.data.unlockedUsers || []);
      toast.success(`🚫 ${cleanPhone} permanently banned from 18+`);
    } catch { toast.error('Failed to ban user'); }
  };

  const handleUnbanAdultUser = async (phone) => {
    const cleanPhone = phone.includes('@') ? phone.split('@')[0] : phone;
    try {
      const res = await axios.delete(`/api/admin/adult/ban/${cleanPhone}`);
      setAdultBannedUsers(res.data.bannedUsers || []);
      toast.success(`✅ ${cleanPhone} unbanned from 18+`);
    } catch { toast.error('Failed to unban user'); }
  };

  const handleBotDisable = async (phone) => {
    const cleanPhone = phone.trim().replace(/[^0-9]/g, '');
    if (!cleanPhone) return toast.error('Please enter a valid phone number');
    setBotControlLoading(true);
    try {
      const res = await axios.post(`/api/admin/bot-disabled/${cleanPhone}`);
      setBotDisabledNumbers(res.data.disabledNumbers || []);
      setBotNumberInput('');
      toast.success(`🔴 Bot disabled for ${cleanPhone}`);
    } catch { toast.error('Failed to disable bot'); }
    finally { setBotControlLoading(false); }
  };

  const handleBotEnable = async (phone) => {
    const cleanPhone = phone.includes('@') ? phone.split('@')[0] : phone;
    try {
      const res = await axios.delete(`/api/admin/bot-disabled/${cleanPhone}`);
      setBotDisabledNumbers(res.data.disabledNumbers || []);
      toast.success(`🟢 Bot enabled for ${cleanPhone}`);
    } catch { toast.error('Failed to enable bot'); }
  };

  const filtered = users.filter(u =>
    u.username?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase())
  );

  const planColors = { free: '#00f5ff', pro: '#8b5cf6', enterprise: '#ff00ff' };
  const pendingCount = upgradeRequests.length;

  return (
    <div className="min-h-screen flex" style={{ background: 'linear-gradient(135deg,#06091a 0%,#120820 50%,#06091a 100%)' }}>
      <div className="fixed top-0 left-0 right-0 h-0.5 z-50"
        style={{ background: 'linear-gradient(90deg,#ff00ff,#8b5cf6,#00f5ff)', boxShadow: '0 0 20px rgba(255,0,255,0.6)' }} />
      <div className="fixed inset-0 cyber-grid pointer-events-none z-0 opacity-30" />

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
        animate={{ x: (sidebarOpen || isDesktop) ? 0 : -260 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="fixed top-0 left-0 h-full w-60 z-40 flex flex-col lg:translate-x-0"
        style={{ background: 'rgba(8,3,18,0.96)', backdropFilter: 'blur(30px)', borderRight: '1px solid rgba(255,0,255,0.15)' }}>

        <div className="p-5 pt-6 border-b border-[rgba(255,0,255,0.12)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src={LOGO} className="w-9 h-9 rounded-xl object-cover" style={{ filter: 'drop-shadow(0 0 8px #ff00ff)' }} alt="CSP" />
              <div>
                <div className="font-display text-xs font-bold tracking-widest" style={{ color: '#ff00ff' }}>ADMIN</div>
                <div className="font-display text-xs font-bold text-white tracking-widest">CONTROL</div>
              </div>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-gray-500 hover:text-white">×</button>
          </div>
        </div>

        <div className="mx-3 mt-3 mb-2 rounded-xl p-3"
          style={{ background: 'rgba(255,0,255,0.08)', border: '1px solid rgba(255,0,255,0.2)' }}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base"
              style={{ background: 'rgba(255,0,255,0.15)', border: '1px solid rgba(255,0,255,0.3)' }}>⚙️</div>
            <div>
              <div className="font-display text-xs text-white">{user?.username}</div>
              <div className="font-mono text-[9px]" style={{ color: '#ff00ff' }}>◆ SUPER ADMIN</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-2 py-2 space-y-1 overflow-y-auto">
          {NAV.map(item => (
            <button key={item.id} onClick={() => { setTab(item.id); setSidebarOpen(false); }}
              className="w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 transition-all relative"
              style={{
                background: tab === item.id ? 'rgba(255,0,255,0.1)' : 'transparent',
                borderLeft: tab === item.id ? '2px solid #ff00ff' : '2px solid transparent',
                color: tab === item.id ? '#ff00ff' : '#9ca3af'
              }}>
              <span>{item.icon}</span>
              <span className="font-mono text-xs tracking-widest">{item.label}</span>
              {item.id === 'upgrades' && pendingCount > 0 && (
                <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ background: '#ff00ff', color: '#fff' }}>{pendingCount}</span>
              )}
              {item.id === 'users' && newSignupBadge > 0 && (
                <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full animate-pulse"
                  style={{ background: '#00f5ff', color: '#000' }}>{newSignupBadge}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="p-2 border-t border-[rgba(255,0,255,0.08)] space-y-1">
          <Link to="/dashboard" onClick={() => setSidebarOpen(false)}>
            <div className="px-4 py-3 rounded-xl font-mono text-xs tracking-widest text-[#00f5ff] flex items-center gap-3 hover:bg-[rgba(0,245,255,0.06)] transition-all">
              ← USER PANEL
            </div>
          </Link>
          <button onClick={() => { logout(); navigate('/'); }}
            className="w-full px-4 py-3 rounded-xl font-mono text-xs tracking-widest text-red-400 flex items-center gap-3 hover:bg-red-500/10 transition-all">
            <span>⏻</span> LOGOUT
          </button>
        </div>
      </motion.aside>

      {/* ════ MAIN ════ */}
      <div className="flex-1 flex flex-col min-w-0 lg:ml-60 relative z-10">
        <header className="sticky top-0.5 z-20 flex items-center justify-between px-4 py-3"
          style={{ background: 'rgba(8,3,18,0.9)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,0,255,0.12)' }}>
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(p => !p)}
              className="w-9 h-9 rounded-xl flex items-center justify-center lg:hidden"
              style={{ background: 'rgba(255,0,255,0.08)', border: '1px solid rgba(255,0,255,0.2)', color: '#ff00ff' }}>☰</button>
            <div>
              <div className="font-display text-sm tracking-widest" style={{ color: '#ff00ff' }}>ADMIN CONTROL CENTER</div>
              <div className="font-mono text-[10px] text-gray-600 hidden sm:block">CYBERSECPRO — CLASSIFIED ACCESS</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {pendingCount > 0 && (
              <button onClick={() => setTab('upgrades')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-mono text-[10px] animate-pulse"
                style={{ background: 'rgba(255,0,255,0.15)', border: '1px solid rgba(255,0,255,0.4)', color: '#ff00ff' }}>
                🔔 {pendingCount} upgrade{pendingCount > 1 ? 's' : ''}
              </button>
            )}
            <button onClick={fetchData}
              className="px-3 py-1.5 rounded-xl font-mono text-[10px] tracking-widest transition-all"
              style={{ border: '1px solid rgba(255,0,255,0.25)', color: '#ff00ff', background: 'rgba(255,0,255,0.06)' }}>
              ↻ REFRESH
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 pb-24 lg:pb-6 overflow-y-auto">
          <AnimatePresence mode="wait">

            {/* ══ OVERVIEW ══ */}
            {tab === 'overview' && (
              <motion.div key="overview" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <div className="mb-5">
                  <h2 className="font-display text-xl font-bold tracking-widest"
                    style={{ color: '#ff00ff', textShadow: '0 0 20px rgba(255,0,255,0.35)' }}>SYSTEM ANALYTICS</h2>
                  <p className="font-mono text-[10px] text-gray-500 mt-0.5">Global platform statistics</p>
                </div>

                {loading ? (
                  <div className="flex justify-center py-20"><div className="cyber-spinner" style={{ borderTopColor: '#ff00ff' }} /></div>
                ) : (
                  <div className="space-y-4">
                    {pendingCount > 0 && (
                      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                        className="rounded-2xl p-4 flex items-center justify-between"
                        style={{ background: 'rgba(255,0,255,0.08)', border: '1px solid rgba(255,0,255,0.3)' }}>
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">🔔</span>
                          <div>
                            <div className="font-display text-sm text-[#ff00ff] tracking-widest">{pendingCount} UPGRADE REQUEST{pendingCount > 1 ? 'S' : ''} PENDING</div>
                            <div className="font-mono text-[10px] text-gray-400">Users are waiting for plan approval</div>
                          </div>
                        </div>
                        <button onClick={() => setTab('upgrades')}
                          className="px-4 py-2 rounded-xl font-mono text-xs text-[#ff00ff]"
                          style={{ background: 'rgba(255,0,255,0.1)', border: '1px solid rgba(255,0,255,0.3)' }}>
                          REVIEW →
                        </button>
                      </motion.div>
                    )}

                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                      <StatPanel label="TOTAL USERS" value={stats?.totalUsers || 0} color="#00f5ff" icon="👥" />
                      <StatPanel label="TOTAL NUMBERS" value={stats?.totalNumbers || 0} color="#8b5cf6" icon="📱" />
                      <StatPanel label="ONLINE NOW" value={stats?.onlineUsers || 0} color="#00ff88" icon="🟢" sub="Last 5 min" />
                      <StatPanel label="ACTIVE NUMBERS" value={stats?.activeNumbers || 0} color="#ffaa00" icon="⚡" />
                      <StatPanel label="BANNED USERS" value={stats?.bannedUsers || 0} color="#ff4444" icon="🚫" />
                    </div>

                    <GCard className="p-5">
                      <h3 className="font-mono text-[10px] tracking-widest mb-4" style={{ color: '#ff00ff' }}>PLAN DISTRIBUTION</h3>
                      <div className="grid grid-cols-3 gap-4">
                        {['free', 'pro', 'enterprise'].map(plan => {
                          const count = stats?.planBreakdown?.find(p => p._id === plan)?.count || 0;
                          const col = planColors[plan];
                          const total = stats?.totalUsers || 1;
                          return (
                            <div key={plan} className="text-center">
                              <div className="font-display text-2xl font-bold mb-1" style={{ color: col }}>{count}</div>
                              <div className="font-mono text-[10px] text-gray-500 mb-2">{plan.toUpperCase()}</div>
                              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                                <motion.div initial={{ width: 0 }} animate={{ width: `${(count / total) * 100}%` }}
                                  transition={{ duration: 1 }} className="h-full rounded-full"
                                  style={{ background: col, boxShadow: `0 0 6px ${col}` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </GCard>

                    <GCard>
                      <div className="px-4 py-3 border-b border-[rgba(255,0,255,0.1)]">
                        <span className="font-mono text-[10px] tracking-widest" style={{ color: '#ff00ff' }}>RECENT REGISTRATIONS</span>
                      </div>
                      <div className="sm:hidden divide-y divide-[rgba(255,0,255,0.06)]">
                        {users.slice(0, 8).map(u => (
                          <div key={u.id || u._id} className="px-4 py-3 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="font-mono text-sm text-[#00f5ff] truncate">{u.username}</div>
                              <div className="font-mono text-[10px] text-gray-500 truncate">{u.email}</div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className="font-mono text-[10px] px-2 py-0.5 rounded"
                                style={{ color: planColors[u.subscriptionPlan] || '#00f5ff', border: '1px solid currentColor', background: 'rgba(0,0,0,0.3)' }}>
                                {u.subscriptionPlan?.toUpperCase()}
                              </span>
                              <span className={u.banned ? 'status-inactive' : 'status-active'}>{u.banned ? 'BAN' : 'OK'}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="hidden sm:block overflow-x-auto">
                        <table className="w-full cyber-table">
                          <thead><tr><th>USERNAME</th><th>EMAIL</th><th>PLAN</th><th>STATUS</th><th>JOINED</th></tr></thead>
                          <tbody>
                            {users.slice(0, 8).map((u, i) => (
                              <motion.tr key={u.id || u._id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.05 }}>
                                <td className="text-[#00f5ff]">{u.username}</td>
                                <td className="text-gray-400 text-xs">{u.email}</td>
                                <td>
                                  <span className="font-mono text-xs px-2 py-0.5 rounded"
                                    style={{ color: planColors[u.subscriptionPlan] || '#00f5ff', border: '1px solid currentColor', background: 'rgba(0,0,0,0.3)' }}>
                                    {u.subscriptionPlan?.toUpperCase()}
                                  </span>
                                </td>
                                <td><span className={u.banned ? 'status-inactive' : 'status-active'}>{u.banned ? 'BANNED' : 'ACTIVE'}</span></td>
                                <td className="text-gray-600 text-xs">{new Date(u.created_at || u.createdAt).toLocaleDateString()}</td>
                              </motion.tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </GCard>
                  </div>
                )}
              </motion.div>
            )}

            {/* ══ USERS ══ */}
            {tab === 'users' && (
              <motion.div key="users" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h2 className="font-display text-xl font-bold tracking-widest" style={{ color: '#ff00ff' }}>USER MANAGEMENT</h2>
                    <p className="font-mono text-[10px] text-gray-500 mt-0.5">{users.length} operators registered</p>
                  </div>
                </div>

                {/* ── Recent Signups Live Feed ── */}
                {newSignups.length > 0 && (
                  <GCard className="p-4 mb-4" style={{ border: '1px solid rgba(0,245,255,0.35)' }}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[#00f5ff] animate-pulse" style={{ boxShadow: '0 0 6px #00f5ff' }} />
                        <span className="font-mono text-[10px] tracking-widest" style={{ color: '#00f5ff' }}>
                          NEW SIGNUPS — LIVE FEED
                        </span>
                        {newSignupBadge > 0 && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                            style={{ background: '#00f5ff', color: '#000' }}>{newSignupBadge} NEW</span>
                        )}
                      </div>
                      <button onClick={() => { setNewSignups([]); setNewSignupBadge(0); }}
                        className="font-mono text-[9px] text-gray-500 hover:text-white transition-all px-2 py-1 rounded"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
                        CLEAR
                      </button>
                    </div>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {newSignups.map((u, i) => (
                        <motion.div key={u.id || i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                          className="flex items-center justify-between rounded-xl px-3 py-2"
                          style={{ background: 'rgba(0,245,255,0.05)', border: '1px solid rgba(0,245,255,0.15)' }}>
                          <div className="flex items-center gap-3">
                            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold"
                              style={{ background: 'rgba(0,245,255,0.15)', color: '#00f5ff' }}>
                              {u.username?.[0]?.toUpperCase() || '?'}
                            </div>
                            <div>
                              <div className="font-mono text-xs font-bold" style={{ color: '#00f5ff' }}>{u.username}</div>
                              <div className="font-mono text-[9px] text-gray-500">{u.email}</div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-mono text-[9px] px-2 py-0.5 rounded-full"
                              style={{ background: u.plan === 'enterprise' ? 'rgba(255,0,255,0.15)' : u.plan === 'pro' ? 'rgba(139,92,246,0.15)' : 'rgba(0,245,255,0.08)', color: u.plan === 'enterprise' ? '#ff00ff' : u.plan === 'pro' ? '#8b5cf6' : '#00f5ff', border: `1px solid ${u.plan === 'enterprise' ? 'rgba(255,0,255,0.3)' : u.plan === 'pro' ? 'rgba(139,92,246,0.3)' : 'rgba(0,245,255,0.2)'}` }}>
                              {(u.plan || 'FREE').toUpperCase()}
                            </div>
                            <div className="font-mono text-[8px] text-gray-600 mt-1">
                              {new Date(u.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </GCard>
                )}

                <input value={search} onChange={e => setSearch(e.target.value)}
                  className="input-neon rounded-xl w-full mb-4" placeholder="🔍  SEARCH USERS..."
                  style={{ borderColor: 'rgba(255,0,255,0.3)' }} />

                {loading ? (
                  <div className="flex justify-center py-20"><div className="cyber-spinner" style={{ borderTopColor: '#ff00ff' }} /></div>
                ) : filtered.length === 0 ? (
                  <GCard className="p-10 text-center">
                    <div className="text-4xl mb-3">👥</div>
                    <div className="font-mono text-xs text-gray-500">NO USERS FOUND</div>
                  </GCard>
                ) : (
                  <>
                    <div className="sm:hidden space-y-3">
                      {filtered.map((u, i) => {
                        const uid = u.id || u._id;
                        return (
                          <motion.div key={uid} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                            className="rounded-2xl p-4"
                            style={{ background: 'rgba(15,5,30,0.65)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,0,255,0.14)' }}>
                            <div className="flex items-start justify-between gap-3 mb-3">
                              <div className="min-w-0">
                                <div className="font-mono text-sm text-[#00f5ff] font-bold truncate">{u.username}</div>
                                <div className="font-mono text-[10px] text-gray-500 truncate">{u.email}</div>
                                {u.upgradeRequest && u.upgradeRequest !== 'none' && (
                                  <div className="font-mono text-[10px] mt-1" style={{ color: '#ff00ff' }}>
                                    ⚡ Requesting {u.upgradeRequest?.toUpperCase()}
                                  </div>
                                )}
                                {u.trialExpiresAt && (
                                  <div className="font-mono text-[9px] text-gray-600 mt-0.5">
                                    Trial: {new Date(u.trialExpiresAt) > new Date() ? '🟢 Active' : '🔴 Expired'}
                                  </div>
                                )}
                              </div>
                              <select value={u.subscriptionPlan} onChange={e => handlePlanChange(uid, e.target.value)}
                                className="text-xs font-mono px-2 py-1.5 rounded-lg outline-none"
                                style={{ background: 'rgba(255,0,255,0.08)', border: '1px solid rgba(255,0,255,0.25)', color: planColors[u.subscriptionPlan] || '#fff' }}>
                                <option value="free" style={{ background: '#0a0a1a' }}>FREE</option>
                                <option value="pro" style={{ background: '#0a0a1a' }}>PRO</option>
                                <option value="enterprise" style={{ background: '#0a0a1a' }}>ENTERPRISE</option>
                              </select>
                            </div>
                            {u.role !== 'admin' && (
                              <div className="flex gap-2 pt-2 border-t border-[rgba(255,0,255,0.07)]">
                                <button onClick={() => handleBan(uid)}
                                  className="flex-1 py-2 rounded-xl font-mono text-xs transition-all"
                                  style={{ background: u.banned ? 'rgba(0,255,136,0.08)' : 'rgba(255,170,0,0.08)', border: `1px solid ${u.banned ? 'rgba(0,255,136,0.25)' : 'rgba(255,170,0,0.25)'}`, color: u.banned ? '#00ff88' : '#ffaa00' }}>
                                  {u.banned ? 'UNBAN' : 'BAN'}
                                </button>
                                <button onClick={() => handleDelete(uid)}
                                  className="flex-1 py-2 rounded-xl font-mono text-xs transition-all"
                                  style={{ background: 'rgba(255,68,68,0.08)', border: '1px solid rgba(255,68,68,0.25)', color: '#ff4444' }}>
                                  DELETE
                                </button>
                              </div>
                            )}
                          </motion.div>
                        );
                      })}
                    </div>

                    <GCard className="hidden sm:block overflow-x-auto">
                      <table className="w-full cyber-table min-w-[800px]">
                        <thead><tr><th>USERNAME</th><th>EMAIL</th><th>PLAN</th><th>TRIAL</th><th>STATUS</th><th>JOINED</th><th className="text-right">ACTIONS</th></tr></thead>
                        <tbody>
                          {filtered.map((u, i) => {
                            const uid = u.id || u._id;
                            return (
                              <motion.tr key={uid} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}>
                                <td className="text-[#00f5ff] font-bold">
                                  {u.username}
                                  {u.upgradeRequest && u.upgradeRequest !== 'none' && (
                                    <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,0,255,0.2)', color: '#ff00ff' }}>
                                      ⚡ {u.upgradeRequest?.toUpperCase()} REQ
                                    </span>
                                  )}
                                </td>
                                <td className="text-gray-400 text-xs">{u.email}</td>
                                <td>
                                  <select value={u.subscriptionPlan} onChange={e => handlePlanChange(uid, e.target.value)}
                                    className="text-xs font-mono px-2 py-1 rounded outline-none"
                                    style={{ background: 'rgba(255,0,255,0.06)', border: '1px solid rgba(255,0,255,0.2)', color: planColors[u.subscriptionPlan] || '#fff' }}>
                                    <option value="free" style={{ background: '#0a0a1a' }}>FREE</option>
                                    <option value="pro" style={{ background: '#0a0a1a' }}>PRO</option>
                                    <option value="enterprise" style={{ background: '#0a0a1a' }}>ENTERPRISE</option>
                                  </select>
                                </td>
                                <td className="text-xs">
                                  {u.trialExpiresAt ? (
                                    <span style={{ color: new Date(u.trialExpiresAt) > new Date() ? '#00ff88' : '#ff4444' }}>
                                      {new Date(u.trialExpiresAt) > new Date() ? '🟢 Active' : '🔴 Expired'}
                                    </span>
                                  ) : <span className="text-gray-600">N/A</span>}
                                </td>
                                <td><span className={u.banned ? 'status-inactive' : 'status-active'}>{u.banned ? 'BANNED' : 'ACTIVE'}</span></td>
                                <td className="text-gray-600 text-xs">{new Date(u.created_at || u.createdAt).toLocaleDateString()}</td>
                                <td className="text-right">
                                  {u.role !== 'admin' && (
                                    <div className="flex gap-3 justify-end">
                                      <button onClick={() => handleBan(uid)}
                                        className={`font-mono text-xs transition-colors ${u.banned ? 'text-green-400 hover:text-green-300' : 'text-yellow-400 hover:text-yellow-300'}`}>
                                        {u.banned ? 'UNBAN' : 'BAN'}
                                      </button>
                                      <button onClick={() => handleDelete(uid)} className="font-mono text-xs text-red-400 hover:text-red-300">DELETE</button>
                                    </div>
                                  )}
                                </td>
                              </motion.tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </GCard>
                  </>
                )}
              </motion.div>
            )}

            {/* ══ NUMBERS ══ */}
            {tab === 'numbers' && (
              <motion.div key="numbers" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <div className="mb-5">
                  <h2 className="font-display text-xl font-bold tracking-widest" style={{ color: '#ff00ff' }}>ALL LINKED NUMBERS</h2>
                  <p className="font-mono text-[10px] text-gray-500 mt-0.5">{numbers.length} numbers in system</p>
                </div>

                {loading ? (
                  <div className="flex justify-center py-20"><div className="cyber-spinner" style={{ borderTopColor: '#ff00ff' }} /></div>
                ) : numbers.length === 0 ? (
                  <GCard className="p-10 text-center">
                    <div className="text-4xl mb-3">📱</div>
                    <div className="font-mono text-xs text-gray-500">NO NUMBERS IN SYSTEM</div>
                  </GCard>
                ) : (
                  <>
                    <div className="sm:hidden space-y-3">
                      {numbers.map((n, i) => (
                        <motion.div key={n._id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                          className="rounded-2xl p-4"
                          style={{ background: 'rgba(15,5,30,0.65)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,0,255,0.14)' }}>
                          <div className="flex items-center justify-between">
                            <div className="min-w-0">
                              <div className="font-mono text-sm text-[#00f5ff] truncate">{n.number}</div>
                              <div className="font-mono text-[10px] text-gray-300">{n.botName}</div>
                              <div className="font-mono text-[10px] text-[#8b5cf6] mt-0.5">Owner: {n.ownerId?.username || 'N/A'}</div>
                            </div>
                            <span className={n.status === 'active' ? 'status-active' : 'status-inactive'}>{n.status?.toUpperCase()}</span>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                    <GCard className="hidden sm:block overflow-x-auto">
                      <table className="w-full cyber-table min-w-[700px]">
                        <thead><tr><th>NUMBER</th><th>BOT NAME</th><th>OWNER</th><th>STATUS</th><th>DATE ADDED</th></tr></thead>
                        <tbody>
                          {numbers.map((n, i) => (
                            <motion.tr key={n._id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}>
                              <td className="text-[#00f5ff]">{n.number}</td>
                              <td className="text-gray-300">{n.botName}</td>
                              <td className="text-[#8b5cf6]">{n.ownerId?.username || 'N/A'}</td>
                              <td><span className={n.status === 'active' ? 'status-active' : 'status-inactive'}>{n.status?.toUpperCase()}</span></td>
                              <td className="text-gray-600 text-xs">{new Date(n.createdAt).toLocaleDateString()}</td>
                            </motion.tr>
                          ))}
                        </tbody>
                      </table>
                    </GCard>
                  </>
                )}
              </motion.div>
            )}

            {/* ══ SECURITY THREATS ══ */}
            {tab === 'security' && (
              <motion.div key="security" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h2 className="font-display text-xl font-bold tracking-widest" style={{ color: '#ff2244' }}>🛡️ SECURITY MONITOR</h2>
                    <p className="font-mono text-[10px] text-gray-500 mt-0.5">{threatTotal} events recorded · live detection active</p>
                  </div>
                  <div className="flex gap-2">
                    <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} onClick={fetchThreats}
                      className="px-3 py-1.5 rounded-xl font-mono text-[10px] tracking-widest"
                      style={{ background: 'rgba(0,245,255,0.08)', border: '1px solid rgba(0,245,255,0.25)', color: '#00f5ff' }}>
                      ↺ REFRESH
                    </motion.button>
                    <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} onClick={clearThreats}
                      className="px-3 py-1.5 rounded-xl font-mono text-[10px] tracking-widest"
                      style={{ background: 'rgba(255,34,68,0.08)', border: '1px solid rgba(255,34,68,0.25)', color: '#ff2244' }}>
                      🗑 CLEAR LOG
                    </motion.button>
                  </div>
                </div>

                {/* Severity summary cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                  {[['CRITICAL','💀'],['HIGH','🔥'],['MEDIUM','⚠️'],['LOW','ℹ️']].map(([sev, icon]) => (
                    <motion.div key={sev} whileHover={{ y: -2 }} className="rounded-2xl p-4 relative overflow-hidden"
                      style={{ background: SEV_BG[sev], border: `1px solid ${SEV_COLOR[sev]}40`, boxShadow: `0 0 18px ${SEV_COLOR[sev]}10` }}>
                      <div className="absolute -top-1 -right-1 text-4xl opacity-10">{icon}</div>
                      <div className="font-mono text-[9px] tracking-widest mb-1" style={{ color: `${SEV_COLOR[sev]}cc` }}>{sev}</div>
                      <div className="font-display font-black text-3xl" style={{ color: SEV_COLOR[sev], textShadow: `0 0 14px ${SEV_COLOR[sev]}60` }}>
                        {threatSummary[sev] || 0}
                      </div>
                    </motion.div>
                  ))}
                </div>

                {/* Threat detection status banner */}
                <div className="rounded-xl p-3 mb-4 flex items-center gap-3"
                  style={{ background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.2)' }}>
                  <div className="w-2 h-2 rounded-full bg-[#00ff88] animate-pulse flex-shrink-0" />
                  <div className="font-mono text-[10px] text-[#00ff88]">ACTIVE · Monitoring: SQL Injection · XSS Attacks · Brute Force · CORS Violations · Rate Limit Abuse</div>
                </div>

                {/* Threat log */}
                {threatLoading ? (
                  <div className="flex justify-center py-20"><div className="cyber-spinner" style={{ borderTopColor: '#ff2244' }} /></div>
                ) : threats.length === 0 ? (
                  <GCard className="p-12 text-center">
                    <div className="text-5xl mb-4">🛡️</div>
                    <div className="font-display text-sm text-[#00ff88] tracking-widest mb-1">ALL CLEAR</div>
                    <div className="font-mono text-[10px] text-gray-500">No security threats detected yet</div>
                  </GCard>
                ) : (
                  <>
                    {/* Mobile cards */}
                    <div className="sm:hidden space-y-2">
                      {threats.map((t, i) => (
                        <motion.div key={t.id || i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.02 }}
                          className="rounded-xl p-3"
                          style={{ background: SEV_BG[t.severity] || 'rgba(15,5,30,0.65)', border: `1px solid ${SEV_COLOR[t.severity] || '#ff2244'}30` }}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm">{TYPE_ICON[t.type] || '⚠️'}</span>
                                <span className="font-mono text-[10px] font-bold" style={{ color: SEV_COLOR[t.severity] || '#ff2244' }}>{t.type?.replace(/_/g,' ')}</span>
                              </div>
                              <div className="font-mono text-[9px] text-gray-400 truncate">{t.detail}</div>
                              <div className="font-mono text-[9px] text-gray-600 mt-0.5">IP: {t.ip} · {t.path}</div>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <span className="inline-block px-2 py-0.5 rounded-full font-mono text-[8px] font-bold"
                                style={{ background: SEV_BG[t.severity], color: SEV_COLOR[t.severity], border: `1px solid ${SEV_COLOR[t.severity]}40` }}>
                                {t.severity}
                              </span>
                              <div className="font-mono text-[8px] text-gray-600 mt-1">{fmtTime(t.timestamp)}</div>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>

                    {/* Desktop table */}
                    <GCard className="hidden sm:block overflow-x-auto">
                      <table className="w-full cyber-table min-w-[750px]">
                        <thead>
                          <tr>
                            <th>TYPE</th>
                            <th>SEVERITY</th>
                            <th>IP ADDRESS</th>
                            <th>PATH</th>
                            <th>DETAIL</th>
                            <th>TIME</th>
                          </tr>
                        </thead>
                        <tbody>
                          {threats.map((t, i) => (
                            <motion.tr key={t.id || i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.015 }}>
                              <td>
                                <span className="flex items-center gap-1.5">
                                  <span>{TYPE_ICON[t.type] || '⚠️'}</span>
                                  <span className="font-mono text-[10px]" style={{ color: SEV_COLOR[t.severity] || '#aaa' }}>{t.type?.replace(/_/g,' ')}</span>
                                </span>
                              </td>
                              <td>
                                <span className="px-2 py-0.5 rounded-full font-mono text-[9px] font-bold"
                                  style={{ background: SEV_BG[t.severity], color: SEV_COLOR[t.severity], border: `1px solid ${SEV_COLOR[t.severity]}40` }}>
                                  {t.severity}
                                </span>
                              </td>
                              <td className="font-mono text-[10px] text-[#00f5ff]">{t.ip}</td>
                              <td className="font-mono text-[10px] text-gray-500 max-w-[120px] truncate">{t.path}</td>
                              <td className="font-mono text-[10px] text-gray-400 max-w-[180px] truncate">{t.detail}</td>
                              <td className="font-mono text-[10px] text-gray-600 whitespace-nowrap">{fmtTime(t.timestamp)}</td>
                            </motion.tr>
                          ))}
                        </tbody>
                      </table>
                    </GCard>
                  </>
                )}
              </motion.div>
            )}

            {/* ══ UPGRADE REQUESTS ══ */}
            {tab === 'upgrades' && (
              <motion.div key="upgrades" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <div className="mb-5">
                  <h2 className="font-display text-xl font-bold tracking-widest" style={{ color: '#ff00ff' }}>UPGRADE REQUESTS</h2>
                  <p className="font-mono text-[10px] text-gray-500 mt-0.5">{upgradeRequests.length} pending requests</p>
                </div>

                {upgradeRequests.length === 0 ? (
                  <GCard className="p-10 text-center">
                    <div className="text-4xl mb-3">✅</div>
                    <div className="font-mono text-xs text-gray-500">NO PENDING UPGRADE REQUESTS</div>
                  </GCard>
                ) : (
                  <div className="space-y-3">
                    {upgradeRequests.map((req, i) => (
                      <motion.div key={req.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                        className="rounded-2xl p-5"
                        style={{ background: 'rgba(15,5,30,0.65)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,0,255,0.25)' }}>
                        <div className="flex items-start justify-between gap-4 mb-4">
                          <div>
                            <div className="font-mono text-sm text-[#00f5ff] font-bold">{req.username}</div>
                            <div className="font-mono text-[10px] text-gray-500">{req.email}</div>
                            <div className="font-mono text-[10px] text-gray-600 mt-1">
                              Current: <span style={{ color: planColors[req.subscriptionPlan] }}>{req.subscriptionPlan?.toUpperCase()}</span>
                            </div>
                            {req.upgradeRequestAt && (
                              <div className="font-mono text-[10px] text-gray-600">
                                Requested: {new Date(req.upgradeRequestAt).toLocaleString()}
                              </div>
                            )}
                          </div>
                          <div className="text-right flex-shrink-0">
                            <div className="font-mono text-[10px] text-gray-500 mb-1">REQUESTING</div>
                            <span className="font-display text-lg font-bold"
                              style={{ color: req.upgradeRequest === 'enterprise' ? '#ff00ff' : '#8b5cf6', textShadow: `0 0 12px ${req.upgradeRequest === 'enterprise' ? '#ff00ff60' : '#8b5cf660'}` }}>
                              {req.upgradeRequest?.toUpperCase()}
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-3">
                          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                            onClick={() => handleApproveUpgrade(req.id, req.upgradeRequest)}
                            className="flex-1 py-2.5 rounded-xl font-display text-xs tracking-widest text-white"
                            style={{ background: 'linear-gradient(135deg,rgba(0,255,136,0.25),rgba(0,245,255,0.15))', border: '1px solid rgba(0,255,136,0.4)' }}>
                            ✅ APPROVE {req.upgradeRequest?.toUpperCase()}
                          </motion.button>
                          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                            onClick={() => handleRejectUpgrade(req.id)}
                            className="py-2.5 px-4 rounded-xl font-display text-xs tracking-widest"
                            style={{ background: 'rgba(255,68,68,0.1)', border: '1px solid rgba(255,68,68,0.3)', color: '#ff4444' }}>
                            ✕ REJECT
                          </motion.button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* ══ AUDIO ══ */}
            {tab === 'audio' && (
              <motion.div key="audio" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <div className="mb-5">
                  <h2 className="font-display text-xl font-bold tracking-widest" style={{ color: '#ff00ff' }}>SITE AUDIO</h2>
                  <p className="font-mono text-[10px] text-gray-500 mt-0.5">Upload background music that plays for all users</p>
                </div>

                <div className="space-y-4 max-w-lg">
                  {audioInfo.filename && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      className="rounded-2xl p-5"
                      style={{ background: 'rgba(0,245,255,0.06)', border: '1px solid rgba(0,245,255,0.25)' }}>
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
                          style={{ background: 'rgba(0,245,255,0.1)', border: '1px solid rgba(0,245,255,0.3)' }}>🎵</div>
                        <div>
                          <div className="font-display text-sm text-[#00f5ff]">CURRENT AUDIO</div>
                          <div className="font-mono text-[10px] text-gray-400">{audioInfo.original || audioInfo.filename}</div>
                        </div>
                      </div>
                      <audio controls className="w-full mb-3" style={{ filter: 'invert(1) hue-rotate(180deg)' }}>
                        <source src="/api/site/audio/file" />
                      </audio>
                      <button onClick={handleAudioRemove}
                        className="w-full py-2.5 rounded-xl font-mono text-xs text-red-400 transition-all"
                        style={{ background: 'rgba(255,68,68,0.08)', border: '1px solid rgba(255,68,68,0.25)' }}>
                        🗑️ REMOVE AUDIO
                      </button>
                    </motion.div>
                  )}

                  <GCard className="p-5">
                    <h3 className="font-mono text-[10px] tracking-widest mb-4" style={{ color: '#ff00ff' }}>
                      {audioInfo.filename ? 'REPLACE AUDIO' : 'UPLOAD AUDIO'}
                    </h3>
                    <div className="space-y-4">
                      <div>
                        <label className="font-mono text-[10px] text-[#ff00ff] tracking-widest block mb-2">SELECT AUDIO FILE</label>
                        <div className="rounded-xl p-4 text-center cursor-pointer transition-all"
                          style={{ background: 'rgba(255,0,255,0.04)', border: '2px dashed rgba(255,0,255,0.25)' }}
                          onClick={() => audioFileRef.current?.click()}>
                          <div className="text-3xl mb-2">🎵</div>
                          <div className="font-mono text-xs text-gray-400">Click to select audio file</div>
                          <div className="font-mono text-[10px] text-gray-600 mt-1">MP3, WAV, OGG — Max 20MB</div>
                          <input ref={audioFileRef} type="file" accept="audio/*" className="hidden"
                            onChange={e => e.target.files[0] && toast.success(`Selected: ${e.target.files[0].name}`)} />
                        </div>
                      </div>
                      <motion.button
                        whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                        onClick={handleAudioUpload} disabled={audioUploading}
                        className="w-full py-3 rounded-xl font-display text-sm tracking-widest text-white"
                        style={{ background: 'linear-gradient(135deg,rgba(255,0,255,0.3),rgba(139,92,246,0.3))', border: '1px solid rgba(255,0,255,0.5)', boxShadow: '0 0 20px rgba(255,0,255,0.2)', opacity: audioUploading ? 0.7 : 1 }}>
                        {audioUploading ? '⏳ UPLOADING...' : '🎵 UPLOAD AUDIO'}
                      </motion.button>
                    </div>

                    <div className="mt-5 rounded-xl p-4" style={{ background: 'rgba(255,0,255,0.05)', border: '1px solid rgba(255,0,255,0.12)' }}>
                      <div className="font-mono text-[10px] text-[#ff00ff] tracking-widest mb-2">HOW IT WORKS</div>
                      <ul className="space-y-1.5">
                        {['Audio plays automatically when users open the dashboard', 'Users can mute/unmute using the speaker button', 'Audio loops continuously', 'Only one audio file can be active at a time'].map((t, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span style={{ color: '#ff00ff' }}>▸</span>
                            <span className="font-mono text-[10px] text-gray-400">{t}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </GCard>
                </div>
              </motion.div>
            )}

            {tab === 'access' && (
              <motion.div key="access" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <div className="mb-5">
                  <h2 className="font-display text-xl font-bold tracking-widest" style={{ color: '#ff00ff' }}>🔞 18+ ACCESS CONTROL</h2>
                  <p className="font-mono text-[10px] text-gray-500 mt-0.5">Manage the secret code for 18+ content unlock</p>
                </div>

                <div className="space-y-4 max-w-lg">
                  {/* Current Code Display */}
                  <GCard className="p-5">
                    <h3 className="font-mono text-[10px] tracking-widest mb-4" style={{ color: '#ff00ff' }}>CURRENT SECRET CODE</h3>
                    <div className="rounded-xl p-4 mb-4 flex items-center justify-between"
                      style={{ background: 'rgba(255,0,255,0.06)', border: '1px solid rgba(255,0,255,0.25)' }}>
                      <div>
                        <div className="font-mono text-[10px] text-gray-500 mb-1">Active Code</div>
                        <div className="font-display text-lg font-bold tracking-widest" style={{ color: '#ff00ff', textShadow: '0 0 12px rgba(255,0,255,0.5)' }}>
                          {adultCode || '—'}
                        </div>
                      </div>
                      <div className="text-3xl">🔐</div>
                    </div>
                    <div className="rounded-xl p-3" style={{ background: 'rgba(0,245,255,0.05)', border: '1px solid rgba(0,245,255,0.15)' }}>
                      <div className="font-mono text-[10px] text-[#00f5ff] mb-1">HOW TO SHARE</div>
                      <div className="font-mono text-[10px] text-gray-400">
                        User WhatsApp bot mein type kare: <span style={{ color: '#ff00ff' }}>.addkey {adultCode}</span>
                      </div>
                    </div>
                  </GCard>

                  {/* Change Code */}
                  <GCard className="p-5">
                    <h3 className="font-mono text-[10px] tracking-widest mb-4" style={{ color: '#ff00ff' }}>CHANGE SECRET CODE</h3>
                    <div className="space-y-3">
                      <div>
                        <label className="font-mono text-[10px] text-[#ff00ff] tracking-widest block mb-2">NEW SECRET CODE</label>
                        <input
                          type="text"
                          value={adultCodeInput}
                          onChange={e => setAdultCodeInput(e.target.value)}
                          placeholder="Enter new secret code (min 4 chars)"
                          className="w-full px-4 py-2.5 rounded-xl font-mono text-sm outline-none transition-all"
                          style={{ background: 'rgba(255,0,255,0.06)', border: '1px solid rgba(255,0,255,0.3)', color: '#fff' }}
                        />
                      </div>
                      <motion.button
                        whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                        onClick={handleUpdateAdultCode} disabled={adultLoading}
                        className="w-full py-3 rounded-xl font-display text-sm tracking-widest text-white"
                        style={{ background: 'linear-gradient(135deg,rgba(255,0,255,0.3),rgba(139,92,246,0.3))', border: '1px solid rgba(255,0,255,0.5)', opacity: adultLoading ? 0.7 : 1 }}>
                        {adultLoading ? '⏳ UPDATING...' : '🔐 UPDATE CODE'}
                      </motion.button>
                    </div>
                  </GCard>

                  {/* Unlocked Users */}
                  <GCard className="p-5">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-mono text-[10px] tracking-widest" style={{ color: '#ff00ff' }}>
                        UNLOCKED USERS ({adultUnlockedUsers.length})
                      </h3>
                      {adultUnlockedUsers.length > 0 && (
                        <button onClick={handleClearAllAdult}
                          className="px-3 py-1 rounded-lg font-mono text-[9px] text-red-400 transition-all"
                          style={{ background: 'rgba(255,68,68,0.08)', border: '1px solid rgba(255,68,68,0.25)' }}>
                          🗑️ CLEAR ALL
                        </button>
                      )}
                    </div>
                    {adultUnlockedUsers.length === 0 ? (
                      <div className="text-center py-6">
                        <div className="text-3xl mb-2">🔒</div>
                        <div className="font-mono text-[10px] text-gray-600">No users have unlocked 18+ content yet</div>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {adultUnlockedUsers.map((u, i) => (
                          <div key={i} className="flex items-center justify-between rounded-xl px-3 py-2"
                            style={{ background: 'rgba(255,0,255,0.05)', border: '1px solid rgba(255,0,255,0.12)' }}>
                            <div className="flex items-center gap-2">
                              <span className="text-sm">📱</span>
                              <span className="font-mono text-xs text-gray-300">{u.split('@')[0]}</span>
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => handleRemoveAdultUser(u.split('@')[0])}
                                className="text-yellow-400 font-mono text-[9px] px-2 py-1 rounded transition-all"
                                style={{ background: 'rgba(255,200,0,0.08)', border: '1px solid rgba(255,200,0,0.2)' }}
                                title="Remove access (user can re-add with code)">
                                REMOVE
                              </button>
                              <button onClick={() => handleBanAdultUser(u)}
                                className="text-red-400 font-mono text-[9px] px-2 py-1 rounded transition-all"
                                style={{ background: 'rgba(255,68,68,0.08)', border: '1px solid rgba(255,68,68,0.2)' }}
                                title="Permanently ban (user cannot re-add)">
                                🚫 BAN
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </GCard>

                  {/* Permanently Banned Users */}
                  <GCard className="p-5">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-mono text-[10px] tracking-widest" style={{ color: '#ff4444' }}>
                        🚫 PERMANENTLY BANNED ({adultBannedUsers.length})
                      </h3>
                    </div>
                    <div className="rounded-xl p-3 mb-3" style={{ background: 'rgba(255,68,68,0.05)', border: '1px solid rgba(255,68,68,0.15)' }}>
                      <div className="font-mono text-[9px] text-gray-500">Ye users dobara .addkey se 18+ access nahi le sakte. Admin hi unban kar sakta hai.</div>
                    </div>
                    {adultBannedUsers.length === 0 ? (
                      <div className="text-center py-4">
                        <div className="font-mono text-[10px] text-gray-600">No permanently banned users</div>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {adultBannedUsers.map((u, i) => (
                          <div key={i} className="flex items-center justify-between rounded-xl px-3 py-2"
                            style={{ background: 'rgba(255,68,68,0.05)', border: '1px solid rgba(255,68,68,0.15)' }}>
                            <div className="flex items-center gap-2">
                              <span className="text-sm">🚫</span>
                              <span className="font-mono text-xs text-red-300">{u.split('@')[0]}</span>
                            </div>
                            <button onClick={() => handleUnbanAdultUser(u.split('@')[0])}
                              className="text-green-400 font-mono text-[9px] px-2 py-1 rounded transition-all"
                              style={{ background: 'rgba(0,255,100,0.08)', border: '1px solid rgba(0,255,100,0.2)' }}>
                              ✅ UNBAN
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </GCard>

                  {/* Bot Number Control */}
                  <GCard className="p-5">
                    <h2 className="font-display text-xl font-bold tracking-widest mb-1" style={{ color: '#00f5ff' }}>🤖 BOT NUMBER CONTROL</h2>
                    <p className="font-mono text-[10px] text-gray-500 mb-4">Kisi bhi number ka bot on/off karein</p>
                    <div className="space-y-3 mb-4">
                      <div>
                        <label className="font-mono text-[10px] text-[#00f5ff] tracking-widest block mb-2">PHONE NUMBER (digits only)</label>
                        <div className="flex gap-2">
                          <input type="text" value={botNumberInput} onChange={e => setBotNumberInput(e.target.value)}
                            placeholder="e.g. 923001234567"
                            className="flex-1 px-4 py-2.5 rounded-xl font-mono text-sm outline-none"
                            style={{ background: 'rgba(0,245,255,0.06)', border: '1px solid rgba(0,245,255,0.3)', color: '#fff' }} />
                          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                            onClick={() => handleBotDisable(botNumberInput)} disabled={botControlLoading}
                            className="px-4 py-2.5 rounded-xl font-display text-xs tracking-widest text-white"
                            style={{ background: 'linear-gradient(135deg,rgba(255,68,68,0.3),rgba(200,0,0,0.3))', border: '1px solid rgba(255,68,68,0.5)' }}>
                            🔴 BOT OFF
                          </motion.button>
                        </div>
                      </div>
                    </div>
                    {botDisabledNumbers.length === 0 ? (
                      <div className="text-center py-4">
                        <div className="font-mono text-[10px] text-gray-600">Koi number disabled nahi hai</div>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        <div className="font-mono text-[9px] text-gray-500 mb-2">DISABLED NUMBERS ({botDisabledNumbers.length})</div>
                        {botDisabledNumbers.map((u, i) => (
                          <div key={i} className="flex items-center justify-between rounded-xl px-3 py-2"
                            style={{ background: 'rgba(255,68,68,0.05)', border: '1px solid rgba(255,68,68,0.15)' }}>
                            <div className="flex items-center gap-2">
                              <span className="text-sm">🔴</span>
                              <span className="font-mono text-xs text-red-300">{u.split('@')[0]}</span>
                            </div>
                            <button onClick={() => handleBotEnable(u.split('@')[0])}
                              className="text-green-400 font-mono text-[9px] px-2 py-1 rounded transition-all"
                              style={{ background: 'rgba(0,255,100,0.08)', border: '1px solid rgba(0,255,100,0.2)' }}>
                              🟢 BOT ON
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </GCard>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      {/* ════ MOBILE BOTTOM NAV ════ */}
      <nav className="fixed bottom-0 left-0 right-0 z-20 lg:hidden flex"
        style={{ background: 'rgba(8,3,18,0.97)', backdropFilter: 'blur(24px)', borderTop: '1px solid rgba(255,0,255,0.15)' }}>
        {NAV.map(item => (
          <button key={item.id} onClick={() => setTab(item.id)}
            className="flex-1 flex flex-col items-center justify-center py-3 gap-1 relative transition-all"
            style={{ color: tab === item.id ? '#ff00ff' : '#6b7280' }}>
            <span className="text-xl leading-none">{item.icon}</span>
            <span className="font-mono text-[9px] tracking-widest">{item.label}</span>
            {item.id === 'upgrades' && pendingCount > 0 && (
              <span className="absolute top-1 right-2 w-4 h-4 rounded-full text-[8px] font-bold flex items-center justify-center"
                style={{ background: '#ff00ff', color: '#fff' }}>{pendingCount}</span>
            )}
            {tab === item.id && (
              <motion.div layoutId="admin-tab-ind" className="absolute top-0 h-0.5 w-10 rounded-full"
                style={{ background: '#ff00ff', boxShadow: '0 0 8px #ff00ff' }} />
            )}
          </button>
        ))}
        <Link to="/dashboard" className="flex-1 flex flex-col items-center justify-center py-3 gap-1" style={{ color: '#00f5ff' }}>
          <span className="text-xl leading-none">←</span>
          <span className="font-mono text-[9px] tracking-widest">USER</span>
        </Link>
      </nav>
    </div>
  );
}
