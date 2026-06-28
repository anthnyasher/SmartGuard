// Human-friendly labels for alert `behavior_type` values from the backend.
// Keep in sync with Alert.BEHAVIOR_CHOICES in smartguard_backend/alerts/models.py.
const BEHAVIOR_LABELS = {
  SHOPLIFTING: "Shoplifting",
  CONCEALMENT: "Concealment",
  LOITERING: "Loitering",
  RAPID_EXIT: "Rapid Exit",
  MANUAL_TRIGGER: "Manual Trigger",
};

export function formatBehavior(behaviorType) {
  if (!behaviorType) return "—";
  if (BEHAVIOR_LABELS[behaviorType]) return BEHAVIOR_LABELS[behaviorType];
  // Fallback: title-case any unknown value, e.g. "FOO_BAR" -> "Foo Bar"
  return String(behaviorType)
    .replace(/_/g, " ")
    .replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
}
