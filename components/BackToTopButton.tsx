'use client';

import { useEffect, useState } from 'react';

export default function BackToTopButton() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 300);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  if (!visible) return null;
  return (
    <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Back to top" title="Back to top"
      className="no-print fade-in fixed bottom-6 left-6 z-40 rounded-full bg-gradient-to-br from-sky-500 to-indigo-500 text-white shadow-lg hover:shadow-xl hover:from-sky-600 hover:to-indigo-600 flex items-center gap-2 pl-4 pr-5 py-3 transition-all">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M12 19V5" /><path d="M5 12l7-7 7 7" />
      </svg>
      <span className="text-sm font-semibold">Top</span>
    </button>
  );
}
