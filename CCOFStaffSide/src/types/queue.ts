export type QueueStatus = 'waiting' | 'arrived' | 'roomed' | 'completed' | 'no_show';

export interface QueueEntry {
  entryid: number;
  registrationid: number;
  parent_fname: string;
  parent_lname: string;
  checked_in_at: string;
  fname: string;
  lname: string;
  symptoms: string;
  position: number;
  status: QueueStatus;
  estimatedWait: string;
}

export interface WaitInterval {
  minutes: number;
  source?: string;
}

export interface QueuePayload {
  entries: QueueEntry[];
  roomingInterval: WaitInterval;
  updatedAt: string;
}

export interface MonitorEntry {
  entryid: number;
  ticket: string;
  position: number;
  status: QueueStatus;
  estimatedWait: string;
}

export interface MonitorPayload {
  entries: MonitorEntry[];
  roomingInterval: WaitInterval;
  updatedAt: string;
}

export interface CheckInChild {
  fname: string;
  lname: string;
  symptoms: string;
}
