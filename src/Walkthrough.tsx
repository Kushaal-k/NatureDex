import { BookOpen, Camera, Footprints } from 'lucide-react';

const steps = [
  { title: 'Capture a little wonder', Icon: Camera, text: 'Photograph one leaf, flower, bird, or tiny creature. Fill the frame and tap to focus.', hint: 'Check the suggested matches before saving. You can keep the photo for later if none look right.' },
  { title: 'Enjoy a walk', Icon: Footprints, text: 'Walk mode keeps your outing simple: capture a few photos, then review them when you get back.', hint: 'Photos stay on this device until you choose to identify them. A connection is needed for identification.' },
  { title: 'Grow your field guide', Icon: BookOpen, text: 'Your Field Guide brings species, photos, notes, and sightings together.', hint: 'Switch between Species, Timeline, and Map. Each sighting updates all three views.' },
];
export function Walkthrough({ step, next, finish, example }: { step: number; next: () => void; finish: () => void; example: () => void }) {
  const { title, Icon, text, hint } = steps[step];
  return <div className="walkthrough-content">
    <div className="walkthrough-progress" aria-label={`Step ${step + 1} of 3`}>{steps.map((s, i) => <span key={s.title} className={i === step ? 'current' : ''} aria-hidden="true" />)}<p>{step + 1} / 3</p></div>
    <div className="walkthrough-icon"><Icon size={42} strokeWidth={1.5} /></div>
    <h3>{title}</h3><p>{text}</p><div className="walkthrough-hint">{hint}</div>
    <button className="primary-button full-width" onClick={step === 2 ? finish : next}>{step === 2 ? 'Let’s explore' : 'Next'}</button>
    {step === 0 && <button className="secondary-button full-width" onClick={example}>Try an example</button>}
    <button className="text-button full-width" onClick={finish}>Skip walkthrough</button>
  </div>;
}
