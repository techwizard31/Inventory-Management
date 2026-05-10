"use client";

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'react-toastify';

export default function SwiggyCallback() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState("Securing connection to Swiggy...");

  useEffect(() => {
    const exchangeToken = async () => {
      // 1. Grab the code Swiggy gave us
      const authCode = searchParams.get('code');
      
      // 2. Retrieve our stored secrets
      const codeVerifier = sessionStorage.getItem('swiggy_pkce_verifier');
      const restaurantId = sessionStorage.getItem('temp_tenant_id');

      if (!authCode || !codeVerifier || !restaurantId) {
        setStatus("Authentication Error: Missing security parameters.");
        toast.error("Auth failed. Please try connecting again.");
        setTimeout(() => router.push('/'), 3000);
        return;
      }

      try {
        // 3. Send the critical data to our FastAPI Vault
        const response = await fetch('http://127.0.0.1:8000/api/auth/swiggy/exchange', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            restaurant_id: restaurantId,
            code: authCode,
            code_verifier: codeVerifier
          })
        });

        if (response.ok) {
          const data = await response.json(); // <-- Get the payload from FastAPI
          
          setStatus("Connection Successful! Initializing AI Agent...");
          toast.success("Swiggy successfully linked!");
          
          // 1. Clear the temporary PKCE secrets
          sessionStorage.removeItem('swiggy_pkce_verifier');
          sessionStorage.removeItem('temp_tenant_id');
          
          // 2. CREATE THE PERSISTENT LOCAL SESSION
          // This is what makes the Dashboard dynamic!
          localStorage.setItem('tenant_id', data.restaurant_id);
          localStorage.setItem('tenant_name', data.restaurant_name);
          
          // 3. Redirect to the Dashboard
          setTimeout(() => router.push('/dashboard'), 2000);
        } else {
          const errorData = await response.json();
          throw new Error(errorData.detail || "Exchange failed");
        }
      } catch (error) {
        console.error("Exchange Error:", error);
        setStatus("Failed to secure connection. Check backend logs.");
        toast.error("Vault exchange failed.");
      }
    };

    exchangeToken();
  }, [searchParams, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="p-8 bg-white rounded-xl shadow-lg text-center max-w-md w-full">
        <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Authenticating</h2>
        <p className="text-slate-500">{status}</p>
      </div>
    </div>
  );
}