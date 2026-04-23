import type { Identifier, RaRecord } from "ra-core";
import type { ComponentType } from "react";

import type {
  COMPANY_CREATED,
  CONTACT_CREATED,
  CONTACT_NOTE_CREATED,
  DEAL_CREATED,
  DEAL_NOTE_CREATED,
} from "./consts";

export type SignUpData = {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
};

export type SalesFormData = {
  avatar?: string;
  email: string;
  password?: string;
  first_name: string;
  last_name: string;
  administrator: boolean;
  disabled: boolean;
};

export type Sale = {
  first_name: string;
  last_name: string;
  administrator: boolean;
  avatar?: RAFile;
  disabled?: boolean;
  user_id: string;

  /**
   * This is a copy of the user's email, to make it easier to handle by react admin
   * DO NOT UPDATE this field directly, it should be updated by the backend
   */
  email: string;

  /**
   * This is used by the fake rest provider to store the password
   * DO NOT USE this field in your code besides the fake rest provider
   * @deprecated
   */
  password?: string;
} & Pick<RaRecord, "id">;

export type LeadSource =
  | "outbound"
  | "referral"
  | "partner"
  | "manual"
  | "email_campaign"
  | "seo"
  | "other"
  | "unknown";

export type Company = {
  name: string;
  logo: RAFile;
  sector: string;
  size: 1 | 10 | 50 | 250 | 500;
  linkedin_url: string;
  website: string;
  phone_number: string;
  address: string;
  zipcode: string;
  city: string;
  state_abbr: string;
  sales_id?: Identifier;
  created_at: string;
  description: string;
  revenue: string;
  tax_identifier: string;
  country: string;
  context_links?: string[];
  nb_contacts?: number;
  nb_deals?: number;
  lead_source: LeadSource;
  stripe_customer_id?: string | null;
} & Pick<RaRecord, "id">;

export type EmailAndType = {
  email: string;
  type: "Work" | "Home" | "Other";
};

export type PhoneNumberAndType = {
  number: string;
  type: "Work" | "Home" | "Other";
};

export type Contact = {
  first_name: string;
  last_name: string;
  title: string;
  company_id?: Identifier | null;
  email_jsonb: EmailAndType[];
  avatar?: Partial<RAFile>;
  linkedin_url?: string | null;
  first_seen: string;
  last_seen: string;
  has_newsletter: boolean;
  tags: number[];
  gender: string;
  sales_id?: Identifier;
  status: string;
  background: string;
  phone_jsonb: PhoneNumberAndType[];
  nb_tasks?: number;
  nb_unread_emails?: number;
  company_name?: string;
  lead_source: LeadSource;
} & Pick<RaRecord, "id">;

export type ContactNote = {
  contact_id: Identifier;
  text: string;
  date: string;
  sales_id: Identifier;
  status: string;
  attachments?: AttachmentNote[];
} & Pick<RaRecord, "id">;

export type Deal = {
  name: string;
  company_id: Identifier;
  contact_ids: Identifier[];
  category: string;
  stage: string;
  description: string;
  amount: number;
  created_at: string;
  updated_at: string;
  archived_at?: string;
  expected_closing_date: string;
  sales_id: Identifier;
  index: number;
  lead_source: LeadSource;
} & Pick<RaRecord, "id">;

export type DealNote = {
  deal_id: Identifier;
  text: string;
  date: string;
  sales_id: Identifier;
  attachments?: AttachmentNote[];

  // This is defined for compatibility with `ContactNote`
  status?: undefined;
} & Pick<RaRecord, "id">;

export type Tag = {
  id: number;
  name: string;
  color: string;
};

export type Task = {
  contact_id: Identifier;
  type: string;
  text: string;
  due_date: string;
  done_date?: string | null;
  sales_id?: Identifier;
} & Pick<RaRecord, "id">;

export type ActivityCompanyCreated = {
  type: typeof COMPANY_CREATED;
  company_id: Identifier;
  company: Company;
  sales_id: Identifier;
  date: string;
} & Pick<RaRecord, "id">;

export type ActivityContactCreated = {
  type: typeof CONTACT_CREATED;
  company_id: Identifier;
  sales_id?: Identifier;
  contact: Contact;
  date: string;
} & Pick<RaRecord, "id">;

export type ActivityContactNoteCreated = {
  type: typeof CONTACT_NOTE_CREATED;
  sales_id?: Identifier;
  contactNote: ContactNote;
  date: string;
} & Pick<RaRecord, "id">;

export type ActivityDealCreated = {
  type: typeof DEAL_CREATED;
  company_id: Identifier;
  sales_id?: Identifier;
  deal: Deal;
  date: string;
};

export type ActivityDealNoteCreated = {
  type: typeof DEAL_NOTE_CREATED;
  sales_id?: Identifier;
  dealNote: DealNote;
  date: string;
};

export type Activity = RaRecord &
  (
    | ActivityCompanyCreated
    | ActivityContactCreated
    | ActivityContactNoteCreated
    | ActivityDealCreated
    | ActivityDealNoteCreated
  );

export type AppointmentSource = "phone_call" | "email_campaign" | "manual";
export type AppointmentStatus = "scheduled" | "completed" | "cancelled";

export type Appointment = {
  contact_id: Identifier | null;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string;
  location: string | null;
  source: AppointmentSource;
  status: AppointmentStatus;
  sales_id: Identifier;
  created_at: string;
} & Pick<RaRecord, "id">;

