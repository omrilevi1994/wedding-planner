import { wedflow } from '@/api/wedflowClient';

// Default checklist template, sourced from the דניאל ועומרי reference wedding.
// The "day of the wedding - event manager" group is intentionally excluded per product decision.
export const DEFAULT_CHECKLIST_GROUPS = [
  { order: 1, title: 'מתחילים', items: [
    'הכנת רשימת מוזמנים',
    'בחירת מועד ואזור מועדפים לחתונה',
    'קביעת תקציב לחתונה',
  ]},
  { order: 2, title: 'בחירת ספקים – שלב א׳', items: [
    'בחירת אולם ושריון תאריך',
    'בחירת קייטרינג',
    'בחירת צלם',
    'בחירת דיג׳יי',
    'בחירת שמלת כלה',
    'דגשים לסגירת חוזה באולם',
  ]},
  { order: 3, title: 'בחירת ספקים – שלב ב׳', items: [
    'עיצוב שיער לכלה ולמלוות',
    'איפור לכלה ולמלוות',
    'צלם מגנטים',
    'בחירת אטרקציות לחתונה',
    'בר אלכוהול',
  ]},
  { order: 4, title: 'בחירת ספקים – שלב ג׳', items: [
    'בחירת רב מחתן',
    'עיצוב הזמנות והדפסה',
    'רכישת חליפת חתן ותוספות',
    'תיאום עם חברת הסעות',
    'מזכרות לאורחים',
  ]},
  { order: 5, title: '3 חודשים לחתונה', items: [
    'הוצאת תעודת רווקות',
    'פתיחת תיק ברבנות ותיאום הדרכת כלה',
    'רכישת טבעות ותכשיטים לכלה',
    'רכישת נעליים ואביזרים משלימים לכלה',
  ]},
  { order: 6, title: 'חודשיים לחתונה', items: [
    'תיאום מסיבת רווקות',
    'שריון חדר במלון לליל הכלולות',
    'הדרכת כלה ותיאום מקווה',
    'רכישת אביזרים לרחבה',
    'רכישת טלית',
    'תיאום מפגש טעימות',
    'לתאם מפגש מוסיקה עם הדיג׳יי',
    'בחירת מלווים ליום החתונה',
    'השכרת רכב לחתונה',
  ]},
  { order: 7, title: 'חודש לחתונה', items: [
    'חלוקת הזמנות',
    'מסיבת רווקים ורווקות',
    'הזמנת זר כלה',
    'מפגש טעימות',
    'פגישת מוסיקה עם תקליטן',
    'צילומי זוגיות / טראש',
    'פגישה עם מעצב/ת האולם',
  ]},
  { order: 8, title: 'שבועיים לחתונה', items: [
    'בחירת לוקיישן לצילומי החתונה',
    'אישורי הגעה',
    'סידורי הושבה',
    'תיאום צפיות מול מנהל האירוע',
    'לאסוף את הכתובה מהרבנות',
    'לדבר עם הרב',
    'לדבר עם הבר',
    'לבדוק על מקבעים לגזיבו לשבת חתן',
    'לקנות כבל מאריך לשבת חתן',
    'להעביר צ׳ק לעיצוב ולבר',
  ]},
  { order: 9, title: 'שבוע לחתונה', items: [
    'שיחת תיאום אחרונה עם הספקים (לשאול כל ספק איך ומתי משלמים)',
    'צ׳ק ליסט ליום החתונה',
    'טבילה במקווה',
    'חינה',
  ]},
  { order: 10, title: 'יום לפני החתונה', items: [
    'מתנות לאורחים',
    'אביזרים לרחבה',
    'אביזרי עיצוב',
    'אלכוהול ותוספות לבר',
    'מפת סידורי הושבה',
  ]},
  { order: 11, title: 'יום החתונה', items: [
    'רשימות חתן כלה',
  ]},
];

export async function seedDefaultChecklist(weddingId) {
  for (const group of DEFAULT_CHECKLIST_GROUPS) {
    const createdGroup = await wedflow.entities.ChecklistGroup.create({
      wedding_id: weddingId,
      title: group.title,
      order: group.order,
    });
    if (group.items.length) {
      await wedflow.entities.ChecklistItem.bulkCreate(
        group.items.map((title, idx) => ({
          wedding_id: weddingId,
          title,
          group: createdGroup.id,
          order: idx + 1,
        }))
      );
    }
  }
}
