export type QueueStatus = 'waiting' | 'arrived' | 'roomed' | 'completed' | 'no_show';

export interface QueueEntry {
  entryid: number;
  registrationid: number;
  parent_fname: string;
  parent_lname: string;
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
  updatedBy?: string;
}

export interface QueuePayload {
  entries: QueueEntry[];
  inRoom?: QueueEntry[];
  roomingInterval: WaitInterval;
  updatedAt: string;
}

export interface CheckInChild {
  fname: string;
  lname: string;
  symptoms: string;
}

export interface CheckInRequest {
  parent_fname: string;
  parent_lname: string;
  phone: string;
  additional_notes: string | null;
  sms_opt_in: boolean;
  children: CheckInChild[];
}

export interface CheckInEntryResult {
  entryid: number;
  position: number;
  status: QueueStatus;
}

export interface CheckInResponse {
  registrationid: number;
  resumeToken: string | null;
  resumeCode: string | null;
  entries: CheckInEntryResult[];
  queue?: QueuePayload;
}

export interface ParentResumeEntry {
  entryid: number;
  fname: string;
  lname: string;
  symptoms: string;
  position: number;
  status: QueueStatus;
  estimatedWait: string;
}

export interface ParentResumeResponse {
  registrationid: number;
  resumeToken: string;
  resumeCode: string;
  entries: ParentResumeEntry[];
}

export interface ClinicHoursResponse {
  hours: string;
  source: 'default' | 'override';
}
