"use client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { OrderDensity } from '@/lib/types';

const data = [
  { hour: '10am', orders: 12 },
  { hour: '12pm', orders: 45 },
  { hour: '2pm', orders: 28 },
  { hour: '6pm', orders: 82 },
  { hour: '8pm', orders: 95 },
  { hour: '10pm', orders: 40 },
];

export const OrderDensityChart = () => (
  <div className="h-[300px] w-full bg-white p-4 rounded-xl border border-slate-200">
    <h3 className="text-sm font-semibold mb-4">Order Density (Peak Hours)</h3>
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
        <XAxis dataKey="hour" fontSize={12} tickLine={false} axisLine={false} />
        <YAxis fontSize={12} tickLine={false} axisLine={false} />
        <Tooltip 
          contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
        />
        <Bar dataKey="orders" fill="#3b82f6" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  </div>
);