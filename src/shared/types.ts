export type QuestionType =
  | 'short_answer'
  | 'paragraph'
  | 'multiple_choice'
  | 'checkboxes'
  | 'dropdown'
  | 'unsupported';

export type Question = {
  text: string;
  type: QuestionType;
  options: string[];
  required: boolean;
};

export type ProfileKey = 'name' | 'email' | 'phone' | 'college' | 'rollNo' | 'department' | 'year' | 'section';

// Lives only in chrome.storage.local under the key "profile".
export type Profile = Partial<Record<ProfileKey, string>> & {
  custom?: { label: string; value: string }[];
};
