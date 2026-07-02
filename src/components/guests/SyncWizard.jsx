import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Circle, ChevronLeft, Download, Upload, RefreshCw, ArrowLeft } from 'lucide-react';

const STEPS = [
  {
    id: 1,
    title: 'ייצוא מ-WiWi',
    description: 'הורד את קובץ האורחים העדכני מ-WiWi',
    icon: '📥',
    action: 'export_wiwi',
    instructions: [
      'היכנס למערכת WiWi',
      'לחץ על "ייצוא" / "Export"',
      'שמור את קובץ ה-Excel',
    ],
    buttonLabel: null, // manual step
  },
  {
    id: 2,
    title: 'עדכון סטטוסים מ-WiWi',
    description: 'ייבא את הקובץ כדי לעדכן סטטוסי אישורים',
    icon: '🔄',
    action: 'import_wiwi',
    instructions: [
      'לחץ על "עדכן מ-WiWi" למטה',
      'בחר את קובץ ה-Excel שהורדת',
      'אשר את השינויים בחלון שייפתח',
    ],
    buttonLabel: 'עדכן מ-WiWi',
  },
  {
    id: 3,
    title: 'ייצוא ל-iPlan',
    description: 'ייצא את המוזמנים המאושרים למערכת iPlan',
    icon: '📤',
    action: 'export_iplan',
    instructions: [
      'לחץ על "ייצוא ל-iPlan" למטה',
      'קובץ Excel יורד אוטומטית',
      'העלה אותו למערכת iPlan',
    ],
    buttonLabel: 'ייצוא ל-iPlan',
  },
  {
    id: 4,
    title: 'ייבוא סידור ישיבה מ-iPlan',
    description: 'ייבא בחזרה את שיבוצי השולחנות מ-iPlan',
    icon: '🪑',
    action: 'import_iplan',
    instructions: [
      'ב-iPlan — ייצא את קובץ השיבוץ',
      'לחץ על "ייבוא מ-iPlan" למטה',
      'בחר את הקובץ שייצאת',
    ],
    buttonLabel: 'ייבוא מ-iPlan',
  },
];

export default function SyncWizard({ open, onClose, onWiwiImport, onIplanExport, onIplanImport }) {
  const [currentStep, setCurrentStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState(new Set());

  const markComplete = (stepId) => {
    setCompletedSteps(prev => new Set([...prev, stepId]));
    if (stepId < STEPS.length) setCurrentStep(stepId + 1);
  };

  const handleAction = (step) => {
    if (step.action === 'import_wiwi') {
      onWiwiImport();
      markComplete(step.id);
    } else if (step.action === 'export_iplan') {
      onIplanExport();
      markComplete(step.id);
    } else if (step.action === 'import_iplan') {
      onIplanImport();
      markComplete(step.id);
    }
  };

  const handleReset = () => {
    setCurrentStep(1);
    setCompletedSteps(new Set());
  };

  const allDone = completedSteps.size === STEPS.length;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); handleReset(); } }}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl">🔁 אשף סינכרון מוזמנים</DialogTitle>
          <p className="text-sm text-gray-500">בצע את השלבים לפי הסדר לסנכרון מלא</p>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {STEPS.map((step) => {
            const isCompleted = completedSteps.has(step.id);
            const isCurrent = currentStep === step.id && !allDone;
            const isLocked = step.id > currentStep && !isCompleted;

            return (
              <div
                key={step.id}
                className={`rounded-xl border p-4 transition-all ${
                  isCurrent
                    ? 'border-amber-400 bg-amber-50 shadow-sm'
                    : isCompleted
                    ? 'border-green-200 bg-green-50'
                    : 'border-gray-200 bg-gray-50 opacity-60'
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Step indicator */}
                  <div className="mt-0.5 shrink-0">
                    {isCompleted ? (
                      <CheckCircle2 className="w-6 h-6 text-green-500" />
                    ) : (
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold ${
                        isCurrent ? 'border-amber-500 text-amber-600' : 'border-gray-300 text-gray-400'
                      }`}>
                        {step.id}
                      </div>
                    )}
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">{step.icon}</span>
                      <span className={`font-semibold ${isCompleted ? 'text-green-700' : isCurrent ? 'text-amber-800' : 'text-gray-500'}`}>
                        {step.title}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mb-2">{step.description}</p>

                    {isCurrent && (
                      <div className="space-y-1 mb-3">
                        {step.instructions.map((inst, i) => (
                          <div key={i} className="flex items-start gap-2 text-sm text-gray-700">
                            <span className="text-amber-500 font-bold shrink-0">{i + 1}.</span>
                            <span>{inst}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {isCurrent && (
                      <div className="flex gap-2">
                        {step.buttonLabel ? (
                          <Button
                            size="sm"
                            onClick={() => handleAction(step)}
                            className="bg-amber-500 hover:bg-amber-600 text-white"
                          >
                            {step.action === 'import_wiwi' && <RefreshCw className="w-4 h-4 ml-1" />}
                            {step.action === 'export_iplan' && <Download className="w-4 h-4 ml-1" />}
                            {step.action === 'import_iplan' && <Upload className="w-4 h-4 ml-1" />}
                            {step.buttonLabel}
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => markComplete(step.id)}
                        >
                          {step.buttonLabel ? 'דלג' : 'סיימתי ✓'}
                        </Button>
                      </div>
                    )}

                    {isCompleted && (
                      <p className="text-sm text-green-600 font-medium">✓ הושלם</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {allDone && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
            <p className="text-green-700 font-bold text-lg">🎉 הסינכרון הושלם בהצלחה!</p>
            <p className="text-green-600 text-sm mt-1">כל השלבים בוצעו</p>
          </div>
        )}

        <div className="flex justify-between pt-2">
          <Button variant="outline" onClick={() => { onClose(); handleReset(); }}>סגור</Button>
          {allDone && (
            <Button variant="ghost" onClick={handleReset} className="text-gray-500">
              התחל מחדש
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}