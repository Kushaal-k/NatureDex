import { specimenArtwork } from './artwork';
import { Check, Leaf } from 'lucide-react';
import type { Scan } from './types';

const prompts: Record<string, string> = {
  Plants: 'Compare leaf edges, vein patterns, and how leaves join the stem.',
  Birds: 'Compare the bill, wing markings, and tail shape.',
  Insects: 'Compare wing markings, body shape, and antennae.',
  Fungi: 'Compare the cap, underside, and what it grows on.',
  Reptiles: 'Compare body markings, head shape, and tail.',
};
export function Matches({ scan, selected, choose }: { scan: Scan; selected: number; choose: (index: number) => void }) {
  if (scan.mode === 'demo') return null;
  return <section className="match-comparison" aria-label="Possible identification matches">
    <h4>Which looks closest?</h4><p>Check the features in your photo. Illustrations are decorative, not reference photos.</p>
    <div className="match-cards">{scan.candidates.slice(0, 3).map((candidate, i) => <button key={candidate.species.id} className={`match-card ${selected === i ? 'selected' : ''}`} aria-pressed={selected === i} onClick={() => choose(i)}>
      <div className="match-art">{candidate.species.image !== '/specimens/unknown.svg' ? <img src={specimenArtwork(candidate.species.image)} alt="" /> : <Leaf size={36} />}<span>{i + 1}</span>{selected === i && <Check size={18} className="match-check" />}<small className="match-image-label">{candidate.species.image === '/specimens/unknown.svg' ? 'No reference photo' : candidate.species.image.endsWith('.svg') ? 'Illustration' : candidate.species.image.startsWith('/photos/') ? 'Previous sighting' : 'Reference photo'}</small></div>
      <strong>{candidate.species.name}</strong><small>{candidate.species.scientific}</small>
      <p>{candidate.species.fact.startsWith('This species is new') ? prompts[candidate.species.category] || 'Compare distinctive markings, shape, and colour.' : candidate.species.fact}</p>
    </button>)}</div>
  </section>;
}
