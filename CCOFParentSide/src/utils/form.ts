export function splitParentName(fullName: string) {
  const trimmed = fullName.trim().replace(/\s+/g, ' ');
  if (!trimmed) {
    return { parent_fname: '', parent_lname: '' };
  }
  const [first, ...rest] = trimmed.split(' ');
  return {
    parent_fname: first ?? '',
    parent_lname: rest.join(' '),
  };
}

export function normalizeUsPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }
  if (value.startsWith('+')) {
    return value;
  }
  return `+1${digits}`;
}

export function toWaitCopy(estimatedWait?: string, minutes = 15) {
  if (estimatedWait) return estimatedWait;
  return `${minutes} min - ${minutes + 10} min`;
}

function formatWaitRange(calculatedMinutes: number) {
  if (calculatedMinutes <= 0) return "You're next";

  let low = Math.round(calculatedMinutes / 5) * 5;
  if (low < calculatedMinutes - 3) low += 5;

  if (calculatedMinutes > 45) {
    low = Math.max(15, Math.floor((calculatedMinutes - 7) / 5) * 5);
  }

  low = Math.max(15, low);
  const high = Math.min(60, low + 15);
  return `${low} min - ${high} min`;
}

export function getEstimatedWaitIfJoinNow(queueLength: number, intervalMinutes: number) {
  const ahead = Math.max(0, Number(queueLength));
  return formatWaitRange(ahead * intervalMinutes);
}
