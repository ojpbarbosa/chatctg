import { useState } from "react";

export function JsonToggle({ value }: { value: unknown }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button className="btn btn-ghost" onClick={() => setOpen((o) => !o)}>{open ? "Hide JSON" : "JSON"}</button>
      {open && <pre className="json">{JSON.stringify(value, null, 2)}</pre>}
    </div>
  );
}
