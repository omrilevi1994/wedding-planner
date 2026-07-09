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

const FONT = "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";

// Styled to the WedFlow design system via CSS variables (hsl(var(--token))),
// so the tour tooltip matches the app in both light and dark themes.
const STYLES = {
  options: {
    primaryColor: 'hsl(var(--primary))',
    backgroundColor: 'hsl(var(--card))',
    arrowColor: 'hsl(var(--card))',
    textColor: 'hsl(var(--card-foreground))',
    overlayColor: 'hsla(24, 9%, 15%, 0.55)',
    zIndex: 10000,
    width: 380,
  },
  tooltip: {
    borderRadius: 16,
    padding: 22,
    textAlign: 'right',
    fontFamily: FONT,
    border: '1px solid hsl(var(--border))',
    boxShadow: '0 24px 60px -20px hsla(24, 9%, 15%, 0.45)',
  },
  tooltipTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: 'hsl(var(--foreground))',
    margin: '0 0 6px',
    textAlign: 'right',
  },
  tooltipContent: {
    fontSize: 14,
    lineHeight: 1.65,
    color: 'hsl(var(--muted-foreground))',
    padding: '4px 0 0',
    textAlign: 'right',
  },
  buttonNext: {
    backgroundColor: 'hsl(var(--primary))',
    color: 'hsl(var(--primary-foreground))',
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 600,
    fontFamily: FONT,
    padding: '10px 20px',
    outline: 'none',
    boxShadow: 'none',
  },
  buttonBack: {
    color: 'hsl(var(--muted-foreground))',
    fontSize: 14,
    fontWeight: 500,
    fontFamily: FONT,
    marginLeft: 4,
  },
  buttonSkip: {
    color: 'hsl(var(--muted-foreground))',
    fontSize: 14,
    fontFamily: FONT,
  },
  buttonClose: {
    color: 'hsl(var(--muted-foreground))',
    width: 10,
    height: 10,
    padding: 14,
  },
  spotlight: {
    borderRadius: 12,
  },
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
      // The app header is sticky (h-16, z-50); offset the scroll so the
      // spotlighted element clears it instead of being cut off at the top.
      scrollOffset={96}
      spotlightPadding={8}
      locale={LOCALE}
      styles={STYLES}
      callback={handleCallback}
    />
  );
}
