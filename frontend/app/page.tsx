"use client";
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { generatePKCE } from '@/lib/pkce';
import { toast } from 'react-toastify';
import { Zap, Brain, BarChart3, Lock, Workflow, TrendingUp } from 'lucide-react';

export default function LandingPage() {
  const router = useRouter();
  const [isLoginMode, setIsLoginMode] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [kitchenName, setKitchenName] = useState('');
  const [kitchenIdInput, setKitchenIdInput] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kitchenIdInput.trim()) return;
    setIsProcessing(true);

    try {
      const res = await fetch('http://127.0.0.1:8000/api/restaurants/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurant_id: kitchenIdInput })
      });

      if (res.ok) {
        const data = await res.json();
        sessionStorage.setItem('tenant_id', data.id);
        sessionStorage.setItem('tenant_name', data.name);
        toast.success(`Welcome back, ${data.name}!`);
        router.push('/dashboard');
      } else {
        toast.error("Invalid Kitchen ID.");
      }
    } catch {
      toast.error("Connection failed.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kitchenName.trim()) return;
    setIsProcessing(true);

    try {
      const dbResponse = await fetch('http://127.0.0.1:8000/api/restaurants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: kitchenName })
      });

      if (!dbResponse.ok) throw new Error("Failed to create restaurant.");
      const dbData = await dbResponse.json();

      const { codeVerifier, codeChallenge } = await generatePKCE();
      sessionStorage.setItem('swiggy_pkce_verifier', codeVerifier);
      sessionStorage.setItem('temp_tenant_id', dbData.id);

      const clientId = 'your_client_id'; 
      const redirectUri = 'http://localhost:3000/auth/callback';
      const swiggyAuthUrl = new URL('https://mcp.swiggy.com/auth/authorize');
      swiggyAuthUrl.searchParams.append('response_type', 'code');
      swiggyAuthUrl.searchParams.append('client_id', clientId);
      swiggyAuthUrl.searchParams.append('redirect_uri', redirectUri);
      swiggyAuthUrl.searchParams.append('scope', 'instamart:read instamart:write');
      swiggyAuthUrl.searchParams.append('code_challenge', codeChallenge);
      swiggyAuthUrl.searchParams.append('code_challenge_method', 'S256');

      window.location.href = swiggyAuthUrl.toString();
    } catch {
      toast.error("Registration failed. Check backend.");
      setIsProcessing(false);
    }
  };

  const features = [
    { icon: Brain, title: 'AI-Powered', desc: 'Gemini agent handles restocking autonomously' },
    { icon: Zap, title: 'Real-Time', desc: 'Instant inventory tracking from POS' },
    { icon: Lock, title: 'Secure', desc: 'OAuth 2.0 authentication with Swiggy' },
    { icon: Workflow, title: 'Seamless', desc: 'Integrates directly with Swiggy Instamart' },
  ];

  return (
    <div className="min-h-screen bg-black text-white overflow-hidden relative">
      {/* Animated background gradient overlay with Swiggy orange */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-96 h-96 rounded-full blur-3xl animate-pulse" style={{ backgroundColor: 'rgba(255, 82, 0, 0.08)' }}></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 rounded-full blur-3xl animate-pulse" style={{ backgroundColor: 'rgba(255, 82, 0, 0.06)', animationDelay: '1s' }}></div>
        <div className="absolute top-1/2 left-1/3 w-80 h-80 rounded-full blur-3xl animate-pulse" style={{ backgroundColor: 'rgba(255, 82, 0, 0.05)', animationDelay: '2s' }}></div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Hero Section */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-16">
          <div className="max-w-4xl w-full space-y-12">
            
            {/* Logo & Branding */}
            <div className="text-center space-y-6 animate-in fade-in slide-in-from-top-10 duration-1000">
              <div className="flex justify-center">
                <div className="group relative">
                  <div className="absolute inset-0 rounded-3xl blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{ backgroundColor: 'rgba(255, 82, 0, 0.4)' }}></div>
                  <div className="relative w-24 h-24 rounded-3xl flex items-center justify-center text-5xl font-black shadow-2xl transform group-hover:scale-110 transition-transform duration-300 border-2" style={{ backgroundColor: 'rgba(255, 82, 0, 0.95)', borderColor: 'rgba(255, 82, 0, 1)', boxShadow: '0 0 40px rgba(255, 82, 0, 0.5)' }}>
                    ⚡
                  </div>
                </div>
              </div>
              
              <div className="space-y-4">
                <div className="relative inline-block w-full text-center">
                  <div className="absolute inset-0 rounded-3xl blur-2xl opacity-60" style={{ backgroundColor: 'rgba(255, 82, 0, 0.3)', transform: 'scale(1.1)' }}></div>
                  <h1 className="relative text-6xl lg:text-8xl font-black tracking-tighter leading-tight px-6 py-4" style={{ color: '#FFFFFF' }}>
                    Zero-Touch<br/>
                    <span style={{ 
                      background: 'linear-gradient(to right, rgb(255, 82, 0), rgb(255, 120, 50))', 
                      WebkitBackgroundClip: 'text', 
                      WebkitTextFillColor: 'transparent', 
                      backgroundClip: 'text',
                      textShadow: 'none'
                    }}>
                      Kitchen
                    </span>
                  </h1>
                </div>
                <div className="relative inline-block w-full text-center">
                  <p className="relative text-xl lg:text-2xl text-white font-light max-w-2xl mx-auto leading-relaxed px-6 py-4 rounded-2xl" style={{ backgroundColor: 'rgba(255, 82, 0, 0.15)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255, 82, 0, 0.3)' }}>
                    AI-driven autonomous inventory management. Your kitchen restocks itself while you focus on what matters.
                  </p>
                </div>
              </div>
            </div>

            {/* Features Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-in fade-in slide-in-from-bottom-10 duration-1000" style={{ animationDelay: '0.2s' }}>
              {features.map((feature, idx) => {
                const Icon = feature.icon;
                return (
                  <div key={idx} className="group relative h-full">
                    <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-xl" style={{ backgroundColor: 'rgba(255, 82, 0, 0.2)' }}></div>
                    <div className="relative bg-gray-900/40 backdrop-blur-xl border border-gray-800 hover:border-gray-700 rounded-2xl p-6 transition-all duration-300 hover:bg-gray-900/60 transform hover:-translate-y-2 h-full flex flex-col">
                      <Icon className="w-12 h-12 mb-4 transition-all duration-300" style={{ color: 'rgb(255, 82, 0)' }} />
                      <div className="mb-3 w-full px-3 py-1 rounded-lg" style={{ backgroundColor: 'rgba(255, 82, 0, 0.2)', border: '1px solid rgba(255, 82, 0, 0.4)' }}>
                        <h3 className="font-bold text-sm text-white text-center" style={{ color: 'rgb(255, 82, 0)' }}>{feature.title}</h3>
                      </div>
                      <div className="rounded-lg p-3 mt-2 flex-1" style={{ backgroundColor: 'rgba(255, 82, 0, 0.08)', border: '1px solid rgba(255, 82, 0, 0.2)' }}>
                        <p className="text-gray-300 text-sm leading-relaxed">{feature.desc}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Auth Form */}
            <div className="flex justify-center animate-in fade-in slide-in-from-bottom-10 duration-1000" style={{ animationDelay: '0.4s' }}>
              <div className="w-full max-w-md">
                <div className="relative group">
                  <div className="absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-50 transition-opacity duration-500 blur-2xl" style={{ backgroundColor: 'rgba(255, 82, 0, 0.2)' }}></div>
                  <div className="relative bg-gray-900/60 backdrop-blur-2xl border border-gray-800 rounded-3xl p-8 shadow-2xl" style={{ boxShadow: '0 0 60px rgba(0, 0, 0, 0.5)' }}>
                    
                    {/* Toggle Buttons */}
                    <div className="flex gap-3 mb-8">
                      <button 
                        onClick={() => setIsLoginMode(false)} 
                        className={`flex-1 py-3 px-4 rounded-xl font-semibold transition-all duration-300 ${
                          !isLoginMode 
                            ? 'text-white scale-105' 
                            : 'bg-gray-800/30 text-gray-400 hover:bg-gray-800/50'
                        }`}
                        style={!isLoginMode ? { backgroundColor: 'rgb(255, 82, 0)', boxShadow: '0 0 20px rgba(255, 82, 0, 0.5)' } : {}}
                      >
                        New Kitchen
                      </button>
                      <button 
                        onClick={() => setIsLoginMode(true)} 
                        className={`flex-1 py-3 px-4 rounded-xl font-semibold transition-all duration-300 ${
                          isLoginMode 
                            ? 'text-white scale-105' 
                            : 'bg-gray-800/30 text-gray-400 hover:bg-gray-800/50'
                        }`}
                        style={isLoginMode ? { backgroundColor: 'rgb(255, 82, 0)', boxShadow: '0 0 20px rgba(255, 82, 0, 0.5)' } : {}}
                      >
                        Existing Kitchen
                      </button>
                    </div>

                    {/* Forms */}
                    {!isLoginMode ? (
                      <form onSubmit={handleRegister} className="space-y-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-gray-300 inline-block px-3 py-1 rounded-lg" style={{ backgroundColor: 'rgba(255, 82, 0, 0.2)', border: '1px solid rgba(255, 82, 0, 0.3)' }}>Restaurant Name</label>
                          <input 
                            type="text" 
                            required 
                            value={kitchenName} 
                            onChange={(e) => setKitchenName(e.target.value)} 
                            placeholder="e.g., Madhuri's Kitchen" 
                            className="w-full px-4 py-3 rounded-xl bg-gray-800/40 border border-gray-700 text-white placeholder-gray-500 focus:outline-none transition-all" 
                            style={{ 
                              borderColor: 'rgb(100, 100, 100)',
                              boxShadow: 'focus:0 0 0 2px rgba(255, 82, 0, 0.2)'
                            }}
                            onFocus={(e) => e.target.style.boxShadow = '0 0 0 2px rgba(255, 82, 0, 0.3)'}
                            onBlur={(e) => e.target.style.boxShadow = 'none'}
                          />
                        </div>
                        <button 
                          type="submit" 
                          disabled={isProcessing} 
                          className="w-full text-white px-8 py-4 rounded-xl font-bold text-lg transition-all duration-300 transform hover:scale-105 disabled:scale-100"
                          style={{
                            backgroundColor: 'rgb(255, 82, 0)',
                            boxShadow: isProcessing ? 'none' : '0 0 30px rgba(255, 82, 0, 0.4)',
                            opacity: isProcessing ? 0.7 : 1
                          }}
                        >
                          {isProcessing ? 'Setting up...' : 'Register & Connect Swiggy'}
                        </button>
                      </form>
                    ) : (
                      <form onSubmit={handleLogin} className="space-y-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-gray-300 inline-block px-3 py-1 rounded-lg" style={{ backgroundColor: 'rgba(255, 82, 0, 0.2)', border: '1px solid rgba(255, 82, 0, 0.3)' }}>Kitchen ID</label>
                          <input 
                            type="text" 
                            required 
                            value={kitchenIdInput} 
                            onChange={(e) => setKitchenIdInput(e.target.value)} 
                            placeholder="Enter your Secret Key" 
                            className="w-full px-4 py-3 rounded-xl bg-gray-800/40 border border-gray-700 text-white placeholder-gray-500 focus:outline-none transition-all"
                            style={{ 
                              borderColor: 'rgb(100, 100, 100)',
                              boxShadow: 'focus:0 0 0 2px rgba(255, 82, 0, 0.2)'
                            }}
                            onFocus={(e) => e.target.style.boxShadow = '0 0 0 2px rgba(255, 82, 0, 0.3)'}
                            onBlur={(e) => e.target.style.boxShadow = 'none'}
                          />
                        </div>
                        <button 
                          type="submit" 
                          disabled={isProcessing} 
                          className="w-full text-white px-8 py-4 rounded-xl font-bold text-lg transition-all duration-300 transform hover:scale-105 disabled:scale-100"
                          style={{
                            backgroundColor: 'rgb(255, 82, 0)',
                            boxShadow: isProcessing ? 'none' : '0 0 30px rgba(255, 82, 0, 0.4)',
                            opacity: isProcessing ? 0.7 : 1
                          }}
                        >
                          {isProcessing ? 'Authenticating...' : 'Secure Login'}
                        </button>
                      </form>
                    )}

                    <div className="mt-6 pt-6 border-t border-gray-800/50 rounded-xl p-4" style={{ backgroundColor: 'rgba(255, 82, 0, 0.08)', border: '1px solid rgba(255, 82, 0, 0.2)' }}>
                      <p className="text-center text-sm text-gray-300">
                        🔒 <span style={{ color: 'rgb(255, 82, 0)' }}>Secure OAuth 2.0 authentication</span><br/>
                        <span className="text-xs text-gray-400">Backend connection required</span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10 py-8 px-6 border-t border-gray-900 flex justify-center">
          <p className="px-6 py-3 rounded-2xl text-center text-sm" style={{ backgroundColor: 'rgba(255, 82, 0, 0.1)', border: '1px solid rgba(255, 82, 0, 0.2)', color: 'rgb(255, 82, 0)' }}>
            Powered by AI • LangGraph • Swiggy Instamart
          </p>
        </div>
      </div>
    </div>
  );
}