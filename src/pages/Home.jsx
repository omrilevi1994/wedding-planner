import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { Heart } from 'lucide-react';

export default function Home() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const isAuthenticated = await base44.auth.isAuthenticated();
      if (isAuthenticated) {
        navigate(createPageUrl('Dashboard'));
      } else {
        base44.auth.redirectToLogin(createPageUrl('Dashboard'));
      }
    };
    checkAuth();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-pink-50 flex items-center justify-center" dir="rtl">
      <div className="text-center">
        <div className="bg-gradient-to-br from-amber-100 to-amber-200 p-6 rounded-full inline-block mb-4 animate-pulse">
          <Heart className="w-16 h-16 text-[#D4AF37]" fill="currentColor" />
        </div>
        <h1 className="text-4xl font-bold bg-gradient-to-l from-[#D4AF37] to-amber-600 bg-clip-text text-transparent mb-2">
          Wedding HQ
        </h1>
        <p className="text-gray-600">מטה החתונה שלכם - טוען...</p>
      </div>
    </div>
  );
}