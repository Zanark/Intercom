import { useId } from 'react';

export type SettingsTab = 'Talk' | 'Input' | 'Session' | 'Voice' | 'Work' | 'Advanced';

export function SettingsTabs<T extends string>({ tabs, value, onChange, label }: {
  tabs: readonly T[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  const id = useId();
  return <div className="settings-tabs" role="tablist" aria-label={label}>
    {tabs.map((tab, index) => <button key={tab} id={`${id}-${index}`} role="tab"
      aria-selected={value === tab} tabIndex={value === tab ? 0 : -1}
      onClick={() => onChange(tab)} onKeyDown={(event) => {
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
          : event.key === 'ArrowRight' ? (index + 1) % tabs.length
          : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : null;
        if (next === null) return;
        event.preventDefault();
        onChange(tabs[next]);
        document.getElementById(`${id}-${next}`)?.focus();
      }}>{tab}</button>)}
  </div>;
}
