import type { ProfileKey } from '../shared/types';

// Synonyms are in normalized form (see normalize). Longer phrases exist so they
// outscore the one-word synonyms they contain, e.g. "name of college" beats "name".
const SYNONYMS: Record<ProfileKey, string[]> = {
  name: ['name', 'full name', 'your name', 'student name', 'name of student', 'name of the student'],
  email: ['email', 'email address', 'email id', 'e mail', 'mail id', 'gmail', 'college email', 'college mail'],
  phone: ['phone', 'phone number', 'phone no', 'mobile', 'mobile number', 'mobile no', 'contact number', 'contact no', 'whatsapp number'],
  college: ['college', 'college name', 'name of college', 'name of the college', 'university', 'institute', 'institution'],
  rollNo: ['roll no', 'roll number', 'registration number', 'register number', 'reg no', 'enrollment number', 'enrolment number'],
  department: ['department', 'branch', 'dept', 'stream'],
  year: ['year', 'year of study', 'current year'],
  section: ['section'],
};

const EXCLUDED = /\b(father|mother|parent|guardian|emergency|mentor|faculty|teacher|teammate)s?\b/;

// "Father's Name*" → "father s name". Splitting on punctuation keeps "father" a whole word.
const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Returns a ProfileKey, a custom field's label, or null (excluded, tie, or no match).
// Matches against every field, not just filled ones, so an empty "college" can't let
// "Name of college" fall through to "name".
export function matchField(question: string, customLabels: string[] = []): string | null {
  const q = ` ${normalize(question)} `;
  if (EXCLUDED.test(q)) return null;

  const fields: [string, string[]][] = [
    ...Object.entries(SYNONYMS),
    ...customLabels.map((label): [string, string[]] => [label, [normalize(label)]]),
  ];
  let best = 0;
  let winners = new Set<string>();
  for (const [id, synonyms] of fields) {
    for (const syn of synonyms) {
      if (!syn || !q.includes(` ${syn} `)) continue;
      const words = syn.split(' ').length;
      if (words > best) [best, winners] = [words, new Set([id])];
      else if (words === best) winners.add(id);
    }
  }
  return winners.size === 1 ? [...winners][0] : null;
}
