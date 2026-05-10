"use client";
import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { LayoutDashboard, Package, History, TrendingUp, ShoppingCart, Menu, X, Mic, BookOpen, Settings } from 'lucide-react';
import { DashboardCard } from '@/components/DashboardCard';
import { OrderDensityChart } from '@/components/Analytics';
import { toast } from 'react-toastify';

interface CriticalItem {
  name: string;
  stock: string;
  status: string;
}

export default function Dashboard() {
  const router = useRouter();

  // --- Dynamic Identity State ---
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [restaurantName, setRestaurantName] = useState<string>("Loading Kitchen...");
  const [ledgerData, setLedgerData] = useState<any[]>([]);
  const [recipes, setRecipes] = useState<any[]>([]);
  const [quickAddQty, setQuickAddQty] = useState<Record<string, string>>({});
  const [editingItem, setEditingItem] = useState<any>(null);
  const [editForm, setEditForm] = useState({ threshold: '', reorderQty: '' });
  // --- UI & Navigation State ---
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // --- Inventory & Dashboard State ---
  const [masterInventory, setMasterInventory] = useState<any[]>([]);
  const [manualItem, setManualItem] = useState({ 
    name: '', qty: '', unit: 'kg', threshold: '1', reorderQty: '5' 
  });
  const [stats, setStats] = useState({
    revenue: 0,
    spend: 0,
    net_profit: 0,
    critical_inventory: [] as CriticalItem[]
  });

  // --- AI Voice State ---
  const [aiInput, setAiInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [recentIngestions, setRecentIngestions] = useState<any[]>([]);
  const [isListening, setIsListening] = useState(false);

  const fetchDashboardData = useCallback(async (id: string) => {
    try {
      const statsRes = await fetch(`http://127.0.0.1:8000/api/dashboard/stats?restaurant_id=${id}`);
      if (statsRes.ok) setStats(await statsRes.json());

      const invRes = await fetch(`http://127.0.0.1:8000/api/inventory/${id}`);
      if (invRes.ok) setMasterInventory(await invRes.json());
      
      const ledgerRes = await fetch(`http://127.0.0.1:8000/api/ledger/${id}`);
      if (ledgerRes.ok) setLedgerData(await ledgerRes.json());

      // NEW: Fetch Recipes
      const recipeRes = await fetch(`http://127.0.0.1:8000/api/recipes/${id}`);
      if (recipeRes.ok) setRecipes(await recipeRes.json());

    } catch (error) {
      console.error("Fetch error:", error);
    }
  }, []);

  const handleLogout = () => {
    sessionStorage.clear();
    router.push('/');
  };

  const handleUpdateRules = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId || !editingItem) return;

    const res = await fetch('http://127.0.0.1:8000/api/inventory/stock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        restaurant_id: tenantId,
        name: editingItem.name,
        quantity: 0, // <-- We are adding ZERO stock, just updating rules
        unit: editingItem.unit,
        reorder_threshold: parseFloat(editForm.threshold),
        reorder_qty: parseFloat(editForm.reorderQty)
      })
    });

    if (res.ok) {
      toast.success(`Automation rules updated for ${editingItem.name}`);
      setEditingItem(null); // Close the modal
      fetchDashboardData(tenantId); // Refresh table
    }
  };

  // 1. Fetch Identity and Start Polling
