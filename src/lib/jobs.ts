import { supabase } from "@/lib/supabase";
import type { Job, JobStatus } from "@/types/job";

export async function fetchJobs(): Promise<Job[]> {
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  return data ?? [];
}

export async function updateJobStatus(id: string, status: JobStatus): Promise<void> {
  const { error } = await supabase.from("jobs").update({ status }).eq("id", id);

  if (error) throw new Error(error.message);
}
