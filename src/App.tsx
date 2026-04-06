import React, { useState, useEffect, useRef } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  User,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword
} from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  doc, 
  getDoc, 
  setDoc, 
  serverTimestamp,
  updateDoc,
  arrayUnion
} from 'firebase/firestore';
import { 
  Brain, 
  History, 
  Plus, 
  LogOut, 
  ChevronRight, 
  ChevronDown,
  CheckCircle2, 
  AlertTriangle, 
  ArrowRight, 
  TrendingUp, 
  Zap,
  DollarSign,
  BarChart3,
  ArrowLeft,
  Loader2,
  Check,
  X,
  Flame,
  Heart,
  Scale,
  CreditCard,
  Apple,
  Mail,
  Lock,
  Smartphone,
  ShieldCheck,
  Globe,
  Layout,
  MessageSquare,
  Share2,
  Download,
  XCircle,
  Send
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { auth, db } from './firebase';
import { cn } from './lib/utils';
import { Decision, DecisionMode, DecisionInputs, UserProfile } from './types';
import { analyzeDecision, compareOptions, askFollowUp } from './services/geminiService';

// --- Components ---

const Button = ({ 
  children, 
  className, 
  variant = 'primary', 
  size = 'md', 
  isLoading, 
  ...props 
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { 
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  isLoading?: boolean;
}) => {
  const variants = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-md shadow-indigo-200',
    secondary: 'bg-zinc-100 text-zinc-900 hover:bg-zinc-200',
    outline: 'border border-zinc-200 text-zinc-600 hover:bg-zinc-50',
    ghost: 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100',
    danger: 'bg-red-50 text-red-600 border border-red-100 hover:bg-red-100',
  };
  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-5 py-2.5',
    lg: 'px-8 py-4 text-lg font-semibold',
    icon: 'p-2',
  };

  return (
    <button 
      className={cn(
        'rounded-xl transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 font-medium',
        variants[variant],
        sizes[size],
        className
      )}
      disabled={isLoading}
      {...props}
    >
      {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : children}
    </button>
  );
};

const Card = ({ children, className, hover = true, onClick }: { children: React.ReactNode; className?: string; hover?: boolean; onClick?: () => void }) => (
  <div 
    onClick={onClick}
    className={cn(
      'bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm transition-all',
      hover && 'hover:border-zinc-300 hover:shadow-md',
      onClick && 'cursor-pointer',
      className
    )}
  >
    {children}
  </div>
);

const Input = ({ label, error, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label?: string; error?: string }) => (
  <div className="space-y-1.5">
    {label && <label className="text-sm font-semibold text-zinc-700 ml-1">{label}</label>}
    <input 
      className={cn(
        'w-full bg-white border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all',
        error && 'border-red-500 focus:ring-red-500/20'
      )}
      {...props}
    />
    {error && <p className="text-xs text-red-500 ml-1 font-medium">{error}</p>}
  </div>
);

