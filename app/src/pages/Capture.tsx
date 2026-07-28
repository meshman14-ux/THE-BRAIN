/* Capture — the whole point. One box, plain typing, live preview of how
   the thought will be filed. Saving takes one tap and returns focus to
   the box so several thoughts can be dumped in a row. */
import { useMemo, useRef, useState } from 'react';
import { parseCapture } from '../lib/parse';
import { humanDate } from '../lib/dates';

export function Capture({ onSave }: { onSave: (raw: string) => void }) {
  const [text, setText] = useState('');
  const box = useRef<HTMLTextAreaElement>(null);
  const preview = useMemo(() => parseCapture(text), [text]);
  const has = text.trim().length > 0;

  function save() {
    if (!has) return;
    onSave(text);
    setText('');
    box.current?.focus();
  }

  return (
    <div className="capture-box">
      <label htmlFor="cap" style={{ position: 'absolute', left: -9999 }}>What's on your mind?</label>
      <textarea
        id="cap" ref={box} autoFocus value={text} placeholder="Type anything… e.g.  pay van insurance tomorrow @business !"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); } }}
      />
      <div className="preview" aria-live="polite">
        {has && (
          <>
            <span className={`badge ${preview.kind === 'note' ? 'biz' : 'today'}`}>{preview.kind}</span>
            {preview.due && <span className="badge">{humanDate(preview.due)}</span>}
            {preview.context === 'business' && <span className="badge biz">business</span>}
            {preview.pinned && <span className="badge pin">★ important</span>}
            {preview.tags.map((t) => <span key={t}>#{t}</span>)}
            <span style={{ opacity: 0.8 }}>“{preview.title}”</span>
          </>
        )}
      </div>
      <button className="btn" onClick={save} disabled={!has}>Save it</button>
      <p className="hint">
        Just type normally — dates and labels are picked up for you:<br />
        <code>tomorrow</code> <code>friday</code> <code>14/8</code> set a date ·{' '}
        <code>@business</code> files it under business ·{' '}
        <code>#van</code> adds a tag · <code>!</code> marks it important ·{' '}
        start with <code>note:</code> for things that aren't to-dos.
      </p>
    </div>
  );
}
