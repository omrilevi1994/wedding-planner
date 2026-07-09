// Onboarding tour steps, keyed by page name (matches pages.config.js keys and
// Layout's currentPageName). Each step targets an element tagged data-tour="...".
// All copy is Hebrew (RTL). Guests/Checklist tours are added in later tasks.
export const TOURS = {
  Dashboard: [
    {
      target: '[data-tour="main-nav"]',
      title: 'ברוכים הבאים ל-WedFlow',
      content: 'מכאן תנווטו בין כל חלקי מתכנן החתונה — מוזמנים, צ׳ק ליסט, הוצאות ותשלומים.',
      disableBeacon: true,
    },
    {
      target: '[data-tour="dashboard-kpis"]',
      title: 'תמונת מצב',
      content: 'הכרטיסים כאן מסכמים את התקציב, ההוצאות והמוזמנים שלכם במבט אחד.',
    },
    {
      target: '[data-tour="dashboard-quick-actions"]',
      title: 'פעולות מהירות',
      content: 'קיצורי דרך להוספת הוצאה, מוזמן או תשלום — ישירות מהדשבורד.',
    },
  ],
};
