"use client";

import * as React from "react";
import type { PartnerApplet, AppletConfigField, AppletInstance } from "../core/types";
import type { AppletStore } from "../core/partner-applets";

// ── Props ───────────────────────────────────────────────────────

export interface AppletConfigModalProps {
  store: AppletStore;
  applet: PartnerApplet;
  /** If provided, we are editing an existing instance */
  existingInstance?: AppletInstance;
  onComplete: (instance: AppletInstance) => void;
  onClose: () => void;
  userId?: string;
}

// ── Component ───────────────────────────────────────────────────

export function AppletConfigModal({
  store,
  applet,
  existingInstance,
  onComplete,
  onClose,
  userId,
}: AppletConfigModalProps) {
  const isEditing = !!existingInstance;

  // Initialize form values from existing config or defaults
  const [values, setValues] = React.useState<Record<string, unknown>>(() => {
    const initial: Record<string, unknown> = {};
    for (const field of applet.requiredConfig) {
      if (existingInstance && existingInstance.config[field.key] !== undefined) {
        initial[field.key] = existingInstance.config[field.key];
      } else if (field.defaultValue !== undefined) {
        initial[field.key] = field.defaultValue;
      } else {
        initial[field.key] = field.type === "boolean" ? false : "";
      }
    }
    return initial;
  });

  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  // Update a single field
  function updateField(key: string, value: unknown) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setSubmitError(null);
  }

  // Validate all fields
  function validate(): boolean {
    const newErrors: Record<string, string> = {};
    for (const field of applet.requiredConfig) {
      const val = values[field.key];
      if (field.required) {
        if (val === undefined || val === null || val === "") {
          newErrors[field.key] = `${field.label} is required`;
          continue;
        }
      }
      if (val !== undefined && val !== null && val !== "") {
        if (field.type === "number" && typeof val !== "number" && isNaN(Number(val))) {
          newErrors[field.key] = `${field.label} must be a number`;
        }
        if (
          field.type === "select" &&
          field.options &&
          !field.options.some((o) => o.value === String(val))
        ) {
          newErrors[field.key] = `Please select a valid option for ${field.label}`;
        }
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  // Submit
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    try {
      // Coerce number fields
      const coerced: Record<string, unknown> = { ...values };
      for (const field of applet.requiredConfig) {
        if (field.type === "number" && typeof coerced[field.key] === "string") {
          coerced[field.key] = Number(coerced[field.key]);
        }
      }

      if (isEditing && existingInstance) {
        // For edit, uninstall and reinstall
        store.uninstall(existingInstance.id);
      }
      const instance = store.install(applet.id, coerced, userId);
      onComplete(instance);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Failed to install applet"
      );
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative flex flex-col w-full max-w-lg max-h-[85vh] rounded-2xl border border-white/10 bg-[#0a0a0f] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between shrink-0 border-b border-white/10 px-6 py-4">
          <div className="flex items-center gap-3">
            {applet.partnerLogo ? (
              <img
                src={applet.partnerLogo}
                alt=""
                className="h-8 w-8 rounded-lg object-contain border border-white/[0.06]"
              />
            ) : (
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.06] border border-white/[0.06] text-[11px] font-bold text-muted-foreground/60">
                {applet.partnerName.charAt(0)}
              </span>
            )}
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                {isEditing ? "Configure" : "Install"} {applet.name}
              </h2>
              <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                by {applet.partnerName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center h-7 w-7 rounded-lg border border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/[0.05] transition-colors"
            aria-label="Close"
          >
            <svg
              className="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {/* Summary */}
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
              <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
                {applet.summary}
              </p>
            </div>

            {/* Fields */}
            {applet.requiredConfig.map((field) => (
              <ConfigField
                key={field.key}
                field={field}
                value={values[field.key]}
                error={errors[field.key]}
                onChange={(val) => updateField(field.key, val)}
              />
            ))}

            {/* Template preview */}
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
              <p className="text-[10px] font-semibold text-muted-foreground/60 mb-2">
                Workflow Preview
              </p>
              <div className="flex flex-wrap gap-1.5">
                {applet.template.nodes.map((node, i) => (
                  <React.Fragment key={node.id}>
                    {i > 0 && (
                      <svg
                        className="h-4 w-4 text-muted-foreground/20 shrink-0"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    )}
                    <span className="rounded-md bg-white/[0.04] border border-white/[0.06] px-2 py-1 text-[9px] text-muted-foreground/70">
                      {node.data.label}
                    </span>
                  </React.Fragment>
                ))}
              </div>
            </div>

            {/* Submit error */}
            {submitError && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2">
                <p className="text-[11px] text-red-400">{submitError}</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="shrink-0 border-t border-white/10 px-6 py-4 flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg px-4 py-2.5 text-xs font-medium border border-white/10 text-muted-foreground/70 hover:text-foreground hover:bg-white/[0.05] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 rounded-lg px-4 py-2.5 text-xs font-medium bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 border border-blue-500/20 transition-colors"
            >
              {isEditing ? "Save Changes" : "Install"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Config field renderer ───────────────────────────────────────

function ConfigField({
  field,
  value,
  error,
  onChange,
}: {
  field: AppletConfigField;
  value: unknown;
  error?: string;
  onChange: (value: unknown) => void;
}) {
  const id = `applet-field-${field.key}`;
  const hasError = !!error;

  const baseInputClass = `w-full rounded-lg border bg-white/[0.02] px-3 py-2 text-xs outline-none transition-colors ${
    hasError
      ? "border-red-500/40 focus:border-red-500/60"
      : "border-white/10 focus:border-white/20"
  } placeholder:text-muted-foreground/40`;

  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="flex items-center gap-1 text-[11px] font-medium text-foreground/80"
      >
        {field.label}
        {field.required && (
          <span className="text-red-400 text-[9px]">*</span>
        )}
      </label>

      {/* Text input */}
      {field.type === "text" && (
        <input
          id={id}
          type="text"
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className={baseInputClass}
        />
      )}

      {/* Number input */}
      {field.type === "number" && (
        <input
          id={id}
          type="number"
          value={value === "" || value === undefined ? "" : String(value)}
          onChange={(e) => {
            const v = e.target.value;
            onChange(v === "" ? "" : Number(v));
          }}
          placeholder={field.placeholder}
          className={baseInputClass}
        />
      )}

      {/* Select */}
      {field.type === "select" && (
        <select
          id={id}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          className={`${baseInputClass} appearance-none`}
        >
          <option value="">Select...</option>
          {field.options?.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      )}

      {/* Boolean toggle */}
      {field.type === "boolean" && (
        <button
          id={id}
          type="button"
          role="switch"
          aria-checked={!!value}
          onClick={() => onChange(!value)}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
            value ? "bg-blue-500/40" : "bg-white/10"
          }`}
        >
          <span
            className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
              value ? "translate-x-4.5" : "translate-x-0.5"
            }`}
            style={{ transform: value ? "translateX(18px)" : "translateX(2px)" }}
          />
        </button>
      )}

      {/* Credential selector */}
      {field.type === "credential" && (
        <input
          id={id}
          type="text"
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder ?? "credential:your-credential-id"}
          className={baseInputClass}
        />
      )}

      {/* Help text */}
      {field.helpText && !hasError && (
        <p className="text-[9px] text-muted-foreground/50">{field.helpText}</p>
      )}

      {/* Error */}
      {hasError && (
        <p className="text-[9px] text-red-400">{error}</p>
      )}
    </div>
  );
}
