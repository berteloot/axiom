import { useState, useEffect, Dispatch, SetStateAction } from 'react';

/**
 * Custom hook that persists state to localStorage
 * Prevents data loss when switching tabs or during page reloads
 */
export function usePersistentState<T>(
  key: string,
  initialValue: T,
  options?: {
    // Clear after successful submission
    clearOnUnmount?: boolean;
    // Timeout in ms to debounce localStorage writes
    debounceMs?: number;
  }
): [T, Dispatch<SetStateAction<T>>, () => void] {
  const storageKey = `persistent_${key}`;
  const { clearOnUnmount = false, debounceMs = 500 } = options || {};

  // Initialize state from localStorage or use initial value
  const [state, setState] = useState<T>(() => {
    if (typeof window === 'undefined') return initialValue;
    
    try {
      const item = window.localStorage.getItem(storageKey);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.warn(`Error loading persisted state for key "${key}":`, error);
      return initialValue;
    }
  });

  // Debounced save to localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const timeoutId = setTimeout(() => {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(state));
      } catch (error) {
        console.warn(`Error saving state to localStorage for key "${key}":`, error);
      }
    }, debounceMs);

    return () => clearTimeout(timeoutId);
  }, [state, storageKey, key, debounceMs]);

  // Clear function to manually remove persisted data
  const clearPersistedState = () => {
    if (typeof window === 'undefined') return;
    
    try {
      window.localStorage.removeItem(storageKey);
    } catch (error) {
      console.warn(`Error clearing persisted state for key "${key}":`, error);
    }
  };

  // Optionally clear on unmount
  useEffect(() => {
    return () => {
      if (clearOnUnmount) {
        clearPersistedState();
      }
    };
  }, [clearOnUnmount]);

  return [state, setState, clearPersistedState];
}