export type EmailAccount = {
  email: string;
  imap_host: string;
  imap_port: number;
  smtp_host?: string | null;
  smtp_port: number;
  sales_id?: Identifier | null;
  is_active: boolean;
  skip_tls_verify: boolean;
  created_at: string;
} & Pick<RaRecord, "id">;

export type EmailMessage = {
  message_id: string;
  email_account_id: Identifier;
  folder: string;
  from_email: string;
  from_name: string | null;
  to_emails: { email: string; name: string | null }[] | null;
  cc_emails: { email: string; name: string | null }[] | null;
  subject: string | null;
  text_body: string | null;
  html_body: string | null;
  date: string;
  is_read: boolean;
  contact_id: Identifier | null;
  sales_id: Identifier | null;
  uid: number | null;
  created_at: string;
} & Pick<RaRecord, "id">;

export type UnreadEmail = {
  from_email: string;
  from_name: string | null;
  subject: string | null;
  date: string;
  contact_id: Identifier | null;
  sales_id: Identifier | null;
  email_account_id: Identifier;
  account_email: string;
  contact_first_name: string | null;
  contact_last_name: string | null;
} & Pick<RaRecord, "id">;

export type ContactRecording = {
  contact_id: Identifier;
  storage_path: string;
  duration_seconds: number;
  transcription: string | null;
  transcription_status: "pending" | "processing" | "completed" | "error";
  summary: string | null;
  email_advice: string | null;
  sms_advice: string | null;
  created_at: string;
  sales_id: Identifier;
} & Pick<RaRecord, "id">;

export interface RAFile {
  src: string;
  title: string;
  path?: string;
  rawFile: File;
  type?: string;
}

export type AttachmentNote = RAFile;

export interface LabeledValue {
  value: string;
  label: string;
}

export type DealStage = LabeledValue;

export type DevTaskStatus = LabeledValue;

export interface DevTaskPriority extends LabeledValue {
  icon: string;
  colorClass: string;
}

export type DevTask = {
  title: string;
  description: string | null;
  status: string;
  priority: string;
  index: number;
  assignee_id: Identifier | null;
  due_date: string | null;
  label_ids: Identifier[];
  contact_id: Identifier | null;
  company_id: Identifier | null;
  deal_id: Identifier | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
} & Pick<RaRecord, "id">;

export type DevTaskLabel = {
  name: string;
  color: string;
  created_at: string;
} & Pick<RaRecord, "id">;

export interface NoteStatus extends LabeledValue {
  color: string;
}

export interface ContactGender {
  value: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

export type Payment = {
  stripe_event_id: string;
  stripe_object_id: string;
  stripe_customer_id: string | null;
  company_id: Identifier | null;
  deal_id: Identifier | null;
  type: string;
  status: string | null;
  amount: number;
  amount_refunded: number;
  currency: string;
  description: string | null;
  invoice_number: string | null;
  hosted_invoice_url: string | null;
  receipt_url: string | null;
  occurred_at: string;
  metadata: Record<string, unknown>;
  created_at: string;
} & Pick<RaRecord, "id">;

export type Subscription = {
  stripe_subscription_id: string;
  stripe_customer_id: string;
  company_id: Identifier | null;
  status: string;
  product_name: string | null;
  amount: number | null;
  currency: string | null;
  recurring_interval: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  started_at: string | null;
  metadata: Record<string, unknown>;
  updated_at: string;
  created_at: string;
} & Pick<RaRecord, "id">;

// Agentic: tenant settings
export type TenantSettings = {
  tenant_id: string;
  agentic_enabled: boolean;
  agentic_enabled_skills: string[];
  agentic_usage_limits: {
    per_day?: number;
    per_month?: number;
    max_cost_usd_per_month?: number;
  };
  stripe_subscription_id?: string | null;
  created_at: string;
  updated_at: string;
};

// Agentic: circuit breaker state
export type AgenticCircuitState = {
  skill_id: string;
  state: "closed" | "open" | "half_open";
  opened_at: string | null;
  last_check_at: string;
  consecutive_errors: number;
};

// Agentic: skill runs
export type SkillRunStatus =
  | "running"
  | "success"
  | "error"
  | "cancelled"
  | "shadow";

export type SkillRunTraceStep =
  | { step: number; type: "user"; content: string; ts: string }
  | { step: number; type: "assistant_text"; content: string; ts: string }
  | { step: number; type: "assistant_thinking"; content: string; ts: string }
  | {
      step: number;
      type: "tool_use";
      tool: string;
      args: unknown;
      tool_use_id: string;
      ts: string;
    }
  | {
      step: number;
      type: "tool_result";
      tool_use_id: string;
      result: unknown;
      duration_ms: number;
      status: "ok" | "error";
      ts: string;
    }
  | {
      step: number;
      type: "guardrail";
      name: string;
      outcome: "allow" | "deny";
      reason: string;
      ts: string;
    };

export type SkillRun = {
  skill_id: string;
  skill_version: string;
  user_id: string;
  tenant_id?: string | null;
  input: Record<string, unknown>;
  trace: SkillRunTraceStep[];
  output?: unknown;
  status: SkillRunStatus;
  dry_run: boolean;
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_tokens?: number | null;
  cache_creation_tokens?: number | null;
  cost_usd?: number | null;
  error_code?: string | null;
  error_message?: string | null;
  model?: string | null;
  started_at: string;
  ended_at?: string | null;
} & Pick<RaRecord, "id">;
