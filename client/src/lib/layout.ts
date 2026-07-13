// Shared reading-column layout for full-page prose (Markdown view, home
// page). Left-biased centering: `ml-[clamp(0px,100%-72rem,(100%-48rem)/2)]`
// caps the left margin at true center ((100% - max-w-3xl) / 2) but lets it
// shrink first — the middle term keeps the right gutter >= 24rem where space
// allows, so the floating chat panel (w-96) opens over gutter, not text.
// Clamp floor 0: px-8 still pads narrow windows.
export const READING_COLUMN_CLASS =
  "mr-auto ml-[clamp(0px,100%-72rem,(100%-48rem)/2)] max-w-3xl px-8 py-10";
