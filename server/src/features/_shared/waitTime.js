const { AVG_VISIT_MINUTES } = require('../../constants');
const { recentRoomedTimestamps } = require('./waitTime-mysql');
const redis = require('./waitTime-redis');

const DEFAULT_INTERVAL = AVG_VISIT_MINUTES;
const MIN_INTERVAL = 10;
const MAX_INTERVAL = 30;
const MIN_ROOMING_EVENTS = 2;
const SAMPLE_MAX = 5;
const SAMPLE_FALLBACK = 3;
function clampInterval(mins) {
  return Math.min(MAX_INTERVAL, Math.max(MIN_INTERVAL, mins));
}

function averageRoomingInterval(timestamps) {
  if (timestamps.length < MIN_ROOMING_EVENTS) return null;
  const gaps = [];
  for (let i = 1; i < timestamps.length; i++) {
    gaps.push((timestamps[i] - timestamps[i - 1]) / 60000);
  }
  return gaps.reduce((a, b) => a + b, 0) / gaps.length;
}

async function getTime() {
  const override = await redis.getOverride();
  if (override?.minutes) {
    return {
      minutes: Number(override.minutes),
      source: 'override',
      override,
    };
  }

  let timestamps = [];
  try {
    timestamps = await recentRoomedTimestamps(SAMPLE_MAX);
  } catch (_err) {
    return { minutes: DEFAULT_INTERVAL, source: 'default', roomedEventsToday: 0 };
  }
  let sample = timestamps;
  if (timestamps.length >= SAMPLE_MAX) {
    sample = timestamps.slice(-SAMPLE_MAX);
  } else if (timestamps.length >= SAMPLE_FALLBACK) {
    sample = timestamps.slice(-SAMPLE_FALLBACK);
  }

  const avg = averageRoomingInterval(sample);
  if (avg == null) {
    return { minutes: DEFAULT_INTERVAL, source: 'default', roomedEventsToday: timestamps.length };
  }

  return {
    minutes: clampInterval(Math.round(avg)),
    source: 'dynamic',
    roomedEventsToday: timestamps.length,
    sampleSize: sample.length,
  };
}

async function setTime(minutes, staffName) {
  const n = Number(minutes);
  if (!n || n < MIN_INTERVAL) {
    const e = new Error(`minutes must be at least ${MIN_INTERVAL}`);
    e.status = 400;
    throw e;
  }
  const override = await redis.setOverride(n, staffName);
  return { minutes: override.minutes, source: 'override', override };
}

async function clearTime() {
  await redis.clearOverride();
  return getTime();
}

function formatWaitRange(calculatedMinutes) {
  if (calculatedMinutes <= 0) return "You're next";
  let low = Math.round(calculatedMinutes / 5) * 5;
  if (low < calculatedMinutes - 3) low += 5;
  if (calculatedMinutes > 45) {
    low = Math.max(15, Math.floor((calculatedMinutes - 7) / 5) * 5);
  }
  low = Math.max(15, low);
  let high = Math.min(60, low + 15);
  if (high < low) {
    low = Math.max(15, high - 15);
  }
  return `${low} min - ${high} min`;
}

function remainingWaitMinutes(position, intervalMinutes, checkedInAt) {
  const ahead = Math.max(0, Number(position) - 1);
  const baselineMinutes = ahead * intervalMinutes;
  if (!checkedInAt) return baselineMinutes;

  const checkedInMs = new Date(checkedInAt).getTime();
  if (Number.isNaN(checkedInMs)) return baselineMinutes;

  const elapsedMinutes = (Date.now() - checkedInMs) / 60000;
  return Math.max(0, baselineMinutes - elapsedMinutes);
}

function getEstimatedWait(position, intervalMinutes, checkedInAt) {
  return formatWaitRange(remainingWaitMinutes(position, intervalMinutes, checkedInAt));
}

async function getEstimatedWaitForPosition(position) {
  const { minutes } = await getTime();
  return getEstimatedWait(position, minutes);
}

module.exports = {
  getTime,
  setTime,
  clearTime,
  getEstimatedWait,
  getEstimatedWaitForPosition,
  formatWaitRange,
};
