"use client";
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { generatePKCE } from '@/lib/pkce';
import { toast } from 'react-toastify';

export default function LandingPage() {
  const router = useRouter();
  
  // --- Auth Modes ---
  const [isLoginMode, setIsLoginMode] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // --- State for Forms ---
  const [kitchenName, setKitchenName] = useState('');
  const [existingKitchens, setExistingKitchens] = useState<any[]>([]);
  const [selectedKitchenId, setSelectedKitchenId] = useState('');

  // Fetch existing kitchens on load
  useEffect(() => {
    const fetchKitchens = async () => {
      try {
        const res = await fetch('http://127.0.0.1:8000/api/restaurants');
        if (res.ok) {
          const data = await res.json();
          setExistingKitchens(data);
          if (data.length > 0) setSelectedKitchenId(data[0].id);
        }
      } catch (error) {
        console.error("Failed to fetch restaurants.");
      }
    };
    fetchKitchens();
  }, []);

  // --- LOGIN FLOW (Fast & Direct) ---
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedKitchenId) return;
    
    // Find the name of the selected kitchen to save in local storage
    const selectedKitchen = existingKitchens.find(k => k.id === selectedKitchenId);
    
    // Create the session
    localStorage.setItem('tenant_id', selectedKitchen.id);
    localStorage.setItem('tenant_name', selectedKitchen.name);
    
    toast.success(`Welcome back to ${selectedKitchen.name}!`);
    
    // Push directly to dashboard (No Swiggy auth needed!)
    router.push('/dashboard');
  };

  // --- REGISTER FLOW (Requires Swiggy Auth) ---
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kitchenName.trim()) return;
    setIsProcessing(true);

    try {
      // 1. Create the new restaurant in DB
      const dbResponse = await fetch('http://127.0.0.1:8000/api/restaurants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: kitchenName })
      });

      if (!dbResponse.ok) throw new Error("Failed to create restaurant.");
      const dbData = await dbResponse.json();

      // 2. Setup Swiggy OAuth
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
    } catch (error) {
      toast.error("Failed to initiate connection. Is the backend running?");
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-white">
      <div className="max-w-2xl w-full text-center space-y-8 p-6">
        <div className="w-16 h-16 bg-blue-600 rounded-xl flex items-center justify-center text-2xl font-bold mx-auto">IMS</div>
        <h1 className="text-5xl font-bold tracking-tight">Zero-Touch Kitchen Inventory</h1>
        <p className="text-xl text-slate-400 pb-4">
          Autonomous restocks via Swiggy Instamart.
        </p>
        
        {/* The Auth Container */}
        <div className="bg-slate-800 p-8 rounded-2xl border border-slate-700 shadow-2xl max-w-md mx-auto">
          
          {/* Toggle Buttons */}
          <div className="flex bg-slate-900 p-1 rounded-lg mb-8">
            <button 
              onClick={() => setIsLoginMode(false)}
              className={`flex-1 py-2 rounded-md font-medium transition-colors ${!isLoginMode ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              New Kitchen
            </button>
            <button 
              onClick={() => setIsLoginMode(true)}
              className={`flex-1 py-2 rounded-md font-medium transition-colors ${isLoginMode ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              Existing Kitchen
            </button>
          </div>

          {/* REGISTER FORM */}
          {!isLoginMode ? (
            <form onSubmit={handleRegister} className="space-y-4">
              <input 
                type="text" 
                required 
                value={kitchenName}
                onChange={(e) => setKitchenName(e.target.value)}
                placeholder="Enter new Restaurant Name" 
                className="w-full p-4 rounded-lg text-slate-900 text-lg border-2 border-transparent focus:border-blue-500 outline-none bg-white"
              />
              <button 
                type="submit"
                disabled={isProcessing}
                className="w-full bg-[#fc8019] hover:bg-[#e06b12] text-white px-8 py-4 rounded-lg font-bold text-lg transition-all shadow-lg shadow-orange-500/20 disabled:bg-slate-600"
              >
                {isProcessing ? 'Registering...' : 'Register & Connect Swiggy'}
              </button>
              <p className="text-sm text-slate-400 mt-4 text-left">
                * You will be redirected to Swiggy to securely authorize Instamart purchases.
              </p>
            </form>
          ) : (
            
          /* LOGIN FORM */
            <form onSubmit={handleLogin} className="space-y-4">
              {existingKitchens.length === 0 ? (
                <p className="text-slate-400 p-4">No kitchens registered yet.</p>
              ) : (
                <>
                  <select 
                    value={selectedKitchenId}
                    onChange={(e) => setSelectedKitchenId(e.target.value)}
                    className="w-full p-4 rounded-lg text-slate-900 text-lg border-2 border-transparent focus:border-blue-500 outline-none bg-white"
                  >
                    {existingKitchens.map(k => (
                      <option key={k.id} value={k.id}>{k.name}</option>
                    ))}
                  </select>
                  <button 
                    type="submit"
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-lg font-bold text-lg transition-all shadow-lg shadow-blue-500/20"
                  >
                    Open Dashboard
                  </button>
                </>
              )}
            </form>
          )}

        </div>
      </div>
    </div>
  );
}