'use client';

import { useRef } from 'react';

// Select the entire value on the first click into a field (so typing replaces it outright);
// a second click while already focused behaves normally and just places the cursor. Without
// the onMouseUp guard, the browser's native mouseup handler collapses the selection focus()
// just made, which is why a plain `onFocus={(e) => e.target.select()}` alone doesn't hold up.
export function useSelectAllOnFocus<T extends HTMLInputElement | HTMLTextAreaElement = HTMLInputElement>() {
  const justFocused = useRef(false);

  function onFocus(e: React.FocusEvent<T>) {
    justFocused.current = true;
    e.target.select();
  }

  function onMouseUp(e: React.MouseEvent<T>) {
    if (justFocused.current) {
      e.preventDefault();
      justFocused.current = false;
    }
  }

  return { onFocus, onMouseUp };
}
