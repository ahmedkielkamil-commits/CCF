import { useEffect, useState } from 'react';

const STORAGE_KEY = 'ccof_staff_name';

export function useStaffName() {
  const [staffName, setStaffName] = useState('Sarah');

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) setStaffName(stored);
  }, []);

  function updateStaffName(value: string) {
    setStaffName(value);
    localStorage.setItem(STORAGE_KEY, value);
  }

  return { staffName, updateStaffName };
}
