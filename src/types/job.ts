export type JobStatus = "pending" | "in_progress" | "completed";

export type JobPriority = "low" | "medium" | "high";

export interface Job {
  id: string;
  created_at: string;
  title: string;
  description: string;
  status: JobStatus;
  priority: JobPriority;
  budget: number;
  client_email: string;
}

/**
 * Supabase's generated-schema types require object types with an implicit index
 * signature, which interfaces don't have. Mapping over `Job` keeps the public
 * `Job` interface intact while satisfying that constraint.
 */
type JobRow = { [K in keyof Job]: Job[K] };

/** Payload for creating a job. `id`, `created_at` and `status` are defaulted by Postgres. */
export type JobInsert = Omit<JobRow, "id" | "created_at" | "status"> & {
  status?: JobStatus;
};

export type JobUpdate = Partial<Omit<JobRow, "id" | "created_at">>;

export const JOB_STATUSES: JobStatus[] = ["pending", "in_progress", "completed"];

export const JOB_PRIORITIES: JobPriority[] = ["low", "medium", "high"];

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  completed: "Completed",
};

export const JOB_PRIORITY_LABELS: Record<JobPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export interface Database {
  public: {
    Tables: {
      jobs: {
        Row: JobRow;
        Insert: JobInsert;
        Update: JobUpdate;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: {
      job_status: JobStatus;
      job_priority: JobPriority;
    };
    CompositeTypes: { [_ in never]: never };
  };
}
