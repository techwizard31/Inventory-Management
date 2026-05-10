import React from 'react';

interface CardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: string;
}

export const DashboardCard = ({ title, value, icon, trend }: CardProps) => (
  <div className="p-6 bg-white border border-slate-200 rounded-xl shadow-sm">
    <div className="flex items-center justify-between mb-4">
      <span className="text-sm font-medium text-slate-500">{title}</span>
      <div className="text-blue-600">{icon}</div>
    </div>
    {/* Added text-slate-900 to explicitly force dark text here */}
    <div className="text-2xl font-bold text-slate-900">{value}</div>
    {trend && (
      <div className="mt-2 text-xs font-medium text-green-600">
        {trend} vs yesterday
      </div>
    )}
  </div>
);