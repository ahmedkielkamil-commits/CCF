import type { CheckInChild, MonitorPayload, QueuePayload, QueueStatus, WaitInterval } from '../types/queue';
import { request } from './client';

interface CheckInBody {
  parent_fname: string;
  parent_lname: string;
  phone: string;
  additional_notes: string | null;
  sms_opt_in: boolean;
  children: CheckInChild[];
}

export function fetchQueue() {
  return request<QueuePayload>('/api/queue');
}

export function fetchMonitorQueue() {
  return request<MonitorPayload>('/api/monitor/queue');
}

export function fetchWaitInterval() {
  return request<WaitInterval>('/api/clinic/wait-interval');
}

export interface SyncRow {
  entryid: number;
  position: number;
  fname: string;
  lname: string;
  status: string;
  checked_in_at?: string;
}

export interface SyncReport {
  checkedAt: string;
  live: {
    inSync: boolean;
    mismatchCount: number;
    mismatches: Array<{ entryid: number; issue: string }>;
  };
  mysql: { live: SyncRow[]; liveCount: number };
  redis: { live: SyncRow[]; liveCount: number };
}

export function fetchSyncReport() {
  return request<SyncReport>('/api/sync');
}

export interface UsageReport {
  checkedAt: string;
  days: number;
  summary: {
    totalFamilies: number;
    totalChildren: number;
    todayFamilies: number;
    todayChildren: number;
    medianJoinToRoomMinutes: number | null;
    joinToRoomSampleSize: number;
    noShowRate: number;
    noShowTotal: number;
    noShowStaff: number;
    noShowParentCancel: number;
  };
  peakHours: Array<{ hour: number; label: string; families: number }>;
  dailyUsage: Array<{ date: string; families: number; children: number }>;
  funnel: {
    joined: number;
    reachedClinic: number;
    roomed: number;
    completed: number;
  };
}

export function fetchUsageReport(days = 14) {
  return request<UsageReport>(`/api/reports/usage?days=${days}`);
}

export function fetchHealth() {
  return request<{ ok: boolean }>('/health');
}

export function patchQueueStatus(entryId: number, status: QueueStatus, staffName: string) {
  return request<{ entryid: number; status: QueueStatus; queue?: QueuePayload }>(`/api/queue/${entryId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, staff_name: staffName }),
  });
}

export function postCheckIn(body: CheckInBody) {
  return request('/api/check-in', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
