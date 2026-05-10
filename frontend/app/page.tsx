"use client";
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { generatePKCE } from '@/lib/pkce';
import { toast } from 'react-toastify';

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

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-white">
      <div className="max-w-2xl w-full text-center space-y-8 p-6">
        <div className="w-16 h-16 bg-blue-600 rounded-xl flex items-center justify-center text-2xl font-bold mx-auto">IMS</div>
        <h1 className="text-5xl font-bold tracking-tight">Zero-Touch Kitchen</h1>
        
        <div className="bg-slate-800 p-8 rounded-2xl border border-slate-700 shadow-2xl max-w-md mx-auto">
          <div className="flex bg-slate-900 p-1 rounded-lg mb-8">
            <button onClick={() => setIsLoginMode(false)} className={`flex-1 py-2 rounded-md font-medium transition-colors ${!isLoginMode ? 'bg-blue-600 text-white' : 'text-slate-400'}`}>New Kitchen</button>
            <button onClick={() => setIsLoginMode(true)} className={`flex-1 py-2 rounded-md font-medium transition-colors ${isLoginMode ? 'bg-blue-600 text-white' : 'text-slate-400'}`}>Existing Kitchen</button>
          </div>

          {!isLoginMode ? (
            <form onSubmit={handleRegister} className="space-y-4">
              <input type="text" required value={kitchenName} onChange={(e) => setKitchenName(e.target.value)} placeholder="Restaurant Name" className="w-full p-4 rounded-lg text-slate-900 text-lg outline-none bg-white" />
              <button type="submit" disabled={isProcessing} className="w-full bg-[#fc8019] hover:bg-[#e06b12] text-white px-8 py-4 rounded-lg font-bold">Register & Connect Swiggy</button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-4">
              <input type="text" required value={kitchenIdInput} onChange={(e) => setKitchenIdInput(e.target.value)} placeholder="Enter Kitchen ID (Secret Key)" className="w-full p-4 rounded-lg text-slate-900 text-lg outline-none bg-white" />
              <button type="submit" disabled={isProcessing} className="w-full bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-lg font-bold">Secure Login</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}