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
  Guests: [
    {
      target: '[data-tour="guests-add"]',
      title: 'הוספת מוזמנים',
      content: 'לחצו כאן כדי להוסיף מוזמן חדש לרשימה.',
      disableBeacon: true,
    },
    {
      target: '[data-tour="guests-search"]',
      title: 'חיפוש וסינון',
      content: 'חפשו מוזמנים לפי שם או טלפון, וסננו לפי סטטוס, צד וקרבה.',
    },
    {
      target: '[data-tour="guests-table"]',
      title: 'רשימת המוזמנים',
      content: 'כאן מוצגים כל המוזמנים — אפשר לעדכן סטטוס הגעה, לערוך ולמחוק.',
    },
  ],
};
