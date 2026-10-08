export type Mode = 'demo' | 'field';
export type Page = 'explore' | 'dex' | 'map' | 'walk' | 'expeditions' | 'journal' | 'achievements';
export interface Species {
  id: string; name: string; scientific: string; category: string; rarity: string;
  fact: string; habitat: string; image: string; tags: string[];
  taxonomy: Record<string, string>; sightings: number; first_found: string | null; last_found: string | null;
}
export interface Observation {
  id: string; species_id: string; name: string; category: string; image: string;
  found_at: string; xp: number; area: string | null; note: string; score: number | null;
  latitude?: number | null; longitude?: number | null;
}
export interface Expedition {
  difficulty?: 'easy' | 'medium' | 'hard';
  id: string; title: string; subtitle: string; duration: number; xp: number; theme: string;
  goals: { label: string; done: boolean; count?: number; progress?: number; target?: number }[]; active: boolean; claimed: boolean; completed: number; generator?: string;
}
export interface Achievement {
  id: string; name: string; description: string; progress: number; target: number; icon: string;
}
export interface Dashboard {
  mode: Mode; collection: Species[]; observations: Observation[]; expeditions: Expedition[]; achievements: Achievement[];
  profile: { xp: number; level: number; title: string; level_start: number; next_level: number | null; discovered: number; streak: number; total_sightings: number };
}
export interface Health {
  status: string; model: { enabled: boolean; installed: boolean; loaded: boolean; device: string; name: string; error: string | null };
}
export interface Scan {
  scan_id: string; mode: Mode; photo: string | null;
  candidates: { species: Species; score: number | null }[]; uncertain: boolean; message: string; score_note: string;
  photo_quality?: { issues: { kind: 'blur' | 'resolution' | 'framing'; title: string; tip: string }[]; needs_review: boolean };
}
