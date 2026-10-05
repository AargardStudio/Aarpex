import { useState } from "react";
import { INDUSTRIES } from "../../data/industries";

/**
 * Real <select> industry picker (all options always visible) with an
 * "Other" mode for typing a custom industry. Replaces <input list=datalist>,
 * which only showed suggestions matching the text already in the box.
 */
export default function IndustryPicker({
  value,
  onChange,
  className = "",
  allowEmpty = true,
  autoFocus = false,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  allowEmpty?: boolean;
  autoFocus?: boolean;
}) {
  const list = INDUSTRIES.filter((i) => i !== "Other");
  const [custom, setCustom] = useState<boolean>(() => !!value && !list.includes(value));
  return (
    <div className="space-y-1.5">
      <select
        autoFocus={autoFocus}
        value={custom ? "__custom__" : value}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "__custom__") {
            setCustom(true);
            if (list.includes(value)) onChange("");
          } else {
            setCustom(false);
            onChange(v);
          }
        }}
        className={className}
      >
        {allowEmpty && <option value="">Select an industry…</option>}
        {list.map((i) => (
          <option key={i} value={i}>{i}</option>
        ))}
        <option value="__custom__">Other (type your own)…</option>
      </select>
      {custom && (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Type the industry"
          className={className}
        />
      )}
    </div>
  );
}
