import { Camera, Info } from 'lucide-react';
import type { Scan } from './types';

export function IdentificationFeedback({ scan, alternative, retake, disabled }: { scan: Scan; alternative: boolean; retake: () => void; disabled?: boolean }) {
  if (scan.mode === 'demo') return null;
  const issues = scan.photo_quality?.issues || [];
  const uncertain = scan.uncertain || alternative;
  if (!uncertain && !issues.length) return null;
  return <section className={`identification-feedback ${uncertain ? 'needs-review' : ''}`} aria-label="Identification guidance">
    {!!issues.length && <div className="photo-quality-hints" role="status"><h4>A clearer photo could help</h4>{issues.map(issue => <div key={issue.kind}><strong>{issue.title}</strong><p>{issue.tip}</p></div>)}</div>}
    {uncertain && <div className="match-explanation"><Info size={18} /><div><strong>Check before you save</strong><p>{alternative ? 'You chose an alternative suggestion. Check its markings against your photo before saving.' : issues.length ? 'This photo may hide useful details, so treat the suggestions as tentative.' : 'The closest suggestions are not distinct enough to be sure. Several species can look alike.'} Compare the choices below, or try another angle.</p></div></div>}
    {uncertain && <button className="secondary-button full-width" disabled={disabled} onClick={retake}><Camera size={17} />Try a clearer photo</button>}
  </section>;
}