useEffect(() => {
    const storedId = sessionStorage.getItem('tenant_id');
    const storedName = sessionStorage.getItem('tenant_name');
    
    // Redirect to login if they bypassed it
    if (!storedId) {
        router.push('/');
        return;
    }

    setTenantId(storedId);
    setRestaurantName(storedName || "My Kitchen");

    // Initial fetch
    fetchDashboardData(storedId);
    
    // Polling interval
    const intervalId = setInterval(() => fetchDashboardData(storedId), 5000);
    return () => clearInterval(intervalId);
  }, [fetchDashboardData, router]);

  const triggerManualRestock = () => toast.info("Manual Restock Check Initiated...");
  const handleNavClick = (tab: string) => { setActiveTab(tab); setIsMobileMenuOpen(false); };

  // --- MANUAL ENTRY FIX ---
  const handleManualStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId) return;

    const res = await fetch('http://127.0.0.1:8000/api/inventory/stock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        restaurant_id: tenantId,
        name: manualItem.name,
        quantity: parseFloat(manualItem.qty),
        unit: manualItem.unit,
        reorder_threshold: parseFloat(manualItem.threshold),
        reorder_qty: parseFloat(manualItem.reorderQty)
      })
    });

    if (res.ok) {
      toast.success("Stock updated successfully!");
      setManualItem({ name: '', qty: '', unit: 'kg', threshold: '1', reorderQty: '5' }); 
      
      // INSTANT UI REFRESH
      fetchDashboardData(tenantId);
    }
  };

  const handleQuickAdd = async (item: any) => {
    const qty = parseFloat(quickAddQty[item.id]);
    if (!qty || isNaN(qty) || !tenantId) return;

    const res = await fetch('http://127.0.0.1:8000/api/inventory/stock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        restaurant_id: tenantId,
        name: item.name,
        quantity: qty,
        unit: item.unit,
        reorder_threshold: item.threshold, // Pulled from the updated GET route
        reorder_qty: item.reorder_qty      // Pulled from the updated GET route
      })
    });

    if (res.ok) {
      toast.success(`Added ${qty} ${item.unit} to ${item.name}`);
      setQuickAddQty({...quickAddQty, [item.id]: ''}); // Clear the tiny box
      fetchDashboardData(tenantId); // Instant refresh
    }
  };

  // --- AI INGESTION FIX ---
  const handleAIIngest = async () => {
    if (!aiInput.trim() || !tenantId) return;
    setIsProcessing(true);

    try {
      const response = await fetch('http://127.0.0.1:8000/api/inventory/ai-ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurant_id: tenantId, text: aiInput })
      });

      if (response.ok) {
        const data = await response.json();
        toast.success(`Successfully added ${data.dish} to the menu!`);
        setRecentIngestions(prev => [data, ...prev]);
        setAiInput("");
        
        // INSTANT UI REFRESH
        fetchDashboardData(tenantId);
      } else {
        const errorData = await response.json();
        toast.error(`Ingestion failed: ${errorData.detail}`);
      }
    } catch (error) {
      toast.error("Failed to connect to the AI engine.");
    } finally {
      setIsProcessing(false);
    }
  };

  // --- AI Voice Recognition ---
  const handleVoiceRecord = () => {
    const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return toast.error("Your browser doesn't support voice dictation.");

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = () => { setIsListening(true); toast.info("Listening... Speak now!"); };
    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results).map((result: any) => result[0].transcript).join('');
      setAiInput(transcript);
    };
    recognition.onerror = () => { setIsListening(false); toast.error("Microphone error."); };
    recognition.onend = () => setIsListening(false);
    recognition.start();
  };

  // --- AI Ingestion Submit ---

  const renderContent = () => {
    if (activeTab === 'inventory') {
      return (
        <div className="space-y-6">
          {/* 1. Manual Delivery Form */}
          <div className="bg-white p-6 border border-slate-200 rounded-xl shadow-sm">
            <h3 className="text-xl font-bold mb-4 text-slate-900">Log Delivery Drop</h3>
            <form onSubmit={handleManualStock} className="flex flex-col gap-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Item Name</label>
                  <input type="text" required value={manualItem.name} onChange={e => setManualItem({...manualItem, name: e.target.value})} className="w-full p-2 border border-slate-300 rounded-lg" placeholder="e.g. Potatoes" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Delivery Qty</label>
                  <input type="number" step="0.1" required value={manualItem.qty} onChange={e => setManualItem({...manualItem, qty: e.target.value})} className="w-full p-2 border border-slate-300 rounded-lg" placeholder="50" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Unit</label>
                  <select value={manualItem.unit} onChange={e => setManualItem({...manualItem, unit: e.target.value})} className="w-full p-2 border border-slate-300 rounded-lg bg-white">
                    <option value="kg">kg</option>
                    <option value="ltr">ltr</option>
                    <option value="pcs">pcs</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                <div className="md:col-span-2">
                  <p className="text-sm text-slate-500 pb-2">Swiggy Instamart Automation Rules:</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Trigger Alert At</label>
                  <input type="number" step="0.1" required value={manualItem.threshold} onChange={e => setManualItem({...manualItem, threshold: e.target.value})} className="w-full p-2 border border-slate-300 rounded-lg" placeholder="1.0" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Auto-Buy Qty</label>
                  <input type="number" step="0.1" required value={manualItem.reorderQty} onChange={e => setManualItem({...manualItem, reorderQty: e.target.value})} className="w-full p-2 border border-slate-300 rounded-lg" placeholder="5.0" />
                </div>
              </div>

              <div className="flex justify-end mt-2">
                <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-2.5 rounded-lg font-medium transition-colors">
                  Add Stock & Save Rules
                </button>
              </div>
            </form>
          </div>

          {/* 2. Master Inventory Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-200 font-semibold text-slate-900">Master Inventory</div>
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-3">Item Name</th>
                  <th className="px-4 py-3">Current Stock</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Quick Restock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {masterInventory.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium">{item.name}</td>
                    <td className="px-4 py-3">{item.stock} {item.unit}</td>
                    <td className={`px-4 py-3 font-bold ${item.status === 'Low' ? 'text-red-600' : 'text-green-600'}`}>{item.status}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {/* The Edit Rules Button */}
                        <button 
                          onClick={() => {
                            setEditingItem(item);
                            setEditForm({ threshold: item.threshold.toString(), reorderQty: item.reorder_qty.toString() });
                          }}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          title="Edit Automation Rules"
                        >
                          <Settings size={18} />
                        </button>
                        
                        {/* The Quick Add Box */}
                        <input 
                          type="number" 
                          step="0.1"
                          placeholder="+ Qty" 
                          value={quickAddQty[item.id] || ''} 
                          onChange={(e) => setQuickAddQty({...quickAddQty, [item.id]: e.target.value})}
                          className="w-20 p-1.5 border border-slate-300 rounded text-xs outline-none focus:border-blue-500" 
                        />
                        <button 
                          onClick={() => handleQuickAdd(item)}
                          className="bg-slate-900 hover:bg-slate-800 text-white px-3 py-1.5 rounded text-xs font-bold transition-colors"
                        >
                          Add
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {/* 3. AI Command Center (Restored!) */}
          <div className="bg-white p-6 border border-slate-200 rounded-xl shadow-sm">
            <h3 className="text-xl font-bold mb-2 text-slate-900">AI Recipe Setup</h3>
            <p className="text-slate-500 mb-4 text-sm">
              Describe the dish, its ingredients, current stock levels, and how much is used per order.
            </p>
            
            <textarea
              className="w-full h-32 p-4 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none text-slate-700 bg-slate-50"
              placeholder="e.g., I want to add Aloo Paratha to the menu. It uses 200 grams of potatoes..."
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              disabled={isProcessing}
            />
            
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={handleVoiceRecord}
                disabled={isProcessing}
                className={`px-4 py-2.5 rounded-lg font-medium transition-all flex items-center gap-2 border ${
                  isListening ? 'bg-red-50 border-red-200 text-red-600 animate-pulse' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Mic size={20} className={isListening ? "animate-bounce" : ""} />
                {isListening ? 'Listening...' : 'Dictate'}
              </button>

              <button
                onClick={handleAIIngest}
                disabled={isProcessing || !aiInput.trim()}
                className="bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white px-6 py-2.5 rounded-lg font-medium transition-all flex items-center gap-2"
              >
                {isProcessing ? 'Parsing Data...' : 'Process Recipe'}
              </button>
            </div>
          </div>
          {/* EDIT RULES MODAL */}
          {editingItem && (
            <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
                <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                  <h3 className="font-bold text-slate-900">Automation Rules: {editingItem.name}</h3>
                  <button onClick={() => setEditingItem(null)} className="text-slate-400 hover:text-slate-700">
                    <X size={20} />
                  </button>
                </div>
                
                <form onSubmit={handleUpdateRules} className="p-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Trigger Alert At ({editingItem.unit})</label>
                    <p className="text-xs text-slate-500 mb-2">When stock falls below this number, Swiggy will be triggered.</p>
                    <input type="number" step="0.1" required value={editForm.threshold} onChange={e => setEditForm({...editForm, threshold: e.target.value})} className="w-full p-3 border border-slate-300 rounded-lg outline-none focus:border-blue-500" />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Auto-Buy Quantity ({editingItem.unit})</label>
                    <p className="text-xs text-slate-500 mb-2">How much should the AI buy when the alert triggers?</p>
                    <input type="number" step="0.1" required value={editForm.reorderQty} onChange={e => setEditForm({...editForm, reorderQty: e.target.value})} className="w-full p-3 border border-slate-300 rounded-lg outline-none focus:border-blue-500" />
                  </div>
                  
                  <div className="flex gap-3 pt-4">
                    <button type="button" onClick={() => setEditingItem(null)} className="flex-1 py-2.5 border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-50">Cancel</button>
                    <button type="submit" className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 shadow-lg shadow-blue-500/20">Save Rules</button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      );
    }
    
    if (activeTab === 'ledger') {
      return (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div className="p-4 border-b border-slate-200 font-semibold text-slate-900">Transaction History</div>
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {ledgerData.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-500">No transactions yet.</td></tr>
              ) : (
                ledgerData.map((t, idx) => (
                  <tr key={idx}>
                    <td className="px-4 py-3 text-xs">{t.timestamp}</td>
                    <td className="px-4 py-3 font-medium">
                      <span className={`px-2 py-1 rounded text-xs ${t.type.includes('INCOME') ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                        {t.type}
                      </span>
                    </td>
                    <td className="px-4 py-3">{t.description}</td>
                    <td className={`px-4 py-3 font-bold ${t.type.includes('INCOME') ? 'text-green-600' : 'text-red-600'}`}>
                      {t.type.includes('INCOME') ? '+' : '-'}₹{t.amount}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      );
    }

    if (activeTab === 'recipes') {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {recipes.length === 0 ? (
            <div className="col-span-full p-8 text-center bg-white border border-slate-200 rounded-xl text-slate-500 shadow-sm">
              No recipes ingested yet. Use the AI dictation on the Inventory tab!
            </div>
          ) : (
            recipes.map((recipe, idx) => (
              <div key={idx} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div className="p-4 border-b border-slate-200 bg-slate-50 font-bold text-slate-900">
                  {recipe.dish_name}
                </div>
                <div className="p-4">
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Bill of Materials</h4>
                  <ul className="space-y-2">
                    {recipe.ingredients.map((ing: any, i: number) => (
                      <li key={i} className="flex justify-between items-center text-sm text-slate-700">
                        <span>{ing.name}</span>
                        <span className="font-medium text-slate-900 bg-slate-100 px-2 py-1 rounded">
                          {ing.burn_rate} {ing.unit}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))
          )}
        </div>
      );
    }
    // Default Dashboard view (Stats & Chart) remains the same
    return (
      <>
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <DashboardCard title="Total Revenue" value={`₹${stats.revenue.toLocaleString()}`} icon={<TrendingUp size={20} />} />
          <DashboardCard title="Automated Spend" value={`₹${stats.spend.toLocaleString()}`} icon={<ShoppingCart size={20} />} />
          <DashboardCard title="Net Profit" value={`₹${stats.net_profit.toLocaleString()}`} icon={<LayoutDashboard size={20} />} />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <OrderDensityChart />
          {/* Critical Stock Table... */}
        </div>
      </>
    );
  };

  return (
    <main className="min-h-screen flex flex-col md:flex-row bg-slate-50">
      {/* Sidebar */}
      <aside className={`fixed md:static inset-y-0 left-0 w-64 bg-slate-900 text-white p-6 z-10 transform transition-transform duration-200 ease-in-out ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="items-center gap-2 mb-10 text-blue-400 hidden md:flex">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center text-white font-bold shrink-0">IMS</div>
          <h1 className="font-bold text-lg tracking-tight text-white leading-tight">Inventory<br/>Management</h1>
        </div>
        <nav className="space-y-2 mt-16 md:mt-0">
          <button onClick={() => handleNavClick('dashboard')} className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors ${activeTab === 'dashboard' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>
            <LayoutDashboard size={20} /> <span>Dashboard</span>
          </button>
          <button onClick={() => handleNavClick('inventory')} className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors ${activeTab === 'inventory' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>
            <Package size={20} /> <span>Inventory</span>
          </button>
          <button onClick={() => handleNavClick('ledger')} className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors ${activeTab === 'ledger' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>
            <History size={20} /> <span>Ledger</span>
          </button>
          <button onClick={() => handleNavClick('recipes')} className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors ${activeTab === 'recipes' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>
            <BookOpen size={20} /> <span>Recipes</span>
          </button>
        </nav>
        <nav className="space-y-2 mt-16 md:mt-0 flex-1">
          {/* ... your existing 3 tab buttons ... */}
        </nav>
        
        {/* NEW: Bottom Section of Sidebar */}
        <div className="absolute bottom-6 left-6 right-6">
          <div className="bg-slate-800 p-3 rounded-lg mb-4">
            <p className="text-xs text-slate-400 mb-1">Your Kitchen ID (Login Key):</p>
            <p className="text-xs font-mono text-blue-400 break-all select-all">{tenantId}</p>
          </div>
          <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 p-3 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors">
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <section className="flex-1 p-4 md:p-8 overflow-y-auto w-full">
        <header className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8 pt-4 md:pt-0">
          <div>
            {/* THIS IS THE DYNAMIC RESTAURANT NAME */}
            <h2 className="text-2xl font-bold text-slate-900 capitalize">{restaurantName} - {activeTab}</h2>
            <p className="text-slate-500">Live operational data and performance</p>
          </div>
          {activeTab === 'dashboard' && (
            <button onClick={triggerManualRestock} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-medium transition-all shadow-lg shadow-blue-500/20">
              Run Audit
            </button>
          )}
        </header>
        {renderContent()}
      </section>
    </main>
  );
}