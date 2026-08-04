import { STATUS_TONES } from "@/components/job-badges";
import { Select, type SelectOption, type SelectSize } from "@/components/ui/select";
import { JOB_STATUSES, JOB_STATUS_LABELS, type JobStatus } from "@/types/job";

const STATUS_OPTIONS: SelectOption<JobStatus>[] = JOB_STATUSES.map((status) => ({
  value: status,
  label: JOB_STATUS_LABELS[status],
}));

export interface JobStatusSelectProps {
  id: string;
  label: string;
  value: JobStatus;
  onChange: (status: JobStatus) => void;
  hideLabel?: boolean;
  disabled?: boolean;
  size?: SelectSize;
  className?: string;
}

/** Status picker tinted to match the current status, shared by the table row and the detail drawer. */
export function JobStatusSelect({
  id,
  label,
  value,
  onChange,
  hideLabel = false,
  disabled = false,
  size = "md",
  className,
}: JobStatusSelectProps) {
  return (
    <Select
      id={id}
      label={label}
      hideLabel={hideLabel}
      value={value}
      options={STATUS_OPTIONS}
      onChange={onChange}
      disabled={disabled}
      tone={STATUS_TONES[value]}
      size={size}
      className={className}
    />
  );
}
