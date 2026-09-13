import type { ReactNode } from 'react';

type FieldProps = {
  label: string;
  required?: boolean;
  hint?: string;
  count?: string;
  children: ReactNode;
};

export function Field({ label, required, hint, count, children }: FieldProps) {
  return (
    <label className="field">
      <span className="field__label">{label}{required ? <b> *</b> : null}</span>
      <span className="field__control">{children}{count ? <small className="field__count">{count}</small> : null}</span>
      {hint ? <span className="field__hint">{hint}</span> : null}
    </label>
  );
}

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (value: boolean) => void; label: string; description: string }) {
  return (
    <button className="toggle-row" type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}>
      <span><strong>{label}</strong><small>{description}</small></span>
      <span className="switch" data-checked={checked}><span /></span>
    </button>
  );
}
