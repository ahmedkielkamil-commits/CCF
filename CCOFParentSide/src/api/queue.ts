import type {
  CheckInChild,
  CheckInRequest,
  CheckInResponse,
  ClinicHoursResponse,
  ParentResumeResponse,
  QueuePayload,
  QueueStatus,
  WaitInterval,
} from '../types/queue';
import { request } from './client';

export function fetchQueue() {
  return request<QueuePayload>('/api/queue');
}

export function fetchWaitInterval() {
  return request<WaitInterval>('/api/clinic/wait-interval');
}

export function fetchClinicHours() {
  return request<ClinicHoursResponse>('/api/clinic/hours');
}

export function postCheckIn(body: CheckInRequest) {
  return request<CheckInResponse>('/api/check-in', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function addChildrenToRegistration(tokenOrCode: string, children: CheckInChild[]) {
  return request<CheckInResponse>(`/api/parent/add-children/${encodeURIComponent(tokenOrCode)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ children }),
  });
}

export function patchQueueStatus(entryId: number, status: QueueStatus, staffName: string) {
  return request<{ entryid: number; status: QueueStatus; queue?: QueuePayload }>(`/api/queue/${entryId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, staff_name: staffName }),
  });
}

export function fetchParentResume(resumeToken: string) {
  return request<ParentResumeResponse>(`/api/parent/resume/${encodeURIComponent(resumeToken)}`);
}

export function cancelParentCheckIn(tokenOrCode: string) {
  return request<{ registrationid: number; cancelledCount: number; queue?: QueuePayload }>(
    `/api/parent/cancel/${encodeURIComponent(tokenOrCode)}`,
    {
      method: 'POST',
    }
  );
}
