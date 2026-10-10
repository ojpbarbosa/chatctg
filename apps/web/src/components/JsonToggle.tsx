/** The footer button that shows or hides the JSON panel; its label never changes length, so it stays put when toggled. */
export function JsonToggle({ open, onToggle, controls }: { open: boolean; onToggle: () => void; controls: string }) {
  return <button className="btn btn-ghost json-toggle" aria-expanded={open} aria-controls={controls} onClick={onToggle}>{open ? "Hide JSON" : "Show JSON"}</button>;
}

/** The request and the response as sent and received, wrapped to the card's width and scrolled vertically. */
export function JsonPanel({ id, value }: { id: string; value: unknown }) {
  return <pre id={id} className="json">{JSON.stringify(value, null, 2)}</pre>;
}
