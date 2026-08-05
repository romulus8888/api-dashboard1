import type { PostgrestError } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";
import type { Job, JobInsert, JobStatus } from "@/types/job";

/** Wraps a PostgREST failure so callers keep the Postgres code and details for logging. */
export class JobsApiError extends Error {
  readonly code: string | undefined;
  readonly details: string | undefined;

  constructor(error: PostgrestError) {
    super(error.code ? `${error.message} (${error.code})` : error.message);
    this.name = "JobsApiError";
    this.code = error.code || undefined;
    this.details = error.details || undefined;
  }
}

export async function fetchJobs(): Promise<Job[]> {
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new JobsApiError(error);

  return data ?? [];
}

export async function createJob(input: JobInsert): Promise<Job> {
  const { data, error } = await supabase.from("jobs").insert(input).select().single();

  if (error) throw new JobsApiError(error);

  return data;
}

export async function updateJobStatus(id: string, status: JobStatus): Promise<void> {
  const { error } = await supabase.from("jobs").update({ status }).eq("id", id);

  if (error) throw new JobsApiError(error);
}
