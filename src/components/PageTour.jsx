import React, { useEffect, useRef, useState } from 'react';
import Joyride, { STATUS } from 'react-joyride';
import { useWedding } from '@/lib/WeddingContext';
import { wedflow } from '@/api/wedflowClient';
import { TOURS } from '@/lib/tours/tourSteps';
import { nextToursSeen } from '@/lib/tours/toursSeen';

const LOCALE = {
  back: 'הקודם',
  next: 'הבא',
  // showProgress uses nextLabelWithProgress; without it Joyride falls back to
  // the English default ("Next (Step 2 of 3)"), which breaks the Hebrew tour.
  nextLabelWithProgress: 'הבא ({step} מתוך {steps})',
  skip: 'דלג',
  last: 'סיום',
  close: 'סגור',
};

export default function PageTour({ pageKey }) {
  const { user, refreshProfile } = useWedding();
  const steps = TOURS[pageKey] || [];
  const alreadySeen = !!user?.tours_seen?.[pageKey];
  const [run, setRun] = useState(false);
  const savedRef = useRef(false);

  useEffect(() => {
    setRun(false);
    savedRef.current = false;
    if (!user || alreadySeen || steps.length === 0) return;
    // Delay so the page DOM (and data-tour targets) has painted.
    const t = setTimeout(() => setRun(true), 500);
    return () => clearTimeout(t);
  }, [pageKey, user?.id, alreadySeen, steps.length]);

  if (!user || steps.length === 0 || alreadySeen) return null;

  const handleCallback = async (data) => {
    const { status } = data;
    if (status !== STATUS.FINISHED && status !== STATUS.SKIPPED) return;
    setRun(false);
    if (savedRef.current) return;
    savedRef.current = true;
    try {
      await wedflow.entities.User.update(user.id, {
        tours_seen: nextToursSeen(user.tours_seen, pageKey),
      });
      await refreshProfile();
    } catch (e) {
      console.error('Failed to persist tour completion', e);
    }
  };

  return (
    <Joyride
      steps={steps}
      run={run}
      continuous
      showSkipButton
      showProgress
      disableScrolling={false}
      locale={LOCALE}
      styles={{ options: { primaryColor: '#db2777', zIndex: 10000, textAlign: 'right' } }}
      callback={handleCallback}
    />
  );
}
