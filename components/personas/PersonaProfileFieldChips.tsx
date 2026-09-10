import {
  PERSONA_FIELD_CHIP_CLASS,
  PERSONA_NESTED_CARD_CLASS,
} from "@/lib/personas/personaPagePresentation";
import type { PersonaFieldPresentation } from "@/lib/personas/personaDetailPresentation";

export function PersonaProfileFieldChips({
  fields,
}: {
  fields: PersonaFieldPresentation[];
}) {
  if (fields.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {fields.map((field) => (
        <div
          key={field.key}
          data-persona-field={field.key}
          className={PERSONA_NESTED_CARD_CLASS}
        >
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
            {field.label}
          </div>
          {field.kind === "chips" ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {field.items.map((item) => (
                <span key={`${field.key}-${item}`} className={PERSONA_FIELD_CHIP_CLASS}>
                  {item}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm leading-6 text-white/75">{field.items[0]}</p>
          )}
        </div>
      ))}
    </div>
  );
}
