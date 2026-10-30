import { useEffect, useState } from "react";
import { Check, Drumstick, Egg, Leaf, Loader2, Save } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getPreferences, savePreferences } from "../../api";
import type { Diet, Preferences as PreferencesData } from "../../api";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { SectionHeader } from "../../components/ui/SectionHeader";
import { Toast } from "../../components/ui/Toast";
import type { ToastVariant } from "../../components/ui/Toast";
import { cx } from "../../lib/cx";

interface DietOption {
  value: Diet;
  label: string;
  hint: string;
  icon: LucideIcon;
  tile: string;
}

const DIET_OPTIONS: DietOption[] = [
  { value: "veg", label: "Veg", hint: "No meat, fish or eggs", icon: Leaf, tile: "bg-success-soft text-success" },
  { value: "non-veg", label: "Non-veg", hint: "Meat and fish are fine", icon: Drumstick, tile: "bg-danger-soft text-danger" },
  { value: "eggetarian", label: "Egg", hint: "Vegetarian plus eggs", icon: Egg, tile: "bg-peach text-accent" },
];

const ALLERGY_OPTIONS: { value: string; label: string }[] = [
  { value: "nuts", label: "Nuts" },
  { value: "dairy", label: "Dairy" },
  { value: "gluten", label: "Gluten" },
  { value: "shellfish", label: "Shellfish" },
  { value: "soy", label: "Soy" },
  { value: "other", label: "Other" },
];

const NOTES_MAX = 500;

interface ToastState {
  open: boolean;
  key: number;
  message: string;
  variant: ToastVariant;
}

function sameAllergies(a: string[], b: string[]): boolean {
  return [...a].sort().join("|") === [...b].sort().join("|");
}

export function Preferences() {
  // The last version the server confirmed. Reminder fields are kept and sent back untouched.
  const [saved, setSaved] = useState<PreferencesData | null>(null);
  const [diet, setDiet] = useState<Diet>("veg");
  const [allergies, setAllergies] = useState<string[]>([]);
  const [notes, setNotes] = useState("");

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastState>({ open: false, key: 0, message: "", variant: "success" });

  function applyPreferences(p: PreferencesData) {
    setSaved(p);
    setDiet(p.diet);
    setAllergies(p.allergies);
    setNotes(p.notes);
  }

  useEffect(() => {
    let cancelled = false;
    getPreferences()
      .then((p) => {
        if (!cancelled) applyPreferences(p);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Could not load your preferences.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function showToast(message: string, variant: ToastVariant) {
    setToast((t) => ({ open: true, key: t.key + 1, message, variant }));
  }

  function toggleAllergy(value: string) {
    setAllergies((current) =>
      current.includes(value) ? current.filter((a) => a !== value) : [...current, value],
    );
  }

  async function handleSave() {
    if (!saved) return;
    setSaving(true);
    try {
      const result = await savePreferences({ ...saved, diet, allergies, notes });
      applyPreferences(result);
      showToast("Preferences saved to your account.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not save your preferences.", "error");
    } finally {
      setSaving(false);
    }
  }

  const dirty =
    saved !== null &&
    (diet !== saved.diet || notes !== saved.notes || !sameAllergies(allergies, saved.allergies));

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <SectionHeader
        as="h1"
        eyebrow="Your profile"
        title="Food preferences"
        description="Save your diet and allergy details in your account."
      />

      {loading ? (
        <Card padding="lg" className="flex items-center justify-center gap-3 text-ink/60">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          Loading your preferences…
        </Card>
      ) : loadError ? (
        <Card padding="lg" role="alert" className="bg-danger-soft text-danger">
          {loadError}
        </Card>
      ) : (
        <>
          {/* Diet type */}
          <Card as="section" padding="lg" aria-labelledby="diet-heading">
            <h2 id="diet-heading" className="font-serif text-xl font-semibold">
              Diet type
            </h2>
            <p className="mt-1 text-sm text-ink/65">Pick the one that fits you best.</p>

            <div role="radiogroup" aria-labelledby="diet-heading" className="mt-4 grid gap-3 sm:grid-cols-3">
              {DIET_OPTIONS.map(({ value, label, hint, icon: Icon, tile }) => {
                const selected = diet === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setDiet(value)}
                    className={cx(
                      "relative flex items-center gap-3 rounded-2xl border p-4 text-left transition-colors sm:flex-col sm:items-start sm:gap-4",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                      selected
                        ? "border-accent bg-peach/50 shadow-soft"
                        : "border-line bg-card hover:border-ink/25",
                    )}
                  >
                    <span
                      className={cx("flex size-12 shrink-0 items-center justify-center rounded-2xl", tile)}
                      aria-hidden="true"
                    >
                      <Icon className="size-6" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-ink">{label}</span>
                      <span className="block text-sm text-ink/60">{hint}</span>
                    </span>
                    {selected ? (
                      <span
                        className="absolute right-3 top-3 flex size-6 items-center justify-center rounded-full bg-accent text-white"
                        aria-hidden="true"
                      >
                        <Check className="size-4" />
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </Card>

          {/* Allergies */}
          <Card as="section" padding="lg" aria-labelledby="allergy-heading">
            <h2 id="allergy-heading" className="font-serif text-xl font-semibold">
              Allergies
            </h2>
            <p className="mt-1 text-sm text-ink/65">
              Select all that apply. For anything else, choose Other and add details in the notes below.
            </p>

            <div className="mt-4 flex flex-wrap gap-2" role="group" aria-labelledby="allergy-heading">
              {ALLERGY_OPTIONS.map(({ value, label }) => {
                const selected = allergies.includes(value);
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleAllergy(value)}
                    className={cx(
                      "inline-flex h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                      selected
                        ? "border-danger bg-danger-soft text-danger"
                        : "border-line bg-card text-ink/75 hover:border-ink/25",
                    )}
                  >
                    {selected ? <Check className="size-4" aria-hidden="true" /> : null}
                    {label}
                  </button>
                );
              })}
            </div>
          </Card>

          {/* Notes */}
          <Card as="section" padding="lg">
            <label htmlFor="pref-notes" className="font-serif text-xl font-semibold">
              Notes for the kitchen
            </label>
            <p className="mt-1 text-sm text-ink/65">Anything else we should know, like less spice or no onion or garlic.</p>
            <textarea
              id="pref-notes"
              value={notes}
              maxLength={NOTES_MAX}
              rows={4}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Allergic to peanuts specifically, cashews are fine."
              className="mt-4 w-full resize-y rounded-xl border border-line bg-white p-3 text-base text-ink placeholder:text-ink/40 focus:border-accent focus:outline-2 focus:outline-offset-0 focus:outline-accent/30"
            />
            <p className="mt-1 text-right text-xs text-ink/50 tabular-nums">
              {notes.length}/{NOTES_MAX}
            </p>
          </Card>

          <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end">
            {dirty ? <p className="text-center text-sm text-accent sm:mr-2">You have unsaved changes</p> : null}
            <Button
              size="lg"
              loading={saving}
              disabled={!dirty}
              onClick={handleSave}
              leftIcon={<Save className="size-5" aria-hidden="true" />}
              className="sm:min-w-44"
            >
              Save preferences
            </Button>
          </div>
        </>
      )}

      <Toast
        key={toast.key}
        open={toast.open}
        message={toast.message}
        variant={toast.variant}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
      />
    </div>
  );
}

export default Preferences;
