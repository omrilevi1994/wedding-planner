import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from './utils';
import { LogOut, ChevronDown } from 'lucide-react';
import { wedflow } from '@/api/wedflowClient';
import { useWedding } from '@/lib/WeddingContext';
import WeddingSelector from '@/components/WeddingSelector';

function DropdownGroup({ label, items, isActive, currentPageName }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
          isActive
            ? 'bg-gradient-to-l from-amber-100 to-amber-50 text-[var(--gold-dark)] shadow-sm'
            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
        }`}
      >
        {label}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full mt-1 right-0 bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-[140px] z-50">
          {items.map(item => (
            <Link
              key={item.name}
              to={createPageUrl(item.name)}
              onClick={() => setOpen(false)}
              className={`block px-4 py-2.5 text-sm font-medium transition-all ${
                currentPageName === item.name
                  ? 'text-[var(--gold-dark)] bg-amber-50'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Layout({ children, currentPageName }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { user, isAdmin, activeWeddingId } = useWedding();
  const [isChecking, setIsChecking] = React.useState(!user);
  const navigate = useNavigate();

  React.useEffect(() => {
    if (user) setIsChecking(false);
  }, [user]);

  const isEventManager = user?.role === 'event_manager';

  // Greeting message - MUST BE DECLARED BEFORE ANY CONDITIONAL RETURNS
  const greetingMessage = React.useMemo(() => {
    if (!user?.wedding_sides || user.wedding_sides.length === 0) return null;
    if (user.wedding_sides.length > 1) return null;
    
    const side = user.wedding_sides[0];
    const greetings = {
      'כלה - אבא': 'ברוכים הבאים לאבא של הכלה',
      'כלה - אמא': 'ברוכים הבאים לאמא של הכלה',
      'חתן - אבא': 'ברוכים הבאים לאבא של החתן',
      'חתן - אמא': 'ברוכים הבאים לאמא של החתן'
    };
    
    return greetings[side] || null;
  }, [user]);

  React.useEffect(() => {
    if (!user) return;

    // Redirect event manager to WeddingMode automatically
    if (user.role === 'event_manager' && currentPageName !== 'WeddingMode') {
      navigate('/WeddingMode', { replace: true });
    }

    // Log login activity (once per session)
    const sessionKey = `logged_session_${user.email}`;
    if (!sessionStorage.getItem(sessionKey)) {
      sessionStorage.setItem(sessionKey, 'true');
      wedflow.entities.ActivityLog.create({
        wedding_id: activeWeddingId || user.wedding_id || null,
        user_email: user.email,
        user_name: user.full_name,
        action_type: 'התחברות',
        description: `${user.full_name} התחבר למערכת`
      }).catch((error) => {
        console.error('Failed to log login activity:', error);
      });
    }
  }, [user]);

  const allNavGroups = [
    { label: 'דשבורד', single: { name: 'Dashboard', label: 'דשבורד' } },
    {
      label: 'לוגיסטיקה',
      items: [
        { name: 'Expenses', label: 'הוצאות' },
        { name: 'Payments', label: 'תשלומים' },
        { name: 'Vendors', label: 'ספקים' },
      ]
    },
    { label: 'מוזמנים', single: { name: 'Guests', label: 'מוזמנים' } },
    {
      label: 'שונות',
      items: [
        { name: 'SeatingPlan', label: 'סידור ישיבה' },
        { name: 'Checklist', label: 'צ\'ק ליסט' },
        { name: 'Gifts', label: 'מתנות' },
        { name: 'Calculator', label: 'מחשבון אולם' },
      ]
    },
    {
      label: 'הגדרות',
      items: [
        { name: 'ActivityLog', label: 'לוג פעילות' },
        { name: 'Settings', label: 'הגדרות' },
        { name: 'UserManagement', label: 'ניהול משתמשים' },
      ]
    },
    { label: '💍 מוד חתונה', single: { name: 'WeddingMode', label: '💍 מוד חתונה' } },
  ];

  const isGuestOnly = !isEventManager && !isAdmin && user?.wedding_sides && user.wedding_sides.length > 0;
  const adminNav = { label: 'ניהול חתונות', single: { name: 'AdminDashboard', label: 'ניהול חתונות' } };
  const navGroups = isEventManager
    ? [{ label: '💍 מוד חתונה', single: { name: 'WeddingMode', label: '💍 מוד חתונה' } }]
    : isGuestOnly
    ? [{ label: 'מוזמנים', single: { name: 'Guests', label: 'מוזמנים' } }]
    : isAdmin
    ? [adminNav, ...allNavGroups]
    : allNavGroups;

  // For mobile flat list
  const allNavItems = isEventManager
    ? [{ name: 'WeddingMode', label: '💍 מוד חתונה' }]
    : isGuestOnly
    ? [{ name: 'Guests', label: 'מוזמנים' }]
    : isAdmin
    ? [
        { name: 'AdminDashboard', label: 'ניהול חתונות' },
        { name: 'Dashboard', label: 'דשבורד' },
        { name: 'Expenses', label: 'הוצאות' },
        { name: 'Payments', label: 'תשלומים' },
        { name: 'Vendors', label: 'ספקים' },
        { name: 'Guests', label: 'מוזמנים' },
        { name: 'SeatingPlan', label: 'סידור ישיבה' },
        { name: 'Checklist', label: 'צ\'ק ליסט' },
        { name: 'Gifts', label: 'מתנות' },
        { name: 'Calculator', label: 'מחשבון אולם' },
        { name: 'ActivityLog', label: 'לוג פעילות' },
        { name: 'Settings', label: 'הגדרות' },
        { name: 'UserManagement', label: 'ניהול משתמשים' },
        { name: 'WeddingMode', label: '💍 מוד חתונה' },
      ]
    : [
        { name: 'Dashboard', label: 'דשבורד' },
        { name: 'Expenses', label: 'הוצאות' },
        { name: 'Payments', label: 'תשלומים' },
        { name: 'Vendors', label: 'ספקים' },
        { name: 'Guests', label: 'מוזמנים' },
        { name: 'SeatingPlan', label: 'סידור ישיבה' },
        { name: 'Checklist', label: 'צ\'ק ליסט' },
        { name: 'Gifts', label: 'מתנות' },
        { name: 'Calculator', label: 'מחשבון אולם' },
        { name: 'ActivityLog', label: 'לוג פעילות' },
        { name: 'Settings', label: 'הגדרות' },
        { name: 'UserManagement', label: 'ניהול משתמשים' },
        { name: 'WeddingMode', label: '💍 מוד חתונה' },
      ];

  const handleLogout = async () => {
    // Log logout activity
    if (user) {
      try {
        await wedflow.entities.ActivityLog.create({
          wedding_id: activeWeddingId || user.wedding_id || null,
          user_email: user.email,
          user_name: user.full_name,
          action_type: 'התנתקות',
          description: `${user.full_name} התנתק מהמערכת`
        });
      } catch (error) {
        console.error('Failed to log logout activity:', error);
      }
    }
    await wedflow.auth.logout();
  };

  if (isChecking) {
    return (
      <div dir="rtl" className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-amber-50/30 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600 mx-auto mb-4"></div>
          <p className="text-gray-600">טוען...</p>
        </div>
      </div>
    );
  }

  // גישה נקבעת לפי חברות בחתונה (wedding_members) + RLS; אין עוד שלב "אישור מנהל"

  // בדוק אם למשתמש אין הרשאה לעמוד הנוכחי
  const hasAccessToPage = isAdmin || 
    isEventManager || 
    !user?.wedding_sides || 
    user.wedding_sides.length === 0 || 
    currentPageName === 'Guests';

  const shouldShowEmptyPage = !isEventManager && !isAdmin && user && 
    user.wedding_sides && user.wedding_sides.length > 0 && 
    currentPageName !== 'Guests';

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-amber-50/30">
      <style>{`
        :root {
          --gold: #D4AF37;
          --gold-light: #F4E4C1;
          --gold-dark: #B8962E;
        }
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }
      `}</style>
      
      {/* Header - hidden while checking permissions */}
      <header className={`bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50 ${isChecking ? 'hidden' : ''}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo + Wedding Selector grouped together */}
            <div className="flex items-center gap-3">
              <Link to={createPageUrl('Dashboard')} className="flex items-center group">
                {/* Placeholder WedFlow wordmark — swap public/logo.svg for the final asset */}
                <img
                  src="/logo.svg"
                  alt="WedFlow"
                  className="h-10 w-auto group-hover:opacity-90 transition-all"
                />
              </Link>
              <WeddingSelector />
            </div>

            {/* Desktop Nav */}
            <div className="hidden md:flex items-center gap-2">
              <nav className="flex items-center gap-1">
              {navGroups.map((group) => {
                if (group.single) {
                  const item = group.single;
                  return (
                    <Link
                      key={item.name}
                      to={createPageUrl(item.name)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        currentPageName === item.name
                          ? 'bg-gradient-to-l from-amber-100 to-amber-50 text-[var(--gold-dark)] shadow-sm'
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                }
                // Dropdown group
                const isActive = group.items.some(i => i.name === currentPageName);
                return (
                  <DropdownGroup
                    key={group.label}
                    label={group.label}
                    items={group.items}
                    isActive={isActive}
                    currentPageName={currentPageName}
                  />
                );
              })}
              <button
                onClick={handleLogout}
                className="mr-2 p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-all"
                title="התנתק"
              >
                <LogOut className="w-5 h-5" />
              </button>
              </nav>
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-2 rounded-lg hover:bg-gray-100"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>

          {/* Mobile Nav */}
          {isMobileMenuOpen && (
            <div className="md:hidden py-4 border-t">
              <div className="px-4 mb-3">
                <WeddingSelector />
              </div>
              {allNavItems.map((item) => (
                <Link
                  key={item.name}
                  to={createPageUrl(item.name)}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`block px-4 py-3 rounded-lg text-sm font-medium transition-all mb-1 ${
                    currentPageName === item.name
                      ? 'bg-gradient-to-l from-amber-100 to-amber-50 text-[var(--gold-dark)]'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
              <button
                onClick={handleLogout}
                className="w-full text-right px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 rounded-lg transition-all"
              >
                התנתק
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {!isChecking && (shouldShowEmptyPage ? (
              <div className="space-y-8">
                {/* Greeting */}
                {greetingMessage && (
                  <div className="bg-gradient-to-l from-amber-100 to-amber-50 border border-amber-200 rounded-xl p-6 text-center shadow-sm">
                    <h2 className="text-2xl font-bold text-amber-900">{greetingMessage}</h2>
                  </div>
                )}

                <div className="text-center py-16">
                  <div className="mb-4 text-gray-400">
                    <svg className="w-20 h-20 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <h2 className="text-2xl font-bold text-gray-700 mb-2">אין הרשאת גישה לעמוד זה</h2>
                  <p className="text-gray-500">יש לך גישה רק לעמוד המוזמנים</p>
                </div>
              </div>
            ) : (
              children
            ))}
          </main>

      {/* Footer */}
      <footer className="mt-16 border-t border-gray-200 bg-white/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 text-center">
          <p className="text-sm text-gray-500">
            Daniel&Omri Wedding © 2026 | מאחלים לכם חתונה מושלמת ❤️
          </p>
        </div>
      </footer>
    </div>
  );
}