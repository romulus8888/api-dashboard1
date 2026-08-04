"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { fetchJobs, updateJobStatus } from "@/lib/jobs";
import { getErrorMessage } from "@/lib/utils";
import type { Job, JobStatus } from "@/types/job";

export interface UseJobsResult {
  jobs: Job[];
  /** True for the first load and for explicit retries, so the table can swap in skeletons. */
  loading: boolean;
  refreshing: boolean;
  loadError: string | null;
  updatingJobId: string | null;
  reload: () => void;
  /** Refetches in the background and rethrows so the caller can surface a toast. */
  refresh: () => Promise<void>;
  /** Optimistically applies the status, rolling back and rethrowing when the write fails. */
  updateStatus: (job: Job, status: JobStatus) => Promise<void>;
}

export function useJobs(): UseJobsResult {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [updatingJobId, setUpdatingJobId] = useState<string | null>(null);
  const [loadToken, setLoadToken] = useState(0);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    void fetchJobs().then(
      (data) => {
        if (cancelled) return;
        setJobs(data);
        setLoadError(null);
        setLoading(false);
      },
      (error: unknown) => {
        if (cancelled) return;
        setLoadError(getErrorMessage(error));
        setLoading(false);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [loadToken]);

  const reload = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    setLoadToken((token) => token + 1);
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);

    try {
      const data = await fetchJobs();
      if (isMounted.current) {
        setJobs(data);
        setLoadError(null);
      }
    } finally {
      if (isMounted.current) setRefreshing(false);
    }
  }, []);

  const patchStatus = useCallback((id: string, status: JobStatus) => {
    setJobs((current) => current.map((item) => (item.id === id ? { ...item, status } : item)));
  }, []);

  const updateStatus = useCallback(
    async (job: Job, status: JobStatus) => {
      const previousStatus = job.status;
      setUpdatingJobId(job.id);
      patchStatus(job.id, status);

      try {
        await updateJobStatus(job.id, status);
      } catch (error) {
        patchStatus(job.id, previousStatus);
        throw error;
      } finally {
        if (isMounted.current) setUpdatingJobId(null);
      }
    },
    [patchStatus],
  );

  return {
    jobs,
    loading,
    refreshing,
    loadError,
    updatingJobId,
    reload,
    refresh,
    updateStatus,
  };
}
