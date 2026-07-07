import React, { useEffect, useState } from 'react';
import { wedflow } from '@/api/wedflowClient';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { Heart } from 'lucide-react';

export default function Home() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const isAuthenticated = await wedflow.auth.isAuthenticated();
      if (isAuthenticated) {
        navigate(createPageUrl('Dashboard'));
      } else {
        wedflow.auth.redirectToLogin(createPageUrl('Dashboard'));
      }
    };
    checkAuth();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-champagne via-card to-rose-light/20 flex items-center justify-center" dir="rtl">
      <div className="text-center">
        <div className="bg-gradient-to-br from-champagne to-rose-light p-6 rounded-full inline-block mb-4 animate-pulse">
          <Heart className="w-16 h-16 text-rose-deep" fill="currentColor" />
        </div>
        <h1 className="text-4xl font-bold bg-gradient-to-l from-rose-deep to-rose bg-clip-text text-transparent mb-2">
          WedFlow
        </h1>
        <p className="text-muted-foreground">מטה החתונה שלכם - טוען...</p>
      </div>
    </div>
  );
}