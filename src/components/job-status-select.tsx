import { STATUS_TONES } from "@/components/job-badges";
import { Select, type SelectOption, type SelectSize } from "@/components/ui/select";
import { useLocaleContext } from "@/i18n/locale-provider";
import { LEAD_STATUSES, type LeadStatus } from "@/types/lead";

export interface JobStatusSelectProps {
  id: string;
  label: string;
  value: LeadStatus;
  onChange: (status: LeadStatus) => void;
  hideLabel?: boolean;
  disabled?: boolean;
  size?: SelectSize;
  className?: string;
  excludedStatuses?: LeadStatus[];
}

export function JobStatusSelect({
  id,
  label,
  value,
  onChange,
  hideLabel = false,
  disabled = false,
  size = "md",
  className,
  excludedStatuses = [],
}: JobStatusSelectProps) {
  const { dictionary } = useLocaleContext();

  const statusOptions: SelectOption<LeadStatus>[] = LEAD_STATUSES
    .filter((status) => !excludedStatuses.includes(status))
    .map((status) => ({
      value: status,
      label: dictionary.leads.status[status],
    }));

  return (
    <Select
      id={id}
      label={label}
      hideLabel={hideLabel}
      value={value}
      options={statusOptions}
      onChange={onChange}
      disabled={disabled}
      tone={STATUS_TONES[value]}
      size={size}
      className={className}
    />
  );
}
