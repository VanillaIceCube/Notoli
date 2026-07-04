# Notoli Frontend Style Guide

## Dividers

- Dialog and modal dividers should be inset to align with the content padding.
- Avoid full-bleed divider lines inside dialogs unless the surrounding surface also uses full-bleed sectioning.
- Use the app divider color (`var(--secondary-color)`) and a visible weight (`borderBottomWidth: 2`) for consistency with sidebar and list surfaces.

## Dialog Density

- Keep dialogs focused on the current task and avoid repeating identity fields.
- Prefer compact sections or responsive two-column layouts when a dialog compares two related groups, such as owner and collaborators.
- In member lists, show a display name plus one secondary identifier when possible instead of separate labeled username and email rows.
- Sharing dialogs should use a single `People with access` list with consistent user rows, avatars, role labels, and owner-only management controls.
- When a section heading already labels an input group, prefer placeholder text plus an accessible `aria-label` over a floating visual input label.
- Text field focus states should use the Notoli secondary color globally, never the default Material UI blue. Keep the global overrides in `src/App.css` covered by `notoliThemeStyles.test.js`.