const TextArea = ({ label, error, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; error?: string }) => (
  <div className="space-y-1.5">
    {label && <label className="text-sm font-semibold text-zinc-700 ml-1">{label}</label>}
    <textarea 
      className={cn(
        'w-full bg-white border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all min-h-[120px] resize-none',
        error && 'border-red-500 focus:ring-red-500/20'
      )}
      {...props}
    />
    {error && <p className="text-xs text-red-500 ml-1 font-medium">{error}</p>}
  </div>
);

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'landing' | 'dashboard' | 'new' | 'results' | 'compare' | 'pricing' | 'history'>('landing');
  const [history, setHistory] = useState<Decision[]>([]);
  const [currentDecision, setCurrentDecision] = useState<Decision | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const userDoc = await getDoc(doc(db, 'users', u.uid));
        const today = new Date().toISOString().split('T')[0];
        
        if (userDoc.exists()) {
          const data = userDoc.data() as UserProfile;
          // Reset daily count if it's a new day
          if (data.lastUsageDate !== today) {
            const updatedProfile = { ...data, dailyUsageCount: 0, lastUsageDate: today };
            await setDoc(doc(db, 'users', u.uid), updatedProfile);
            setProfile(updatedProfile);
          } else {
            setProfile(data);
          }
        } else {
          const newProfile: UserProfile = {
            uid: u.uid,
            email: u.email || '',
            displayName: u.displayName || '',
            photoURL: u.photoURL || '',
            subscription: 'free',
            dailyUsageCount: 0,
            lastUsageDate: today,
            totalDecisionsCount: 0,
          };
          await setDoc(doc(db, 'users', u.uid), newProfile);
          setProfile(newProfile);
        }
        if (view === 'landing') setView('dashboard');
      } else {
        setProfile(null);
        setView('landing');
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // History Listener
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'decisions'),
      where('uid', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Decision));
      setHistory(docs);
    });
    return unsubscribe;
  }, [user]);

  const handleLogin = async () => {
    setAuthMode('login');
    setShowAuthModal(true);
  };

  const handleRegister = async () => {
    setAuthMode('register');
    setShowAuthModal(true);
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    try {
      if (authMode === 'register') {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      setShowAuthModal(false);
      setEmail('');
      setPassword('');
    } catch (error: any) {
      console.error('Auth failed:', error);
      setAuthError(error.message);
    }
  };

  const handleSocialLogin = async (providerName: 'google' | 'apple') => {
    if (providerName === 'google') {
      try {
        const provider = new GoogleAuthProvider();
        await signInWithPopup(auth, provider);
        setShowAuthModal(false);
      } catch (error) {
        console.error('Login failed:', error);
      }
    } else {
      // Apple login simulation
      console.log('Apple login clicked');
    }
  };

  const handleLogout = () => setShowLogoutConfirm(true);

  const confirmLogout = () => {
    signOut(auth);
    setShowLogoutConfirm(false);
  };

  const handleAnalyze = async (title: string, description: string, mode: DecisionMode, inputs: DecisionInputs) => {
    if (!user || !profile) return;

    // Check daily limits for free users (3 per day)
    if (profile.subscription === 'free' && profile.dailyUsageCount >= 3) {
      setShowCheckout(true);
      return;
    }

    setIsAnalyzing(true);
    try {
      const analysis = await analyzeDecision(title, description, mode, inputs);
      const decision: Decision = {
        uid: user.uid,
        title,
        description,
        mode,
        inputs,
        analysis,
        createdAt: serverTimestamp(),
      };
      const docRef = await addDoc(collection(db, 'decisions'), decision);
      
      // Update profile count
      const today = new Date().toISOString().split('T')[0];
      const updatedProfile: UserProfile = { 
        ...profile, 
        dailyUsageCount: profile.dailyUsageCount + 1,
        totalDecisionsCount: (profile.totalDecisionsCount || 0) + 1,
        lastUsageDate: today
      };
      await setDoc(doc(db, 'users', user.uid), updatedProfile);
      setProfile(updatedProfile);

      setCurrentDecision({ ...decision, id: docRef.id });
      setView('results');
    } catch (error: any) {
      console.error('Analysis failed:', error);
      throw error;
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleUpgrade = async () => {
    if (!user || !profile) return;
    
    try {
      const response = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: user.uid,
          email: user.email,
        }),
      });

      const { url, error } = await response.json();
      if (error) throw new Error(error);
      if (url) window.location.href = url;
    } catch (err) {
      console.error("Checkout failed:", err);
      alert("Failed to start checkout. Please try again.");
    }
  };

  // Handle Stripe Success
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("success") === "true" && user && profile && profile.subscription === 'free') {
      const upgradeUser = async () => {
        const updatedProfile: UserProfile = { ...profile, subscription: 'pro' };
        await setDoc(doc(db, 'users', user.uid), updatedProfile);
        setProfile(updatedProfile);
        // Clear URL params
        window.history.replaceState({}, document.title, "/");
      };
      upgradeUser();
    }
  }, [user, profile]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin" />
            <Brain className="w-8 h-8 text-indigo-600 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
          </div>
          <p className="text-zinc-400 font-medium animate-pulse">Loading Decido AI...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-zinc-50 text-zinc-900 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      {/* Animated Background Blobs */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <motion.div 
          animate={{ 
            x: [0, 100, 0],
            y: [0, -50, 0],
            scale: [1, 1.2, 1]
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-indigo-200/30 rounded-full blur-[120px]" 
        />
        <motion.div 
          animate={{ 
            x: [0, -100, 0],
            y: [0, 100, 0],
            scale: [1, 1.1, 1]
          }}
          transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
          className="absolute top-[20%] -right-[10%] w-[35%] h-[35%] bg-purple-200/30 rounded-full blur-[120px]" 
        />
        <motion.div 
          animate={{ 
            x: [0, 50, 0],
            y: [0, -100, 0],
            scale: [1, 1.3, 1]
          }}
          transition={{ duration: 22, repeat: Infinity, ease: "linear" }}
          className="absolute -bottom-[10%] left-[20%] w-[45%] h-[45%] bg-blue-200/20 rounded-full blur-[120px]" 
        />
      </div>

      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 border-b border-zinc-200/50 bg-white/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setView(user ? 'dashboard' : 'landing')}>
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-200">
              <Brain className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight font-display">Decido AI</span>
          </div>

          <div className="flex items-center gap-4">
            {user ? (
              <>
                <div className="hidden md:flex items-center gap-4 mr-2">
                  {profile?.subscription === 'free' && (
                    <div className="flex items-center gap-2 px-3 py-1 bg-indigo-50 rounded-full border border-indigo-100">
                      <Zap className="w-3.5 h-3.5 text-indigo-600 fill-indigo-600" />
                      <span className="text-xs font-bold text-indigo-600">
                        {3 - (profile?.dailyUsageCount || 0)} left today
                      </span>
                    </div>
                  )}
                  <button onClick={() => setView('dashboard')} className={cn("text-sm font-semibold transition-colors", view === 'dashboard' ? "text-indigo-600" : "text-zinc-500 hover:text-zinc-900")}>Dashboard</button>
                  <button onClick={() => setView('history')} className={cn("text-sm font-semibold transition-colors", view === 'history' ? "text-indigo-600" : "text-zinc-500 hover:text-zinc-900")}>History</button>
                </div>
                
                {profile?.subscription === 'free' ? (
                  <Button 
                    size="sm" 
                    onClick={() => setView('pricing')}
                    className="bg-gradient-to-r from-indigo-600 to-violet-600 border-none shadow-lg shadow-indigo-200 hover:scale-105 transition-transform text-xs md:text-sm"
                  >
                    Upgrade
                  </Button>
                ) : (
                  <div 
                    onClick={() => setView('pricing')}
                    className="px-3 py-1 bg-amber-50 rounded-full border border-amber-100 flex items-center gap-1.5 cursor-pointer hover:bg-amber-100 transition-colors"
                  >
                    <Flame className="w-3.5 h-3.5 text-amber-600 fill-amber-600" />
                    <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">Pro</span>
                  </div>
                )}

                <div className="h-4 w-px bg-zinc-200" />
                <div className="flex items-center gap-2 md:gap-3">
                  <img src={user.photoURL || ''} className="w-7 h-7 md:w-8 md:h-8 rounded-full border border-zinc-200" alt="" />
                  <button onClick={handleLogout} className="text-zinc-400 hover:text-red-500 transition-colors">
                    <LogOut className="w-4 h-4 md:w-5 md:h-5" />
                  </button>
                </div>
              </>
            ) : (
              <Button size="sm" onClick={handleLogin}>Get Started</Button>
            )}
          </div>
        </div>
      </nav>

      <main className="pt-24 pb-24 md:pb-12 px-4 max-w-7xl mx-auto">
        <AnimatePresence mode="wait">
          {view === 'landing' && <LandingPage onStart={handleRegister} onLogin={handleLogin} />}
          {view === 'dashboard' && (
            <Dashboard 
              onNew={() => setView('new')} 
              history={history} 
              onViewDecision={(d) => { setCurrentDecision(d); setView('results'); }} 
              onCompare={() => setView('compare')} 
              onUpgrade={handleUpgrade}
              profile={profile}
              onViewHistory={() => setView('history')}
            />
          )}
          {view === 'new' && <DecisionForm onBack={() => setView('dashboard')} onSubmit={handleAnalyze} isAnalyzing={isAnalyzing} />}
          {view === 'results' && currentDecision && (
            <Results 
              decision={currentDecision} 
              onBack={() => setView('dashboard')} 
              onNew={() => setView('new')}
              onCompare={() => setView('compare')}
              onUpgrade={handleUpgrade}
              profile={profile}
            />
          )}
          {view === 'compare' && (
            <CompareMode 
              onBack={() => setView('dashboard')} 
              mode="analyst" 
              user={user}
              profile={profile}
              setProfile={setProfile}
              onUpgrade={handleUpgrade}
            />
          )}
          {view === 'history' && <HistoryView history={history} onViewDecision={(d) => { setCurrentDecision(d); setView('results'); }} />}
          {view === 'pricing' && <Pricing profile={profile} onUpgrade={handleUpgrade} />}
        </AnimatePresence>
      </main>

      {/* Mobile Bottom Navigation */}
      {user && (
        <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-white border-t border-zinc-200 px-6 py-3 flex items-center justify-between shadow-2xl shadow-zinc-900/10">
          <button 
            onClick={() => setView('dashboard')} 
            className={cn(
              "flex flex-col items-center gap-1 transition-colors",
              view === 'dashboard' ? "text-indigo-600" : "text-zinc-400"
            )}
          >
            <Layout className="w-6 h-6" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Home</span>
          </button>
          <button 
            onClick={() => setView('new')} 
            className="flex flex-col items-center gap-1 -mt-8"
          >
            <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-xl shadow-indigo-200 text-white">
              <Plus className="w-6 h-6" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest mt-1 text-indigo-600">New</span>
          </button>
          <button 
            onClick={() => setView('history')} 
            className={cn(
              "flex flex-col items-center gap-1 transition-colors",
              view === 'history' ? "text-indigo-600" : "text-zinc-400"
            )}
          >
            <History className="w-6 h-6" />
            <span className="text-[10px] font-bold uppercase tracking-widest">History</span>
          </button>
        </nav>
      )}

      {/* Logout Confirmation Modal */}
      <AnimatePresence>
        {showLogoutConfirm && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[2rem] p-8 max-w-sm w-full shadow-2xl text-center space-y-6"
            >
              <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto text-red-600">
                <LogOut className="w-8 h-8" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold font-display">Confirm Logout</h3>
                <p className="text-zinc-500">Are you sure you want to log out of your account?</p>
              </div>
              <div className="flex gap-3 pt-2">
                <Button 
                  variant="outline" 
                  className="flex-1" 
                  onClick={() => setShowLogoutConfirm(false)}
                >
                  Cancel
                </Button>
                <Button 
                  variant="danger" 
                  className="flex-1" 
                  onClick={confirmLogout}
                >
                  Log Out
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Auth Modal */}
      <AnimatePresence>
        {showAuthModal && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[2.5rem] p-8 max-w-md w-full shadow-2xl space-y-8 relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-6">
                <button onClick={() => setShowAuthModal(false)} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
                  <X className="w-5 h-5 text-zinc-400" />
                </button>
              </div>

              <div className="text-center space-y-2">
                <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-200">
                  <Brain className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-2xl font-bold font-display tracking-tight">
                  {authMode === 'login' ? 'Welcome back' : 'Create your account'}
                </h3>
                <p className="text-zinc-500">
                  {authMode === 'login' ? 'Log in to continue your journey.' : 'Start making smarter decisions today.'}
                </p>
              </div>

              <form onSubmit={handleEmailAuth} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-zinc-700 ml-1">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
                    <input 
                      type="email" 
                      placeholder="name@example.com"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-12 pr-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-zinc-700 ml-1">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
                    <input 
                      type="password" 
                      placeholder="••••••••"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-12 pr-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                    />
                  </div>
                </div>
                {authError && <p className="text-xs text-red-500 ml-1">{authError}</p>}
                <Button type="submit" className="w-full py-4 text-lg font-bold shadow-xl shadow-indigo-100">
                  {authMode === 'login' ? 'Log In' : 'Sign Up'}
                </Button>
              </form>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-zinc-200"></div>
                </div>
                <div className="relative flex justify-center text-xs uppercase font-bold tracking-widest">
                  <span className="bg-white px-4 text-zinc-400">Or continue with</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={() => handleSocialLogin('google')}
                  className="flex items-center justify-center gap-3 py-3 border border-zinc-200 rounded-xl hover:bg-zinc-50 transition-all font-semibold text-zinc-700"
                >
                  <img src="https://www.google.com/favicon.ico" className="w-4 h-4" alt="" />
                  Google
                </button>
                <button 
                  onClick={() => handleSocialLogin('apple')}
                  className="flex items-center justify-center gap-3 py-3 border border-zinc-200 rounded-xl hover:bg-zinc-50 transition-all font-semibold text-zinc-700"
                >
                  <Apple className="w-5 h-5" />
                  Apple
                </button>
              </div>

              <div className="text-center">
                <button 
                  onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
                  className="text-sm font-semibold text-zinc-500 hover:text-indigo-600 transition-colors"
                >
                  {authMode === 'login' ? "Don't have an account? Sign up" : "Already have an account? Log in"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}

// --- Views ---

function LandingPage({ onStart, onLogin }: { onStart: () => void; onLogin: () => void }) {
  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15,
        delayChildren: 0.3
      }
    }
  } as const;

  const item = {
    hidden: { opacity: 0, y: 30 },
    show: { 
      opacity: 1, 
      y: 0,
      transition: {
        type: "spring",
        stiffness: 100,
        damping: 20
      }
    }
  } as const;

  return (
    <motion.div 
      variants={container}
      initial="hidden"
      animate="show"
      exit={{ opacity: 0, scale: 0.95 }}
      className="space-y-32 py-12 relative z-10"
    >
      {/* Hero Section */}
      <section className="text-center space-y-10 max-w-5xl mx-auto pt-10">
        <motion.div 
          variants={item} 
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 text-sm font-bold shadow-sm"
        >
          <div className="w-2 h-2 bg-indigo-600 rounded-full animate-pulse" />
          Next-Gen Decision Intelligence
        </motion.div>
        
        <motion.h1 variants={item} className="text-7xl md:text-9xl font-black tracking-tighter text-zinc-900 font-display leading-[0.9] md:leading-[0.85]">
          Stop <span className="text-zinc-400 italic font-light">overthinking.</span><br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 via-purple-600 to-blue-600">Decide smarter.</span>
        </motion.h1>
        
        <motion.p variants={item} className="text-xl md:text-2xl text-zinc-500 max-w-3xl mx-auto leading-relaxed font-medium">
          Decido AI combines data-driven analysis with human-like reasoning to help you navigate life's toughest choices with absolute clarity.
        </motion.p>
        
        <motion.div variants={item} className="flex flex-col sm:flex-row items-center justify-center gap-6 pt-6">
          <Button size="lg" onClick={onStart} className="px-12 py-6 text-xl relative group overflow-hidden rounded-2xl">
            <span className="relative z-10 flex items-center gap-2">
              Start Deciding Now <ArrowRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
            </span>
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 to-purple-600 group-hover:scale-110 transition-transform duration-500" />
          </Button>
          <Button variant="outline" size="lg" onClick={onLogin} className="px-12 py-6 text-xl border-2 hover:bg-zinc-50 rounded-2xl">
            Log In
          </Button>
        </motion.div>

        {/* Floating Stats */}
        <motion.div 
          variants={item}
          className="pt-20 grid grid-cols-2 md:grid-cols-4 gap-8 max-w-4xl mx-auto opacity-50"
        >
          {[
            { label: "Decisions Made", value: "50k+" },
            { label: "AI Confidence", value: "99.2%" },
            { label: "User Rating", value: "4.9/5" },
            { label: "Time Saved", value: "100h+" }
          ].map((stat, i) => (
            <div key={i} className="text-center">
              <div className="text-2xl font-black text-zinc-900 font-display">{stat.value}</div>
              <div className="text-xs font-bold text-zinc-400 uppercase tracking-widest">{stat.label}</div>
            </div>
          ))}
        </motion.div>
      </section>

      {/* Interactive Feature Showcase */}
      <section className="space-y-20">
        <div className="text-center space-y-6">
          <h2 className="text-5xl md:text-6xl font-black font-display tracking-tight">Engineered for clarity</h2>
          <p className="text-zinc-500 text-xl max-w-2xl mx-auto font-medium">Everything you need to navigate complex choices with confidence.</p>
        </div>
        
        <div className="grid md:grid-cols-3 gap-8">
          {[
            { icon: Brain, title: "Deep Analysis", desc: "AI considers your context, budget, and risk tolerance to provide structured insights.", color: "from-blue-500 to-blue-600" },
            { icon: Scale, title: "Compare Mode", desc: "Stuck between two paths? Let AI weigh them side-by-side to find the winner.", color: "from-purple-500 to-purple-600" },
            { icon: History, title: "Decision Memory", desc: "Keep track of your past decisions and learn from your choices over time.", color: "from-indigo-500 to-indigo-600" },
            { icon: Zap, title: "Instant Reasoning", desc: "Get detailed explanations of why a certain path is recommended.", color: "from-amber-500 to-amber-600" },
            { icon: TrendingUp, title: "Risk Assessment", desc: "Understand the potential downsides before you commit to a major change.", color: "from-emerald-500 to-emerald-600" },
            { icon: CheckCircle2, title: "Action Plans", desc: "Don't just decide—get a step-by-step roadmap to execute your choice.", color: "from-rose-500 to-rose-600" }
          ].map((feature, i) => (
            <motion.div 
              key={i} 
              variants={item}
              whileHover={{ y: -10, transition: { duration: 0.2 } }}
            >
              <Card className="h-full group hover:border-indigo-200 hover:shadow-2xl hover:shadow-indigo-100 transition-all duration-500 p-10 rounded-[3rem] border-none bg-white shadow-xl shadow-zinc-100">
                <div className={cn(
                  "w-16 h-16 rounded-2xl flex items-center justify-center mb-8 bg-gradient-to-br shadow-lg group-hover:scale-110 transition-transform duration-500",
                  feature.color
                )}>
                  <feature.icon className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-2xl font-black mb-4 font-display tracking-tight">{feature.title}</h3>
                <p className="text-zinc-500 leading-relaxed font-medium">{feature.desc}</p>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Use Cases */}
      <section className="bg-zinc-900 px-8 py-24 rounded-[3rem] text-white overflow-hidden relative">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 blur-[100px] rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center relative z-10">
          <div className="space-y-8">
            <h2 className="text-4xl md:text-5xl font-bold font-display leading-tight">Built for every<br />major milestone.</h2>
            <div className="space-y-6">
              {[
                { title: "Career Moves", desc: "Should you take that promotion or start your own business?" },
                { title: "Financial Choices", desc: "Is it the right time to invest or save for a house?" },
                { title: "Life Changes", desc: "Moving to a new city, starting a family, or changing paths." }
              ].map((useCase, i) => (
                <div key={i} className="flex gap-4">
                  <div className="w-6 h-6 rounded-full bg-indigo-500 flex-shrink-0 mt-1 flex items-center justify-center text-[10px] font-bold">✓</div>
                  <div>
                    <h4 className="font-bold text-lg">{useCase.title}</h4>
                    <p className="text-zinc-400">{useCase.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="relative">
            <div className="absolute inset-0 bg-indigo-500/20 blur-[100px] rounded-full" />
            <Card className="relative bg-zinc-800 border-zinc-700 text-white p-8 space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center">
                  <Brain className="w-6 h-6" />
                </div>
                <span className="font-bold">AI Analyst</span>
              </div>
              <div className="space-y-4">
                <div className="p-4 bg-zinc-700/50 rounded-xl text-sm border border-zinc-600">
                  "Based on your 5-year goals and current market trends, moving to Berlin offers a 24% higher quality of life index compared to London."
                </div>
                <div className="flex justify-end">
                  <div className="p-4 bg-indigo-600 rounded-xl text-sm shadow-lg">
                    "What about the tax implications?"
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="space-y-16">
        <div className="text-center space-y-4">
          <h2 className="text-4xl font-bold font-display">Trusted by overthinkers</h2>
          <p className="text-zinc-500">See how Decido AI is changing the way people make choices.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-8">
          {[
            { name: "Sarah J.", role: "Product Designer", text: "Decido helped me weigh the pros and cons of three different job offers. The 'Brutal' mode was exactly the wake-up call I needed.", avatar: "https://i.pravatar.cc/150?u=sarah" },
            { name: "Marcus T.", role: "Entrepreneur", text: "I use the 'Money' mode for every major business investment. It catches risks I completely overlooked in my own spreadsheets.", avatar: "https://i.pravatar.cc/150?u=marcus" },
            { name: "Elena R.", role: "Student", text: "Comparing master's programs was overwhelming until I used Decido. The side-by-side comparison made the choice obvious.", avatar: "https://i.pravatar.cc/150?u=elena" }
          ].map((t, i) => (
            <motion.div key={i} variants={item}>
              <Card className="h-full space-y-6 italic text-zinc-600">
                <p>"{t.text}"</p>
                <div className="flex items-center gap-3 not-italic">
                  <img src={t.avatar} className="w-10 h-10 rounded-full border border-zinc-100" alt="" />
                  <div>
                    <div className="font-bold text-zinc-900 text-sm">{t.name}</div>
                    <div className="text-xs text-zinc-400">{t.role}</div>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="text-center space-y-8 py-12 flex flex-col items-center">
        <h2 className="text-4xl md:text-5xl font-bold font-display">Ready to decide?</h2>
        <p className="text-xl text-zinc-500 max-w-xl mx-auto">Join thousands of users making better choices every day.</p>
        <Button size="lg" onClick={onStart} className="px-12 mx-auto">Get Started Now</Button>
      </section>
    </motion.div>
  );
}

function Dashboard({ onNew, history, onViewDecision, onCompare, onUpgrade, profile, onViewHistory }: { onNew: () => void; history: Decision[]; onViewDecision: (d: Decision) => void; onCompare: () => void; onUpgrade: () => void; profile: UserProfile | null; onViewHistory: () => void }) {
  const decisionsThisWeek = history.filter(d => {
    if (!d.createdAt) return false;
    const date = d.createdAt.toDate ? d.createdAt.toDate() : new Date(d.createdAt);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    return diff < 7 * 24 * 60 * 60 * 1000;
  }).length;

  const isNewUser = history.length === 0;

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
  };

  return (
    <motion.div 
      variants={container}
      initial="hidden"
      animate="show"
      exit={{ opacity: 0, y: -20 }}
      className="space-y-12 pb-20"
    >
      <motion.div variants={item} className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <h2 className="text-4xl font-black font-display tracking-tight">Welcome back, {profile?.displayName?.split(' ')[0] || 'Decider'}</h2>
          <p className="text-zinc-500 font-medium">Here's what's happening with your decisions today.</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={onCompare} size="lg" className="hover:scale-105 transition-transform"><Scale className="w-5 h-5 mr-2" /> Compare</Button>
          <Button onClick={onNew} size="lg" className="shadow-xl shadow-indigo-100 hover:scale-105 transition-transform">
            <Plus className="w-5 h-5 mr-2" /> New Decision
          </Button>
        </div>
      </motion.div>

      {isNewUser && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-[2rem] p-8 md:p-12 text-white relative overflow-hidden shadow-2xl shadow-indigo-200"
        >
          <div className="absolute top-0 right-0 -mt-12 -mr-12 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
          <div className="relative z-10 space-y-6 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/20 rounded-full text-xs font-bold uppercase tracking-widest">Quick Start</div>
            <h3 className="text-3xl md:text-4xl font-bold font-display leading-tight">Make your first AI-powered decision in seconds.</h3>
            <p className="text-indigo-100 text-lg">Whether it's a career move, a big purchase, or a life change, Decido AI helps you see the full picture.</p>
            <div className="flex flex-wrap gap-4 pt-4">
              <Button onClick={onNew} className="bg-white text-indigo-600 hover:bg-zinc-100 px-8">Start Now</Button>
              <Button variant="ghost" onClick={onCompare} className="text-white hover:bg-white/10 border border-white/20">Try Compare Mode</Button>
            </div>
          </div>
          <div className="absolute bottom-0 right-0 p-8 hidden lg:block">
            <Brain className="w-48 h-48 text-white/10" />
          </div>
        </motion.div>
      )}

      <motion.div variants={item} className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { label: 'Total Decisions', value: history.length, icon: Brain, color: 'text-indigo-600', bg: 'bg-indigo-50' },
          { label: 'This Week', value: decisionsThisWeek, icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Daily Limit', value: profile?.subscription === 'pro' ? '∞' : `${3 - (profile?.dailyUsageCount || 0)}/3`, icon: Zap, color: 'text-amber-600', bg: 'bg-amber-50' }
        ].map((stat, i) => (
          <Card key={i} className="flex items-center gap-6 p-8 hover:shadow-xl hover:shadow-zinc-100 transition-all duration-300 group border-none bg-white shadow-sm">
            <div className={cn("w-16 h-16 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300", stat.bg)}>
              <stat.icon className={cn("w-8 h-8", stat.color)} />
            </div>
            <div>
              <div className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">{stat.label}</div>
              <div className="text-3xl font-black font-display text-zinc-900">{stat.value}</div>
            </div>
          </Card>
        ))}
      </motion.div>

      <motion.div variants={item} className="space-y-6">
        <div className="flex items-center justify-between px-2">
          <h3 className="text-2xl font-black font-display tracking-tight">Recent History</h3>
          <button onClick={onViewHistory} className="text-sm font-bold text-indigo-600 hover:text-indigo-700 transition-colors">View All History</button>
        </div>
        
        {history.length > 0 ? (
          <div className="grid gap-4">
            {history.slice(0, 5).map((d) => (
              <motion.div 
                key={d.id}
                whileHover={{ x: 10 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
              >
                <Card 
                  onClick={() => onViewDecision(d)}
                  className="flex items-center justify-between p-6 cursor-pointer hover:border-indigo-200 group transition-all border-none bg-white shadow-sm"
                >
                  <div className="flex items-center gap-6">
                    <div className={cn(
                      "w-14 h-14 rounded-2xl flex items-center justify-center transition-colors",
                      d.mode === 'brutal' ? "bg-red-50 text-red-600" :
                      d.mode === 'money' ? "bg-green-50 text-green-600" :
                      d.mode === 'life' ? "bg-pink-50 text-pink-600" :
                      "bg-indigo-50 text-indigo-600"
                    )}>
                      {d.mode === 'brutal' ? <Flame className="w-7 h-7" /> :
                       d.mode === 'money' ? <DollarSign className="w-7 h-7" /> :
                       d.mode === 'life' ? <Heart className="w-7 h-7" /> :
                       <Brain className="w-7 h-7" />}
                    </div>
                    <div>
                      <h4 className="font-bold group-hover:text-indigo-600 transition-colors text-lg font-display">{d.title}</h4>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">
                          {d.createdAt?.toDate ? d.createdAt.toDate().toLocaleDateString() : 'Just now'}
                        </span>
                        <span className="w-1 h-1 bg-zinc-300 rounded-full" />
                        <span className="text-xs font-bold text-indigo-600 uppercase tracking-widest">{d.mode} mode</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="hidden sm:block text-right">
                      <div className="text-[10px] text-zinc-400 uppercase font-bold tracking-widest">Confidence</div>
                      <div className="text-sm font-black text-indigo-600 font-display">{d.analysis?.confidenceScore}%</div>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-zinc-50 flex items-center justify-center text-zinc-300 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-all">
                      <ChevronRight className="w-6 h-6 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        ) : (
          <Card className="py-24 text-center border-dashed border-2 bg-zinc-50/50 border-zinc-200 rounded-[3rem]">
            <div className="w-24 h-24 bg-zinc-100 rounded-full flex items-center justify-center mx-auto mb-8 text-zinc-400">
              <Plus className="w-12 h-12" />
            </div>
            <h4 className="text-2xl font-black text-zinc-900 mb-2 font-display">No decisions yet</h4>
            <p className="text-zinc-500 mb-10 max-w-xs mx-auto font-medium">Start your first AI-powered analysis to see it here.</p>
            <Button onClick={onNew} variant="outline" className="px-12 py-4 text-lg border-2">Create New Decision</Button>
          </Card>
        )}
      </motion.div>
    </motion.div>
  );
}

function DecisionForm({ onBack, onSubmit, isAnalyzing }: { onBack: () => void; onSubmit: (t: string, d: string, m: DecisionMode, i: DecisionInputs) => void; isAnalyzing: boolean }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [mode, setMode] = useState<DecisionMode>('analyst');
  const [risk, setRisk] = useState(50);
  const [error, setError] = useState<string | null>(null);

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05
      }
    }
  } as const;

  const item = {
    hidden: { opacity: 0, x: 20 },
    show: { opacity: 1, x: 0 }
  } as const;

  const modes: { id: DecisionMode; icon: any; label: string; desc: string; color: string; bg: string }[] = [
    { id: 'analyst', icon: Brain, label: 'Analyst', desc: 'Logical & Data-driven', color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { id: 'money', icon: DollarSign, label: 'Money', desc: 'Profit & Efficiency', color: 'text-green-600', bg: 'bg-green-50' },
    { id: 'life', icon: Heart, label: 'Life', desc: 'Happiness & Lifestyle', color: 'text-pink-600', bg: 'bg-pink-50' },
    { id: 'brutal', icon: Flame, label: 'Brutal', desc: 'Honest & Harsh Truth', color: 'text-red-600', bg: 'bg-red-50' }
  ];

  const [showValidation, setShowValidation] = useState(false);

  const handleSubmit = async () => {
    setShowValidation(true);
    if (!title.trim()) {
      setError('Please specify what you are deciding.');
      return;
    }
    if (!description.trim()) {
      setError('Please provide context and details for your decision.');
      return;
    }
    setError(null);
    try {
      await onSubmit(title, description, mode, { 
        riskTolerance: risk 
      });
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    }
  };

  return (
    <motion.div 
      variants={container}
      initial="hidden"
      animate="show"
      exit={{ opacity: 0, x: -20 }}
      className="max-w-2xl mx-auto space-y-8"
    >
      <motion.div variants={item} className="flex items-center gap-4">
        <Button variant="ghost" onClick={onBack} size="icon" className="rounded-full hover:bg-zinc-100">
          <ArrowLeft className="w-6 h-6" />
        </Button>
        <h2 className="text-3xl md:text-4xl font-black font-display tracking-tight">New Decision</h2>
      </motion.div>

      <div className="space-y-10">
        <AnimatePresence>
          {error && (
            <motion.div 
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-600 text-sm font-semibold flex items-center gap-3 shadow-lg shadow-red-100/50"
            >
              <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <p>{error}</p>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div variants={item} className="space-y-4">
          <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest ml-1">What are you deciding?</label>
          <Input 
            placeholder="e.g. Should I move to Berlin?" 
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="text-xl py-6 rounded-2xl border-none bg-white shadow-lg shadow-zinc-100"
            error={showValidation && !title.trim() ? 'This field is required' : undefined}
          />
        </motion.div>
        <motion.div variants={item} className="space-y-4">
          <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest ml-1">Context & Details</label>
          <TextArea 
            placeholder="Provide as much detail as possible. What are the options? What are your goals? What's holding you back?" 
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="text-lg py-6 rounded-2xl border-none bg-white shadow-lg shadow-zinc-100 min-h-[200px]"
            error={showValidation && !description.trim() ? 'This field is required' : undefined}
          />
        </motion.div>

        <motion.div variants={item} className="space-y-6">
          <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest ml-1">Choose Analysis Mode</label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {modes.map((m) => (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className={cn(
                  "flex flex-col items-center gap-4 p-6 rounded-[2rem] border-2 transition-all duration-300",
                  mode === m.id 
                    ? "border-indigo-600 bg-indigo-50/50 shadow-lg shadow-indigo-100" 
                    : "border-transparent bg-white hover:bg-zinc-50 shadow-sm"
                )}
              >
                <div className={cn(
                  "w-12 h-12 rounded-xl flex items-center justify-center transition-transform duration-300",
                  mode === m.id ? "scale-110 " + m.bg : "bg-zinc-100"
                )}>
                  <m.icon className={cn("w-6 h-6", mode === m.id ? m.color : "text-zinc-400")} />
                </div>
                <div className="text-center">
                  <div className={cn("text-sm font-bold font-display", mode === m.id ? "text-indigo-600" : "text-zinc-600")}>{m.label}</div>
                  <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-tighter mt-0.5">{m.id}</div>
                </div>
              </button>
            ))}
          </div>
        </motion.div>

        <motion.div variants={item} className="space-y-6 p-8 bg-white rounded-[2.5rem] shadow-lg shadow-zinc-100">
          <div className="flex justify-between items-center">
            <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Risk Tolerance</label>
            <span className="text-lg font-black font-display text-indigo-600">{risk}%</span>
          </div>
          <input 
            type="range" 
            min="0" 
            max="100" 
            value={risk}
            onChange={(e) => setRisk(parseInt(e.target.value))}
            className="w-full h-2 bg-zinc-100 rounded-full appearance-none cursor-pointer accent-indigo-600"
          />
          <div className="flex justify-between text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
            <span>Conservative</span>
            <span>Aggressive</span>
          </div>
        </motion.div>

        <motion.div variants={item} className="pt-6">
          <Button 
            onClick={handleSubmit} 
            isLoading={isAnalyzing}
            className="w-full py-6 text-xl font-black font-display tracking-tight shadow-2xl shadow-indigo-200 rounded-2xl"
          >
            {isAnalyzing ? 'Analyzing with Decido AI...' : 'Generate Analysis'}
          </Button>
        </motion.div>
      </div>
    </motion.div>
  );
}

function Results({ decision, onBack, onNew, onCompare, onUpgrade, profile }: { decision: Decision; onBack: () => void; onNew: () => void; onCompare: () => void; onUpgrade: () => void; profile: UserProfile | null }) {
  const { analysis } = decision;
  const [question, setQuestion] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'model'; parts: { text: string }[] }[]>([]);
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'model'; text: string }[]>([]);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [showConfetti, setShowConfetti] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setShowConfetti(false), 5000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, isAsking]);

  if (!analysis) return null;

  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || isAsking) return;

    const userQuestion = question.trim();
    setQuestion('');
    setIsAsking(true);
    setIsChatOpen(true);
    
    setChatMessages(prev => [...prev, { role: 'user', text: userQuestion }]);

    try {
      const response = await askFollowUp(userQuestion, decision, chatHistory);
      setChatMessages(prev => [...prev, { role: 'model', text: response }]);
      setChatHistory(prev => [
        ...prev,
        { role: 'user', parts: [{ text: userQuestion }] },
        { role: 'model', parts: [{ text: response }] }
      ]);
    } catch (error) {
      console.error('Chat error:', error);
    } finally {
      setIsAsking(false);
    }
  };

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
  };

  return (
    <motion.div 
      variants={container}
      initial="hidden"
      animate="show"
      exit={{ opacity: 0, scale: 0.95 }}
      className="max-w-5xl mx-auto space-y-10 pb-32 relative"
    >
      {showConfetti && (
        <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
          {[...Array(50)].map((_, i) => (
            <motion.div
              key={i}
              initial={{ 
                top: -20, 
                left: `${Math.random() * 100}%`,
                scale: Math.random() * 0.5 + 0.5,
                rotate: 0
              }}
              animate={{ 
                top: '120%',
                left: `${Math.random() * 100}%`,
                rotate: 360
              }}
              transition={{ 
                duration: Math.random() * 2 + 3,
                ease: "linear",
                repeat: 0
              }}
              className={cn(
                "absolute w-3 h-3 rounded-sm",
                ["bg-indigo-500", "bg-violet-500", "bg-emerald-500", "bg-amber-500", "bg-pink-500"][Math.floor(Math.random() * 5)]
              )}
            />
          ))}
        </div>
      )}

      <motion.div variants={item} className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={onBack} size="icon" className="rounded-full hover:bg-zinc-100">
            <ArrowLeft className="w-6 h-6" />
          </Button>
          <div>
            <h2 className="text-3xl md:text-4xl font-black font-display tracking-tight truncate max-w-md">{decision.title}</h2>
            <p className="text-zinc-500 text-sm font-bold uppercase tracking-widest mt-1">{decision.mode} Mode Analysis</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" className="rounded-full" title="Share"><Share2 className="w-5 h-5" /></Button>
          <Button variant="outline" size="icon" className="rounded-full" title="Export"><Download className="w-5 h-5" /></Button>
        </div>
      </motion.div>

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <motion.div variants={item}>
            <Card className="p-10 border-none bg-white shadow-xl shadow-indigo-50 rounded-[3rem] overflow-hidden relative">
              <div className="absolute top-0 right-0 p-8 opacity-5">
                <Brain className="w-32 h-32" />
              </div>
              <div className="space-y-6 relative z-10">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 rounded-full text-indigo-600 text-xs font-bold uppercase tracking-widest">Recommendation</div>
                <h3 className="text-4xl md:text-5xl font-black font-display text-zinc-900 leading-tight">{analysis.recommendation}</h3>
                <div className="h-px bg-zinc-100 w-full" />
                <div className="grid md:grid-cols-2 gap-10">
                  <div className="space-y-4">
                    <h4 className="text-sm font-bold text-emerald-600 uppercase tracking-widest flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-500" /> Pros
                    </h4>
                    <ul className="space-y-3">
                      {analysis.pros.map((pro, i) => (
                        <li key={i} className="flex gap-3 text-zinc-600 font-medium leading-relaxed">
                          <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                          <span>{pro}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="space-y-4">
                    <h4 className="text-sm font-bold text-red-600 uppercase tracking-widest flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-red-500" /> Cons
                    </h4>
                    <ul className="space-y-3">
                      {analysis.cons.map((con, i) => (
                        <li key={i} className="flex gap-3 text-zinc-600 font-medium leading-relaxed">
                          <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                          <span>{con}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>

          <motion.div variants={item}>
            <Card className="p-10 border-none bg-white shadow-xl shadow-indigo-50 rounded-[3rem]">
              <div className="space-y-6">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-100 rounded-full text-zinc-600 text-xs font-bold uppercase tracking-widest">AI Reasoning</div>
                <div className="prose prose-zinc max-w-none">
                  <div className="text-zinc-600 font-medium leading-relaxed whitespace-pre-wrap">
                    <Markdown>{analysis.reasoning}</Markdown>
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>

          <motion.div variants={item}>
            <Card className="p-10 border-none bg-indigo-900 text-white shadow-2xl shadow-indigo-200 rounded-[3rem] relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 blur-[80px] rounded-full -translate-y-1/2 translate-x-1/2" />
              <div className="space-y-8 relative z-10">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 rounded-full text-white text-xs font-bold uppercase tracking-widest">Action Plan</div>
                <div className="grid gap-6">
                  {analysis.actionPlan.map((step, i) => (
                    <div key={i} className="flex gap-6 items-start group">
                      <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center shrink-0 font-black text-xl group-hover:bg-white group-hover:text-indigo-900 transition-all duration-300">
                        {i + 1}
                      </div>
                      <p className="text-indigo-100 text-lg font-medium leading-relaxed pt-2">{step}</p>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </motion.div>
        </div>

        <div className="space-y-8">
          <motion.div variants={item}>
            <Card className="p-8 border-none bg-white shadow-xl shadow-indigo-50 rounded-[2.5rem] space-y-8">
              <div className="space-y-4">
                <div className="flex justify-between items-end">
                  <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Confidence Score</span>
                  <span className="text-4xl font-black font-display text-indigo-600">{analysis.confidenceScore}%</span>
                </div>
                <div className="h-4 bg-zinc-100 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${analysis.confidenceScore}%` }}
                    transition={{ duration: 1.5, ease: "easeOut", delay: 0.5 }}
                    className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full"
                  />
                </div>
                <p className="text-xs text-zinc-400 font-medium leading-relaxed">Based on current parameters and AI analysis reliability.</p>
              </div>

              <div className="h-px bg-zinc-100" />

              <div className="space-y-4">
                <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Risk Assessment</span>
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-4 h-4 rounded-full",
                    analysis.riskLevel.toLowerCase() === 'low' ? "bg-emerald-500" :
                    analysis.riskLevel.toLowerCase() === 'medium' ? "bg-amber-500" : "bg-red-500"
                  )} />
                  <span className="text-2xl font-black font-display capitalize">{analysis.riskLevel} Risk</span>
                </div>
              </div>
            </Card>
          </motion.div>

          <motion.div variants={item}>
            <Card className="p-8 border-none bg-gradient-to-br from-zinc-50 to-white shadow-xl shadow-indigo-50 rounded-[2.5rem] space-y-6">
              <h4 className="text-xl font-black font-display tracking-tight">Need more clarity?</h4>
              <p className="text-zinc-500 text-sm font-medium leading-relaxed">Ask follow-up questions about this analysis to our AI expert.</p>
              <Button onClick={() => setIsChatOpen(true)} className="w-full py-6 text-lg shadow-lg shadow-indigo-100">
                <MessageSquare className="w-5 h-5 mr-2" /> Chat with AI
              </Button>
            </Card>
          </motion.div>

          <motion.div variants={item} className="p-8 bg-indigo-50 rounded-[2.5rem] border-2 border-dashed border-indigo-100 text-center space-y-4">
            <p className="text-sm font-bold text-indigo-600">Want a second opinion?</p>
            <Button variant="outline" onClick={onCompare} className="w-full border-2 hover:bg-white">Compare Options</Button>
          </motion.div>
        </div>
      </div>

      <AnimatePresence>
        {isChatOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="fixed bottom-8 right-8 w-full max-w-md z-50 px-4 md:px-0"
          >
            <Card className="h-[600px] flex flex-col shadow-2xl border-none overflow-hidden rounded-[2.5rem]">
              <div className="p-6 bg-zinc-900 text-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500 flex items-center justify-center">
                    <Brain className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-bold font-display">AI Analyst</h4>
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-400">Online</span>
                    </div>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setIsChatOpen(false)} className="text-white hover:bg-white/10 rounded-full">
                  <X className="w-6 h-6" />
                </Button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-zinc-50/50">
                {chatMessages.length === 0 && (
                  <div className="text-center py-10 space-y-4">
                    <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto shadow-sm">
                      <MessageSquare className="w-8 h-8 text-indigo-600" />
                    </div>
                    <p className="text-zinc-500 text-sm font-medium px-10">Ask anything about the recommendation, pros, or cons.</p>
                  </div>
                )}
                {chatMessages.map((msg, i) => (
                  <div key={i} className={cn("flex", msg.role === 'user' ? "justify-end" : "justify-start")}>
                    <div className={cn(
                      "max-w-[85%] p-4 rounded-2xl text-sm font-medium leading-relaxed shadow-sm",
                      msg.role === 'user' ? "bg-indigo-600 text-white rounded-tr-none" : "bg-white text-zinc-900 rounded-tl-none"
                    )}>
                      {msg.text}
                    </div>
                  </div>
                ))}
                {isAsking && (
                  <div className="flex justify-start">
                    <div className="bg-white p-4 rounded-2xl rounded-tl-none shadow-sm">
                      <div className="flex gap-1">
                        <div className="w-1.5 h-1.5 bg-zinc-300 rounded-full animate-bounce" />
                        <div className="w-1.5 h-1.5 bg-zinc-300 rounded-full animate-bounce [animation-delay:0.2s]" />
                        <div className="w-1.5 h-1.5 bg-zinc-300 rounded-full animate-bounce [animation-delay:0.4s]" />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <form onSubmit={handleAsk} className="p-6 bg-white border-t border-zinc-100 flex gap-3">
                <Input
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Ask a follow-up..."
                  className="flex-1 bg-zinc-50 border-none focus-visible:ring-indigo-600 rounded-xl h-12"
                />
                <Button type="submit" size="icon" disabled={!question.trim() || isAsking} className="rounded-xl h-12 w-12 shrink-0">
                  <Send className="w-5 h-5" />
                </Button>
              </form>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function CompareMode({ onBack, mode, user, profile, setProfile, onUpgrade }: { onBack: () => void; mode: DecisionMode; user: User | null; profile: UserProfile | null; setProfile: (p: UserProfile) => void; onUpgrade: () => void }) {
  const [context, setContext] = useState('');
  const [optionA, setOptionA] = useState('');
  const [optionB, setOptionB] = useState('');
  const [isComparing, setIsComparing] = useState(false);
  const [result, setResult] = useState<{ winner: string; comparison: string; reasoning: string } | null>(null);

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
  };

  const handleCompare = async () => {
    if (!user || !profile) return;

    // Check daily limits for free users (3 per day)
    if (profile.subscription === 'free' && profile.dailyUsageCount >= 3) {
      onUpgrade();
      return;
    }

    setIsComparing(true);
    try {
      const res = await compareOptions(optionA, optionB, context, mode);
      
      // Update profile count
      const today = new Date().toISOString().split('T')[0];
      const updatedProfile: UserProfile = { 
        ...profile, 
        dailyUsageCount: profile.dailyUsageCount + 1,
        totalDecisionsCount: (profile.totalDecisionsCount || 0) + 1,
        lastUsageDate: today
      };
      await setDoc(doc(db, 'users', user.uid), updatedProfile);
      setProfile(updatedProfile);

      setResult(res);
    } catch (error) {
      console.error('Comparison failed:', error);
    } finally {
      setIsComparing(false);
    }
  };

  return (
    <motion.div 
      variants={container}
      initial="hidden"
      animate="show"
      exit={{ opacity: 0, y: -20 }}
      className="max-w-4xl mx-auto space-y-8"
    >
      <motion.div variants={item} className="flex items-center gap-4">
        <button onClick={onBack} className="p-2 hover:bg-zinc-100 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-2xl font-bold font-display">Compare Options</h2>
      </motion.div>

      {!result ? (
        <div className="space-y-8">
          <motion.div variants={item}>
            <TextArea 
              label="What's the context?" 
              placeholder="Describe the situation you're facing..." 
              value={context}
              onChange={(e) => setContext(e.target.value)}
            />
          </motion.div>
          <div className="grid md:grid-cols-2 gap-6">
            <motion.div variants={item}>
              <Card className="space-y-4 border-indigo-100 bg-indigo-50/30 h-full">
                <div className="flex items-center gap-2 text-indigo-600 font-bold uppercase text-xs tracking-widest font-display">Option A</div>
                <TextArea 
                  placeholder="Describe the first option..." 
                  value={optionA}
                  onChange={(e) => setOptionA(e.target.value)}
                />
              </Card>
            </motion.div>
            <motion.div variants={item}>
              <Card className="space-y-4 border-purple-100 bg-purple-50/30 h-full">
                <div className="flex items-center gap-2 text-purple-600 font-bold uppercase text-xs tracking-widest font-display">Option B</div>
                <TextArea 
                  placeholder="Describe the second option..." 
                  value={optionB}
                  onChange={(e) => setOptionB(e.target.value)}
                />
              </Card>
            </motion.div>
          </div>
          <motion.div variants={item}>
            <Button 
              className="w-full" 
              size="lg" 
              isLoading={isComparing}
              onClick={handleCompare}
              disabled={!context || !optionA || !optionB}
            >
              Compare with AI
            </Button>
          </motion.div>
        </div>
      ) : (
        <motion.div variants={container} initial="hidden" animate="show" className="space-y-8">
          <motion.div variants={item}>
            <Card className="bg-indigo-600 text-white border-none shadow-xl shadow-indigo-100 text-center py-12">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-100 text-xs font-bold uppercase tracking-widest mb-4">The Winner</div>
              <h3 className="text-4xl font-black text-white mb-4 font-display">{result.winner}</h3>
              <p className="text-indigo-100 max-w-xl mx-auto font-medium">{result.reasoning}</p>
            </Card>
          </motion.div>

          <motion.div variants={item}>
            <Card>
              <h4 className="font-bold mb-4 font-display">Side-by-Side Comparison</h4>
              <div className="prose max-w-none text-zinc-600">
                <Markdown>{result.comparison}</Markdown>
              </div>
            </Card>
          </motion.div>

          <motion.div variants={item}>
            <Button variant="outline" className="w-full" onClick={() => setResult(null)}>New Comparison</Button>
          </motion.div>
        </motion.div>
      )}
    </motion.div>
  );
}

function HistoryView({ history, onViewDecision }: { history: Decision[]; onViewDecision: (d: Decision) => void }) {
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="space-y-8"
    >
      <h2 className="text-3xl font-bold font-display">Decision History</h2>
      <div className="grid gap-4">
        {history.map((d) => (
          <Card key={d.id} className="flex items-center justify-between cursor-pointer group" onClick={() => onViewDecision(d)}>
            <div className="flex items-center gap-6">
              <div className={cn(
                "w-12 h-12 rounded-xl flex items-center justify-center",
                d.mode === 'brutal' ? "bg-red-50 text-red-600" :
                d.mode === 'money' ? "bg-green-50 text-green-600" :
                d.mode === 'life' ? "bg-pink-50 text-pink-600" :
                "bg-indigo-50 text-indigo-600"
              )}>
                {d.mode === 'brutal' ? <Flame className="w-6 h-6" /> :
                 d.mode === 'money' ? <DollarSign className="w-6 h-6" /> :
                 d.mode === 'life' ? <Heart className="w-6 h-6" /> :
                 <Brain className="w-6 h-6" />}
              </div>
              <div>
                <h4 className="font-bold group-hover:text-indigo-600 transition-colors font-display">{d.title}</h4>
                <p className="text-sm text-zinc-500">{d.createdAt?.toDate ? d.createdAt.toDate().toLocaleString() : 'Just now'}</p>
              </div>
            </div>
            <div className="flex items-center gap-8">
              <div className="hidden md:block text-right">
                <div className="text-[10px] text-zinc-400 uppercase font-bold tracking-widest mb-1">Confidence</div>
                <div className="font-bold text-indigo-600">{d.analysis?.confidenceScore}%</div>
              </div>
              <ChevronRight className="w-5 h-5 text-zinc-300 group-hover:text-indigo-600 transition-colors group-hover:translate-x-1" />
            </div>
          </Card>
        ))}
      </div>
    </motion.div>
  );
}

function Pricing({ profile, onUpgrade }: { profile: UserProfile | null; onUpgrade: () => void }) {
  const plans = [
    {
      name: 'Free',
      price: '$0',
      features: ['3 decisions per day', 'Basic analysis', 'Standard history', 'Analyst mode only'],
      cta: 'Current Plan',
      current: profile?.subscription === 'free'
    },
    {
      name: 'Pro',
      price: '$12',
      features: ['Unlimited decisions', 'Compare mode unlocked', 'All AI personalities', 'Full history', 'Priority AI processing'],
      cta: 'Upgrade',
      current: profile?.subscription === 'pro',
      highlight: true
    }
  ];

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="max-w-6xl mx-auto space-y-32 pb-24"
    >
      <div className="max-w-4xl mx-auto space-y-12 text-center">
        <div className="space-y-4">
          <h2 className="text-4xl md:text-5xl font-bold font-display tracking-tight">Simple, transparent pricing</h2>
          <p className="text-zinc-500 text-lg">Choose the plan that fits your decision-making needs.</p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {plans.map((plan, i) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
            >
              <Card className={cn(
                "relative flex flex-col p-8 text-left h-full",
                plan.highlight && "border-indigo-600 bg-indigo-50/50 ring-1 ring-indigo-600 shadow-xl shadow-indigo-100"
              )}>
                {plan.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-indigo-600 text-white text-[10px] font-bold uppercase tracking-widest rounded-full shadow-lg shadow-indigo-200">
                    Most Popular
                  </div>
                )}
                <div className="mb-8">
                  <h3 className="text-xl font-bold mb-2 font-display">{plan.name}</h3>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold font-display">{plan.price}</span>
                    <span className="text-zinc-500 font-medium">/month</span>
                  </div>
                </div>
                <ul className="space-y-4 mb-10 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-3 text-zinc-600 font-medium">
                      <CheckCircle2 className="w-5 h-5 text-indigo-600" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button 
                  variant={plan.highlight ? 'primary' : 'outline'} 
                  className="w-full py-4 text-lg font-bold"
                  disabled={plan.current}
                  onClick={onUpgrade}
                >
                  {plan.cta}
                </Button>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
